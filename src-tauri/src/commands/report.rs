use crate::db::connection::DbState;
use crate::models::{CollectionSummary, AgeBucket, StudentOutstanding, StudentHistoryEntry, GradeCollection, MethodCollection, VoteHeadCollection, DailyCollection};
use tauri::State;

#[tauri::command]
pub fn get_collection_summary(
    state: State<'_, DbState>,
    school_id: String,
    academic_year: i32,
    term: Option<i32>,
) -> Result<CollectionSummary, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut filters = vec!["i.student_id IN (SELECT id FROM students WHERE school_id = ?1)"];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(school_id.clone())];

    if let Some(t) = term {
        filters.push("fs.term = ?");
        params.push(Box::new(t));
    }
    filters.push("fs.academic_year = ?");
    params.push(Box::new(academic_year));

    let where_clause = filters.join(" AND ");
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    // Single consolidated query for all totals (was 3 separate queries)
    let (total_invoiced, total_discounted, total_paid): (i64, i64, i64) = {
        let sql = format!(
            "SELECT
                COALESCE(SUM(i.net_amount), 0),
                COALESCE(SUM(i.discount_amount), 0),
                COALESCE((SELECT SUM(p.amount) FROM payments p JOIN invoices pi ON p.invoice_id = pi.id
                          JOIN fee_structures pfs ON pi.fee_structure_id = pfs.id
                          WHERE p.status = 'completed' AND {}), 0)
             FROM invoices i
             JOIN fee_structures fs ON i.fee_structure_id = fs.id
             WHERE {}",
            where_clause, where_clause
        );
        conn.query_row(&sql, param_refs.as_slice(), |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        }).map_err(|e| e.to_string())?
    };

    let total_outstanding = total_invoiced - total_paid;
    let collection_rate = if total_invoiced > 0 { (total_paid as f64 / total_invoiced as f64) * 100.0 } else { 0.0 };

    // By grade
    let by_grade = {
        let sql = format!(
            "SELECT fs.grade,
                    COALESCE(SUM(i.net_amount), 0) as invoiced,
                    COALESCE((SELECT SUM(p.amount) FROM payments p JOIN invoices pi ON p.invoice_id = pi.id
                              WHERE pi.student_id = i.student_id AND pi.fee_structure_id = i.fee_structure_id AND p.status = 'completed'), 0) as paid
             FROM invoices i
             JOIN fee_structures fs ON i.fee_structure_id = fs.id
             WHERE {}
             GROUP BY fs.grade ORDER BY fs.grade",
            where_clause
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<GradeCollection> = stmt.query_map(param_refs.as_slice(), |row| {
            let invoiced: i64 = row.get(1)?;
            let paid: i64 = row.get(2)?;
            Ok(GradeCollection { grade: row.get(0)?, invoiced, paid, outstanding: invoiced - paid })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        rows
    };

    // By vote head
    let by_vote_head = {
        let sql = format!(
            "SELECT vh.name,
                    COALESCE(SUM(ii.amount), 0) as invoiced,
                    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'completed'), 0) as paid_per_invoice
             FROM invoice_items ii
             JOIN vote_heads vh ON ii.vote_head_id = vh.id
             JOIN invoices i ON ii.invoice_id = i.id
             JOIN fee_structures fs ON i.fee_structure_id = fs.id
             WHERE {}
             GROUP BY vh.name ORDER BY invoiced DESC",
            where_clause
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<VoteHeadCollection> = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(VoteHeadCollection { name: row.get(0)?, invoiced: row.get(1)?, paid: row.get(2)? })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        rows
    };

    // By payment method
    let by_method = {
        let sql = format!(
            "SELECT p.method, COUNT(*) as cnt, SUM(p.amount) as total
             FROM payments p JOIN invoices i ON p.invoice_id = i.id JOIN fee_structures fs ON i.fee_structure_id = fs.id
             WHERE p.status = 'completed' AND {}
             GROUP BY p.method ORDER BY total DESC",
            where_clause
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<MethodCollection> = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(MethodCollection { method: row.get(0)?, count: row.get(1)?, total: row.get(2)? })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        rows
    };

    // Daily trend (last 30 days)
    let daily_trend = {
        let sql = format!(
            "SELECT DATE(p.created_at) as day, SUM(p.amount) as total
             FROM payments p JOIN invoices i ON p.invoice_id = i.id JOIN fee_structures fs ON i.fee_structure_id = fs.id
             WHERE p.status = 'completed' AND julianday('now') - julianday(p.created_at) <= 30 AND {}
             GROUP BY day ORDER BY day ASC",
            where_clause
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<DailyCollection> = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(DailyCollection { date: row.get(0)?, amount: row.get(1)? })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        rows
    };

    Ok(CollectionSummary {
        total_invoiced,
        total_paid,
        total_outstanding,
        total_discounted,
        collection_rate,
        by_grade,
        by_method,
        by_vote_head,
        daily_trend,
    })
}

#[tauri::command]
pub fn get_outstanding_report(
    state: State<'_, DbState>,
    school_id: String,
    academic_year: Option<i32>,
    term: Option<i32>,
) -> Result<Vec<StudentOutstanding>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut filters = vec!["s.school_id = ?1", "s.status = 'active'"];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(school_id)];

    if let Some(y) = academic_year {
        filters.push("fs.academic_year = ?");
        params.push(Box::new(y));
    }
    if let Some(t) = term {
        filters.push("fs.term = ?");
        params.push(Box::new(t));
    }

    let where_clause = filters.join(" AND ");
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let sql = format!(
        "SELECT s.id, s.first_name || ' ' || s.last_name, s.admission_no, s.grade,
                COALESCE(SUM(i.net_amount), 0) as total_invoiced,
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.id AND p.status = 'completed'), 0) as total_paid,
                MIN(CASE WHEN i.status != 'paid' THEN i.created_at END) as oldest_unpaid
         FROM students s
         LEFT JOIN invoices i ON s.id = i.student_id
         LEFT JOIN fee_structures fs ON i.fee_structure_id = fs.id
         WHERE {}
         GROUP BY s.id
         HAVING total_invoiced - total_paid > 0
         ORDER BY (total_invoiced - total_paid) DESC",
        where_clause
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let results: Vec<StudentOutstanding> = stmt
        .query_map(param_refs.as_slice(), |row| {
            let total_invoiced: i64 = row.get(4)?;
            let total_paid: i64 = row.get(5)?;
            let outstanding = total_invoiced - total_paid;
            let oldest: Option<String> = row.get(6)?;
            let oldest_str = oldest.unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
            let days = chrono::NaiveDateTime::parse_from_str(&oldest_str[..19], "%Y-%m-%dT%H:%M:%S")
                .map(|d| (chrono::Utc::now().naive_utc() - d).num_days() as i32)
                .unwrap_or(0);

            Ok(StudentOutstanding {
                student_id: row.get(0)?,
                student_name: row.get(1)?,
                admission_no: row.get(2)?,
                grade: row.get(3)?,
                total_invoiced,
                total_paid,
                outstanding,
                oldest_unpaid_date: oldest_str,
                days_overdue: days,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

#[tauri::command]
pub fn get_age_analysis(
    state: State<'_, DbState>,
    _school_id: String,
) -> Result<Vec<AgeBucket>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT
                CASE
                    WHEN julianday('now') - julianday(i.created_at) <= 30 THEN '0-30 days'
                    WHEN julianday('now') - julianday(i.created_at) <= 60 THEN '31-60 days'
                    WHEN julianday('now') - julianday(i.created_at) <= 90 THEN '61-90 days'
                    ELSE '90+ days'
                END as bucket,
                COUNT(*) as count,
                SUM(i.net_amount - COALESCE(
                    (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'completed'), 0
                )) as amount
             FROM invoices i
             WHERE i.status != 'paid'
             GROUP BY bucket
             ORDER BY bucket",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<AgeBucket> = stmt
        .query_map([], |row| {
            Ok(AgeBucket {
                bucket: row.get(0)?,
                count: row.get(1)?,
                amount: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_student_history(
    state: State<'_, DbState>,
    student_id: String,
) -> Result<Vec<StudentHistoryEntry>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut entries: Vec<StudentHistoryEntry> = Vec::new();

    // Invoices as debits
    {
        let mut stmt = conn
            .prepare(
                "SELECT i.created_at, i.invoice_no, i.net_amount, i.discount_amount, fs.name
                 FROM invoices i
                 JOIN fee_structures fs ON i.fee_structure_id = fs.id
                 WHERE i.student_id = ?1
                 ORDER BY i.created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<(String, String, i64, i64, String)> = stmt
            .query_map(rusqlite::params![student_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for (created_at, invoice_no, net_amount, discount_amount, structure_name) in rows {
            entries.push(StudentHistoryEntry {
                date: created_at,
                description: format!("Invoice: {} ({})", invoice_no, structure_name),
                debit: net_amount,
                credit: 0,
                balance: 0,
                method: None,
                reference: if discount_amount > 0 { Some(format!("Discount: {}", discount_amount)) } else { None },
            });
        }
    }

    // Payments as credits
    {
        let mut stmt = conn
            .prepare(
                "SELECT p.created_at, p.payment_no, p.amount, p.method, p.reference, p.mpesa_receipt
                 FROM payments p
                 WHERE p.student_id = ?1 AND p.status = 'completed'
                 ORDER BY p.created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<(String, String, i64, String, Option<String>, Option<String>)> = stmt
            .query_map(rusqlite::params![student_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for (created_at, payment_no, amount, method, reference, mpesa_receipt) in rows {
            let desc = if let Some(ref receipt) = mpesa_receipt {
                format!("Payment: {} (M-Pesa: {})", payment_no, receipt)
            } else {
                format!("Payment: {}", payment_no)
            };
            entries.push(StudentHistoryEntry {
                date: created_at,
                description: desc,
                debit: 0,
                credit: amount,
                balance: 0,
                method: Some(method),
                reference,
            });
        }
    }

    // Sort by date
    entries.sort_by(|a, b| a.date.cmp(&b.date));

    // Calculate running balance
    let mut running_balance: i64 = 0;
    for entry in &mut entries {
        running_balance += entry.debit - entry.credit;
        entry.balance = running_balance;
    }

    Ok(entries)
}
