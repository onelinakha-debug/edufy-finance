use crate::models::StoredDocument;
use crate::utils::generate_id;
use rusqlite::Connection;
use tauri::State;
use crate::db::connection::DbState;

const DOC_TTL_DAYS: i64 = 30;

/// Store a PDF blob, return an expiring public token.
/// `pdf_base64` keeps the Tauri/HTTP boundary JSON-simple (receipts are <200KB).
pub fn store_document_inner(
    conn: &Connection,
    school_id: &str,
    kind: &str,
    ref_id: &str,
    filename: &str,
    pdf_base64: &str,
) -> Result<StoredDocument, String> {
    if !["receipt", "statement"].contains(&kind) {
        return Err("kind must be 'receipt' or 'statement'".to_string());
    }
    let bytes = base64_decode(pdf_base64)?;
    if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 {
        return Err("PDF must be non-empty and under 5MB".to_string());
    }
    // Quick magic-byte check: %PDF
    if bytes.len() < 4 || &bytes[..4] != b"%PDF" {
        return Err("Not a valid PDF".to_string());
    }

    let token = generate_id().replace('-', "").chars().take(32).collect::<String>();
    let now = chrono::Utc::now();
    let expires = (now + chrono::Duration::days(DOC_TTL_DAYS)).to_rfc3339();
    conn.execute(
        "INSERT INTO documents (token, school_id, kind, ref_id, filename, pdf_blob, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![token, school_id, kind, ref_id, filename, bytes, expires, now.to_rfc3339()],
    ).map_err(|e| e.to_string())?;

    Ok(StoredDocument {
        token,
        kind: kind.to_string(),
        ref_id: ref_id.to_string(),
        filename: filename.to_string(),
        expires_at: expires,
    })
}

pub fn resolve_document_inner(conn: &Connection, token: &str) -> Result<(Vec<u8>, String), String> {
    let (blob, filename, expires_at): (Vec<u8>, String, String) = conn.query_row(
        "SELECT pdf_blob, filename, expires_at FROM documents WHERE token = ?1",
        rusqlite::params![token],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Document not found".to_string())?;
    if expires_at < chrono::Utc::now().to_rfc3339() {
        return Err("Document link expired".to_string());
    }
    Ok((blob, filename))
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s.trim())
        .map_err(|_| "Invalid base64".to_string())
}

#[tauri::command]
pub fn store_document(
    state: State<'_, DbState>,
    school_id: String,
    kind: String,
    ref_id: String,
    filename: String,
    pdf_base64: String,
) -> Result<StoredDocument, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    store_document_inner(&conn, &school_id, &kind, &ref_id, &filename, &pdf_base64)
}
