use crate::models::Invoice;
use crate::utils::{generate_id, generate_sequential, errors::AppResult};
use rusqlite::Connection;

/// Generate invoices for all students in a fee structure
pub fn generate_invoices_for_structure(
    conn: &Connection,
    fee_structure_id: &str,
    student_ids: Option<Vec<String>>,
) -> AppResult<Vec<Invoice>> {
    // Get the fee structure details
    let fee_structure = {
        let mut stmt = conn.prepare(
            "SELECT id, school_id, name, grade, term, academic_year
             FROM fee_structures WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map([fee_structure_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, i32>(5)?,
            ))
        })?;
        rows.next()
            .ok_or_else(|| crate::utils::errors::AppError::NotFound("Fee structure not found".into()))??
    };

    // Get students to invoice
    let students = if let Some(ids) = student_ids {
        let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT id, admission_no, first_name, middle_name, last_name, grade
             FROM students WHERE id IN ({}) AND status = 'active'",
            placeholders.join(",")
        );
        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<Box<dyn rusqlite::types::ToSql>> =
            ids.iter().map(|id| Box::new(id.clone()) as Box<dyn rusqlite::types::ToSql>).collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })?;
        let mut students = Vec::new();
        for row in rows {
            students.push(row?);
        }
        students
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, admission_no, first_name, middle_name, last_name, grade
             FROM students WHERE school_id = ?1 AND status = 'active' AND grade = ?2",
        )?;
        let rows = stmt.query_map(
            rusqlite::params![&fee_structure.1, &fee_structure.3],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )?;
        let mut students = Vec::new();
        for row in rows {
            students.push(row?);
        }
        students
    };

    if students.is_empty() {
        return Ok(Vec::new());
    }

    // Get vote heads for this fee structure
    let vote_heads = {
        let mut stmt = conn.prepare(
            "SELECT id, name, amount FROM vote_heads
             WHERE fee_structure_id = ?1 ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([fee_structure_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?;
        let mut vhs = Vec::new();
        for row in rows {
            vhs.push(row?);
        }
        vhs
    };

    // BATCH FIX: Get all existing invoice student+structure pairs in ONE query
    let student_ids_in_scope: Vec<String> = students.iter().map(|s| s.0.clone()).collect();
    let existing_invoices: std::collections::HashSet<String> = {
        let placeholders: Vec<String> = student_ids_in_scope.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT student_id FROM invoices WHERE fee_structure_id = ?1 AND student_id IN ({})",
            placeholders.join(",")
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(fee_structure_id.to_string())];
        for id in &student_ids_in_scope {
            params.push(Box::new(id.clone()));
        }
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    // Get current invoice count for this school (for sequential numbering)
    let school_id = &fee_structure.1;
    let invoice_count: i64 = {
        let mut stmt = conn.prepare(
            "SELECT COUNT(*) FROM invoices i
             JOIN students s ON i.student_id = s.id
             WHERE s.school_id = ?1",
        )?;
        stmt.query_row([school_id], |row| row.get(0))?
    };

    // BEGIN TRANSACTION for batch insert
    conn.execute("BEGIN", [])?;

    let result = (|| -> AppResult<Vec<Invoice>> {
        let mut invoices = Vec::new();

        for (idx, student) in students.iter().enumerate() {
            // Skip if already invoiced
            if existing_invoices.contains(&student.0) {
                continue;
            }

            let total_amount: i64 = vote_heads.iter().map(|vh| vh.2).sum();
            let invoice_no = generate_sequential("INV", invoice_count + idx as i64 + 1);
            let invoice_id = generate_id();
            let now = chrono::Utc::now().to_rfc3339();

            // Insert invoice
            conn.execute(
                "INSERT INTO invoices (id, invoice_no, student_id, fee_structure_id, total_amount, net_amount, status, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'unpaid', ?6)",
                rusqlite::params![invoice_id, invoice_no, student.0, fee_structure_id, total_amount, now],
            )?;

            // Insert invoice items
            for vh in &vote_heads {
                let item_id = generate_id();
                conn.execute(
                    "INSERT INTO invoice_items (id, invoice_id, vote_head_id, amount, description)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![item_id, invoice_id, vh.0, vh.2, vh.1],
                )?;
            }

            invoices.push(Invoice {
                id: invoice_id,
                invoice_no,
                student_id: student.0.clone(),
                fee_structure_id: fee_structure_id.to_string(),
                total_amount,
                discount_amount: 0,
                net_amount: total_amount,
                status: "unpaid".to_string(),
                due_date: None,
                created_at: now,
                paid_at: None,
            });
        }

        Ok(invoices)
    })();

    match result {
        Ok(invoices) => {
            conn.execute("COMMIT", [])?;
            Ok(invoices)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
