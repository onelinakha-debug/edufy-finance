# WhatsApp Fee Bot — Technical Specification

**Companion to:** `PROPOSAL_KENYAN_SCHOOL_ADOPTION.md` (product proposal) and `ROADMAP_UPGRADE.md` (execution plan)
**Scope:** This doc is the build spec for the parent-facing WhatsApp channel. It is grounded in the current codebase: Axum `server.rs`, Daraja `mpesa.rs`/`daraja.rs`, SQLite `connection.rs`, `models/mod.rs`, Tauri `lib.rs`.

---

## 1. Decision: WhatsApp Cloud API (Meta) + Africa's Talking SMS fallback

| Option | Verdict |
|--------|---------|
| **Meta WhatsApp Cloud API** (primary) | ✅ Interactive buttons, list messages, PDF documents, delivery receipts. ~$0.005–0.02/msg. Required for balance bot. |
| **Africa's Talking SMS** (fallback + reminders) | ✅ Parents without WhatsApp/data still get reminders + receipts. KES ~0.80/SMS. Already Kenyan, M-Pesa-friendly. |
| USSD (`*384#`) | ❌ Parked. High telco setup cost, poor UX for statements. Revisit only if a school group demands it. |

**Best approach:** WhatsApp first, SMS fallback when `whatsapp_outbox` delivery fails or parent has no WhatsApp session. One outbox table drives both channels.

---

## 2. Message Flows (State Machine)

Session states stored in `whatsapp_sessions.state`: `main_menu`, `await_adm_no`, `select_child`, `viewing_balance`, `await_pay_confirm`.

```
INCOMING TEXT (normalized, case-insensitive)
├── "hi"|"hello"|"start"|"menu" → main_menu + help text
├── "balance"|"bal"|"fee"        → if linked child: balance reply
│                                  else: await_adm_no ("Reply with admission no, e.g. 34567")
├── "<digits>" (3–10 chars)      → treat as admission no → link phone↔student (after OTP) → balance reply
├── "pay"|"lipa"                 → generate 10-min STK link for oldest unpaid invoice → reply link + instructions
├── "receipt"|"risiti"           → last completed payment PDF → send as WhatsApp document
├── "statement"                  → full-term PDF → send as WhatsApp document
├── "plan"                       → payment-plan request → notify bursar (creates follow-up task)
├── "bursar"|"help"|"msaada"     → school phone + hours + opt-out instructions
├── "stop"                       → opt out of reminders (sets parents.sms_opt_out=1)
└── anything else                → help text + main menu
```

**Multi-child:** if one phone maps to N students, reply with an Interactive List Message (max 10 rows). Selecting a row sets `whatsapp_sessions.student_id` then sends balance.

**Security rule:** admission-no alone does NOT link. First-time linking requires OTP: bot sends 6-digit code via SMS to the phone already on file for that student (`parents.phone`), parent replies with code. This prevents a stranger enumerating admission numbers.

---

## 3. Data Model (New Tables)

All in `connection.rs::run_migrations` (SQLite now, same DDL ports to Postgres in Phase 1 of roadmap):

```sql
-- 1. Bot sessions (short-lived, TTL enforced by cleanup job)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id),
    parent_phone TEXT NOT NULL,          -- E.164 without '+': 2547XXXXXXXX
    parent_id TEXT REFERENCES parents(id),
    student_id TEXT REFERENCES students(id),
    state TEXT NOT NULL DEFAULT 'main_menu',
    context_json TEXT,                   -- e.g. {"candidate_children":[...], "otp_attempts":0}
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wa_sess_phone ON whatsapp_sessions(parent_phone);
CREATE INDEX IF NOT EXISTS idx_wa_sess_expires ON whatsapp_sessions(expires_at);

-- 2. Unified outbound queue (WhatsApp primary, SMS fallback)
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id),
    parent_phone TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp',  -- whatsapp | sms
    template_name TEXT NOT NULL,               -- balance_reply, payment_receipt, fee_reminder_14d...
    params_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',    -- pending|sent|failed|delivered|read
    meta_msg_id TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    scheduled_for TEXT,                        -- NULL = send ASAP; else cron time
    created_at TEXT DEFAULT (datetime('now')),
    sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_wa_outbox_status ON whatsapp_outbox(status);
CREATE INDEX IF NOT EXISTS idx_wa_outbox_sched ON whatsapp_outbox(scheduled_for);

-- 3. Single-use payment links (STK Push entry point, 10-min TTL)
CREATE TABLE IF NOT EXISTS payment_links (
    token TEXT PRIMARY KEY,              -- 32-char URL-safe
    school_id TEXT NOT NULL REFERENCES schools(id),
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    phone TEXT NOT NULL,                 -- prefilled, editable on page
    amount INTEGER NOT NULL,             -- snapshot at creation
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_paylink_expires ON payment_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_paylink_invoice ON payment_links(invoice_id);

-- 4. Parent hardening (columns added via ALTER TABLE guards)
-- parents.phone_e164 TEXT      -- normalized 2547XXXXXXXX (migration backfills)
-- parents.sms_opt_out INTEGER DEFAULT 0
-- parents.link_otp TEXT        -- hashed OTP, NULL after verify
-- parents.link_otp_expires TEXT
```

**Reuse, don't duplicate:** balance math reuses `get_student_detail_inner` + `get_invoices` logic; STK initiation reuses `initiate_mpesa_payment` async path; receipts reuse `services/invoice_gen.rs` PDF builder.

---

## 4. Rust Service: `services/whatsapp.rs`

Responsibilities only: config from env, signature verify, Graph API send, phone normalize, KES format, OTP helpers. All DB/balance logic stays in `commands/whatsapp.rs` (new) so Tauri + HTTP share `*_inner` functions per the `WEB_MIGRATION_PLAN.md` pattern.

```rust
pub struct WhatsAppConfig {
    pub phone_number_id: String,  // WHATSAPP_PHONE_NUMBER_ID
    pub access_token: String,     // WHATSAPP_ACCESS_TOKEN
    pub verify_token: String,     // WHATSAPP_VERIFY_TOKEN
    pub app_secret: String,       // WHATSAPP_APP_SECRET (HMAC verify)
    pub graph_base: String,       // default https://graph.facebook.com/v20.0
}

pub fn normalize_ke_phone(raw: &str) -> Option<String>;
pub fn format_kes(amount: i64) -> String;   // "KES 30,000"
pub fn verify_meta_signature(app_secret: &str, body: &[u8], sig_header: &str) -> bool; // HMAC-SHA256
pub async fn send_text(cfg, to, body) -> Result<String /*meta_msg_id*/>;
pub async fn send_interactive_buttons(cfg, to, body, buttons: &[(id, title)]) -> Result<String>;
pub async fn send_document_by_url(cfg, to, doc_url, filename, caption) -> Result<String>;
```

New crates: `hmac 0.12`, `sha2 0.10`, `hex 0.4` (signature verify). `reqwest` already present.

---

## 5. Server Wiring (`server.rs`)

Public routes (exempt from `auth_middleware`, like `/health` and `/api/auth/login`):

```
GET  /webhook/whatsapp      → Meta verification (hub.mode/challenge/verify_token)
POST /webhook/whatsapp      → verify X-Hub-Signature-256 → spawn async handler → 200 OK immediately
POST /api/whatsapp/generate-link  (auth) → {invoice_id, phone} → {url, expires_at}
GET  /pay/:token            → public: validate token+expiry → return invoice snapshot JSON
POST /pay/:token/confirm    → public: triggers initiate_mpesa_payment_inner path → returns checkout_request_id
```

Webhook handler never blocks: parse → `tokio::spawn(handle)` → `200`. All sends go through `whatsapp_outbox` so retries/scheduling survive restarts. A background task (`tokio::spawn(outbox_worker)`) drains `pending` rows every 5s, marks `sent/failed`, falls back to SMS after 2 WhatsApp failures.

---

## 6. Templates (submit for Meta approval in Week 9)

| Name | Type | Content |
|------|------|---------|
| `fee_balance` | interactive | Balance + 4 buttons (Pay / Statement / Plan / Bursar) |
| `payment_receipt` | document | "Payment received" + PDF |
| `fee_reminder_14d/7d/1d` | text + quick reply | Due-date + amount + "Pay Now" |
| `fee_overdue` | text | Balance + penalty policy |
| `link_otp` | text (utility) | 6-digit code, 10-min expiry |
| `statement_ready` | document | Full-term PDF |

All templates in English + Swahili (`_sw` variants). Swahili chosen by `parents.preferred_lang`.

---

## 7. Abuse & Cost Guards

- Rate limit: max 20 inbound msgs/phone/hour, max 5 OTP attempts → 30-min lockout.
- OTP: 6 digits, bcrypt-hashed at rest, 10-min expiry, single use.
- Payment links: single use, 10-min TTL, amount snapshot validated against invoice at confirm time (reject if invoice changed/paid).
- Outbox worker: exponential backoff (5s → 1m → 10m), dead-letter after 5 tries, bursar dashboard surfaces failures.
- PII: never log full phone or message bodies at `info`; phones masked (`2547***123`) in logs.

---

## 8. Testing

- Unit: phone normalize (0/+/254/7XX), KES format, HMAC verify with known vector, state-machine transitions with mocked DB.
- E2E (new `e2e/whatsapp.spec.ts`): mock Meta webhook POST → assert balance reply queued in `whatsapp_outbox`; generate-link → `GET /pay/:token` returns snapshot; expired token → 410.
- Load: outbox worker drains 1,000 scheduled reminders in <2 min on 1 vCPU.

---

## 9. What This Spec Deliberately Defers

USSD, AI/NLP intent parsing (keyword matching is enough for v1), multi-language auto-detect (explicit `EN/SW` keyword), voice notes, group broadcasts (use Channels/Communities manually).
