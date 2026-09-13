use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn init_database(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;

    // Enable WAL mode for better concurrent performance
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

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

        -- Schema v2: add motto to schools, add users table, add discount_configs table
        CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
        ")?;

    // Add motto column if not exists
    let has_motto: bool = conn
        .prepare("PRAGMA table_info(schools)")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            for r in rows {
                if r.unwrap_or_default() == "motto" {
                    return Ok(true);
                }
            }
            Ok(false)
        })
        .unwrap_or(false);

    if !has_motto {
        conn.execute_batch("ALTER TABLE schools ADD COLUMN motto TEXT;")?;
    }

    // Ensure users table exists
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS users (
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
        );",
    )?;

    // Ensure discount_configs table exists
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

    conn.execute_batch("        CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
        CREATE INDEX IF NOT EXISTS idx_discount_configs_school ON discount_configs(school_id);

        CREATE TABLE IF NOT EXISTS mpesa_configs (
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

        CREATE INDEX IF NOT EXISTS idx_mpesa_tx_school ON mpesa_transactions(school_id);
        CREATE INDEX IF NOT EXISTS idx_mpesa_tx_checkout ON mpesa_transactions(checkout_request_id);
        CREATE INDEX IF NOT EXISTS idx_mpesa_tx_invoice ON mpesa_transactions(invoice_id);")?;

    Ok(())
}
