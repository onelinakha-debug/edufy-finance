use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn init_database(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;

    // Enable WAL mode for better concurrent performance
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")?;

    run_migrations(&conn)?;

    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schools (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            type          TEXT NOT NULL DEFAULT 'private_day',
            curriculum    TEXT NOT NULL DEFAULT 'cbc',
            county        TEXT,
            sub_county    TEXT,
            registration  TEXT,
            phone         TEXT,
            email         TEXT,
            address       TEXT,
            mpesa_paybill TEXT,
            mpesa_till    TEXT,
            logo_path     TEXT,
            motto         TEXT,
            created_at    TEXT DEFAULT (datetime('now')),
            updated_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fee_structures (
            id            TEXT PRIMARY KEY,
            school_id     TEXT NOT NULL REFERENCES schools(id),
            name          TEXT NOT NULL,
            grade         TEXT NOT NULL,
            term          INTEGER NOT NULL,
            academic_year INTEGER NOT NULL,
            is_active     INTEGER DEFAULT 1,
            created_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS vote_heads (
            id               TEXT PRIMARY KEY,
            fee_structure_id  TEXT NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
            name             TEXT NOT NULL,
            category         TEXT NOT NULL DEFAULT 'tuition',
            amount           INTEGER NOT NULL,
            is_mandatory     INTEGER DEFAULT 1,
            sort_order       INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS students (
            id              TEXT PRIMARY KEY,
            admission_no    TEXT UNIQUE NOT NULL,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            first_name      TEXT NOT NULL,
            middle_name     TEXT,
            last_name       TEXT NOT NULL,
            grade           TEXT NOT NULL,
            stream          TEXT,
            status          TEXT DEFAULT 'active',
            enrollment_date TEXT,
            created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS parents (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            phone        TEXT NOT NULL,
            email        TEXT,
            relationship TEXT,
            is_primary   INTEGER DEFAULT 0,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS student_parents (
            student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
            parent_id  TEXT REFERENCES parents(id) ON DELETE CASCADE,
            PRIMARY KEY (student_id, parent_id)
        );

        CREATE TABLE IF NOT EXISTS discount_policies (
            id              TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            name            TEXT NOT NULL,
            type            TEXT NOT NULL,
            applies_to      TEXT,
            percentage      REAL,
            fixed_amount    INTEGER,
            condition_json  TEXT,
            is_active       INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id               TEXT PRIMARY KEY,
            invoice_no       TEXT UNIQUE NOT NULL,
            student_id       TEXT NOT NULL REFERENCES students(id),
            fee_structure_id  TEXT NOT NULL REFERENCES fee_structures(id),
            total_amount     INTEGER NOT NULL,
            discount_amount  INTEGER DEFAULT 0,
            net_amount       INTEGER NOT NULL,
            status           TEXT DEFAULT 'unpaid',
            due_date         TEXT,
            created_at       TEXT DEFAULT (datetime('now')),
            paid_at          TEXT
        );

        CREATE TABLE IF NOT EXISTS invoice_items (
            id           TEXT PRIMARY KEY,
            invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            vote_head_id TEXT NOT NULL REFERENCES vote_heads(id),
            amount       INTEGER NOT NULL,
            description  TEXT
        );

        CREATE TABLE IF NOT EXISTS payments (
            id              TEXT PRIMARY KEY,
            payment_no      TEXT UNIQUE NOT NULL,
            invoice_id      TEXT NOT NULL REFERENCES invoices(id),
            student_id      TEXT NOT NULL REFERENCES students(id),
            amount          INTEGER NOT NULL,
            method          TEXT NOT NULL,
            reference       TEXT,
            mpesa_receipt   TEXT,
            status          TEXT DEFAULT 'completed',
            notes           TEXT,
            received_by     TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            confirmed_at    TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS grades (
            id            TEXT PRIMARY KEY,
            school_id     TEXT NOT NULL REFERENCES schools(id),
            name          TEXT NOT NULL,
            level         TEXT NOT NULL DEFAULT 'primary',
            sort_order    INTEGER DEFAULT 0,
            is_active     INTEGER DEFAULT 1,
            created_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS grade_promotions (
            id            TEXT PRIMARY KEY,
            school_id     TEXT NOT NULL REFERENCES schools(id),
            from_grade    TEXT NOT NULL,
            to_grade      TEXT NOT NULL,
            student_count INTEGER NOT NULL DEFAULT 0,
            academic_year INTEGER NOT NULL,
            promoted_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS users (
            id            TEXT PRIMARY KEY,
            school_id     TEXT NOT NULL REFERENCES schools(id),
            username      TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            full_name     TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'viewer',
            is_active     INTEGER DEFAULT 1,
            last_login    TEXT,
            created_at    TEXT DEFAULT (datetime('now')),
            UNIQUE(school_id, username)
        );

        CREATE TABLE IF NOT EXISTS discount_configs (
            id              TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            name            TEXT NOT NULL,
            type            TEXT NOT NULL,
            rate            REAL NOT NULL DEFAULT 0,
            min_students    INTEGER NOT NULL DEFAULT 1,
            is_active       INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id           TEXT PRIMARY KEY,
            action       TEXT NOT NULL,
            entity       TEXT NOT NULL,
            entity_id    TEXT NOT NULL,
            changes      TEXT,
            performed_by TEXT,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
        ")?;

    // ═══ CRITICAL INDEXES ═══

    conn.execute_batch(
        "
        -- Students: most queried table
        CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
        CREATE INDEX IF NOT EXISTS idx_students_school_grade ON students(school_id, grade);
        CREATE INDEX IF NOT EXISTS idx_students_status ON students(school_id, status);

        -- Fee structures: filtered by school + year + term
        CREATE INDEX IF NOT EXISTS idx_fee_structures_school ON fee_structures(school_id);
        CREATE INDEX IF NOT EXISTS idx_fee_structures_school_year_term ON fee_structures(school_id, academic_year, term);

        -- Vote heads: joined per fee structure
        CREATE INDEX IF NOT EXISTS idx_vote_heads_fee_structure ON vote_heads(fee_structure_id);

        -- Invoices: filtered by student, status, fee_structure
        CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
        CREATE INDEX IF NOT EXISTS idx_invoices_fee_structure ON invoices(fee_structure_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_student_fee ON invoices(student_id, fee_structure_id);

        -- Payments: filtered by invoice, student, receipt
        CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
        CREATE INDEX IF NOT EXISTS idx_payments_mpesa_receipt ON payments(mpesa_receipt);
        CREATE INDEX IF NOT EXISTS idx_payments_invoice_status ON payments(invoice_id, status);

        -- Grade promotions
        CREATE INDEX IF NOT EXISTS idx_grade_promotions_school ON grade_promotions(school_id);

        -- Users
        CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);

        -- Discount configs
        CREATE INDEX IF NOT EXISTS idx_discount_configs_school ON discount_configs(school_id);

        ")?;

    // Ensure discount_configs table exists (migration safety)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS discount_configs (
            id              TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            name            TEXT NOT NULL,
            type            TEXT NOT NULL,
            rate            REAL NOT NULL DEFAULT 0,
            min_students    INTEGER NOT NULL DEFAULT 1,
            is_active       INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now'))
        );",
    )?;

    // M-Pesa tables (must be created before indexes)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mpesa_configs (
            id                TEXT PRIMARY KEY,
            school_id         TEXT NOT NULL UNIQUE REFERENCES schools(id),
            consumer_key      TEXT NOT NULL,
            consumer_secret   TEXT NOT NULL,
            passkey           TEXT NOT NULL,
            shortcode         TEXT NOT NULL,
            callback_url      TEXT,
            is_active         INTEGER DEFAULT 1,
            created_at        TEXT DEFAULT (datetime('now')),
            updated_at        TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mpesa_transactions (
            id                      TEXT PRIMARY KEY,
            school_id               TEXT NOT NULL REFERENCES schools(id),
            invoice_id              TEXT REFERENCES invoices(id),
            merchant_request_id     TEXT,
            checkout_request_id     TEXT,
            phone                   TEXT NOT NULL,
            amount                  INTEGER NOT NULL,
            account_reference       TEXT,
            status                  TEXT DEFAULT 'pending',
            result_code             INTEGER,
            result_description      TEXT,
            mpesa_receipt           TEXT,
            raw_callback            TEXT,
            created_at              TEXT DEFAULT (datetime('now')),
            updated_at              TEXT DEFAULT (datetime('now'))
        );

        -- M-Pesa indexes (after table creation)
        CREATE INDEX IF NOT EXISTS idx_mpesa_tx_school ON mpesa_transactions(school_id);
        CREATE INDEX IF NOT EXISTS idx_mpesa_tx_checkout ON mpesa_transactions(checkout_request_id);
        CREATE INDEX IF NOT EXISTS idx_mpesa_tx_invoice ON mpesa_transactions(invoice_id);

        -- WhatsApp bot sessions (short-lived, TTL enforced by cleanup)
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id              TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            parent_phone    TEXT NOT NULL,
            parent_id       TEXT REFERENCES parents(id),
            student_id      TEXT REFERENCES students(id),
            state           TEXT NOT NULL DEFAULT 'main_menu',
            context_json    TEXT,
            expires_at      TEXT NOT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_wa_sess_phone ON whatsapp_sessions(parent_phone);
        CREATE INDEX IF NOT EXISTS idx_wa_sess_expires ON whatsapp_sessions(expires_at);

        -- Unified outbound queue (WhatsApp primary, SMS fallback)
        CREATE TABLE IF NOT EXISTS whatsapp_outbox (
            id              TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            parent_phone    TEXT NOT NULL,
            channel         TEXT NOT NULL DEFAULT 'whatsapp',
            template_name   TEXT NOT NULL,
            params_json     TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'pending',
            meta_msg_id     TEXT,
            retry_count     INTEGER NOT NULL DEFAULT 0,
            scheduled_for   TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            sent_at         TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_wa_outbox_status ON whatsapp_outbox(status);
        CREATE INDEX IF NOT EXISTS idx_wa_outbox_sched ON whatsapp_outbox(scheduled_for);

        -- Single-use STK Push payment links (10-min TTL)
        CREATE TABLE IF NOT EXISTS payment_links (
            token           TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            invoice_id      TEXT NOT NULL REFERENCES invoices(id),
            phone           TEXT NOT NULL,
            amount          INTEGER NOT NULL,
            expires_at      TEXT NOT NULL,
            used_at         TEXT,
            created_at      TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_paylink_expires ON payment_links(expires_at);
        CREATE INDEX IF NOT EXISTS idx_paylink_invoice ON payment_links(invoice_id);

        -- Parent link OTPs (admission-no + code verification)
        -- NOTE: `code` is plaintext by design: 6 digits, 10-min TTL, single-use,
        -- 5-attempt lockout, auto-purged by worker. Bursar reveals are audit-logged.
        -- (Phase 0 dev DBs used `code_hash`; rebuild dev DBs — no production exists yet.)
        CREATE TABLE IF NOT EXISTS parent_link_otps (
            id              TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            student_id      TEXT NOT NULL REFERENCES students(id),
            requester_phone TEXT NOT NULL,
            code            TEXT NOT NULL,
            attempts        INTEGER NOT NULL DEFAULT 0,
            used_at         TEXT,
            expires_at      TEXT NOT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_linkotp_student ON parent_link_otps(student_id);
        CREATE INDEX IF NOT EXISTS idx_linkotp_expires ON parent_link_otps(expires_at);

        -- Capitation batches (government per-student grants, applied oldest-first)
        CREATE TABLE IF NOT EXISTS capitation_batches (
            id              TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            term            INTEGER NOT NULL,
            academic_year   INTEGER NOT NULL,
            total_amount    INTEGER NOT NULL DEFAULT 0,
            student_count   INTEGER NOT NULL DEFAULT 0,
            matched_count   INTEGER NOT NULL DEFAULT 0,
            content_hash    TEXT NOT NULL DEFAULT '',
            source_filename TEXT,
            applied_by      TEXT,
            created_at      TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_capbatch_school ON capitation_batches(school_id);
        CREATE INDEX IF NOT EXISTS idx_capbatch_hash ON capitation_batches(school_id, content_hash);

        -- Bursar-configured fee caps per category (gazette compliance; empty = uncapped)
        CREATE TABLE IF NOT EXISTS fee_caps (
            school_id       TEXT NOT NULL REFERENCES schools(id),
            category        TEXT NOT NULL,
            cap_amount      INTEGER NOT NULL,
            updated_at      TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (school_id, category)
        );

        -- Document vault: PDFs served via expiring public links (WhatsApp docs)
        CREATE TABLE IF NOT EXISTS documents (
            token           TEXT PRIMARY KEY,
            school_id       TEXT NOT NULL REFERENCES schools(id),
            kind            TEXT NOT NULL,
            ref_id          TEXT NOT NULL,
            filename        TEXT NOT NULL,
            pdf_blob        BLOB NOT NULL,
            expires_at      TEXT NOT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_docs_expires ON documents(expires_at);")?;

    // Parents hardening columns (idempotent guards for existing DBs)
    ensure_column(conn, "parents", "phone_e164", "TEXT")?;
    ensure_column(conn, "parents", "sms_opt_out", "INTEGER DEFAULT 0")?;
    ensure_column(conn, "parents", "preferred_lang", "TEXT DEFAULT 'en'")?;
    ensure_column(conn, "payments", "capitation_batch_id", "TEXT")?;
    backfill_phone_e164(conn);

    Ok(())
}

/// ADD COLUMN if missing (SQLite has no IF NOT EXISTS for columns).
fn ensure_column(conn: &Connection, table: &str, column: &str, ddl: &str) -> Result<()> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?",
        rusqlite::params![table, column],
        |row| row.get(0),
    ).unwrap_or(0);
    if exists == 0 {
        let sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, ddl);
        // Ignore errors (e.g. concurrent migration) — column presence is re-checked next boot.
        let _ = conn.execute_batch(&sql);
    }
    Ok(())
}

/// Best-effort normalize of legacy parent phones to E.164 2547XXXXXXXX.
fn backfill_phone_e164(conn: &Connection) {    let rows: Vec<(String, String)> = conn.prepare("SELECT id, phone FROM parents WHERE phone_e164 IS NULL OR phone_e164 = ''")
        .and_then(|mut s| s.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).and_then(|r| r.collect::<Result<Vec<_>, _>>()))
        .unwrap_or_default();
    for (id, phone) in rows {
        let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
        let e164 = if digits.starts_with("254") && digits.len() == 12 {
            Some(digits)
        } else if digits.starts_with('0') && digits.len() == 10 {
            Some(format!("254{}", &digits[1..]))
        } else if digits.len() == 9 {
            Some(format!("254{}", digits))
        } else {
            None
        };
        if let Some(e) = e164 {
            let _ = conn.execute("UPDATE parents SET phone_e164 = ?1 WHERE id = ?2", rusqlite::params![e, id]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_create_all_phase_tables() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        for t in [
            "schools", "students", "invoices", "payments",
            "capitation_batches", "fee_caps", "documents",
            "whatsapp_outbox", "whatsapp_sessions", "payment_links", "parent_link_otps",
        ] {
            let n: i64 = conn.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                rusqlite::params![t],
                |r| r.get(0),
            ).unwrap();
            assert_eq!(n, 1, "missing table {}", t);
        }
        // ensure_column is idempotent
        ensure_column(&conn, "payments", "capitation_batch_id", "TEXT").unwrap();
        ensure_column(&conn, "payments", "capitation_batch_id", "TEXT").unwrap();
    }
}
