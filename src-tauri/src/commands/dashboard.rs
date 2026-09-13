use crate::db::connection::DbState;
use crate::models::DashboardStats;
use tauri::State;

#[tauri::command]
pub fn get_dashboard_stats(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<DashboardStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let total_students: i64 = {
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM students WHERE school_id = ?1 AND status = 'active'")
            .map_err(|e| e.to_string())?;
        stmt.query_row([&school_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };

    let total_collected: i64 = {
        let mut stmt = conn
            .prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed'")
            .map_err(|e| e.to_string())?;
        stmt.query_row([], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };

    let total_outstanding: i64 = {
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(SUM(i.net_amount), 0) - COALESCE(
                    (SELECT SUM(p.amount) FROM payments p WHERE p.status = 'completed'), 0
                 ) FROM invoices i",
            )
            .map_err(|e| e.to_string())?;
        stmt.query_row([], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };

    let collection_rate = if total_collected + total_outstanding > 0 {
        (total_collected as f64 / (total_collected + total_outstanding) as f64) * 100.0
    } else {
        0.0
    };

    Ok(crate::models::DashboardStats {
        total_students,
        total_collected,
        total_outstanding,
        collection_rate,
        recent_payments: Vec::new(),
        top_outstanding: Vec::new(),
        term_summary: crate::models::TermSummary {
            term: 1,
            academic_year: 2026,
            invoiced: total_collected + total_outstanding,
            collected: total_collected,
            outstanding: total_outstanding,
        },
    })
}
