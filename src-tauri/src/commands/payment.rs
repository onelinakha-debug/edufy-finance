use crate::db::connection::DbState;
use crate::models::{Payment, PaymentDetail};
use crate::utils::generate_id;
use tauri::State;

#[tauri::command]
pub fn record_payment(
    state: State<'_, DbState>,
    invoice_id: String,
    amount: i64,
    method: String,
    reference: Option<String>,
    mpesa_receipt: Option<String>,
    notes: Option<String>,
    received_by: Option<String>,
) -> Result<Payment, String> {
    if amount <= 0 {
        return Err("Payment amount must be greater than 0".to_string());
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Get student_id and outstanding balance from invoice
    let (student_id, net_amount): (String, i64) = {
        let mut stmt = conn
            .prepare("SELECT student_id, net_amount FROM invoices WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row([&invoice_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| format!("Invoice not found: {}", e))?
    };

    // Calculate current paid amount
    let current_paid: i64 = {
        let mut stmt = conn
            .prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = ?1 AND status = 'completed'")
            .map_err(|e| e.to_string())?;
        stmt.query_row([&invoice_id], |row| row.get(0)).map_err(|e| e.to_string())?
    };

    let outstanding = net_amount - current_paid;
    if amount > outstanding {
        return Err(format!("Amount {} exceeds outstanding balance of {}", amount, outstanding));
    }

    // Check for duplicate M-Pesa receipt
    if let Some(ref receipt) = mpesa_receipt {
        if !receipt.trim().is_empty() {
            let existing: i64 = {
                let mut stmt = conn
                    .prepare("SELECT COUNT(*) FROM payments WHERE mpesa_receipt = ?1 AND status = 'completed'")
                    .map_err(|e| e.to_string())?;
                stmt.query_row([receipt.as_str()], |row| row.get(0)).map_err(|e| e.to_string())?
            };
            if existing > 0 {
                return Err(format!("M-Pesa receipt '{}' has already been recorded", receipt));
            }
        }
    }

    let id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();
    let payment_no = format!("PAY-{}", &id[..8].to_uppercase());

    conn.execute(
        "INSERT INTO payments (id, payment_no, invoice_id, student_id, amount, method, reference, mpesa_receipt, status, notes, received_by, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'completed', ?9, ?10, ?11)",
        rusqlite::params![id, payment_no, invoice_id, student_id, amount, method, reference, mpesa_receipt, notes, received_by, now],
    )
    .map_err(|e| e.to_string())?;

    // Update invoice status
    update_invoice_status(&conn, &invoice_id).map_err(|e| e.to_string())?;

    Ok(Payment {
        id,
        payment_no,
        invoice_id,
        student_id,
        amount,
        method,
        reference,
        mpesa_receipt,
        status: "completed".to_string(),
        notes,
        received_by,
        created_at: now,
        confirmed_at: None,
    })
}

#[tauri::command]
pub fn get_payments(
    state: State<'_, DbState>,
    student_id: Option<String>,
    method: Option<String>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<Payment>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sql = "SELECT id, payment_no, invoice_id, student_id, amount, method, reference, mpesa_receipt, status, notes, received_by, created_at, confirmed_at
                   FROM payments WHERE 1=1".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(s) = &student_id {
        sql.push_str(" AND student_id = ?");
        params.push(Box::new(s.clone()));
    }
    if let Some(m) = &method {
        sql.push_str(" AND method = ?");
        params.push(Box::new(m.clone()));
    }

    sql.push_str(" ORDER BY created_at DESC");

    let lim = limit.unwrap_or(100);
    let off = offset.unwrap_or(0);
    sql.push_str(&format!(" LIMIT {} OFFSET {}", lim, off));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let payments: Vec<Payment> = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(Payment {
                id: row.get(0)?,
                payment_no: row.get(1)?,
                invoice_id: row.get(2)?,
                student_id: row.get(3)?,
                amount: row.get(4)?,
                method: row.get(5)?,
                reference: row.get(6)?,
                mpesa_receipt: row.get(7)?,
                status: row.get(8)?,
                notes: row.get(9)?,
                received_by: row.get(10)?,
                created_at: row.get(11)?,
                confirmed_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(payments)
}

#[tauri::command]
pub fn get_payment_detail(
    state: State<'_, DbState>,
    id: String,
) -> Result<PaymentDetail, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let payment: Payment = {
        let mut stmt = conn
            .prepare("SELECT id, payment_no, invoice_id, student_id, amount, method, reference, mpesa_receipt, status, notes, received_by, created_at, confirmed_at FROM payments WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row([&id], |row| {
            Ok(Payment {
                id: row.get(0)?,
                payment_no: row.get(1)?,
                invoice_id: row.get(2)?,
                student_id: row.get(3)?,
                amount: row.get(4)?,
                method: row.get(5)?,
                reference: row.get(6)?,
                mpesa_receipt: row.get(7)?,
                status: row.get(8)?,
                notes: row.get(9)?,
                received_by: row.get(10)?,
                created_at: row.get(11)?,
                confirmed_at: row.get(12)?,
            })
        })
        .map_err(|e| format!("Payment not found: {}", e))?
    };

    let (student_name, admission_no): (String, String) = {
        let mut stmt = conn
            .prepare("SELECT first_name || ' ' || last_name, admission_no FROM students WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row([&payment.student_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
    };

    let invoice_no: String = {
        let mut stmt = conn
            .prepare("SELECT invoice_no FROM invoices WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row([&payment.invoice_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };

    Ok(PaymentDetail {
        payment,
        student_name,
        admission_no,
        invoice_no,
    })
}

fn update_invoice_status(conn: &rusqlite::Connection, invoice_id: &str) -> Result<(), rusqlite::Error> {
    let (net_amount, paid): (i64, i64) = {
        let mut stmt = conn.prepare(
            "SELECT i.net_amount,
                    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'completed'), 0)
             FROM invoices i WHERE i.id = ?1",
        )?;
        stmt.query_row([invoice_id], |row| Ok((row.get(0)?, row.get(1)?)))?
    };

    let status = if paid >= net_amount {
        "paid"
    } else if paid > 0 {
        "partial"
    } else {
        "unpaid"
    };

    let paid_at = if status == "paid" {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };

    conn.execute(
        "UPDATE invoices SET status = ?1, paid_at = ?2 WHERE id = ?3",
        rusqlite::params![status, paid_at, invoice_id],
    )?;

    Ok(())
}
