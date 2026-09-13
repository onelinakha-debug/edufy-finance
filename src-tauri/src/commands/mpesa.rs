use crate::db::connection::DbState;
use crate::models::{MpesaConfig, MpesaTransaction};
use crate::services::daraja::DarajaClient;
use crate::services::c2b_server::{self, C2bServerState};
use crate::utils::generate_id;
use std::sync::{Arc, Mutex};
use tauri::State;
use tokio::sync::OnceCell;

// ═══ M-Pesa Config ═══

#[tauri::command]
pub fn get_mpesa_config(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<Option<MpesaConfig>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, school_id, consumer_key, consumer_secret, passkey, shortcode, callback_url, is_active, created_at, updated_at
         FROM mpesa_configs WHERE school_id = ?1",
        rusqlite::params![school_id],
        |row| {
            Ok(MpesaConfig {
                id: row.get(0)?,
                school_id: row.get(1)?,
                consumer_key: row.get(2)?,
                consumer_secret: row.get(3)?,
                passkey: row.get(4)?,
                shortcode: row.get(5)?,
                callback_url: row.get(6)?,
                is_active: row.get::<_, i32>(7)? == 1,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    );
    match result {
        Ok(config) => Ok(Some(config)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_mpesa_config(
    state: State<'_, DbState>,
    school_id: String,
    consumer_key: String,
    consumer_secret: String,
    passkey: String,
    shortcode: String,
    callback_url: Option<String>,
) -> Result<MpesaConfig, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // Upsert: delete existing then insert
    conn.execute("DELETE FROM mpesa_configs WHERE school_id = ?1", rusqlite::params![school_id])
        .map_err(|e| e.to_string())?;

    let id = generate_id();
    conn.execute(
        "INSERT INTO mpesa_configs (id, school_id, consumer_key, consumer_secret, passkey, shortcode, callback_url, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
        rusqlite::params![id, school_id, consumer_key, consumer_secret, passkey, shortcode, callback_url, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(MpesaConfig {
        id,
        school_id,
        consumer_key,
        consumer_secret,
        passkey,
        shortcode,
        callback_url,
        is_active: true,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn test_mpesa_connection(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let config = conn.query_row(
        "SELECT consumer_key, consumer_secret FROM mpesa_configs WHERE school_id = ?1 AND is_active = 1",
        rusqlite::params![school_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ).map_err(|_| "M-Pesa not configured. Save credentials first.".to_string())?;
    drop(conn);

    let client = DarajaClient::new();
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    let token = rt.block_on(client.get_access_token(&config.0, &config.1))?;

    Ok(format!("Connected! Token: {}...", &token[..20.min(token.len())]))
}

// ═══ STK Push ═══

#[tauri::command]
pub async fn initiate_mpesa_payment(
    state: State<'_, DbState>,
    school_id: String,
    invoice_id: String,
    phone: String,
    amount: i64,
) -> Result<MpesaTransaction, String> {
    if amount <= 0 {
        return Err("Amount must be greater than 0".to_string());
    }

    // Get config
    let (consumer_key, consumer_secret, passkey, shortcode, callback_url) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT consumer_key, consumer_secret, passkey, shortcode, callback_url
             FROM mpesa_configs WHERE school_id = ?1 AND is_active = 1",
            rusqlite::params![school_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            )),
        )
        .map_err(|_| "M-Pesa not configured. Set up Daraja credentials in Settings.".to_string())?
    };

    let cb_url = callback_url.unwrap_or_else(|| "https://example.com/callback".to_string());

    // Get account reference from invoice
    let account_ref = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT invoice_no FROM invoices WHERE id = ?1",
            rusqlite::params![invoice_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "FEE-000".to_string())
    };

    // Get access token and initiate STK Push
    let client = DarajaClient::new();
    let access_token = client
        .get_access_token(&consumer_key, &consumer_secret)
        .await?;

    let stk_response = client
        .initiate_stk_push(
            &access_token,
            &shortcode,
            &passkey,
            &phone,
            amount,
            &cb_url,
            &account_ref,
        )
        .await?;

    // Save transaction to DB
    let tx_id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();
    let status = if stk_response.response_code.as_deref() == Some("0") {
        "pending"
    } else {
        "failed"
    };

    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO mpesa_transactions (id, school_id, invoice_id, merchant_request_id, checkout_request_id, phone, amount, account_reference, status, result_description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            rusqlite::params![
                tx_id, school_id, invoice_id,
                stk_response.merchant_request_id, stk_response.checkout_request_id,
                phone, amount, account_ref, status, stk_response.customer_message,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(MpesaTransaction {
        id: tx_id,
        school_id,
        invoice_id: Some(invoice_id),
        merchant_request_id: stk_response.merchant_request_id,
        checkout_request_id: stk_response.checkout_request_id,
        phone,
        amount,
        account_reference: Some(account_ref),
        status: status.to_string(),
        result_code: None,
        result_description: stk_response.customer_message,
        mpesa_receipt: None,
        raw_callback: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn check_mpesa_status(
    state: State<'_, DbState>,
    transaction_id: String,
) -> Result<MpesaTransaction, String> {
    let (school_id, checkout_request_id, invoice_id, amount) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT school_id, checkout_request_id, invoice_id, amount FROM mpesa_transactions WHERE id = ?1",
            rusqlite::params![transaction_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, i64>(3)?)),
        )
        .map_err(|e| format!("Transaction not found: {}", e))?
    };

    let checkout_id = checkout_request_id.ok_or("No checkout request ID")?;

    // Get config
    let (consumer_key, consumer_secret, passkey, shortcode) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT consumer_key, consumer_secret, passkey, shortcode FROM mpesa_configs WHERE school_id = ?1",
            rusqlite::params![school_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
        )
        .map_err(|e| format!("M-Pesa config not found: {}", e))?
    };

    let client = DarajaClient::new();
    let access_token = client.get_access_token(&consumer_key, &consumer_secret).await?;
    let query_response = client.query_stk_push_status(&access_token, &shortcode, &passkey, &checkout_id).await?;

    let result_code = query_response.result_code.as_deref().unwrap_or("1032");
    let result_desc = query_response.result_desc.unwrap_or_default();

    let (status, _mpesa_receipt): (&str, Option<String>) = match result_code {
        "0" => ("completed", None), // Receipt will be set from callback
        "1032" => ("pending", None), // Transaction still processing
        "1037" => ("pending", None), // Timeout, still processing
        "1" => ("failed", None),    // Insufficient balance
        "2001" => ("failed", None), // Wrong credentials
        _ => ("failed", None),
    };

    // Update transaction
    let now = chrono::Utc::now().to_rfc3339();
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let result_code_int: Option<i32> = result_code.parse().ok();
        conn.execute(
            "UPDATE mpesa_transactions SET status = ?1, result_code = ?2, result_description = ?3, updated_at = ?4 WHERE id = ?5",
            rusqlite::params![status, result_code_int, result_desc, now, transaction_id],
        )
        .map_err(|e| e.to_string())?;

        // If completed, auto-record payment
        if status == "completed" {
            if let Some(ref inv_id) = invoice_id {
                // Get student_id
                let student_id: String = conn.query_row(
                    "SELECT student_id FROM invoices WHERE id = ?1",
                    rusqlite::params![inv_id],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?;

                let payment_id = generate_id();
                let payment_no = format!("PAY-{}", &payment_id[..8].to_uppercase());
                let receipt = format!("MPESA-{}", &transaction_id[..8].to_uppercase());

                conn.execute(
                    "INSERT INTO payments (id, payment_no, invoice_id, student_id, amount, method, mpesa_receipt, status, notes, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'mpesa', ?6, 'completed', 'Auto-recorded via Daraja STK Push', ?7)",
                    rusqlite::params![payment_id, payment_no, inv_id, student_id, amount, receipt, now],
                ).map_err(|e| e.to_string())?;

                // Update invoice status
                let (net, paid): (i64, i64) = {
                    let mut stmt = conn.prepare(
                        "SELECT i.net_amount, COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'completed'), 0) FROM invoices i WHERE i.id = ?1"
                    ).map_err(|e| e.to_string())?;
                    stmt.query_row([inv_id], |row| Ok((row.get(0)?, row.get(1)?))).map_err(|e| e.to_string())?
                };

                let inv_status = if paid >= net { "paid" } else if paid > 0 { "partial" } else { "unpaid" };
                let paid_at = if inv_status == "paid" { Some(now.clone()) } else { None };
                conn.execute(
                    "UPDATE invoices SET status = ?1, paid_at = ?2 WHERE id = ?3",
                    rusqlite::params![inv_status, paid_at, inv_id],
                ).map_err(|e| e.to_string())?;

                // Update mpesa receipt
                conn.execute(
                    "UPDATE mpesa_transactions SET mpesa_receipt = ?1 WHERE id = ?2",
                    rusqlite::params![receipt, transaction_id],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // Return updated transaction
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, school_id, invoice_id, merchant_request_id, checkout_request_id, phone, amount, account_reference, status, result_code, result_description, mpesa_receipt, raw_callback, created_at, updated_at
         FROM mpesa_transactions WHERE id = ?1",
        rusqlite::params![transaction_id],
        |row| {
            Ok(MpesaTransaction {
                id: row.get(0)?,
                school_id: row.get(1)?,
                invoice_id: row.get(2)?,
                merchant_request_id: row.get(3)?,
                checkout_request_id: row.get(4)?,
                phone: row.get(5)?,
                amount: row.get(6)?,
                account_reference: row.get(7)?,
                status: row.get(8)?,
                result_code: row.get(9)?,
                result_description: row.get(10)?,
                mpesa_receipt: row.get(11)?,
                raw_callback: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        },
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mpesa_transactions(
    state: State<'_, DbState>,
    school_id: String,
    limit: Option<i32>,
) -> Result<Vec<MpesaTransaction>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, school_id, invoice_id, merchant_request_id, checkout_request_id, phone, amount, account_reference, status, result_code, result_description, mpesa_receipt, raw_callback, created_at, updated_at
             FROM mpesa_transactions WHERE school_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let transactions: Vec<MpesaTransaction> = stmt
        .query_map(rusqlite::params![school_id, lim], |row| {
            Ok(MpesaTransaction {
                id: row.get(0)?,
                school_id: row.get(1)?,
                invoice_id: row.get(2)?,
                merchant_request_id: row.get(3)?,
                checkout_request_id: row.get(4)?,
                phone: row.get(5)?,
                amount: row.get(6)?,
                account_reference: row.get(7)?,
                status: row.get(8)?,
                result_code: row.get(9)?,
                result_description: row.get(10)?,
                mpesa_receipt: row.get(11)?,
                raw_callback: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(transactions)
}

// ═══ C2B ═══

/// Server handle stored globally
#[allow(dead_code)]
static C2B_SERVER_HANDLE: OnceCell<()> = OnceCell::const_new();

#[tauri::command]
pub async fn register_c2b_urls(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<String, String> {
    let (consumer_key, consumer_secret, shortcode, _passkey) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT consumer_key, consumer_secret, shortcode, passkey FROM mpesa_configs WHERE school_id = ?1 AND is_active = 1",
            rusqlite::params![school_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
        )
        .map_err(|_| "M-Pesa not configured. Save credentials first.".to_string())?
    };

    let client = DarajaClient::new();
    let access_token = client.get_access_token(&consumer_key, &consumer_secret).await?;

    // Default callback URLs — in production these should be the user's public URL
    // For local dev, we use localhost
    let port = 8089;
    let confirmation_url = format!("http://localhost:{}/c2b/confirm", port);
    let validation_url = format!("http://localhost:{}/c2b/validate", port);

    client
        .register_c2b_urls(&access_token, &shortcode, &confirmation_url, &validation_url)
        .await?;

    Ok(format!(
        "C2B URLs registered!\nConfirmation: {}\nValidation: {}\n\nStart the C2B server to receive payments.",
        confirmation_url, validation_url
    ))
}

#[tauri::command]
pub async fn start_c2b_server(
    state: State<'_, DbState>,
    port: Option<u16>,
) -> Result<String, String> {
    let listen_port = port.unwrap_or(8089);

    // Get DB connection for the server state
    let db_conn = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        // Create a new connection for the C2B server (can't share across threads)
        let path = conn
            .pragma_query_value(None, "database_list", |row| row.get::<_, String>(2))
            .map_err(|e| format!("Failed to get DB path: {}", e))?;
        drop(conn);
        Arc::new(Mutex::new(
            rusqlite::Connection::open(&path).map_err(|e| format!("Failed to open DB: {}", e))?,
        ))
    };

    let server_state = C2bServerState {
        db: db_conn,
        port: listen_port,
    };

    // Start server in background
    tokio::spawn(async move {
        if let Err(e) = c2b_server::start_c2b_server(server_state).await {
            log::error!("C2B server failed: {}", e);
        }
    });

    // Give server a moment to start
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    Ok(format!(
        "C2B server started on port {}. Callback URLs:\n- http://localhost:{}/c2b/confirm\n- http://localhost:{}/c2b/validate",
        listen_port, listen_port, listen_port
    ))
}

#[tauri::command]
pub async fn get_c2b_transactions(
    state: State<'_, DbState>,
    school_id: String,
    limit: Option<i32>,
) -> Result<Vec<MpesaTransaction>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, school_id, invoice_id, merchant_request_id, checkout_request_id, phone, amount, account_reference, status, result_code, result_description, mpesa_receipt, raw_callback, created_at, updated_at
             FROM mpesa_transactions
             WHERE school_id = ?1 AND status IN ('completed', 'unmatched')
             ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let transactions: Vec<MpesaTransaction> = stmt
        .query_map(rusqlite::params![school_id, lim], |row| {
            Ok(MpesaTransaction {
                id: row.get(0)?,
                school_id: row.get(1)?,
                invoice_id: row.get(2)?,
                merchant_request_id: row.get(3)?,
                checkout_request_id: row.get(4)?,
                phone: row.get(5)?,
                amount: row.get(6)?,
                account_reference: row.get(7)?,
                status: row.get(8)?,
                result_code: row.get(9)?,
                result_description: row.get(10)?,
                mpesa_receipt: row.get(11)?,
                raw_callback: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(transactions)
}

#[tauri::command]
pub async fn match_c2b_payment(
    state: State<'_, DbState>,
    transaction_id: String,
    invoice_id: String,
) -> Result<MpesaTransaction, String> {
    let (tx_amount, _tx_phone, tx_receipt, _school_id) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT amount, phone, mpesa_receipt, school_id FROM mpesa_transactions WHERE id = ?1",
            rusqlite::params![transaction_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, String>(3)?)),
        )
        .map_err(|e| format!("Transaction not found: {}", e))?
    };

    let (student_id, net_amount, _school_id_from_inv): (String, i64, String) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT student_id, net_amount, school_id FROM invoices WHERE id = ?1",
            rusqlite::params![invoice_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Invoice not found: {}", e))?
    };

    let now = chrono::Utc::now().to_rfc3339();

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Update the mpesa transaction to link to this invoice
    conn.execute(
        "UPDATE mpesa_transactions SET invoice_id = ?1, status = 'completed', updated_at = ?2 WHERE id = ?3",
        rusqlite::params![invoice_id, now, transaction_id],
    )
    .map_err(|e| e.to_string())?;

    // Record payment
    let payment_id = generate_id();
    let payment_no = format!("PAY-{}", &payment_id[..8].to_uppercase());
    let receipt = tx_receipt.unwrap_or_else(|| format!("C2B-{}", &transaction_id[..8].to_uppercase()));

    conn.execute(
        "INSERT INTO payments (id, payment_no, invoice_id, student_id, amount, method, mpesa_receipt, status, notes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'mpesa', ?6, 'completed', 'Matched from C2B payment', ?7)",
        rusqlite::params![payment_id, payment_no, invoice_id, student_id, tx_amount, receipt, now],
    )
    .map_err(|e| e.to_string())?;

    // Update invoice status
    let (paid_total,): (i64,) = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = ?1 AND status = 'completed'",
            rusqlite::params![invoice_id],
            |row| Ok((row.get(0)?,)),
        )
        .unwrap_or((0,));

    let inv_status = if paid_total >= net_amount {
        "paid"
    } else if paid_total > 0 {
        "partial"
    } else {
        "unpaid"
    };

    let paid_at = if inv_status == "paid" {
        Some(now.clone())
    } else {
        None
    };

    conn.execute(
        "UPDATE invoices SET status = ?1, paid_at = ?2 WHERE id = ?3",
        rusqlite::params![inv_status, paid_at, invoice_id],
    )
    .map_err(|e| e.to_string())?;

    // Return updated transaction
    conn.query_row(
        "SELECT id, school_id, invoice_id, merchant_request_id, checkout_request_id, phone, amount, account_reference, status, result_code, result_description, mpesa_receipt, raw_callback, created_at, updated_at
         FROM mpesa_transactions WHERE id = ?1",
        rusqlite::params![transaction_id],
        |row| {
            Ok(MpesaTransaction {
                id: row.get(0)?,
                school_id: row.get(1)?,
                invoice_id: row.get(2)?,
                merchant_request_id: row.get(3)?,
                checkout_request_id: row.get(4)?,
                phone: row.get(5)?,
                amount: row.get(6)?,
                account_reference: row.get(7)?,
                status: row.get(8)?,
                result_code: row.get(9)?,
                result_description: row.get(10)?,
                mpesa_receipt: row.get(11)?,
                raw_callback: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}
