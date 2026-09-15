use crate::models::{ParentBalance, PaymentLink, WhatsAppOutbox};
use crate::services::whatsapp::normalize_ke_phone;
use crate::utils::generate_id;
use rusqlite::Connection;
use tauri::State;
use crate::db::connection::DbState;

// ═══ PARENT BALANCE LOOKUP (shared inner) ═══

/// Find all children linked to a parent phone (E.164 2547XXXXXXXX),
/// with current-term balance per child. Used by the WhatsApp bot and
/// the bursar "parent view". Phone matching tries exact then suffix.
pub fn lookup_parent_balances_inner(
    conn: &Connection,
    raw_phone: &str,
) -> Result<Vec<ParentBalance>, String> {
    let e164 = normalize_ke_phone(raw_phone)
        .ok_or_else(|| "Unrecognized phone number format".to_string())?;
    let suffix = e164.chars().rev().take(9).collect::<String>(); // last 9 digits

    let mut stmt = conn.prepare(
        "SELECT s.id, s.admission_no, s.first_name, s.last_name, s.grade,
                COALESCE((SELECT SUM(i.net_amount) FROM invoices i WHERE i.student_id = s.id), 0),
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.id AND p.status = 'completed'), 0)
         FROM students s
         JOIN student_parents sp ON sp.student_id = s.id
         JOIN parents pa ON pa.id = sp.parent_id
         WHERE (pa.phone = ?1 OR pa.phone LIKE '%' || ?2)
           AND s.status = 'active'",
    ).map_err(|e| e.to_string())?;

    let term = current_term();
    let year = chrono::Utc::now().format("%Y").to_string().parse::<i32>().unwrap_or(2026);

    let rows: Vec<ParentBalance> = stmt.query_map(
        rusqlite::params![e164, suffix],
        |row| {
            let id: String = row.get(0)?;
            let adm: String = row.get(1)?;
            let fn_: String = row.get(2)?;
            let ln: String = row.get(3)?;
            let grade: String = row.get(4)?;
            let invoiced: i64 = row.get(5)?;
            let paid: i64 = row.get(6)?;
            Ok(ParentBalance {
                student_id: id,
                admission_no: adm,
                student_name: format!("{} {}", fn_, ln),
                grade,
                term,
                academic_year: year,
                outstanding: (invoiced - paid).max(0),
                invoiced,
                paid,
            })
        },
    ).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

fn current_term() -> i32 {
    let month: u32 = chrono::Utc::now().format("%m").to_string().parse().unwrap_or(1);
    if month < 4 { 1 } else if month < 8 { 2 } else { 3 }
}

// ═══ OUTBOX (shared inner) ═══

pub fn enqueue_outbox_inner(
    conn: &Connection,
    school_id: &str,
    parent_phone: &str,
    template_name: &str,
    params_json: &str,
    scheduled_for: Option<String>,
) -> Result<WhatsAppOutbox, String> {
    let phone = normalize_ke_phone(parent_phone).unwrap_or_else(|| parent_phone.to_string());
    let id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO whatsapp_outbox (id, school_id, parent_phone, channel, template_name, params_json, status, retry_count, scheduled_for, created_at)
         VALUES (?1, ?2, ?3, 'whatsapp', ?4, ?5, 'pending', 0, ?6, ?7)",
        rusqlite::params![id, school_id, phone, template_name, params_json, scheduled_for, now],
    ).map_err(|e| e.to_string())?;

    Ok(WhatsAppOutbox {
        id,
        school_id: school_id.to_string(),
        parent_phone: phone,
        channel: "whatsapp".to_string(),
        template_name: template_name.to_string(),
        params_json: params_json.to_string(),
        status: "pending".to_string(),
        meta_msg_id: None,
        retry_count: 0,
        scheduled_for,
        created_at: now,
        sent_at: None,
    })
}

// ═══ PAYMENT LINKS (shared inner) ═══

const PAY_LINK_TTL_MIN: i64 = 10;

pub fn generate_payment_link_inner(
    conn: &Connection,
    school_id: &str,
    invoice_id: &str,
    phone: &str,
) -> Result<PaymentLink, String> {
    let (net, status, inv_school): (i64, String, String) = conn.query_row(
        "SELECT net_amount, status, school_id FROM invoices WHERE id = ?1",
        rusqlite::params![invoice_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Invoice not found".to_string())?;

    if inv_school != school_id {
        return Err("Invoice does not belong to this school".to_string());
    }
    if status == "paid" || status == "waived" {
        return Err("Invoice is already settled".to_string());
    }

    let paid: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?1 AND status = 'completed'",
        rusqlite::params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let outstanding = (net - paid).max(0);
    if outstanding <= 0 {
        return Err("Invoice is already settled".to_string());
    }

    let token = generate_id().replace('-', "").chars().take(32).collect::<String>();
    let now = chrono::Utc::now();
    let expires = (now + chrono::Duration::minutes(PAY_LINK_TTL_MIN)).to_rfc3339();
    let created = now.to_rfc3339();
    let e164 = normalize_ke_phone(phone).unwrap_or_else(|| phone.to_string());

    conn.execute(
        "INSERT INTO payment_links (token, school_id, invoice_id, phone, amount, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![token, school_id, invoice_id, e164, outstanding, expires, created],
    ).map_err(|e| e.to_string())?;

    Ok(PaymentLink {
        token,
        school_id: school_id.to_string(),
        invoice_id: invoice_id.to_string(),
        phone: e164,
        amount: outstanding,
        expires_at: expires,
        used_at: None,
        created_at: created,
    })
}

pub fn resolve_payment_link_inner(conn: &Connection, token: &str) -> Result<PaymentLink, String> {
    let link: PaymentLink = conn.query_row(
        "SELECT token, school_id, invoice_id, phone, amount, expires_at, used_at, created_at
         FROM payment_links WHERE token = ?1",
        rusqlite::params![token],
        |row| Ok(PaymentLink {
            token: row.get(0)?,
            school_id: row.get(1)?,
            invoice_id: row.get(2)?,
            phone: row.get(3)?,
            amount: row.get(4)?,
            expires_at: row.get(5)?,
            used_at: row.get(6)?,
            created_at: row.get(7)?,
        }),
    ).map_err(|_| "Payment link not found".to_string())?;

    if link.used_at.is_some() {
        return Err("Payment link already used".to_string());
    }
    let now = chrono::Utc::now().to_rfc3339();
    if link.expires_at < now {
        return Err("Payment link expired".to_string());
    }
    Ok(link)
}

// ═══ TAURI COMMANDS (thin wrappers) ═══

#[tauri::command]
pub fn lookup_parent_balances(
    state: State<'_, DbState>,
    phone: String,
) -> Result<Vec<ParentBalance>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    lookup_parent_balances_inner(&conn, &phone)
}

#[tauri::command]
pub fn generate_payment_link(
    state: State<'_, DbState>,
    school_id: String,
    invoice_id: String,
    phone: String,
) -> Result<PaymentLink, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    generate_payment_link_inner(&conn, &school_id, &invoice_id, &phone)
}

#[tauri::command]
pub fn enqueue_whatsapp(
    state: State<'_, DbState>,
    school_id: String,
    parent_phone: String,
    template_name: String,
    params_json: String,
) -> Result<WhatsAppOutbox, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    enqueue_outbox_inner(&conn, &school_id, &parent_phone, &template_name, &params_json, None)
}
