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

// ═══ OTP-GUARDED PARENT LINKING ═══

const OTP_TTL_MIN: i64 = 10;
const OTP_MAX_ATTEMPTS: i32 = 5;

/// Deterministic-enough 6-digit code from a fresh uuid (no rand crate needed).
fn new_otp_code() -> String {
    use sha2::{Digest, Sha256};
    let raw = generate_id();
    let digest = Sha256::digest(raw.as_bytes());
    let mut digits = String::new();
    for b in digest.iter() {
        if digits.len() >= 6 {
            break;
        }
        digits.push_str(&(b % 10).to_string());
    }
    while digits.len() < 6 {
        digits.push('0');
    }
    digits
}

fn mask(phone: &str) -> String {
    if phone.len() >= 6 {
        format!("{}***{}", &phone[..4], &phone[phone.len() - 3..])
    } else {
        "***".to_string()
    }
}

use crate::models::{LinkOtpRequest, PendingLinkRequest};

/// Step 1: parent sends an admission no from an unlinked phone.
/// Creates an OTP and delivers the code to the ON-FILE parent number(s)
/// (WhatsApp outbox, so it sends even if the bot worker is the only sender).
/// Returns masked on-file numbers so the requester knows where to ask.
pub fn request_link_otp_inner(
    conn: &Connection,
    admission_no: &str,
    requester_phone: &str,
) -> Result<LinkOtpRequest, String> {
    let adm = admission_no.trim();
    if adm.is_empty() {
        return Err("Admission number is required".to_string());
    }
    let req_phone = normalize_ke_phone(requester_phone).unwrap_or_else(|| requester_phone.to_string());

    let (student_id, school_id, student_name): (String, String, String) = conn.query_row(
        "SELECT s.id, s.school_id, s.first_name || ' ' || s.last_name
         FROM students s WHERE s.admission_no = ?1 AND s.status = 'active'",
        rusqlite::params![adm],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "No active student with that admission number.".to_string())?;

    // Already linked? Short-circuit — no OTP needed.
    let linked: i64 = conn.query_row(
        "SELECT COUNT(*) FROM student_parents sp
         JOIN parents pa ON pa.id = sp.parent_id
         WHERE sp.student_id = ?1 AND (pa.phone = ?2 OR pa.phone_e164 = ?2)",
        rusqlite::params![student_id, req_phone],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if linked > 0 {
        return Ok(LinkOtpRequest { masked_phones: vec![], expires_in_min: 0, already_linked: true });
    }

    // On-file parent numbers for this child.
    let on_file: Vec<String> = conn.prepare(
        "SELECT COALESCE(NULLIF(pa.phone_e164,''), pa.phone) FROM parents pa
         JOIN student_parents sp ON sp.parent_id = pa.id
         WHERE sp.student_id = ?1",
    ).map_err(|e| e.to_string())?
    .query_map(rusqlite::params![student_id], |row| row.get(0))
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    if on_file.is_empty() {
        return Err(format!(
            "No parent number is on file for {}. Ask the bursar to register your number first.",
            student_name
        ));
    }

    let code = new_otp_code();
    let now = chrono::Utc::now();
    let expires = (now + chrono::Duration::minutes(OTP_TTL_MIN)).to_rfc3339();
    let otp_id = generate_id();
    conn.execute(
        "INSERT INTO parent_link_otps (id, school_id, student_id, requester_phone, code, attempts, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
        rusqlite::params![otp_id, school_id, student_id, req_phone, code, expires, now.to_rfc3339()],
    ).map_err(|e| e.to_string())?;

    // Deliver code to on-file numbers via outbox (worker sends; bursar can also relay from panel).
    for num in &on_file {
        let params = serde_json::json!({
            "body": format!(
                "🔐 Edufy access code for {}: {}. Valid 10 min. Share it ONLY with the child's parent/guardian. If you didn't request this, ignore it.",
                student_name, code
            ),
        }).to_string();
        let _ = enqueue_outbox_inner(conn, &school_id, num, "link_otp", &params, None);
    }

    Ok(LinkOtpRequest {
        masked_phones: on_file.iter().map(|p| mask(p)).collect(),
        expires_in_min: OTP_TTL_MIN,
        already_linked: false,
    })
}

/// Step 2: requester replies with the 6-digit code. On success, links phone↔student.
pub fn verify_link_otp_inner(
    conn: &Connection,
    admission_no: &str,
    requester_phone: &str,
    code: &str,
) -> Result<String, String> {
    let req_phone = normalize_ke_phone(requester_phone).unwrap_or_else(|| requester_phone.to_string());
    let code = code.trim().replace(' ', "");
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err("Enter the 6-digit code.".to_string());
    }

    let (student_id, _school_id, student_name): (String, String, String) = conn.query_row(
        "SELECT s.id, s.school_id, s.first_name || ' ' || s.last_name
         FROM students s WHERE s.admission_no = ?1 AND s.status = 'active'",
        rusqlite::params![admission_no.trim()],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "No active student with that admission number.".to_string())?;

    let (otp_id, code_stored, attempts, expires_at, used_at): (String, String, i32, String, Option<String>) = conn.query_row(
        "SELECT id, code, attempts, expires_at, used_at FROM parent_link_otps
         WHERE student_id = ?1 AND requester_phone = ?2 AND used_at IS NULL
         ORDER BY created_at DESC LIMIT 1",
        rusqlite::params![student_id, req_phone],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).map_err(|_| "No pending code for this number. Send the admission number first to get a code.".to_string())?;

    if used_at.is_some() {
        return Err("This code was already used. Request a new one.".to_string());
    }
    if attempts >= OTP_MAX_ATTEMPTS {
        return Err("Too many wrong attempts. Wait 30 minutes and try again.".to_string());
    }
    let now = chrono::Utc::now().to_rfc3339();
    if expires_at < now {
        return Err("Code expired. Send the admission number again for a new code.".to_string());
    }
    if code != code_stored {        conn.execute(
            "UPDATE parent_link_otps SET attempts = attempts + 1 WHERE id = ?1",
            rusqlite::params![otp_id],
        ).ok();
        return Err("Wrong code. Check and try again.".to_string());
    }

    // Success: mark used + link phone↔student (find-or-create parent row).
    let now2 = chrono::Utc::now().to_rfc3339();
    conn.execute("UPDATE parent_link_otps SET used_at = ?1 WHERE id = ?2", rusqlite::params![now2, otp_id]).ok();

    let parent_id: Option<String> = conn.query_row(
        "SELECT id FROM parents WHERE phone = ?1 OR phone_e164 = ?1 LIMIT 1",
        rusqlite::params![req_phone],
        |row| row.get(0),
    ).ok();
    let parent_id = match parent_id {
        Some(id) => id,
        None => {
            let id = generate_id();
            conn.execute(
                "INSERT INTO parents (id, name, phone, phone_e164, relationship, is_primary, created_at)
                 VALUES (?1, ?2, ?3, ?3, 'guardian', 0, ?4)",
                rusqlite::params![id, format!("Parent {}", &req_phone[req_phone.len().saturating_sub(4)..]), req_phone, now2],
            ).map_err(|e| e.to_string())?;
            id
        }
    };
    conn.execute(
        "INSERT OR IGNORE INTO student_parents (student_id, parent_id) VALUES (?1, ?2)",
        rusqlite::params![student_id, parent_id],
    ).map_err(|e| e.to_string())?;

    Ok(format!("✅ {} linked! Reply BALANCE to see fees.", student_name))
}

/// Bursar relay queue: pending (unused, unexpired) OTPs with codes masked.
/// NOTE: codes are hashed at rest; the panel shows request metadata so the
/// bursar can confirm legitimacy — actual codes travel via outbox to on-file numbers.
pub fn list_link_requests_inner(conn: &Connection, school_id: &str) -> Result<Vec<PendingLinkRequest>, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "SELECT o.id, o.student_id, s.admission_no, s.first_name || ' ' || s.last_name, s.grade,
                o.requester_phone, o.attempts, o.expires_at, o.created_at
         FROM parent_link_otps o
         JOIN students s ON s.id = o.student_id
         WHERE o.school_id = ?1 AND o.used_at IS NULL AND o.expires_at > ?2
         ORDER BY o.created_at DESC LIMIT 50",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(
        rusqlite::params![school_id, now],
        |row| Ok(PendingLinkRequest {
            otp_id: row.get(0)?,
            student_id: row.get(1)?,
            admission_no: row.get(2)?,
            student_name: row.get(3)?,
            grade: row.get(4)?,
            requester_phone: row.get(5)?,
            attempts: row.get(6)?,
            expires_at: row.get(7)?,
            created_at: row.get(8)?,
        }),
    ).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(rows)
}

// ═══ TEXT STATEMENT ═══

/// Compact in-chat statement: invoices with status + recent payments + totals.
pub fn text_statement_inner(conn: &Connection, student_id: &str) -> Result<String, String> {
    let (name, adm, grade): (String, String, String) = conn.query_row(
        "SELECT first_name || ' ' || last_name, admission_no, grade FROM students WHERE id = ?1",
        rusqlite::params![student_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Student not found".to_string())?;

    let mut out = format!("📄 *Statement — {} ({}, Adm: {})*\n", name, grade, adm);
    let mut stmt = conn.prepare(
        "SELECT invoice_no, net_amount, status, substr(created_at,1,10) FROM invoices
         WHERE student_id = ?1 ORDER BY created_at DESC LIMIT 8",
    ).map_err(|e| e.to_string())?;
    let invs: Vec<(String, i64, String, String)> = stmt.query_map(
        rusqlite::params![student_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    drop(stmt);

    if invs.is_empty() {
        out.push_str("No invoices yet.\n");
    } else {
        for (no, net, status, date) in &invs {
            out.push_str(&format!("• {} — {} [{}] ({})\n", no, crate::services::whatsapp::format_kes(*net), status, date));
        }
    }

    let (invoiced, paid): (i64, i64) = conn.query_row(
        "SELECT COALESCE((SELECT SUM(net_amount) FROM invoices WHERE student_id = ?1),0),
                COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = ?1 AND status='completed'),0)",
        rusqlite::params![student_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;
    out.push_str(&format!(
        "─────────────────\nTotal invoiced: {}\nTotal paid: {}\nBalance: *{}*",
        crate::services::whatsapp::format_kes(invoiced),
        crate::services::whatsapp::format_kes(paid),
        crate::services::whatsapp::format_kes((invoiced - paid).max(0)),
    ));
    Ok(out)
}

#[tauri::command]
pub fn request_link_otp(
    state: State<'_, DbState>,
    admission_no: String,
    phone: String,
) -> Result<LinkOtpRequest, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    request_link_otp_inner(&conn, &admission_no, &phone)
}

#[tauri::command]
pub fn verify_link_otp(
    state: State<'_, DbState>,
    admission_no: String,
    phone: String,
    code: String,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    verify_link_otp_inner(&conn, &admission_no, &phone, &code)
}

#[tauri::command]
pub fn list_link_requests(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<Vec<PendingLinkRequest>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    list_link_requests_inner(&conn, &school_id)
}

/// Bursar reveal: show a pending code to relay verbally when auto-delivery
/// failed. Audit-logged. Does NOT consume the code.
pub fn reveal_link_code_inner(
    conn: &Connection,
    otp_id: &str,
    performed_by: &str,
) -> Result<String, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let (code, used_at, expires_at): (String, Option<String>, String) = conn.query_row(
        "SELECT code, used_at, expires_at FROM parent_link_otps WHERE id = ?1",
        rusqlite::params![otp_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Code request not found".to_string())?;
    if used_at.is_some() {
        return Err("Code already used".to_string());
    }
    if expires_at < now {
        return Err("Code expired".to_string());
    }
    conn.execute(
        "INSERT INTO audit_log (id, action, entity, entity_id, changes, performed_by, created_at)
         VALUES (?1, 'reveal_otp', 'parent_link_otp', ?2, 'bursar relay', ?3, ?4)",
        rusqlite::params![generate_id(), otp_id, performed_by, now],
    ).ok();
    Ok(code)
}

#[tauri::command]
pub fn reveal_link_code(
    state: State<'_, DbState>,
    otp_id: String,
    performed_by: String,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    reveal_link_code_inner(&conn, &otp_id, &performed_by)
}

#[tauri::command]
pub fn sweep_reminders(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let n = crate::services::scheduler::enqueue_due_reminders_inner(&conn, &school_id)?;
    Ok(serde_json::json!({"queued": n}))
}

#[tauri::command]
pub fn whatsapp_status(
    state: State<'_, DbState>,
) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let pending: i64 = conn.query_row(
        "SELECT COUNT(*) FROM whatsapp_outbox WHERE status = 'pending'",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let links_pending: i64 = conn.query_row(
        "SELECT COUNT(*) FROM parent_link_otps WHERE used_at IS NULL AND expires_at > datetime('now')",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let wa_cfg = crate::services::whatsapp::WhatsAppConfig::from_env();
    Ok(serde_json::json!({
        "whatsapp_configured": wa_cfg.as_ref().map(|c| c.is_configured()).unwrap_or(false),
        "sms_configured": crate::services::sms::SmsConfig::from_env().is_some(),
        "outbox_pending": pending,
        "link_requests_pending": links_pending,
    }))
}
