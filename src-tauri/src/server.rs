use axum::{
    extract::{Path, Query, State as AxumState, Request},
    http::{header, StatusCode, Method, HeaderMap},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    body::Bytes,
    Json, Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

use crate::auth;
use crate::commands;
use crate::db::connection::DbState;
use crate::models::User;
use crate::services::whatsapp as wa;

// ═══ SHARED STATE ═══

pub struct AppState {
    pub db: DbState,
    pub jwt_secret: Vec<u8>,
}

// ═══ ERROR HANDLING ═══

struct AppError(String);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = serde_json::json!({ "error": self.0 });
        (StatusCode::BAD_REQUEST, Json(body)).into_response()
    }
}

// ═══ HELPER ═══

fn lock_db(state: &Arc<AppState>) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, AppError> {
    state.db.0.lock().map_err(|e| AppError(e.to_string()))
}

// ═══ AUTH MIDDLEWARE ═══

async fn auth_middleware(
    AxumState(state): AxumState<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = request.uri().path().to_string();

    // Public routes: login, health, WhatsApp webhook, public pay page
    if path == "/api/auth/login"
        || path == "/health"
        || path == "/webhook/whatsapp"
        || path.starts_with("/pay/")
    {
        return Ok(next.run(request).await);
    }

    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));

    match token {
        Some(t) => match auth::verify_token(t, &state.jwt_secret) {
            Ok(_claims) => Ok(next.run(request).await),
            Err(_) => Err(StatusCode::UNAUTHORIZED),
        },
        None => Err(StatusCode::UNAUTHORIZED),
    }
}

// ═══ REQUEST TYPES ═══

#[derive(Deserialize)]
struct IdReq { id: String }
#[derive(Deserialize)]
struct SchoolIdReq { school_id: String }

#[derive(Deserialize)]
struct CreateSchoolReq { name: String, school_type: String, curriculum: Option<String>, county: Option<String>, phone: Option<String>, email: Option<String> }
#[derive(Deserialize)]
struct UpdateSchoolReq { id: String, name: Option<String>, school_type: Option<String>, county: Option<String>, phone: Option<String>, email: Option<String>, mpesa_paybill: Option<String>, mpesa_till: Option<String> }

#[derive(Deserialize)]
struct CreateStudentReq { school_id: String, admission_no: String, first_name: String, last_name: String, middle_name: Option<String>, grade: String, stream: Option<String>, enrollment_date: Option<String> }
#[derive(Deserialize)]
struct GetStudentsReq { school_id: String, grade: Option<String>, status: Option<String> }
#[derive(Deserialize)]
struct UpdateStudentReq { id: String, first_name: Option<String>, last_name: Option<String>, middle_name: Option<String>, grade: Option<String>, stream: Option<String>, status: Option<String> }

#[derive(Deserialize)]
struct CreateFeeStructureReq { school_id: String, name: String, grade: String, term: i32, academic_year: i32 }
#[derive(Deserialize)]
struct GetFeeStructuresReq { school_id: String, academic_year: Option<i32>, term: Option<i32> }
#[derive(Deserialize)]
struct AddVoteHeadReq { fee_structure_id: String, name: String, category: String, amount: i64, is_mandatory: Option<bool>, sort_order: Option<i32> }
#[derive(Deserialize)]
struct GetVoteHeadsReq { fee_structure_id: String }
#[derive(Deserialize)]
struct DiscountConfigReq { school_id: String, name: String, discount_type: String, rate: f64, min_students: i32, is_active: bool }
#[derive(Deserialize)]
struct GenerateInvoicesReq { fee_structure_id: String, student_ids: Option<Vec<String>> }
#[derive(Deserialize)]
struct GetInvoicesReq { student_id: Option<String>, status: Option<String>, limit: Option<i32>, offset: Option<i32> }
#[derive(Deserialize)]
struct RecordPaymentReq { invoice_id: String, amount: i64, method: String, reference: Option<String>, mpesa_receipt: Option<String>, notes: Option<String>, received_by: Option<String> }
#[derive(Deserialize)]
struct GetPaymentsReq { student_id: Option<String>, method: Option<String>, limit: Option<i32>, offset: Option<i32> }
#[derive(Deserialize)]
struct MpesaConfigReq { school_id: String, consumer_key: String, consumer_secret: String, passkey: String, shortcode: String, callback_url: Option<String> }
#[derive(Deserialize)]
struct MpesaTransactionsReq { school_id: String, limit: Option<i32> }
#[derive(Deserialize)]
struct C2bMatchReq { transaction_id: String, invoice_id: String }
#[derive(Deserialize)]
struct CollectionSummaryReq { school_id: String, academic_year: i32, term: Option<i32> }
#[derive(Deserialize)]
struct OutstandingReportReq { school_id: String, academic_year: Option<i32>, term: Option<i32> }
#[derive(Deserialize)]
struct StudentHistoryReq { student_id: String }
#[derive(Deserialize)]
struct SettingReq { key: String }
#[derive(Deserialize)]
struct SetSettingReq { key: String, value: String }
#[derive(Deserialize)]
struct SchoolProfileReq { school_id: String }
#[derive(Deserialize)]
struct UpdateSchoolProfileReq { school_id: String, name: Option<String>, school_type: Option<String>, address: Option<String>, phone: Option<String>, email: Option<String>, motto: Option<String>, county: Option<String> }
#[derive(Deserialize)]
struct CreateUserReq { school_id: String, username: String, password: String, full_name: String, role: String }
#[derive(Deserialize)]
struct UpdateUserReq { user_id: String, full_name: Option<String>, role: Option<String>, is_active: Option<bool> }
#[derive(Deserialize)]
struct CreateGradeReq { school_id: String, name: String, level: String, sort_order: Option<i32> }
#[derive(Deserialize)]
struct UpdateGradeReq { id: String, name: Option<String>, level: Option<String>, sort_order: Option<i32>, is_active: Option<bool> }
#[derive(Deserialize)]
struct PromoteStudentsReq { school_id: String, from_grade: String, to_grade: String, academic_year: i32, student_ids: Option<Vec<String>> }
#[derive(Deserialize)]
struct CountStudentsReq { school_id: String, grade: String }
#[derive(Deserialize)]
struct LoginReq { username: String, password: String, school_id: String }
#[derive(Deserialize)]
struct GenerateLinkReq { school_id: String, invoice_id: String, phone: String }
#[derive(Deserialize)]
struct EnqueueWaReq { school_id: String, parent_phone: String, template_name: String, params_json: Option<String> }

// ═══ HANDLERS ═══

async fn health() -> &'static str { "OK" }

// ═══ WHATSAPP WEBHOOK (public) ═══

/// Meta verification handshake: GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
async fn whatsapp_verify(Query(q): Query<HashMap<String, String>>) -> impl IntoResponse {
    let mode = q.get("hub.mode").map(|s| s.as_str()).unwrap_or("");
    let token = q.get("hub.verify_token").map(|s| s.as_str()).unwrap_or("");
    let challenge = q.get("hub.challenge").cloned().unwrap_or_default();
    let expected = std::env::var("WHATSAPP_VERIFY_TOKEN").unwrap_or_default();
    if mode == "subscribe" && !expected.is_empty() && token == expected && !challenge.is_empty() {
        return challenge.into_response();
    }
    StatusCode::FORBIDDEN.into_response()
}

/// Incoming message handler: verifies HMAC, spawns async processing, returns 200 fast.
async fn whatsapp_webhook(
    AxumState(s): AxumState<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let sig = headers
        .get("x-hub-signature-256")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let secret = std::env::var("WHATSAPP_APP_SECRET").unwrap_or_default();
    if !secret.is_empty() && !wa::verify_meta_signature(&secret, &body, sig) {
        log::warn!("WhatsApp webhook: bad signature");
        return StatusCode::FORBIDDEN;
    }
    let payload: wa::WhatsAppIncoming = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(_) => return StatusCode::OK, // ack non-message callbacks (e.g. status updates)
    };
    let state = s.clone();
    tokio::spawn(async move {
        handle_wa_inbound(state, payload).await;
    });
    StatusCode::OK
}

/// Core inbound logic: BALANCE / admission-no / PAY / RECEIPT keywords.
async fn handle_wa_inbound(state: Arc<AppState>, payload: wa::WhatsAppIncoming) {
    let (phone_raw, text_raw) = match wa::extract_inbound(&payload) {
        Some(v) => v,
        None => return,
    };
    let phone = match wa::normalize_ke_phone(&phone_raw) {
        Some(p) => p,
        None => return,
    };
    log::info!("WhatsApp inbound from {}", wa::mask_phone(&phone));
    let text = text_raw.trim().to_lowercase();

    // Balance lookup (sender phone → linked children)
    let balances = {
        let conn = match lock_db(&state) {
            Ok(c) => c,
            Err(_) => return,
        };
        commands::whatsapp::lookup_parent_balances_inner(&conn, &phone).unwrap_or_default()
    };

    // (reply text, optional interactive buttons [(id, title)])
    let (reply, buttons): (String, Vec<(&str, &str)>) = if text == "balance" || text == "bal" || text == "fee" || text == "ada" {
        let r = build_balance_reply(&balances);
        let b = if balances.is_empty() { vec![] } else { vec![("pay_mpesa", "💳 Pay"), ("statement", "📄 Statement"), ("talk_bursar", "💬 Bursar")] };
        (r, b)
    } else if text == "pay" || text == "lipa" {
        (build_pay_reply(&state, &phone, &balances).await, vec![])
    } else if text == "statement" || text == "statement_ready" {
        (build_statement_reply(&state, &balances), vec![])
    } else if text == "plan" {
        (build_plan_reply(&state, &balances), vec![])
    } else if text.chars().all(|c| c.is_ascii_digit()) && (3..=10).contains(&text.len()) {
        // Admission no: linked → balance; unlinked → OTP challenge to on-file number.
        let hit: Vec<_> = balances.iter().filter(|b| b.admission_no == text_raw.trim()).collect();
        if !hit.is_empty() {
            let owned: Vec<_> = hit.into_iter().cloned().collect();
            let r = build_balance_reply(&owned);
            (r, vec![("pay_mpesa", "💳 Pay"), ("statement", "📄 Statement"), ("talk_bursar", "💬 Bursar")])
        } else {
            (request_otp_reply(&state, text_raw.trim(), &phone), vec![])
        }
    } else if text.starts_with("btn:") {
        match text.as_str() {
            "btn:pay_mpesa" => (build_pay_reply(&state, &phone, &balances).await, vec![]),
            "btn:statement" => (build_statement_reply(&state, &balances), vec![]),
            "btn:plan" => (build_plan_reply(&state, &balances), vec![]),
            "btn:talk_bursar" => (bursar_contact(&state), vec![]),
            _ => (build_balance_reply(&balances), vec![]),
        }
    } else if text.contains(' ') {
        // "34567 482913" → admission + OTP verify
        let parts: Vec<&str> = text_raw.trim().split_whitespace().collect();
        if parts.len() == 2 && parts[1].len() == 6 && parts[1].chars().all(|c| c.is_ascii_digit()) {
            (verify_otp_reply(&state, parts[0], &phone, parts[1]), vec![])
        } else {
            (help_text().to_string(), vec![])
        }
    } else if ["hi", "hello", "start", "menu", "help", "msaada"].contains(&text.as_str()) {
        (help_text().to_string(), vec![])
    } else {
        (help_text().to_string(), vec![])
    };

    // Persist to outbox (audit + retry) and attempt direct send
    let school_id = balances.first().map(|b| {
        // resolve school via student
        let conn = lock_db(&state).ok()?;
        conn.query_row(
            "SELECT school_id FROM students WHERE id = ?1",
            rusqlite::params![b.student_id],
            |row| row.get::<_, String>(0),
        ).ok()
    }).flatten().unwrap_or_default();

    if !school_id.is_empty() {
        if let Ok(conn) = lock_db(&state) {
            let params = serde_json::json!({"body": reply}).to_string();
            let _ = commands::whatsapp::enqueue_outbox_inner(
                &conn, &school_id, &phone, "bot_reply", &params, None,
            );
        }
    }

    if let Some(cfg) = wa::WhatsAppConfig::from_env() {
        if cfg.is_configured() {
            let res = if buttons.is_empty() {
                wa::send_text(&cfg, &phone, &reply).await
            } else {
                wa::send_interactive_buttons(&cfg, &phone, &reply, &buttons).await
            };
            if let Err(e) = res {
                log::warn!("WhatsApp direct send failed for {}: {}", wa::mask_phone(&phone), e);
            }
        }
    }
}

fn request_otp_reply(state: &Arc<AppState>, admission_no: &str, requester_phone: &str) -> String {
    let res = lock_db(state).map_err(|_| "busy".to_string()).and_then(|conn| {
        commands::whatsapp::request_link_otp_inner(&conn, admission_no, requester_phone).map_err(|e| e)
    });
    match res {
        Ok(r) if r.already_linked => {
            // Number got linked meanwhile (or was already) — show balance.
            let balances = lock_db(state).ok()
                .and_then(|conn| commands::whatsapp::lookup_parent_balances_inner(&conn, requester_phone).ok())
                .unwrap_or_default();
            build_balance_reply(&balances)
        }
        Ok(r) => format!(
            "🔐 For security, I've sent a 6-digit code to the parent number on file ({}). Reply with `{}` + code, e.g. `{} 482913`. Valid {} min.",
            r.masked_phones.join(", "), admission_no, admission_no, r.expires_in_min
        ),
        Err(e) => e,
    }
}

fn verify_otp_reply(state: &Arc<AppState>, admission_no: &str, requester_phone: &str, code: &str) -> String {
    match lock_db(state) {
        Ok(conn) => match commands::whatsapp::verify_link_otp_inner(&conn, admission_no, requester_phone, code) {
            Ok(msg) => msg,
            Err(e) => e,
        },
        Err(_) => "Service busy, try again in a minute.".to_string(),
    }
}

fn build_statement_reply(state: &Arc<AppState>, balances: &[crate::models::ParentBalance]) -> String {
    let b = match balances.first() {
        Some(v) => v,
        None => return "No child is linked to this number yet. Reply with the admission number to start.".to_string(),
    };
    // If several children, give the first + hint; parent can scope via admission no later (v1).
    let extra = if balances.len() > 1 {
        "\n\n_Showing first child — full multi-child statements come with the PDF in Phase 4._".to_string()
    } else {
        String::new()
    };
    match lock_db(state) {
        Ok(conn) => match commands::whatsapp::text_statement_inner(&conn, &b.student_id) {
            Ok(s) => format!("{}{}", s, extra),
            Err(e) => e,
        },
        Err(_) => "Service busy, try again in a minute.".to_string(),
    }
}

fn build_plan_reply(state: &Arc<AppState>, balances: &[crate::models::ParentBalance]) -> String {
    let name = balances.first().map(|b| b.student_name.clone()).unwrap_or_else(|| "your child".to_string());
    // Notify bursar via outbox if we can resolve school + school phone.
    if let Some(b) = balances.first() {
        if let Ok(conn) = lock_db(state) {
            if let Ok(school_id) = conn.query_row(
                "SELECT school_id FROM students WHERE id = ?1",
                rusqlite::params![b.student_id],
                |row| row.get::<_, String>(0),
            ) {
                let bursar_phone: Option<String> = conn.query_row(
                    "SELECT value FROM settings WHERE key = 'school_phone'",
                    [],
                    |row| row.get(0),
                ).ok().filter(|p: &String| !p.is_empty());
                if let Some(bp) = bursar_phone {
                    let params = serde_json::json!({
                        "body": format!("📅 Payment-plan request: {} (Adm {}) — parent {} asked to discuss a plan. Please call them.", b.student_name, b.admission_no, "via WhatsApp")
                    }).to_string();
                    let _ = commands::whatsapp::enqueue_outbox_inner(&conn, &school_id, &bp, "plan_request", &params, None);
                }
            }
        }
    }
    format!(
        "📅 Noted, {}. I've alerted the bursar — they'll contact you to agree a payment plan. Your current balance still stands; keep it in mind for the discussion.",
        name
    )
}

fn build_balance_reply(balances: &[crate::models::ParentBalance]) -> String {
    if balances.is_empty() {
        return "I couldn't find any children linked to this number. Reply with your child's admission number (e.g. 34567), or ask your bursar to link your number.".to_string();
    }
    let mut out = String::from("📋 *Fee Balance*\n─────────────────\n");
    for b in balances {
        out.push_str(&format!(
            "{} ({}, Adm: {})\nInvoiced: {}\nPaid: {}\nBalance: *{}* {}\n─────────────────\n",
            b.student_name, b.grade, b.admission_no,
            wa::format_kes(b.invoiced),
            wa::format_kes(b.paid),
            wa::format_kes(b.outstanding),
            if b.outstanding > 0 { "⚠️" } else { "✅" },
        ));
    }
    out.push_str("Reply PAY for an M-Pesa link, or STATEMENT for a full statement.");
    out
}

async fn build_pay_reply(state: &Arc<AppState>, parent_phone: &str, balances: &[crate::models::ParentBalance]) -> String {
    let target = balances.iter().find(|b| b.outstanding > 0);
    let b = match target {
        Some(v) => v,
        None => return "✅ All balances are cleared. Asante!".to_string(),
    };
    // Oldest unpaid invoice for this student
    let inv_id: Option<String> = lock_db(state).ok().and_then(|conn| {
        conn.query_row(
            "SELECT id FROM invoices WHERE student_id = ?1 AND status IN ('unpaid','partial') ORDER BY created_at ASC LIMIT 1",
            rusqlite::params![b.student_id],
            |row| row.get(0),
        ).ok()
    });
    let inv_id = match inv_id {
        Some(id) => id,
        None => return format!("Balance for {} is {}. Ask the bursar to raise an invoice.", b.student_name, wa::format_kes(b.outstanding)),
    };
    let school_id: String = lock_db(state).ok().and_then(|conn| {
        conn.query_row("SELECT school_id FROM students WHERE id = ?1", rusqlite::params![b.student_id], |row| row.get(0)).ok()
    }).unwrap_or_default();

    let token: String = match lock_db(state) {
        Ok(conn) => match commands::whatsapp::generate_payment_link_inner(&conn, &school_id, &inv_id, parent_phone) {
            Ok(link) => link.token,
            Err(e) => return format!("Couldn't create a payment link: {}", e),
        },
        Err(_) => return "Service busy, try again in a minute.".to_string(),
    };
    let base = std::env::var("PUBLIC_BASE_URL").unwrap_or_else(|_| "https://pay.edufy.finance".into());
    format!(
        "💳 *Pay {} for {}*\nTap to pay (valid 10 min):\n{}/pay/{}\n\nYou'll get an M-Pesa prompt on your phone. Enter your PIN to complete.",
        wa::format_kes(b.outstanding), b.student_name, base.trim_end_matches('/'), token
    )
}

fn bursar_contact(state: &Arc<AppState>) -> String {
    let info: (String, String) = lock_db(state).ok().and_then(|conn| {
        conn.query_row(
            "SELECT COALESCE((SELECT value FROM settings WHERE key='school_phone'), ''), COALESCE((SELECT value FROM settings WHERE key='school_hours'), '')",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).ok()
    }).unwrap_or_default();
    let (phone, hours) = info;
    if !phone.is_empty() {
        format!("💬 Bursar: {}\nHours: {}\nOr reply BALANCE to check fees anytime.", phone, if hours.is_empty() { "Mon–Fri 7am–5pm" } else { &hours })
    } else {
        "💬 Contact your school bursar Mon–Fri 7am–5pm. Reply BALANCE to check fees anytime.".to_string()
    }
}

fn help_text() -> &'static str {
    "👋 *Edufy Fee Bot*\nReply:\n• BALANCE — fee balance\n• PAY — M-Pesa pay link\n• STATEMENT — mini-statement\n• PLAN — request a payment plan\n• BURSAR — school contact\n• New number? Send admission no., then reply `adm_no code`."
}

// ═══ PAYMENT LINKS (public snapshot + authed generation) ═══

#[derive(Deserialize)]
struct PhoneReq { phone: String }

async fn wa_balances(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<PhoneReq>,
) -> Result<Json<Vec<crate::models::ParentBalance>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::whatsapp::lookup_parent_balances_inner(&conn, &a.phone).map_err(AppError)?))
}

async fn generate_link(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<GenerateLinkReq>,
) -> Result<Json<crate::models::PaymentLink>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::whatsapp::generate_payment_link_inner(&conn, &a.school_id, &a.invoice_id, &a.phone).map_err(AppError)?))
}

async fn pay_snapshot(
    AxumState(s): AxumState<Arc<AppState>>,
    Path(token): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    let link = commands::whatsapp::resolve_payment_link_inner(&conn, &token).map_err(AppError)?;
    let (invoice_no, student_name, adm): (String, String, String) = conn.query_row(
        "SELECT i.invoice_no, s.first_name || ' ' || s.last_name, s.admission_no
         FROM invoices i JOIN students s ON s.id = i.student_id WHERE i.id = ?1",
        rusqlite::params![link.invoice_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|e| AppError(e.to_string()))?;
    Ok(Json(serde_json::json!({
        "invoice_no": invoice_no,
        "student_name": student_name,
        "admission_no": adm,
        "amount": link.amount,
        "phone": link.phone,
        "expires_at": link.expires_at,
    })))
}

#[derive(Deserialize)]
struct PayConfirmReq { phone: String }

/// Public STK Push trigger: POST /pay/:token/confirm { phone }
/// Re-validates link, recomputes outstanding (never trusts the snapshot),
/// initiates STK via the shared Daraja path, marks link single-use.
async fn pay_confirm(
    AxumState(s): AxumState<Arc<AppState>>,
    Path(token): Path<String>,
    Json(a): Json<PayConfirmReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let phone = wa::normalize_ke_phone(&a.phone)
        .ok_or_else(|| AppError("Enter a valid Safaricom number (e.g. 0712 345 678)".to_string()))?;

    // Resolve + validate link under lock, capture what we need, then drop guard before awaits.
    let (school_id, invoice_id, outstanding) = {
        let conn = lock_db(&s)?;
        let link = commands::whatsapp::resolve_payment_link_inner(&conn, &token).map_err(AppError)?;
        let (net, status, inv_school): (i64, String, String) = conn.query_row(
            "SELECT net_amount, status, school_id FROM invoices WHERE id = ?1",
            rusqlite::params![link.invoice_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).map_err(|_| AppError("Invoice not found".to_string()))?;
        if status == "paid" || status == "waived" {
            return Err(AppError("This invoice is already settled.".to_string()));
        }
        let paid: i64 = conn.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?1 AND status = 'completed'",
            rusqlite::params![link.invoice_id],
            |row| row.get(0),
        ).map_err(|e| AppError(e.to_string()))?;
        let out = (net - paid).max(0);
        if out <= 0 {
            return Err(AppError("This invoice is already settled.".to_string()));
        }
        // Link amount is a snapshot; charge live outstanding (caps over/under-payment).
        (inv_school, link.invoice_id.clone(), out)
    };

    let tx = commands::mpesa::initiate_mpesa_payment_inner(
        &s.db.0, &school_id, &invoice_id, &phone, outstanding,
    ).await.map_err(AppError)?;

    // Single-use: mark consumed only after STK accepted (pending) — failed STK keeps link usable.
    if let Ok(conn) = lock_db(&s) {
        let now = chrono::Utc::now().to_rfc3339();
        let _ = conn.execute(
            "UPDATE payment_links SET used_at = ?1 WHERE token = ?2",
            rusqlite::params![now, token],
        );
    }

    Ok(Json(serde_json::json!({
        "transaction_id": tx.id,
        "checkout_request_id": tx.checkout_request_id,
        "status": tx.status,
        "amount": outstanding,
    })))
}

/// Public status poll: GET /pay/status/:transaction_id
async fn pay_status(
    AxumState(s): AxumState<Arc<AppState>>,
    Path(transaction_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let tx = commands::mpesa::check_mpesa_status_inner(&s.db.0, &transaction_id).await.map_err(AppError)?;
    Ok(Json(serde_json::json!({
        "status": tx.status,
        "result_description": tx.result_description,
        "mpesa_receipt": tx.mpesa_receipt,
        "amount": tx.amount,
    })))
}

async fn enqueue_wa(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<EnqueueWaReq>,
) -> Result<Json<crate::models::WhatsAppOutbox>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::whatsapp::enqueue_outbox_inner(
        &conn, &a.school_id, &a.parent_phone, &a.template_name,
        &a.params_json.unwrap_or_else(|| "{}".into()), None,
    ).map_err(AppError)?))
}

// ═══ PARENT LINKING + REMINDERS (authed) ═══

#[derive(Deserialize)]
struct LinkReqReq { admission_no: String, phone: String }
#[derive(Deserialize)]
struct LinkVerifyReq { admission_no: String, phone: String, code: String }

async fn wa_link_request(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<LinkReqReq>,
) -> Result<Json<crate::models::LinkOtpRequest>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::whatsapp::request_link_otp_inner(&conn, &a.admission_no, &a.phone).map_err(AppError)?))
}

async fn wa_link_verify(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<LinkVerifyReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    let msg = commands::whatsapp::verify_link_otp_inner(&conn, &a.admission_no, &a.phone, &a.code).map_err(AppError)?;
    Ok(Json(serde_json::json!({"message": msg})))
}

async fn wa_link_requests(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<SchoolIdReq>,
) -> Result<Json<Vec<crate::models::PendingLinkRequest>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::whatsapp::list_link_requests_inner(&conn, &a.school_id).map_err(AppError)?))
}

#[derive(Deserialize)]
struct RevealReq { otp_id: String, performed_by: String }

async fn wa_reveal_code(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<RevealReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    let code = commands::whatsapp::reveal_link_code_inner(&conn, &a.otp_id, &a.performed_by).map_err(AppError)?;
    Ok(Json(serde_json::json!({"code": code})))
}

async fn wa_sweep_reminders(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<SchoolIdReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    let n = crate::services::scheduler::enqueue_due_reminders_inner(&conn, &a.school_id).map_err(AppError)?;
    Ok(Json(serde_json::json!({"queued": n})))
}

async fn wa_status(
    AxumState(s): AxumState<Arc<AppState>>,
    _: Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    let pending: i64 = conn.query_row(
        "SELECT COUNT(*) FROM whatsapp_outbox WHERE status = 'pending'",
        [],
        |row| row.get(0),
    ).map_err(|e| AppError(e.to_string()))?;
    let links_pending: i64 = conn.query_row(
        "SELECT COUNT(*) FROM parent_link_otps WHERE used_at IS NULL AND expires_at > datetime('now')",
        [],
        |row| row.get(0),
    ).map_err(|e| AppError(e.to_string()))?;
    let wa_cfg = wa::WhatsAppConfig::from_env();
    Ok(Json(serde_json::json!({
        "whatsapp_configured": wa_cfg.as_ref().map(|c| c.is_configured()).unwrap_or(false),
        "sms_configured": crate::services::sms::SmsConfig::from_env().is_some(),
        "outbox_pending": pending,
        "link_requests_pending": links_pending,
    })))
}

// ═══ OUTBOX WORKER (WhatsApp primary, SMS fallback) ═══

struct OutboxJob {
    id: String,
    parent_phone: String,
    template_name: String,
    params_json: String,
    retry_count: i32,
}

fn outbox_body(params_json: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(params_json).ok()
        .and_then(|v| v.get("body")?.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
}

async fn drain_outbox_once(state: &Arc<AppState>) {
    let jobs: Vec<OutboxJob> = match lock_db(state) {
        Ok(conn) => conn.prepare(
            "SELECT id, parent_phone, template_name, params_json, retry_count FROM whatsapp_outbox
             WHERE status = 'pending' AND (scheduled_for IS NULL OR scheduled_for <= datetime('now'))
             ORDER BY created_at ASC LIMIT 20",
        ).and_then(|mut st| st.query_map([], |row| Ok(OutboxJob {
            id: row.get(0)?, parent_phone: row.get(1)?, template_name: row.get(2)?,
            params_json: row.get(3)?, retry_count: row.get(4)?,
        })).and_then(|r| r.collect::<Result<Vec<_>, _>>()))
        .unwrap_or_default(),
        Err(_) => return,
    };

    let wa_cfg = wa::WhatsAppConfig::from_env().filter(|c| c.is_configured());
    let sms_cfg = crate::services::sms::SmsConfig::from_env();

    for job in jobs {
        let body = match outbox_body(&job.params_json) {
            Some(b) => b,
            None => {
                if let Ok(conn) = lock_db(state) {
                    let _ = conn.execute(
                        "UPDATE whatsapp_outbox SET status='failed', retry_count=retry_count+1 WHERE id=?1",
                        rusqlite::params![job.id],
                    );
                }
                continue;
            }
        };

        // 1) WhatsApp attempt
        let mut sent_via: Option<(&str, Option<String>)> = None;
        if let Some(cfg) = wa_cfg.as_ref() {
            match wa::send_text(cfg, &job.parent_phone, &body).await {
                Ok(msg_id) => sent_via = Some(("whatsapp", msg_id)),
                Err(e) => log::warn!("outbox {} ({}) wa send failed (try {}): {}", job.id, job.template_name, job.retry_count, e),
            }
        }

        // 2) SMS fallback after 2 failed WhatsApp attempts
        if sent_via.is_none() && job.retry_count >= 2 {
            if let Some(cfg) = sms_cfg.as_ref() {
                match crate::services::sms::send_sms(cfg, &job.parent_phone, &body).await {
                    Ok(()) => sent_via = Some(("sms", None)),
                    Err(e) => log::warn!("outbox {} sms fallback failed: {}", job.id, e),
                }
            }
        }

        if let Ok(conn) = lock_db(state) {
            match sent_via {
                Some((channel, msg_id)) => {
                    let now = chrono::Utc::now().to_rfc3339();
                    let _ = conn.execute(
                        "UPDATE whatsapp_outbox SET status='sent', channel=?1, meta_msg_id=?2, sent_at=?3 WHERE id=?4",
                        rusqlite::params![channel, msg_id, now, job.id],
                    );
                }
                None => {
                    // Exponential-ish backoff via scheduled_for; dead-letter after 5 tries.
                    if job.retry_count + 1 >= 5 {
                        let _ = conn.execute(
                            "UPDATE whatsapp_outbox SET status='failed', retry_count=retry_count+1 WHERE id=?1",
                            rusqlite::params![job.id],
                        );
                    } else {
                        let delay_min = [5, 15, 60, 180][job.retry_count.min(3) as usize];
                        let _ = conn.execute(
                            "UPDATE whatsapp_outbox SET retry_count=retry_count+1, scheduled_for=datetime('now', ?1) WHERE id=?2",
                            rusqlite::params![format!("+{} minutes", delay_min), job.id],
                        );
                    }
                }
            }
        }
    }

    // Opportunistic cleanup: drop expired sessions + used/expired OTPs older than a day.
    if let Ok(conn) = lock_db(state) {
        let _ = conn.execute("DELETE FROM whatsapp_sessions WHERE expires_at <= datetime('now')", []);
        let _ = conn.execute(
            "DELETE FROM parent_link_otps WHERE (used_at IS NOT NULL OR expires_at <= datetime('now', '-1 day'))",
            [],
        );
    }
}

async fn outbox_worker(state: Arc<AppState>) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        drain_outbox_once(&state).await;
    }
}

async fn reminder_scheduler(state: Arc<AppState>) {
    // Let boot settle, then sweep daily.
    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
    loop {
        let schools: Vec<String> = lock_db(&state).ok()
            .and_then(|conn| conn.prepare("SELECT id FROM schools")
                .and_then(|mut st| st.query_map([], |row| row.get(0))
                    .and_then(|r| r.collect::<Result<Vec<String>, _>>())).ok())
            .unwrap_or_default();
        for school_id in schools {
            if let Ok(conn) = lock_db(&state) {
                match crate::services::scheduler::enqueue_due_reminders_inner(&conn, &school_id) {
                    Ok(n) if n > 0 => log::info!("scheduler: queued {} reminders for {}", n, school_id),
                    Ok(_) => {}
                    Err(e) => log::warn!("scheduler sweep failed for {}: {}", school_id, e),
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(86400)).await;
    }
}

async fn login_handler(
    AxumState(s): AxumState<Arc<AppState>>,
    Json(a): Json<LoginReq>,
) -> Result<Json<commands::settings::LoginResult>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::settings::login_inner(&conn, &a.username, &a.password, &a.school_id).map_err(AppError)?))
}

// School
async fn create_school(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<CreateSchoolReq>) -> Result<Json<crate::models::School>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::school::create_school_inner(&conn, a.name, a.school_type, a.curriculum, a.county, a.phone, a.email).map_err(AppError)?))
}
async fn list_schools(AxumState(s): AxumState<Arc<AppState>>, _: Json<serde_json::Value>) -> Result<Json<Vec<crate::models::School>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::school::list_schools_inner(&conn).map_err(AppError)?))
}
async fn get_school(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<IdReq>) -> Result<Json<crate::models::School>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::school::get_school_inner(&conn, a.id).map_err(AppError)?))
}
async fn update_school(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<UpdateSchoolReq>) -> Result<Json<crate::models::School>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::school::update_school_inner(&conn, a.id, a.name, a.school_type, a.county, a.phone, a.email, a.mpesa_paybill, a.mpesa_till).map_err(AppError)?))
}

// Students
async fn create_student(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<CreateStudentReq>) -> Result<Json<crate::models::Student>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::student::create_student_inner(&conn, a.school_id, a.admission_no, a.first_name, a.last_name, a.middle_name, a.grade, a.stream, a.enrollment_date).map_err(AppError)?))
}
async fn get_students(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<GetStudentsReq>) -> Result<Json<Vec<crate::models::Student>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::student::get_students_inner(&conn, a.school_id, a.grade, a.status).map_err(AppError)?))
}
async fn get_student_detail(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<IdReq>) -> Result<Json<crate::models::StudentDetail>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::student::get_student_detail_inner(&conn, a.id).map_err(AppError)?))
}
async fn update_student(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<UpdateStudentReq>) -> Result<Json<crate::models::Student>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::student::update_student_inner(&conn, a.id, a.first_name, a.last_name, a.middle_name, a.grade, a.stream, a.status).map_err(AppError)?))
}
async fn delete_student(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<IdReq>) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    commands::student::delete_student_inner(&conn, a.id).map_err(AppError)?;
    Ok(Json(serde_json::json!({"ok": true})))
}

// Grades
async fn create_grade(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<CreateGradeReq>) -> Result<Json<crate::models::Grade>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::grade::create_grade_inner(&conn, a.school_id, a.name, a.level, a.sort_order).map_err(AppError)?))
}
async fn get_grades(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SchoolIdReq>) -> Result<Json<Vec<crate::models::Grade>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::grade::get_grades_inner(&conn, a.school_id).map_err(AppError)?))
}
async fn update_grade(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<UpdateGradeReq>) -> Result<Json<crate::models::Grade>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::grade::update_grade_inner(&conn, a.id, a.name, a.level, a.sort_order, a.is_active).map_err(AppError)?))
}
async fn delete_grade(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<IdReq>) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    commands::grade::delete_grade_inner(&conn, a.id).map_err(AppError)?;
    Ok(Json(serde_json::json!({"ok": true})))
}
async fn promote_students(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<PromoteStudentsReq>) -> Result<Json<crate::models::GradePromotion>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::grade::promote_students_inner(&conn, a.school_id, a.from_grade, a.to_grade, a.student_ids, a.academic_year).map_err(AppError)?))
}
async fn get_promotion_history(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SchoolIdReq>) -> Result<Json<Vec<crate::models::GradePromotion>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::grade::get_promotion_history_inner(&conn, a.school_id).map_err(AppError)?))
}
async fn count_students_in_grade(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<CountStudentsReq>) -> Result<Json<i64>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::grade::count_students_in_grade_inner(&conn, a.school_id, a.grade).map_err(AppError)?))
}

// Fees
async fn create_fee_structure(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<CreateFeeStructureReq>) -> Result<Json<crate::models::FeeStructure>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::fee::create_fee_structure_inner(&conn, a.school_id, a.name, a.grade, a.term, a.academic_year).map_err(AppError)?))
}
async fn get_fee_structures(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<GetFeeStructuresReq>) -> Result<Json<Vec<crate::models::FeeStructure>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::fee::get_fee_structures_inner(&conn, a.school_id, a.academic_year, a.term).map_err(AppError)?))
}
async fn add_vote_head(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<AddVoteHeadReq>) -> Result<Json<crate::models::VoteHead>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::fee::add_vote_head_inner(&conn, a.fee_structure_id, a.name, a.category, a.amount, a.is_mandatory, a.sort_order).map_err(AppError)?))
}
async fn get_vote_heads(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<GetVoteHeadsReq>) -> Result<Json<Vec<crate::models::VoteHead>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::fee::get_vote_heads_inner(&conn, a.fee_structure_id).map_err(AppError)?))
}
async fn get_discount_configs(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SchoolIdReq>) -> Result<Json<Vec<crate::models::DiscountConfig>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::fee::get_discount_configs_inner(&conn, a.school_id).map_err(AppError)?))
}
async fn add_discount_config(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<DiscountConfigReq>) -> Result<Json<crate::models::DiscountConfig>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::fee::add_discount_config_inner(&conn, a.school_id, a.name, a.discount_type, a.rate, a.min_students, a.is_active).map_err(AppError)?))
}
async fn remove_discount_config(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<IdReq>) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    commands::fee::remove_discount_config_inner(&conn, a.id).map_err(AppError)?;
    Ok(Json(serde_json::json!({"ok": true})))
}

// Invoices
async fn generate_invoices(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<GenerateInvoicesReq>) -> Result<Json<Vec<crate::models::Invoice>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::invoice::generate_invoices_inner(&conn, a.fee_structure_id, a.student_ids).map_err(AppError)?))
}
async fn get_invoices(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<GetInvoicesReq>) -> Result<Json<Vec<crate::models::Invoice>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::invoice::get_invoices_inner(&conn, a.student_id, a.status, a.limit, a.offset).map_err(AppError)?))
}
async fn get_invoice_detail(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<IdReq>) -> Result<Json<crate::models::InvoiceDetail>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::invoice::get_invoice_detail_inner(&conn, a.id).map_err(AppError)?))
}

// Payments
async fn record_payment(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<RecordPaymentReq>) -> Result<Json<crate::models::Payment>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::payment::record_payment_inner(&conn, a.invoice_id, a.amount, a.method, a.reference, a.mpesa_receipt, a.notes, a.received_by).map_err(AppError)?))
}
async fn get_payments(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<GetPaymentsReq>) -> Result<Json<Vec<crate::models::Payment>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::payment::get_payments_inner(&conn, a.student_id, a.method, a.limit, a.offset).map_err(AppError)?))
}
async fn get_payment_detail(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<IdReq>) -> Result<Json<crate::models::PaymentDetail>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::payment::get_payment_detail_inner(&conn, a.id).map_err(AppError)?))
}

// M-Pesa
async fn get_mpesa_config(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SchoolIdReq>) -> Result<Json<Option<crate::models::MpesaConfig>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::mpesa::get_mpesa_config_inner(&conn, &a.school_id).map_err(AppError)?))
}
async fn save_mpesa_config(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<MpesaConfigReq>) -> Result<Json<crate::models::MpesaConfig>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::mpesa::save_mpesa_config_inner(&conn, a.school_id, a.consumer_key, a.consumer_secret, a.passkey, a.shortcode, a.callback_url).map_err(AppError)?))
}
async fn get_mpesa_transactions(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<MpesaTransactionsReq>) -> Result<Json<Vec<crate::models::MpesaTransaction>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::mpesa::get_mpesa_transactions_inner(&conn, &a.school_id, a.limit.unwrap_or(50)).map_err(AppError)?))
}
async fn get_c2b_transactions(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<MpesaTransactionsReq>) -> Result<Json<Vec<crate::models::MpesaTransaction>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::mpesa::get_c2b_transactions_inner(&conn, &a.school_id, a.limit.unwrap_or(50)).map_err(AppError)?))
}
async fn match_c2b_payment(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<C2bMatchReq>) -> Result<Json<crate::models::MpesaTransaction>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::mpesa::match_c2b_payment_inner(&conn, &a.transaction_id, &a.invoice_id).map_err(AppError)?))
}

// Dashboard & Reports
async fn get_dashboard_stats(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SchoolIdReq>) -> Result<Json<crate::models::DashboardStats>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::dashboard::get_dashboard_stats_inner(&conn, a.school_id).map_err(AppError)?))
}
async fn get_collection_summary(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<CollectionSummaryReq>) -> Result<Json<crate::models::CollectionSummary>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::report::get_collection_summary_inner(&conn, a.school_id, a.academic_year, a.term).map_err(AppError)?))
}
async fn get_outstanding_report(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<OutstandingReportReq>) -> Result<Json<Vec<crate::models::StudentOutstanding>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::report::get_outstanding_report_inner(&conn, a.school_id, a.academic_year, a.term).map_err(AppError)?))
}
async fn get_student_history(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<StudentHistoryReq>) -> Result<Json<Vec<crate::models::StudentHistoryEntry>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::report::get_student_history_inner(&conn, a.student_id).map_err(AppError)?))
}
async fn get_age_analysis(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SchoolIdReq>) -> Result<Json<Vec<crate::models::AgeBucket>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::report::get_age_analysis_inner(&conn, a.school_id).map_err(AppError)?))
}

// Settings
async fn get_setting(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SettingReq>) -> Result<Json<Option<String>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::settings::get_setting_inner(&conn, &a.key).map_err(AppError)?))
}
async fn set_setting(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SetSettingReq>) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    commands::settings::set_setting_inner(&conn, &a.key, &a.value).map_err(AppError)?;
    Ok(Json(serde_json::json!({"ok": true})))
}
async fn backup_database(AxumState(s): AxumState<Arc<AppState>>, _: Json<serde_json::Value>) -> Result<Json<String>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::settings::backup_database_inner(&conn).map_err(AppError)?))
}
async fn get_school_profile(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SchoolProfileReq>) -> Result<Json<crate::models::SchoolProfile>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::settings::get_school_profile_inner(&conn, &a.school_id).map_err(AppError)?))
}
async fn update_school_profile(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<UpdateSchoolProfileReq>) -> Result<Json<crate::models::SchoolProfile>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::settings::update_school_profile_inner(&conn, &a.school_id, a.name, a.school_type, a.address, a.phone, a.email, a.motto, a.county).map_err(AppError)?))
}
async fn list_users(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<SchoolIdReq>) -> Result<Json<Vec<User>>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::settings::list_users_inner(&conn, &a.school_id).map_err(AppError)?))
}
async fn create_user(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<CreateUserReq>) -> Result<Json<User>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::settings::create_user_inner(&conn, &a.school_id, &a.username, &a.password, &a.full_name, &a.role).map_err(AppError)?))
}
async fn update_user(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<UpdateUserReq>) -> Result<Json<User>, AppError> {
    let conn = lock_db(&s)?;
    Ok(Json(commands::settings::update_user_inner(&conn, &a.user_id, a.full_name, a.role, a.is_active).map_err(AppError)?))
}
async fn delete_user(AxumState(s): AxumState<Arc<AppState>>, Json(a): Json<IdReq>) -> Result<Json<serde_json::Value>, AppError> {
    let conn = lock_db(&s)?;
    commands::settings::delete_user_inner(&conn, &a.id).map_err(AppError)?;
    Ok(Json(serde_json::json!({"ok": true})))
}

// ═══ ROUTER ═══

fn api_router() -> Router<Arc<AppState>> {
    Router::new()
        // School
        .route("/create_school", post(create_school))
        .route("/list_schools", post(list_schools))
        .route("/get_school", post(get_school))
        .route("/update_school", post(update_school))
        // Students
        .route("/create_student", post(create_student))
        .route("/get_students", post(get_students))
        .route("/get_student_detail", post(get_student_detail))
        .route("/update_student", post(update_student))
        .route("/delete_student", post(delete_student))
        // Grades
        .route("/create_grade", post(create_grade))
        .route("/get_grades", post(get_grades))
        .route("/update_grade", post(update_grade))
        .route("/delete_grade", post(delete_grade))
        .route("/promote_students", post(promote_students))
        .route("/get_promotion_history", post(get_promotion_history))
        .route("/count_students_in_grade", post(count_students_in_grade))
        // Fees
        .route("/create_fee_structure", post(create_fee_structure))
        .route("/get_fee_structures", post(get_fee_structures))
        .route("/add_vote_head", post(add_vote_head))
        .route("/get_vote_heads", post(get_vote_heads))
        .route("/get_discount_configs", post(get_discount_configs))
        .route("/add_discount_config", post(add_discount_config))
        .route("/remove_discount_config", post(remove_discount_config))
        // Invoices
        .route("/generate_invoices", post(generate_invoices))
        .route("/get_invoices", post(get_invoices))
        .route("/get_invoice_detail", post(get_invoice_detail))
        // Payments
        .route("/record_payment", post(record_payment))
        .route("/get_payments", post(get_payments))
        .route("/get_payment_detail", post(get_payment_detail))
        // M-Pesa
        .route("/get_mpesa_config", post(get_mpesa_config))
        .route("/save_mpesa_config", post(save_mpesa_config))
        .route("/get_mpesa_transactions", post(get_mpesa_transactions))
        .route("/get_c2b_transactions", post(get_c2b_transactions))
        .route("/match_c2b_payment", post(match_c2b_payment))
        // Dashboard & Reports
        .route("/get_dashboard_stats", post(get_dashboard_stats))
        .route("/get_collection_summary", post(get_collection_summary))
        .route("/get_outstanding_report", post(get_outstanding_report))
        .route("/get_student_history", post(get_student_history))
        .route("/get_age_analysis", post(get_age_analysis))
        // Settings
        .route("/get_setting", post(get_setting))
        .route("/set_setting", post(set_setting))
        .route("/backup_database", post(backup_database))
        .route("/get_school_profile", post(get_school_profile))
        .route("/update_school_profile", post(update_school_profile))
        .route("/list_users", post(list_users))
        .route("/create_user", post(create_user))
        .route("/update_user", post(update_user))
        .route("/delete_user", post(delete_user))
        // WhatsApp bot + payment links
        .route("/whatsapp/balances", post(wa_balances))
        .route("/whatsapp/generate-link", post(generate_link))
        .route("/whatsapp/enqueue", post(enqueue_wa))
        .route("/whatsapp/link-request", post(wa_link_request))
        .route("/whatsapp/link-verify", post(wa_link_verify))
        .route("/whatsapp/link-requests", post(wa_link_requests))
        .route("/whatsapp/reveal-code", post(wa_reveal_code))
        .route("/whatsapp/sweep-reminders", post(wa_sweep_reminders))
        .route("/whatsapp/status", post(wa_status))
}

pub fn build_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::POST, Method::GET, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    Router::new()
        .route("/health", get(health))
        .route("/api/auth/login", post(login_handler))
        .route("/webhook/whatsapp", get(whatsapp_verify).post(whatsapp_webhook))
        .route("/pay/:token", get(pay_snapshot))
        .route("/pay/:token/confirm", post(pay_confirm))
        .route("/pay/status/:transaction_id", get(pay_status))
        .nest("/api", api_router())
        .fallback_service(ServeDir::new("dist").append_index_html_on_directories(true))
        .layer(cors)
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state)
}

// ═══ SERVER STARTUP ═══

pub async fn start() {
    env_logger::init();

    let db_path: PathBuf = std::env::var("DATABASE_URL").map(PathBuf::from).unwrap_or_else(|_| {
        let dirs = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        dirs.join("edufy").join("edufy.db")
    });

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = crate::db::connection::init_database(&db_path).expect("Failed to initialize database");

    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "edufy-finance-dev-secret-change-in-production".into());

    let state = Arc::new(AppState {
        db: DbState(Mutex::new(conn)),
        jwt_secret: jwt_secret.into_bytes(),
    });

    // Background: WhatsApp outbox drain (5s) + daily reminder sweep.
    tokio::spawn(outbox_worker(state.clone()));
    tokio::spawn(reminder_scheduler(state.clone()));

    let app = build_router(state);

    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse()
        .unwrap_or(8080);

    let addr = format!("{}:{}", host, port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind to {}: {}", addr, e));

    log::info!("Edufy Finance web server running on http://{}", addr);

    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| panic!("Server error: {}", e));
}
