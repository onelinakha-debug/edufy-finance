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
        CREATE INDEX IF NOT EXISTS idx_mpesa_tx_invoice ON mpesa_transactions(invoice_id);")?;

    Ok(())
}
