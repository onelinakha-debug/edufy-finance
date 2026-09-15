use crate::models::{
    CapitationApplyResult, CapitationBatch, CapitationItem, CapitationPreviewItem, GazetteCategory,
};
use crate::utils::generate_id;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use tauri::State;
use crate::db::connection::DbState;

// ═══ CAPITATION (government grants, oldest-invoice-first) ═══

fn content_hash(school_id: &str, term: i32, year: i32, items: &[CapitationItem]) -> String {
    let mut rows: Vec<String> = items.iter()
        .map(|i| format!("{}:{}", i.admission_no.trim(), i.amount))
        .collect();
    rows.sort();
    let canonical = format!("{}|{}|{}|{}", school_id, term, year, rows.join(","));
    hex::encode(Sha256::digest(canonical.as_bytes()))
}

fn student_outstanding(conn: &Connection, student_id: &str) -> Result<i64, String> {
    let (invoiced, paid): (i64, i64) = conn.query_row(
        "SELECT COALESCE((SELECT SUM(net_amount) FROM invoices WHERE student_id = ?1),0),
                COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = ?1 AND status='completed'),0)",
        rusqlite::params![student_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;
    Ok((invoiced - paid).max(0))
}

/// Dry-run: match CSV rows to students, show what would be applied. No writes.
pub fn preview_capitation_inner(
    conn: &Connection,
    school_id: &str,
    items: &[CapitationItem],
) -> Result<Vec<CapitationPreviewItem>, String> {
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        let adm = item.admission_no.trim();
        let student: Option<(String, String, String)> = conn.query_row(
            "SELECT id, first_name || ' ' || last_name, grade FROM students
             WHERE admission_no = ?1 AND school_id = ?2 AND status = 'active'",
            rusqlite::params![adm, school_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).ok();
        match student {
            Some((id, name, grade)) => {
                let outstanding = student_outstanding(conn, &id)?;
                out.push(CapitationPreviewItem {
                    admission_no: adm.to_string(),
                    student_name: Some(name),
                    grade: Some(grade),
                    amount: item.amount,
                    matched: true,
                    outstanding,
                    will_apply: item.amount.min(outstanding),
                });
            }
            None => out.push(CapitationPreviewItem {
                admission_no: adm.to_string(),
                student_name: None,
                grade: None,
                amount: item.amount,
                matched: false,
                outstanding: 0,
                will_apply: 0,
            }),
        }
    }
    Ok(out)
}

/// Apply a capitation file. Idempotent via content hash. All writes in one SQLite transaction.
pub fn apply_capitation_inner(
    conn: &Connection,
    school_id: &str,
    term: i32,
    academic_year: i32,
    items: &[CapitationItem],
    source_filename: Option<String>,
    applied_by: Option<String>,
) -> Result<CapitationApplyResult, String> {
    if items.is_empty() {
        return Err("No rows to apply".to_string());
    }
    if term < 1 || term > 3 {
        return Err("Term must be 1, 2 or 3".to_string());
    }
    let hash = content_hash(school_id, term, academic_year, items);
    let dup: i64 = conn.query_row(
        "SELECT COUNT(*) FROM capitation_batches WHERE school_id = ?1 AND content_hash = ?2",
        rusqlite::params![school_id, hash],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if dup > 0 {
        return Err("This exact file was already applied (duplicate content).".to_string());
    }

    let batch_id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();
    let total: i64 = items.iter().map(|i| i.amount).sum();

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;
    let result = (|| -> Result<CapitationApplyResult, String> {
        conn.execute(
            "INSERT INTO capitation_batches (id, school_id, term, academic_year, total_amount, student_count, matched_count, content_hash, source_filename, applied_by, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10)",
            rusqlite::params![batch_id, school_id, term, academic_year, total, items.len() as i64, hash, source_filename, applied_by, now],
        ).map_err(|e| e.to_string())?;

        let mut matched = 0i32;
        let mut payments = 0i32;
        let mut unmatched = Vec::new();

        for item in items {
            let adm = item.admission_no.trim();
            let student_id: Option<String> = conn.query_row(
                "SELECT id FROM students WHERE admission_no = ?1 AND school_id = ?2 AND status = 'active'",
                rusqlite::params![adm, school_id],
                |row| row.get(0),
            ).ok();
            let student_id = match student_id {
                Some(id) => id,
                None => { unmatched.push(adm.to_string()); continue; }
            };
            matched += 1;

            // Oldest unpaid invoices first.
            let mut inv_stmt = conn.prepare(
                "SELECT id, net_amount,
                        COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = invoices.id AND status='completed'),0)
                 FROM invoices WHERE student_id = ?1 AND status IN ('unpaid','partial')
                 ORDER BY created_at ASC",
            ).map_err(|e| e.to_string())?;
            let invs: Vec<(String, i64, i64)> = inv_stmt.query_map(
                rusqlite::params![student_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
            drop(inv_stmt);

            let mut remaining = item.amount;
            for (inv_id, net, paid) in invs {
                if remaining <= 0 {
                    break;
                }
                let owe = (net - paid).max(0);
                if owe <= 0 {
                    continue;
                }
                let take = remaining.min(owe);
                remaining -= take;

                let pay_id = generate_id();
                let pay_no = format!("CAP-{}", &pay_id[..8].to_uppercase());
                conn.execute(
                    "INSERT INTO payments (id, payment_no, invoice_id, student_id, amount, method, reference, status, notes, received_by, capitation_batch_id, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'capitation', ?6, 'completed', 'Government capitation grant', ?7, ?8, ?9)",
                    rusqlite::params![pay_id, pay_no, inv_id, student_id, take, format!("CAP-{}", &batch_id[..8].to_uppercase()), applied_by, batch_id, now],
                ).map_err(|e| e.to_string())?;
                payments += 1;

                let new_paid = paid + take;
                let status = if new_paid >= net { "paid" } else { "partial" };
                let paid_at: Option<String> = if status == "paid" { Some(now.clone()) } else { None };
                conn.execute(
                    "UPDATE invoices SET status = ?1, paid_at = ?2 WHERE id = ?3",
                    rusqlite::params![status, paid_at, inv_id],
                ).map_err(|e| e.to_string())?;
            }
        }

        conn.execute(
            "UPDATE capitation_batches SET matched_count = ?1 WHERE id = ?2",
            rusqlite::params![matched, batch_id],
        ).map_err(|e| e.to_string())?;

        Ok(CapitationApplyResult {
            batch_id: batch_id.clone(),
            total_amount: total,
            student_count: items.len() as i32,
            matched_count: matched,
            payments_recorded: payments,
            unmatched,
        })
    })();

    match result {
        Ok(r) => { conn.execute("COMMIT", []).map_err(|e| e.to_string())?; Ok(r) }
        Err(e) => { let _ = conn.execute("ROLLBACK", []); Err(e) }
    }
}

pub fn list_capitation_batches_inner(conn: &Connection, school_id: &str) -> Result<Vec<CapitationBatch>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, term, academic_year, total_amount, student_count, matched_count, source_filename, applied_by, created_at
         FROM capitation_batches WHERE school_id = ?1 ORDER BY created_at DESC LIMIT 50",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(
        rusqlite::params![school_id],
        |row| Ok(CapitationBatch {
            id: row.get(0)?, school_id: row.get(1)?, term: row.get(2)?, academic_year: row.get(3)?,
            total_amount: row.get(4)?, student_count: row.get(5)?, matched_count: row.get(6)?,
            source_filename: row.get(7)?, applied_by: row.get(8)?, created_at: row.get(9)?,
        }),
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(rows)
}

// ═══ GAZETTE COMPLIANCE (bursar-configured caps) ═══

/// Per-category charged totals vs bursar-configured caps for a term.
/// Caps live in `fee_caps` (empty = uncapped) — the school confirms figures
/// against the current Ministry gazette; nothing is hardcoded here.
pub fn gazette_return_inner(
    conn: &Connection,
    school_id: &str,
    academic_year: i32,
    term: i32,
) -> Result<Vec<GazetteCategory>, String> {
    let mut stmt = conn.prepare(
        "SELECT vh.category, COALESCE(SUM(vh.amount),0)
         FROM vote_heads vh
         JOIN fee_structures fs ON fs.id = vh.fee_structure_id
         WHERE fs.school_id = ?1 AND fs.academic_year = ?2 AND fs.term = ?3 AND fs.is_active = 1
         GROUP BY vh.category",
    ).map_err(|e| e.to_string())?;
    let charged: Vec<(String, i64)> = stmt.query_map(
        rusqlite::params![school_id, academic_year, term],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    drop(stmt);

    let mut out = Vec::with_capacity(charged.len());
    for (category, amount) in charged {
        let cap: Option<i64> = conn.query_row(
            "SELECT cap_amount FROM fee_caps WHERE school_id = ?1 AND category = ?2",
            rusqlite::params![school_id, category],
            |row| row.get(0),
        ).ok();
        let status = match cap {
            Some(c) if amount > c => "over".to_string(),
            Some(_) => "within".to_string(),
            None => "uncapped".to_string(),
        };
        out.push(GazetteCategory { category, charged: amount, cap_amount: cap, status });
    }
    Ok(out)
}

pub fn set_fee_cap_inner(conn: &Connection, school_id: &str, category: &str, cap_amount: i64) -> Result<(), String> {
    if category.trim().is_empty() {
        return Err("Category is required".to_string());
    }
    if cap_amount < 0 {
        return Err("Cap cannot be negative".to_string());
    }
    conn.execute(
        "INSERT INTO fee_caps (school_id, category, cap_amount, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(school_id, category) DO UPDATE SET cap_amount = excluded.cap_amount, updated_at = datetime('now')",
        rusqlite::params![school_id, category.trim(), cap_amount],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ═══ TAURI COMMANDS ═══

#[tauri::command]
pub fn preview_capitation(
    state: State<'_, DbState>,
    school_id: String,
    items: Vec<CapitationItem>,
) -> Result<Vec<CapitationPreviewItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    preview_capitation_inner(&conn, &school_id, &items)
}

#[tauri::command]
pub fn apply_capitation(
    state: State<'_, DbState>,
    school_id: String,
    term: i32,
    academic_year: i32,
    items: Vec<CapitationItem>,
    source_filename: Option<String>,
    applied_by: Option<String>,
) -> Result<CapitationApplyResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    apply_capitation_inner(&conn, &school_id, term, academic_year, &items, source_filename, applied_by)
}

#[tauri::command]
pub fn list_capitation_batches(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<Vec<CapitationBatch>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    list_capitation_batches_inner(&conn, &school_id)
}

#[tauri::command]
pub fn gazette_return(
    state: State<'_, DbState>,
    school_id: String,
    academic_year: i32,
    term: i32,
) -> Result<Vec<GazetteCategory>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    gazette_return_inner(&conn, &school_id, academic_year, term)
}

#[tauri::command]
pub fn set_fee_cap(
    state: State<'_, DbState>,
    school_id: String,
    category: String,
    cap_amount: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    set_fee_cap_inner(&conn, &school_id, &category, cap_amount)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memdb() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE students (id TEXT PRIMARY KEY, admission_no TEXT, school_id TEXT, status TEXT, first_name TEXT, middle_name TEXT, last_name TEXT, grade TEXT);
             CREATE TABLE invoices (id TEXT PRIMARY KEY, student_id TEXT, net_amount INTEGER, status TEXT, created_at TEXT, paid_at TEXT);
             CREATE TABLE payments (id TEXT PRIMARY KEY, payment_no TEXT, invoice_id TEXT, student_id TEXT, amount INTEGER, method TEXT, reference TEXT, status TEXT, notes TEXT, received_by TEXT, capitation_batch_id TEXT, created_at TEXT);
             CREATE TABLE capitation_batches (id TEXT PRIMARY KEY, school_id TEXT, term INTEGER, academic_year INTEGER, total_amount INTEGER, student_count INTEGER, matched_count INTEGER, content_hash TEXT, source_filename TEXT, applied_by TEXT, created_at TEXT);",
        ).unwrap();
        conn.execute(
            "INSERT INTO students (id, admission_no, school_id, status, first_name, last_name, grade) VALUES ('s1','A1','sch', 'active','Jane','Wanjiku','Grade 3')",
            [],
        ).unwrap();
        // Oldest invoice first: 5000 then 3000
        conn.execute(
            "INSERT INTO invoices (id, student_id, net_amount, status, created_at) VALUES
             ('old','s1',5000,'unpaid','2026-01-05'), ('new','s1',3000,'unpaid','2026-02-05')",
            [],
        ).unwrap();
        conn
    }

    #[test]
    fn applies_oldest_first_and_partials() {
        let conn = memdb();
        let items = vec![
            CapitationItem { admission_no: "A1".into(), amount: 6000 },
            CapitationItem { admission_no: "GHOST".into(), amount: 1420 },
        ];
        let res = apply_capitation_inner(&conn, "sch", 1, 2026, &items, Some("f.csv".into()), Some("t".into())).unwrap();
        assert_eq!(res.matched_count, 1);
        assert_eq!(res.payments_recorded, 2);
        assert_eq!(res.unmatched, vec!["GHOST".to_string()]);

        let status = |id: &str| -> String {
            conn.query_row("SELECT status FROM invoices WHERE id = ?1", rusqlite::params![id], |r| r.get(0)).unwrap()
        };
        assert_eq!(status("old"), "paid");     // 5000 fully covered
        assert_eq!(status("new"), "partial");  // 1000 of 3000

        let cap_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM payments WHERE method='capitation' AND capitation_batch_id = ?1",
            rusqlite::params![res.batch_id],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(cap_count, 2);
    }

    #[test]
    fn duplicate_content_rejected() {
        let conn = memdb();
        let items = vec![CapitationItem { admission_no: "A1".into(), amount: 1000 }];
        apply_capitation_inner(&conn, "sch", 1, 2026, &items, None, None).unwrap();
        let err = apply_capitation_inner(&conn, "sch", 1, 2026, &items, None, None).unwrap_err();
        assert!(err.contains("already applied"), "unexpected: {}", err);
    }

    #[test]
    fn preview_matches_without_writes() {
        let conn = memdb();
        let items = vec![CapitationItem { admission_no: "A1".into(), amount: 2000 }];
        let p = preview_capitation_inner(&conn, "sch", &items).unwrap();
        assert_eq!(p.len(), 1);
        assert!(p[0].matched);
        assert_eq!(p[0].outstanding, 8000);
        assert_eq!(p[0].will_apply, 2000);
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM payments", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }
}
