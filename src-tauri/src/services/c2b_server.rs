use axum::{
    extract::State as AxumState,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};

use crate::models::C2bCallbackPayload;
use crate::utils::generate_id;

pub struct C2bServerState {
    pub db: Arc<Mutex<Connection>>,
    pub port: u16,
}

/// Start the C2B callback server on a given port
pub async fn start_c2b_server(state: C2bServerState) -> Result<(), String> {
    let port = state.port;
    let shared_state = Arc::new(state);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(health_check))
        .route("/c2b/confirm", post(handle_confirmation))
        .route("/c2b/validate", post(handle_validation))
        .layer(cors)
        .with_state(shared_state);

    let addr = format!("0.0.0.0:{}", port);
    log::info!("C2B callback server starting on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind C2B server on port {}: {}", port, e))?;

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("C2B server error: {}", e))?;

    Ok(())
}

async fn health_check() -> &'static str {
    "OK"
}

/// Handle C2B validation — Safaricom sends this first to validate the transaction
async fn handle_validation(
    AxumState(_state): AxumState<Arc<C2bServerState>>,
    Json(payload): Json<C2bCallbackPayload>,
) -> (StatusCode, Json<serde_json::Value>) {
    log::info!(
        "C2B Validation: {} sent KES {} (Ref: {})",
        payload.msisdn,
        payload.trans_amount,
        payload.bill_ref_number
    );

    // Check if the bill ref number matches a valid invoice
    let conn = _state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);

    if let Ok(conn) = conn {
        let amount: i64 = payload.trans_amount.parse().unwrap_or(0);
        let ref_num = &payload.bill_ref_number;

        // Try to find matching invoice
        let result = conn.query_row(
            "SELECT id, net_amount FROM invoices WHERE invoice_no = ?1 OR id = ?1",
            rusqlite::params![ref_num],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        );

        match result {
            Ok((_, net_amount)) => {
                // Validate amount matches or is within acceptable range
                if amount > 0 && (amount - net_amount).abs() <= net_amount / 10 {
                    (
                        StatusCode::OK,
                        Json(serde_json::json!({
                            "ResultCode": 0,
                            "ResultDesc": "Accepted"
                        })),
                    )
                } else {
                    (
                        StatusCode::OK,
                        Json(serde_json::json!({
                            "ResultCode": 0,
                            "ResultDesc": "Accepted — amount mismatch but accepted"
                        })),
                    )
                }
            }
            Err(_) => {
                // Accept anyway — we'll handle matching in confirmation
                (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "ResultCode": 0,
                        "ResultDesc": "Accepted"
                    })),
                )
            }
        }
    } else {
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "ResultCode": 0,
                "ResultDesc": "Accepted"
            })),
        )
    }
}

/// Handle C2B confirmation — Safaricom sends this after successful payment
async fn handle_confirmation(
    AxumState(state): AxumState<Arc<C2bServerState>>,
    Json(payload): Json<C2bCallbackPayload>,
) -> (StatusCode, Json<serde_json::Value>) {
    log::info!(
        "C2B Confirmation: {} sent KES {} (Ref: {}, TransID: {})",
        payload.msisdn,
        payload.trans_amount,
        payload.bill_ref_number,
        payload.trans_id
    );

    let amount: i64 = match payload.trans_amount.parse() {
        Ok(a) => a,
        Err(_) => {
            return (
                StatusCode::OK,
                Json(serde_json::json!({
                    "ResultCode": 0,
                    "ResultDesc": "Accepted"
                })),
            );
        }
    };

    if amount <= 0 {
        return (
            StatusCode::OK,
            Json(serde_json::json!({
                "ResultCode": 0,
                "ResultDesc": "Accepted"
            })),
        );
    }

    let conn_lock = state.db.lock();
    if let Ok(conn) = conn_lock {
        let now = chrono::Utc::now().to_rfc3339();
        let ref_num = &payload.bill_ref_number;
        let phone = &payload.msisdn;
        let trans_id = &payload.trans_id;

        // Try to match invoice by invoice_no or bill ref number
        let invoice_match = conn.query_row(
            "SELECT i.id, i.school_id, i.student_id, i.net_amount, i.status
             FROM invoices i
             WHERE i.invoice_no = ?1
                OR i.id = ?1
                OR i.invoice_no LIKE '%' || ?1 || '%'
             LIMIT 1",
            rusqlite::params![ref_num],
            |row| Ok((
                row.get::<_, String>(0)?,   // invoice_id
                row.get::<_, String>(1)?,   // school_id
                row.get::<_, String>(2)?,   // student_id
                row.get::<_, i64>(3)?,      // net_amount
                row.get::<_, String>(4)?,   // status
            )),
        );

        if let Ok((invoice_id, school_id, student_id, net_amount, _inv_status)) = invoice_match {
            // Check for duplicate transaction
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM mpesa_transactions WHERE mpesa_receipt = ?1",
                    rusqlite::params![trans_id],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if exists {
                log::info!("C2B duplicate transaction {} — skipping", trans_id);
                return (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "ResultCode": 0,
                        "ResultDesc": "Accepted — already processed"
                    })),
                );
            }

            // Wrap all writes in a transaction for atomicity
            if let Err(e) = conn.execute_batch("BEGIN") {
                log::error!("C2B failed to begin transaction: {}", e);
                return (StatusCode::OK, Json(serde_json::json!({"ResultCode": 0, "ResultDesc": "Accepted"})));
            }

            let tx_result = (|| -> Result<(), String> {
                let tx_id = generate_id();
                conn.execute(
                    "INSERT INTO mpesa_transactions (id, school_id, invoice_id, phone, amount, account_reference, status, result_code, mpesa_receipt, raw_callback, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'completed', 0, ?7, ?8, ?9, ?9)",
                    rusqlite::params![
                        tx_id, school_id, invoice_id, phone, amount, ref_num,
                        trans_id, serde_json::to_string(&payload).unwrap_or_default(), now
                    ],
                ).map_err(|e| format!("Failed to record C2B transaction: {}", e))?;

                // Auto-record payment
                let payment_id = generate_id();
                let payment_no = format!("PAY-{}", &payment_id[..8].to_uppercase());
                let receipt = format!("C2B-{}", trans_id);

                conn.execute(
                    "INSERT INTO payments (id, payment_no, invoice_id, student_id, amount, method, mpesa_receipt, status, notes, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'mpesa', ?6, 'completed', 'Auto-recorded via C2B callback', ?7)",
                    rusqlite::params![payment_id, payment_no, invoice_id, student_id, amount, receipt, now],
                ).map_err(|e| format!("Failed to record payment: {}", e))?;

                // Update invoice status
                let (paid_total,): (i64,) = conn
                    .query_row(
                        "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = ?1 AND status = 'completed'",
                        rusqlite::params![invoice_id],
                        |row| Ok((row.get(0)?,)),
                    )
                    .map_err(|e| format!("Failed to calculate paid total: {}", e))?;

                let inv_status = if paid_total >= net_amount {
                    "paid"
                } else if paid_total > 0 {
                    "partial"
                } else {
                    "unpaid"
                };

                let paid_at = if inv_status == "paid" { Some(now.clone()) } else { None };

                conn.execute(
                    "UPDATE invoices SET status = ?1, paid_at = ?2 WHERE id = ?3",
                    rusqlite::params![inv_status, paid_at, invoice_id],
                ).map_err(|e| format!("Failed to update invoice status: {}", e))?;

                Ok(())
            })();

            match tx_result {
                Ok(()) => {
                    let _ = conn.execute_batch("COMMIT");
                    log::info!("C2B payment recorded: {} KES for invoice {} (status: matched)", amount, ref_num);
                }
                Err(e) => {
                    let _ = conn.execute_batch("ROLLBACK");
                    log::error!("C2B transaction failed: {}", e);
                }
            }
        } else {
            // No matching invoice — record as unmatched C2B payment
            let tx_id = generate_id();
            let school_id = get_first_school_id(&conn).unwrap_or_default();

            if let Err(e) = conn.execute(
                "INSERT INTO mpesa_transactions (id, school_id, phone, amount, account_reference, status, result_code, mpesa_receipt, raw_callback, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'unmatched', 0, ?6, ?7, ?8, ?8)",
                rusqlite::params![
                    tx_id, school_id, phone, amount, ref_num, trans_id,
                    serde_json::to_string(&payload).unwrap_or_default(), now
                ],
            ) {
                log::error!("C2B failed to record unmatched payment: {}", e);
            } else {
                log::warn!(
                    "C2B payment received but no matching invoice for ref: {} — saved as unmatched",
                    ref_num
                );
            }
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "ResultCode": 0,
            "ResultDesc": "Accepted"
        })),
    )
}

fn get_first_school_id(conn: &Connection) -> Result<String, rusqlite::Error> {
    conn.query_row("SELECT id FROM schools LIMIT 1", [], |row| row.get(0))
}
