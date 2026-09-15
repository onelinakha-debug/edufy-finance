use crate::db::connection::DbState;
use crate::models::{Invoice, InvoiceDetail, InvoiceItem};
use crate::services::invoice_gen;
use rusqlite::Connection;
use tauri::State;

pub fn generate_invoices_inner(
    conn: &Connection,
    fee_structure_id: String,
    student_ids: Option<Vec<String>>,
) -> Result<Vec<Invoice>, String> {
    invoice_gen::generate_invoices_for_structure(conn, &fee_structure_id, student_ids)
        .map_err(|e| e.to_string())
}

pub fn get_invoices_inner(
    conn: &Connection,
    student_id: Option<String>,
    status: Option<String>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<Invoice>, String> {
    let mut sql = "SELECT id, invoice_no, student_id, fee_structure_id, total_amount, discount_amount, net_amount, status, due_date, created_at, paid_at
                   FROM invoices WHERE 1=1".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(s) = &student_id {
        sql.push_str(" AND student_id = ?");
        params.push(Box::new(s.clone()));
    }
    if let Some(s) = &status {
        sql.push_str(" AND status = ?");
        params.push(Box::new(s.clone()));
    }

    sql.push_str(" ORDER BY created_at DESC");

    let lim = limit.unwrap_or(100).min(1000);
    let off = offset.unwrap_or(0).max(0);
    sql.push_str(" LIMIT ? OFFSET ?");
    params.push(Box::new(lim));
    params.push(Box::new(off));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(Invoice {
                id: row.get(0)?,
                invoice_no: row.get(1)?,
                student_id: row.get(2)?,
                fee_structure_id: row.get(3)?,
                total_amount: row.get(4)?,
                discount_amount: row.get(5)?,
                net_amount: row.get(6)?,
                status: row.get(7)?,
                due_date: row.get(8)?,
                created_at: row.get(9)?,
                paid_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut invoices = Vec::new();
    for row in rows {
        invoices.push(row.map_err(|e| e.to_string())?);
    }

    Ok(invoices)
}

pub fn get_invoice_detail_inner(
    conn: &Connection,
    id: String,
) -> Result<InvoiceDetail, String> {
    let invoice: Invoice = {
        let mut stmt = conn
            .prepare("SELECT id, invoice_no, student_id, fee_structure_id, total_amount, discount_amount, net_amount, status, due_date, created_at, paid_at FROM invoices WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row([&id], |row| {
            Ok(Invoice {
                id: row.get(0)?,
                invoice_no: row.get(1)?,
                student_id: row.get(2)?,
                fee_structure_id: row.get(3)?,
                total_amount: row.get(4)?,
                discount_amount: row.get(5)?,
                net_amount: row.get(6)?,
                status: row.get(7)?,
                due_date: row.get(8)?,
                created_at: row.get(9)?,
                paid_at: row.get(10)?,
            })
        })
        .map_err(|e| format!("Invoice not found: {}", e))?
    };

    // Get items
    let items: Vec<InvoiceItem> = {
        let mut stmt = conn
            .prepare("SELECT ii.id, ii.vote_head_id, ii.amount, ii.description, vh.name
                      FROM invoice_items ii JOIN vote_heads vh ON ii.vote_head_id = vh.id
                      WHERE ii.invoice_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&id], |row| {
            Ok(InvoiceItem {
                id: row.get(0)?,
                vote_head_id: row.get(1)?,
                amount: row.get(2)?,
                description: row.get(3)?,
                vote_head_name: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        for row in rows { items.push(row.map_err(|e| e.to_string())?); }
        items
    };

    // Get payments for this invoice
    let payments: Vec<crate::models::InvoicePayment> = {
        let mut stmt = conn
            .prepare("SELECT id, payment_no, amount, method, mpesa_receipt, created_at
                      FROM payments WHERE invoice_id = ?1 AND status = 'completed'
                      ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&id], |row| {
            Ok(crate::models::InvoicePayment {
                id: row.get(0)?,
                payment_no: row.get(1)?,
                amount: row.get(2)?,
                method: row.get(3)?,
                mpesa_receipt: row.get(4)?,
                created_at: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut payments = Vec::new();
        for row in rows { payments.push(row.map_err(|e| e.to_string())?); }
        payments
    };

    // Get student info
    let (student_name, admission_no): (String, String) = {
        let mut stmt = conn
            .prepare("SELECT first_name || ' ' || last_name, admission_no FROM students WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row([&invoice.student_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
    };

    Ok(InvoiceDetail {
        invoice,
        items,
        payments,
        student_name,
        admission_no,
    })
}

#[tauri::command]
pub fn generate_invoices(
    state: State<'_, DbState>,
    fee_structure_id: String,
    student_ids: Option<Vec<String>>,
) -> Result<Vec<Invoice>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    generate_invoices_inner(&conn, fee_structure_id, student_ids)
}

#[tauri::command]
pub fn get_invoices(
    state: State<'_, DbState>,
    student_id: Option<String>,
    status: Option<String>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<Invoice>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_invoices_inner(&conn, student_id, status, limit, offset)
}

#[tauri::command]
pub fn get_invoice_detail(
    state: State<'_, DbState>,
    id: String,
) -> Result<InvoiceDetail, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_invoice_detail_inner(&conn, id)
}
