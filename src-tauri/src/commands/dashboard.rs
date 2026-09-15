use crate::db::connection::DbState;
use crate::models::{DashboardStats, TermSummary, RecentPayment, TopOutstanding};
use rusqlite::Connection;
use tauri::State;

pub fn get_dashboard_stats_inner(conn: &Connection, school_id: String) -> Result<DashboardStats, String> {
    // Single optimized query combining student count, collection stats, and outstanding
    let total_students: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM students WHERE school_id = ?1 AND status = 'active'",
            rusqlite::params![school_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let (total_invoiced, total_paid, _overdue_count): (i64, i64, i64) = conn
        .query_row(
            "SELECT
                COALESCE(SUM(i.net_amount), 0),
                COALESCE((SELECT SUM(p.amount) FROM payments p JOIN invoices pi ON p.invoice_id = pi.id
                          JOIN students s2 ON pi.student_id = s2.id WHERE s2.school_id = ?1 AND p.status = 'completed'), 0),
                COALESCE((SELECT COUNT(*) FROM invoices i2 JOIN students s3 ON i2.student_id = s3.id
                          WHERE s3.school_id = ?1 AND i2.status = 'overdue'), 0)
             FROM invoices i
             JOIN students s ON i.student_id = s.id
             WHERE s.school_id = ?1",
            rusqlite::params![school_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let total_outstanding = total_invoiced - total_paid;
    let collection_rate = if total_invoiced > 0 {
        (total_paid as f64 / total_invoiced as f64) * 100.0
    } else {
        0.0
    };

    // Recent payments (last 5)
    let recent_payments: Vec<RecentPayment> = {
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.payment_no, p.amount, p.method, p.mpesa_receipt, p.created_at,
                        s.first_name || ' ' || s.last_name as student_name, s.admission_no
                 FROM payments p
                 JOIN students s ON p.student_id = s.id
                 WHERE s.school_id = ?1 AND p.status = 'completed'
                 ORDER BY p.created_at DESC LIMIT 5",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![school_id], |row| {
            Ok(RecentPayment {
                id: row.get(0)?,
                payment_no: row.get(1)?,
                amount: row.get(2)?,
                method: row.get(3)?,
                mpesa_receipt: row.get(4)?,
                created_at: row.get(5)?,
                student_name: row.get(6)?,
                admission_no: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    // Top 5 outstanding students
    let top_outstanding: Vec<TopOutstanding> = {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.first_name || ' ' || s.last_name as name, s.admission_no, s.grade,
                        COALESCE(SUM(i.net_amount), 0) as total_invoiced,
                        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.id AND p.status = 'completed'), 0) as total_paid
                 FROM students s
                 LEFT JOIN invoices i ON s.id = i.student_id
                 WHERE s.school_id = ?1 AND s.status = 'active'
                 GROUP BY s.id
                 HAVING total_invoiced - total_paid > 0
                 ORDER BY (total_invoiced - total_paid) DESC LIMIT 5",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![school_id], |row| {
            let invoiced: i64 = row.get(4)?;
            let paid: i64 = row.get(5)?;
            Ok(TopOutstanding {
                student_id: row.get(0)?,
                student_name: row.get(1)?,
                admission_no: row.get(2)?,
                grade: row.get(3)?,
                outstanding: invoiced - paid,
            })
        })
        .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    // Current term summary (dynamic)
    let now = chrono::Utc::now();
    let month = now.format("%m").to_string().parse::<u32>().unwrap_or(1);
    let current_term = if month <= 4 { 1 } else if month <= 8 { 2 } else { 3 };
    let current_year = now.format("%Y").to_string().parse::<i32>().unwrap_or(2026);

    let term_summary = {
        let result = conn.query_row(
            "SELECT
                COALESCE(SUM(i.net_amount), 0) as invoiced,
                COALESCE((SELECT SUM(p.amount) FROM payments p JOIN invoices pi ON p.invoice_id = pi.id
                          JOIN students s ON pi.student_id = s.id
                          JOIN fee_structures fs ON pi.fee_structure_id = fs.id
                          WHERE s.school_id = ?1 AND fs.term = ?2 AND fs.academic_year = ?3 AND p.status = 'completed'), 0) as collected
             FROM invoices i
             JOIN students s ON i.student_id = s.id
             JOIN fee_structures fs ON i.fee_structure_id = fs.id
             WHERE s.school_id = ?1 AND fs.term = ?2 AND fs.academic_year = ?3",
            rusqlite::params![school_id, current_term, current_year],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        );

        match result {
            Ok((invoiced, collected)) => TermSummary {
                term: current_term,
                academic_year: current_year,
                invoiced,
                collected,
                outstanding: invoiced - collected,
            },
            Err(_) => TermSummary {
                term: current_term,
                academic_year: current_year,
                invoiced: 0,
                collected: 0,
                outstanding: 0,
            },
        }
    };

    Ok(DashboardStats {
        total_students,
        total_collected: total_paid,
        total_outstanding,
        collection_rate,
        recent_payments,
        top_outstanding,
        term_summary,
    })
}

#[tauri::command]
pub fn get_dashboard_stats(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<DashboardStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_dashboard_stats_inner(&conn, school_id)
}
