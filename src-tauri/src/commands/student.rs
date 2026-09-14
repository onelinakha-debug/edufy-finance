use crate::db::connection::DbState;
use crate::models::{Student, StudentDetail, Parent};
use crate::utils::generate_id;
use tauri::State;

#[tauri::command]
pub fn create_student(
    state: State<'_, DbState>,
    school_id: String,
    admission_no: String,
    first_name: String,
    last_name: String,
    middle_name: Option<String>,
    grade: String,
    stream: Option<String>,
    enrollment_date: Option<String>,
) -> Result<Student, String> {
    // Input validation
    if school_id.trim().is_empty() { return Err("School ID is required".to_string()); }
    if admission_no.trim().is_empty() { return Err("Admission number is required".to_string()); }
    if first_name.trim().is_empty() { return Err("First name is required".to_string()); }
    if last_name.trim().is_empty() { return Err("Last name is required".to_string()); }
    if grade.trim().is_empty() { return Err("Grade is required".to_string()); }
    if admission_no.len() > 50 { return Err("Admission number too long (max 50 characters)".to_string()); }
    if first_name.len() > 100 { return Err("First name too long (max 100 characters)".to_string()); }
    if last_name.len() > 100 { return Err("Last name too long (max 100 characters)".to_string()); }

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Check for duplicate admission number
    let exists: bool = {
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM students WHERE admission_no = ?1")
            .map_err(|e| e.to_string())?;
        let count: i64 = stmt
            .query_row([&admission_no], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        count > 0
    };

    if exists {
        return Err(format!("Admission number '{}' already exists", admission_no));
    }

    let id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();
    let enrollment = enrollment_date.unwrap_or_else(|| now.clone());

    conn.execute(
        "INSERT INTO students (id, admission_no, school_id, first_name, middle_name, last_name, grade, stream, status, enrollment_date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?10)",
        rusqlite::params![id, admission_no, school_id, first_name, middle_name, last_name, grade, stream, enrollment, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Student {
        id,
        admission_no,
        school_id,
        first_name,
        middle_name,
        last_name,
        grade,
        stream,
        status: "active".to_string(),
        enrollment_date: Some(enrollment),
        created_at: now,
    })
}

#[tauri::command]
pub fn get_students(
    state: State<'_, DbState>,
    school_id: String,
    grade: Option<String>,
    status: Option<String>,
) -> Result<Vec<Student>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sql = "SELECT id, admission_no, school_id, first_name, middle_name, last_name, grade, stream, status, enrollment_date, created_at
                   FROM students WHERE school_id = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(school_id)];

    if let Some(g) = &grade {
        sql.push_str(" AND grade = ?");
        params.push(Box::new(g.clone()));
    }
    if let Some(s) = &status {
        sql.push_str(" AND status = ?");
        params.push(Box::new(s.clone()));
    } else {
        sql.push_str(" AND status = 'active'");
    }

    sql.push_str(" ORDER BY last_name, first_name");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(Student {
                id: row.get(0)?,
                admission_no: row.get(1)?,
                school_id: row.get(2)?,
                first_name: row.get(3)?,
                middle_name: row.get(4)?,
                last_name: row.get(5)?,
                grade: row.get(6)?,
                stream: row.get(7)?,
                status: row.get(8)?,
                enrollment_date: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut students = Vec::new();
    for row in rows {
        students.push(row.map_err(|e| e.to_string())?);
    }

    Ok(students)
}

#[tauri::command]
pub fn get_student_detail(
    state: State<'_, DbState>,
    id: String,
) -> Result<StudentDetail, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let student: Student = {
        let mut stmt = conn
            .prepare(
                "SELECT id, admission_no, school_id, first_name, middle_name, last_name, grade, stream, status, enrollment_date, created_at
                 FROM students WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        stmt.query_row([&id], |row| {
            Ok(Student {
                id: row.get(0)?,
                admission_no: row.get(1)?,
                school_id: row.get(2)?,
                first_name: row.get(3)?,
                middle_name: row.get(4)?,
                last_name: row.get(5)?,
                grade: row.get(6)?,
                stream: row.get(7)?,
                status: row.get(8)?,
                enrollment_date: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| format!("Student not found: {}", e))?
    };

    // Get parents
    let parents: Vec<Parent> = {
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.name, p.phone, p.email, p.relationship, p.is_primary
                 FROM parents p
                 JOIN student_parents sp ON p.id = sp.parent_id
                 WHERE sp.student_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&id], |row| {
            Ok(Parent {
                id: row.get(0)?,
                name: row.get(1)?,
                phone: row.get(2)?,
                email: row.get(3)?,
                relationship: row.get(4)?,
                is_primary: row.get::<_, i32>(5)? == 1,
            })
        }).map_err(|e| e.to_string())?;
        let mut parents = Vec::new();
        for row in rows {
            parents.push(row.map_err(|e| e.to_string())?);
        }
        parents
    };

    // Get outstanding and paid totals
    let (total_invoiced, total_paid): (i64, i64) = {
        let mut stmt = conn
            .prepare(
                "SELECT
                    COALESCE(SUM(i.net_amount), 0),
                    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = ?1 AND p.status = 'completed'), 0)
                 FROM invoices i WHERE i.student_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        stmt.query_row([&id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
    };

    let outstanding_fees = total_invoiced - total_paid;

    // Populate invoice summaries
    let invoices: Vec<crate::models::InvoiceSummary> = {
        let mut stmt = conn
            .prepare(
                "SELECT i.id, i.invoice_no, i.net_amount,
                        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'completed'), 0) as paid,
                        i.status, COALESCE(s.grade, '') as grade, COALESCE(fs.term, 1), COALESCE(fs.academic_year, 2026)
                 FROM invoices i
                 LEFT JOIN students s ON i.student_id = s.id
                 LEFT JOIN fee_structures fs ON i.fee_structure_id = fs.id
                 WHERE i.student_id = ?1
                 ORDER BY i.created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&id], |row| {
            let net: i64 = row.get(2)?;
            let paid: i64 = row.get(3)?;
            Ok(crate::models::InvoiceSummary {
                id: row.get(0)?,
                invoice_no: row.get(1)?,
                net_amount: net,
                amount_paid: paid,
                outstanding: net - paid,
                status: row.get(4)?,
                grade: row.get(5)?,
                term: row.get(6)?,
                academic_year: row.get(7)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut invs = Vec::new();
        for row in rows {
            invs.push(row.map_err(|e| e.to_string())?);
        }
        invs
    };

    Ok(StudentDetail {
        student,
        parents,
        outstanding_fees: outstanding_fees.max(0),
        total_paid,
        invoices,
    })
}

#[tauri::command]
pub fn update_student(
    state: State<'_, DbState>,
    id: String,
    first_name: Option<String>,
    last_name: Option<String>,
    middle_name: Option<String>,
    grade: Option<String>,
    stream: Option<String>,
    status: Option<String>,
) -> Result<Student, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = &first_name { updates.push("first_name = ?"); params.push(Box::new(v.clone())); }
    if let Some(v) = &last_name { updates.push("last_name = ?"); params.push(Box::new(v.clone())); }
    if let Some(v) = &middle_name { updates.push("middle_name = ?"); params.push(Box::new(v.clone())); }
    if let Some(v) = &grade { updates.push("grade = ?"); params.push(Box::new(v.clone())); }
    if let Some(v) = &stream { updates.push("stream = ?"); params.push(Box::new(v.clone())); }
    if let Some(v) = &status { updates.push("status = ?"); params.push(Box::new(v.clone())); }

    if updates.is_empty() {
        return Err("No fields to update".to_string());
    }

    params.push(Box::new(id.clone()));
    let sql = format!("UPDATE students SET {} WHERE id = ?", updates.join(", "));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    drop(conn);

    // Return updated student
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, admission_no, school_id, first_name, middle_name, last_name, grade, stream, status, enrollment_date, created_at FROM students WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    stmt.query_row([&id], |row| {
        Ok(Student {
            id: row.get(0)?,
            admission_no: row.get(1)?,
            school_id: row.get(2)?,
            first_name: row.get(3)?,
            middle_name: row.get(4)?,
            last_name: row.get(5)?,
            grade: row.get(6)?,
            stream: row.get(7)?,
            status: row.get(8)?,
            enrollment_date: row.get(9)?,
            created_at: row.get(10)?,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_student(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM students WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
