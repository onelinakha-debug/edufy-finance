//! Fee reminder scheduler.
//! Scans unpaid invoices with due dates and enqueues WhatsApp reminders.
//! Idempotent: dedupe window prevents double-enqueue on repeated sweeps.

use chrono::{NaiveDate, Utc};
use rusqlite::Connection;

use crate::commands::whatsapp::enqueue_outbox_inner;
use crate::services::whatsapp::format_kes;

fn schedule_days() -> Vec<i64> {
    std::env::var("REMINDER_SCHEDULE")
        .unwrap_or_else(|_| "14,7,1".into())
        .split(',')
        .filter_map(|s| s.trim().parse::<i64>().ok())
        .collect()
}

/// Enqueue reminders for one school. Returns number of messages queued.
pub fn enqueue_due_reminders_inner(conn: &Connection, school_id: &str) -> Result<usize, String> {
    let schedule = schedule_days();
    let today: NaiveDate = Utc::now().date_naive();

    let mut stmt = conn.prepare(
        "SELECT i.id, i.invoice_no, i.net_amount,
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.status='completed'),0),
                i.due_date, s.first_name || ' ' || s.last_name, s.admission_no, s.grade
         FROM invoices i
         JOIN students s ON s.id = i.student_id
         WHERE s.school_id = ?1 AND i.status IN ('unpaid','partial') AND i.due_date IS NOT NULL",
    ).map_err(|e| e.to_string())?;

    #[allow(clippy::type_complexity)]
    let rows: Vec<(String, String, i64, i64, String, String, String, String)> = stmt.query_map(
        rusqlite::params![school_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
    ).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    drop(stmt);

    let mut queued = 0;
    for (inv_id, inv_no, net, paid, due_str, student_name, adm, grade) in rows {
        let outstanding = (net - paid).max(0);
        if outstanding <= 0 {
            continue;
        }
        let due = match NaiveDate::parse_from_str(&due_str[..10.min(due_str.len())], "%Y-%m-%d") {
            Ok(d) => d,
            Err(_) => continue,
        };
        let days = (due - today).num_days();

        let template: Option<String> = if schedule.contains(&days) {
            Some(format!("fee_reminder_{}d", days))
        } else if (-30..0).contains(&days) {
            Some("fee_overdue".to_string())
        } else {
            None
        };
        let template = match template {
            Some(t) => t,
            None => continue,
        };

        // Dedupe: same template+invoice within window (36h pre-due, 7d overdue)
        let window_h = if template == "fee_overdue" { 168 } else { 36 };
        let recent: i64 = conn.query_row(
            "SELECT COUNT(*) FROM whatsapp_outbox
             WHERE template_name = ?1 AND params_json LIKE '%' || ?2 || '%'
               AND datetime(created_at) > datetime('now', ?3)",
            rusqlite::params![template, inv_id, format!("-{} hours", window_h)],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        if recent > 0 {
            continue;
        }

        // Primary parent phone; skip opted-out
        let parent: Option<(String, i64)> = conn.query_row(
            "SELECT pa.phone, COALESCE(pa.sms_opt_out,0) FROM parents pa
             JOIN student_parents sp ON sp.parent_id = pa.id
             WHERE sp.student_id = ?1 ORDER BY pa.is_primary DESC LIMIT 1",
            rusqlite::params![{
                // student_id lookup
                conn.query_row(
                    "SELECT student_id FROM invoices WHERE id = ?1",
                    rusqlite::params![inv_id],
                    |row| row.get::<_, String>(0),
                ).unwrap_or_default()
            }],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok();
        let (phone, opted_out) = match parent {
            Some(p) => p,
            None => continue,
        };
        if opted_out == 1 {
            continue;
        }

        let body = if template == "fee_overdue" {
            format!(
                "⚠️ OVERDUE: {} ({}, {}) owes {} ({} was due {}). Pay now to avoid penalties. Reply PAY for an M-Pesa link.",
                student_name, grade, adm, format_kes(outstanding), inv_no, &due_str[..10.min(due_str.len())]
            )
        } else if days == 1 {
            format!(
                "⏰ URGENT: {} ({}) — {} due TOMORROW ({}). Reply PAY for an M-Pesa link.",
                student_name, adm, format_kes(outstanding), inv_no
            )
        } else {
            format!(
                "📋 Fee reminder: {} ({}, {}) — {} due in {} days ({}). Reply PAY for an M-Pesa link, BALANCE for details.",
                student_name, grade, adm, format_kes(outstanding), days, inv_no
            )
        };

        let params = serde_json::json!({
            "body": body,
            "invoice_id": inv_id,
            "student_name": student_name,
            "amount": outstanding,
        }).to_string();

        if enqueue_outbox_inner(conn, school_id, &phone, &template, &params, None).is_ok() {
            queued += 1;
        }
    }

    Ok(queued)
}
