# Edufy Finance — Proposal & Roadmap for Real Kenyan School Adoption

**Status:** Current system is a solid *desktop-only* fee management tool. To be adopted by real schools, it must become a **parent-facing payment + communication platform** with offline-first architecture.

---

## 🎯 Executive Summary

| Current State | Target State |
|---------------|--------------|
| Desktop app (Tauri) — bursar installs, records payments manually | **Multi-tenant web app + WhatsApp bot** — parents self-serve, bursar reconciles |
| M-Pesa STK Push initiated by bursar | **Parent-initiated STK Push + C2B** — parent pays on their phone, auto-reconciled |
| No parent access | **WhatsApp "Fee Bot"** — `BALANCE` → instant reply with amount + pay link |
| No SMS/Notifications | **Africa's Talking integration** — bulk reminders, receipts, alerts |
| Online-only SQLite | **Offline-first sync** — works during power/internet outages |
| Single school per install | **Multi-tenant SaaS** — one deployment serves 100+ schools |

---

## 🏫 What Real Kenyan Schools Need (Gap Analysis)

### 1. Parent Payment Channel (Critical)
**Current:** Bursar asks parent for phone → sends STK Push → parent enters PIN → bursar confirms.
**Problem:** Bursar is bottleneck. 500 parents = 500 manual STK pushes per term.
**Solution:** Parent clicks link / sends WhatsApp → sees balance → taps "Pay" → STK Push on *their* phone → auto-reconciled.

### 2. Fee Balance Enquiry (Critical)
**Current:** Parent calls/visits school → bursar looks up → reads balance.
**Problem:** 50+ calls/day during fee deadlines. Bursar can't work.
**Solution:** WhatsApp bot:
```
Parent: BALANCE 34567
Bot:    📋 Fee Balance for Jane Wanjiku (Grade 3A)
        Term 1 2026: KES 45,000
        Paid: KES 15,000
        Balance: KES 30,000
        
        💳 Tap to pay: https://pay.edufy.finance/inv/abc123
        Or dial *384*30000*254712345678# (STK Push)
```

### 3. Automated Reminders (High)
**Current:** Manual SMS/calls.
**Problem:** Inconsistent, missed parents, no audit trail.
**Solution:** Scheduled jobs:
- T-14 days: "Fee due in 2 weeks"
- T-7 days: "Reminder: KES 30,000 due"
- T-1 day: "URGENT: Pay tomorrow to avoid penalties"
- T+7 days: "Overdue: KES 30,000 + 5% penalty"

### 4. Capitation Grant Tracking (High — Public Schools)
**Current:** Not tracked.
**Problem:** Govt pays KES 1,420/child/term (primary) / KES 22,244 (secondary). Bursar must manually apply to arrears.
**Solution:** Capitation module — upload CSV from Ministry → auto-apply to oldest invoices → generate Ministry compliance report.

### 5. Offline-First (Critical — Rural Schools)
**Current:** Requires internet.
**Problem:** Power outages 4-6 hrs/day. Internet unreliable. Can't record cash payments during blackout.
**Solution:** Local SQLite + background sync queue. Cash payments recorded instantly → sync when online.

### 6. Ministry/County Compliance Reports (High)
**Current:** Manual Excel.
**Problem:** Specific formats required by MoE, County, KRA. Errors = penalties.
**Solution:** Pre-built templates: Gazette Return, KRA VAT, County Education Board.

---

## 🏗️ Architecture: From Desktop → Multi-Tenant SaaS

```
┌─────────────────────────────────────────────────────────────────┐
│                     EDUFY FINANCE CLOUD                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   API       │  │   WhatsApp  │  │   Worker    │             │
│  │   (Axum)    │◄─►│   Bot       │◄─►│   (Redis)   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                    │
│         ▼                ▼                ▼                    │
│  ┌─────────────────────────────────────────────┐              │
│  │           PostgreSQL (Primary)              │              │
│  │  schools • users • students • invoices      │              │
│  │  payments • mpesa_tx • whatsapp_sessions    │              │
│  └─────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌──────────┐    ┌──────────┐    ┌──────────┐
       │ School A │    │ School B │    │ School N │
       │ Desktop  │    │ Web Only │    │ Web Only │
       │ (Tauri)  │    │ (Mobile) │    │ (Mobile) │
       └──────────┘    └──────────┘    └──────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                    ┌─────────────────┐
                    │  SQLite Local   │
                    │  (Offline Queue)│
                    └─────────────────┘
```

---

## 📱 WhatsApp Bot Architecture (The Game Changer)

### Why WhatsApp?
- **98% penetration** in Kenya (vs 40% for email, 15% for school apps)
- Parents already use it daily
- No app install, no login, works on feature phones via WhatsApp Web
- Meta Business API supports interactive buttons, list messages, flows

### Bot Flow

```
┌────────────────────────────────────────────────────────────┐
│ PARENT SENDS "BALANCE" OR CHILD'S ADMISSION NO            │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│ WHATSAPP WEBHOOK (POST /webhook/whatsapp)                  │
│ 1. Verify Meta signature                                   │
│ 2. Extract phone_number (wa_id)                            │
│ 3. Lookup parent by phone → get children                   │
│ 4. If multiple children → send List Message                │
│ 5. If single child → fetch balance → reply with pay link   │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│ REPLY TEMPLATE (Interactive)                               │
│                                                            │
│  📋 Fee Balance — Jane Wanjiku (Grade 3A, Adm: 34567)     │
│  ─────────────────────────────────────                     │
│  Term 1 2026      Invoiced: KES 45,000                     │
│  Paid:            KES 15,000                               │
│  Balance:         KES 30,000  ⚠️ OVERDUE                   │
│  ─────────────────────────────────────                     │
│  [ 💳 Pay via M-Pesa ]  [ 📄 Download Statement ]         │
│  [ 📅 Payment Plan ]   [ 💬 Talk to Bursar ]              │
└────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     ┌─────────────────┐          ┌─────────────────┐
     │ "Pay via M-Pesa"│          │ "Download       │
     │ button clicked  │          │ Statement"      │
     └────────┬────────┘          └────────┬────────┘
              │                            │
              ▼                            ▼
     ┌─────────────────┐          ┌─────────────────┐
     │ Generate unique │          │ Generate PDF    │
     │ STK Push link   │          │ statement →     │
     │ valid 10 min    │          │ WhatsApp doc    │
     └────────┬────────┘          └─────────────────┘
              │
              ▼
     ┌─────────────────────────────────────────┐
     │ Parent taps link → opens browser →      │
     │ "Enter M-Pesa PIN" → payment done →     │
     │ Webhook confirms → invoice paid →       │
     │ WhatsApp receipt sent automatically     │
     └─────────────────────────────────────────┘
```

### Technical Implementation

**New Tables:**
```sql
-- WhatsApp sessions & rate limiting
CREATE TABLE whatsapp_sessions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id),
    parent_phone TEXT NOT NULL,      -- 2547XXXXXXXX
    parent_id TEXT REFERENCES parents(id),
    student_id TEXT REFERENCES students(id),
    state TEXT DEFAULT 'main_menu',  -- main_menu, select_child, viewing_balance, paying
    context_json TEXT,               -- JSON for multi-step flows
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_whatsapp_phone ON whatsapp_sessions(parent_phone);
CREATE INDEX idx_whatsapp_expires ON whatsapp_sessions(expires_at);

-- Outbound message queue (for reminders, receipts)
CREATE TABLE whatsapp_outbox (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id),
    parent_phone TEXT NOT NULL,
    template_name TEXT NOT NULL,     -- balance_reply, payment_receipt, fee_reminder
    params_json TEXT NOT NULL,       -- template variables
    status TEXT DEFAULT 'pending',   -- pending, sent, failed, delivered, read
    meta_msg_id TEXT,                -- Meta message ID for delivery tracking
    retry_count INTEGER DEFAULT 0,
    scheduled_for TEXT,              -- for scheduled reminders
    created_at TEXT DEFAULT (datetime('now')),
    sent_at TEXT
);
CREATE INDEX idx_whatsapp_outbox_status ON whatsapp_outbox(status);
CREATE INDEX idx_whatsapp_outbox_scheduled ON whatsapp_outbox(scheduled_for);
```

**Rust Service (`src-tauri/src/services/whatsapp_bot.rs`):**
```rust
pub struct WhatsAppBot {
    client: reqwest::Client,
    phone_number_id: String,
    access_token: String,
    verify_token: String,
    app_secret: String,
    base_url: String, // "https://graph.facebook.com/v20.0"
}

impl WhatsAppBot {
    // Verify incoming webhook
    pub fn verify_webhook(&self, mode: &str, token: &str, challenge: &str) -> Option<String> {
        if mode == "subscribe" && token == self.verify_token {
            Some(challenge.to_string())
        } else { None }
    }

    // Process incoming message
    pub async fn handle_incoming(&self, payload: WhatsAppIncoming) -> Result<()> {
        let phone = payload.entry[0].changes[0].value.contacts[0].wa_id.clone();
        let msg = &payload.entry[0].changes[0].value.messages[0];
        
        let session = self.get_or_create_session(&phone).await?;
        
        match msg.type_.as_str() {
            "text" => self.handle_text(&phone, &msg.text.body, &session).await?,
            "interactive" => self.handle_interactive(&phone, &msg.interactive, &session).await?,
            _ => {}
        }
        Ok(())
    }

    // Send balance reply with interactive buttons
    async fn send_balance_reply(&self, phone: &str, student: &Student, balance: &Balance) {
        let body = format!(
            "📋 *Fee Balance* — {} {} (Grade {}, Adm: {})\n\
            ──────────────────\n\
            Term {} {}\n\
            Invoiced: {} KES\n\
            Paid:     {} KES\n\
            Balance:  *{} KES* {}\n\
            ──────────────────",
            student.first_name, student.last_name, student.grade, student.admission_no,
            balance.term, balance.year,
            format_kes(balance.invoiced),
            format_kes(balance.paid),
            format_kes(balance.outstanding),
            if balance.outstanding > 0 { "⚠️" } else { "✅" }
        );

        let buttons = vec![
            InteractiveButton { id: "pay_mpesa", title: "💳 Pay via M-Pesa" },
            InteractiveButton { id: "download_stmt", title: "📄 Statement" },
            InteractiveButton { id: "payment_plan", title: "📅 Plan" },
            InteractiveButton { id: "talk_bursar", title: "💬 Bursar" },
        ];

        self.send_interactive(phone, &body, &buttons).await?;
    }

    // Generate STK Push payment link (valid 10 min)
    pub async fn generate_payment_link(&self, school_id: &str, invoice_id: &str, phone: &str) -> Result<String> {
        let token = generate_token(32);
        let expires = Utc::now() + Duration::minutes(10);
        
        // Store in Redis/DB with TTL
        redis::setex(&format!("stk_link:{}", token), 600, json!({
            "school_id": school_id,
            "invoice_id": invoice_id,
            "phone": phone
        })).await?;

        format!("https://pay.edufy.finance/pay/{}", token)
    }
}
```

**Webhook Endpoint (`src-tauri/src/server.rs`):**
```rust
// POST /webhook/whatsapp
async fn whatsapp_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<WhatsAppIncoming>,
) -> Result<impl IntoResponse, StatusCode> {
    // 1. Verify Meta signature (X-Hub-Signature-256)
    verify_meta_signature(&headers, &payload, &state.whatsapp_app_secret)?;

    // 2. Process asynchronously (don't block webhook)
    let bot = state.whatsapp_bot.clone();
    tokio::spawn(async move {
        if let Err(e) = bot.handle_incoming(payload).await {
            log::error!("WhatsApp handler error: {}", e);
        }
    });

    Ok(StatusCode::OK)
}

// GET /webhook/whatsapp (Meta verification)
async fn whatsapp_verify(
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    if let Some(challenge) = state.whatsapp_bot.verify_webhook(
        params.get("hub.mode").map(|s| s.as_str()).unwrap_or(""),
        params.get("hub.verify_token").map(|s| s.as_str()).unwrap_or(""),
        params.get("hub.challenge").map(|s| s.as_str()).unwrap_or(""),
    ) {
        return challenge.into_response();
    }
    StatusCode::FORBIDDEN.into_response()
}
```

---

## 📅 Roadmap: 16-Week Plan

### Phase 1: Foundation (Weeks 1-4) — *Web-Ready Multi-Tenant Core*

| Week | Deliverable | Details |
|------|-------------|---------|
| 1 | **PostgreSQL Migration** | Replace SQLite with Postgres for multi-tenancy. Add `school_id` to ALL tables (already there). Row-level security policies. |
| 2 | **Auth System** | JWT + bcrypt (already in web migration). Add: school-scoped roles (bursar, principal, teacher, parent). Invite flow. |
| 3 | **Web Deployment** | Complete `WEB_MIGRATION_PLAN.md` Phases 1-5. Docker + Railway/Fly.io deploy. Custom domains per school. |
| 4 | **API Hardening** | Rate limiting, CORS, request validation, audit logging, OpenAPI/Swagger docs. |

**Success Criteria:** Single deployment serves multiple schools. Each school gets `schoolname.edufy.finance` subdomain.

---

### Phase 2: Parent Payment Portal (Weeks 5-8) — *Self-Service Payments*

| Week | Deliverable | Details |
|------|-------------|---------|
| 5 | **Public Payment Page** | `/pay/:token` — no login. Shows invoice details, amount. "Pay KES 30,000" button → STK Push. |
| 6 | **STK Push Link Generator** | Secure 10-min tokens. QR code for desktop users. Deep link to M-Pesa app. |
| 7 | **C2B (Paybill/Till) Auto-Reconciliation** | Parent pays via paybill → C2B callback → auto-match to invoice by admission no in reference. |
| 8 | **Payment Receipts** | Auto-generated PDF + WhatsApp/Email/SMS delivery. KRA-compliant (VAT, PIN, serial). |

**Success Criteria:** Parent pays without bursar involvement. 100% auto-reconciliation.

---

### Phase 3: WhatsApp Bot (Weeks 9-12) — *The Killer Feature*

| Week | Deliverable | Details |
|------|-------------|---------|
| 9 | **Meta Business API Setup** | Register Business Account. Verify phone. Configure webhook. Template approval. |
| 10 | **Core Bot Engine** | Session management, state machine, rate limiting, message templates. |
| 11 | **Balance Enquiry Flow** | `BALANCE [adm_no]` → interactive reply with pay buttons. Multi-child selection. |
| 12 | **Automated Reminders** | Scheduler (cron) → `whatsapp_outbox` → template messages. Opt-out handling. |

**Template Messages (Pre-approved by Meta):**
```
1. fee_balance_reply — interactive buttons
2. payment_receipt — document (PDF)
3. fee_reminder_14d — text + quick reply "Pay Now"
4. fee_reminder_7d — text
5. fee_reminder_1d — text + "URGENT"
6. fee_overdue — text + penalty notice
7. capitation_applied — text
8. statement_ready — document
```

**Success Criteria:** Parent sends "BALANCE" → gets balance + pay link in <3 seconds. Zero bursar involvement.

---

### Phase 4: Offline-First & Sync (Weeks 13-16) — *Rural Reliability*

| Week | Deliverable | Details |
|------|-------------|---------|
| 13 | **Local-First Desktop** | Tauri app uses local SQLite. All writes local. Background sync to cloud. |
| 14 | **Conflict Resolution** | Last-write-wins for payments. Server-authoritative for invoices. Manual merge UI for conflicts. |
| 15 | **Sync Dashboard** | Bursar sees: "Last synced 2 min ago", "5 pending", "Conflict: 1 payment". |
| 16 | **Mobile PWA** | Service worker caches app shell. IndexedDB for offline reads. Background sync API. |

**Success Criteria:** Bursar records 50 cash payments during 4-hour power outage. All sync automatically when power returns.

---

## 💰 Business Model (Kenya-Friendly)

| Tier | Price | Includes | Target |
|------|-------|----------|--------|
| **Starter** | Free | Up to 100 students. Web only. Community support. | Small private / ECD |
| **Standard** | KES 50/student/term | Unlimited students. WhatsApp bot (1,000 msgs/mo). SMS 500/mo. Email support. | Primary schools |
| **Pro** | KES 80/student/term | WhatsApp unlimited. SMS 2,000/mo. Capitation module. Ministry reports. Phone support. | Secondary / Large primary |
| **Enterprise** | Custom | Multi-campus. Custom integrations. Dedicated account manager. SLA. | School groups |

**Revenue Example:** 500 students × KES 50 × 3 terms = **KES 75,000/year per school**. 100 schools = **KES 7.5M/year ARR**.

---

## 🔧 Technical Debt to Address First

Before Phase 1, these must be fixed (from current codebase):

1. **Password hashing** — Currently `sha256:{password}`. Must use bcrypt (already in web migration plan).
2. **JWT secret** — Hardcoded default. Must enforce env var in production.
3. **SQLite → Postgres** — `Mutex<Connection>` doesn't scale. Use `sqlx::PgPool` with connection pooling.
4. **M-Pesa callback URL** — Currently `localhost`. Must be configurable per school + HTTPS.
5. **C2B server** — Runs on fixed port 8089. Must be dynamic per school in cloud.
6. **Database migrations** — Raw SQL in `run_migrations`. Use `sqlx::migrate!` for versioned migrations.
6. **Multi-tenancy** — Add `school_id` to all queries (already there). Add RLS policies in Postgres.

---

## 📋 Immediate Next Steps (This Week)

1. **Complete web migration** — Finish `WEB_MIGRATION_PLAN.md` (Phases 1-5 already 80% done).
2. **Add Postgres support** — `sqlx` + `sqlx-cli` for migrations. Keep SQLite for local dev.
3. **Deploy to Railway** — Test multi-tenant with 2-3 pilot schools.
4. **Apply for WhatsApp Business API** — Takes 1-2 weeks for verification. Start now.
5. **Design payment link flow** — `POST /api/payment/generate-link` → returns short URL + QR.

---

## 🎓 Why This Wins in Kenya

| Feature | Excel | M-Pesa Paybill | SchoolERP | **Edufy Finance** |
|---------|-------|----------------|-----------|-------------------|
| Parent self-service | ❌ | ❌ | ✅ (app) | ✅ (WhatsApp — no app) |
| STK Push auto-reconcile | ❌ | Manual | Partial | ✅ Full |
| Offline cash recording | ✅ | ❌ | ❌ | ✅ |
| WhatsApp balance bot | ❌ | ❌ | ❌ | ✅ **Unique** |
| Ministry reports | Manual | ❌ | ✅ | ✅ Pre-built |
| Price | Free | Free | KES 200+/student | **KES 50/student** |
| Support | None | Safaricom | Nairobi only | **Kenya-wide** |

---

## 📞 Support Model (Kenya Context)

- **WhatsApp Support Group** — Each school gets a group with Edufy support (bursar + principal).
- **Business Hours** — Mon-Fri 7am-5pm EAT, Sat 8am-12pm.
- **Response SLA** — Critical (payment stuck): 15 min. Normal: 2 hours.
- **Training** — Monthly Zoom/YouTube tutorials in English + Swahili.
- **Onboarding** — Dedicated 1-hour call per school. Data migration from Excel.

---

## ✅ Definition of Done (MVP for First Paying School)

- [ ] Multi-tenant web app deployed on custom domain
- [ ] Parent pays via `/pay/:token` link → STK Push → auto-reconciled
- [ ] WhatsApp bot: `BALANCE` → interactive reply with pay button
- [ ] Automated fee reminders (14d, 7d, 1d, overdue)
- [ ] KRA-compliant receipt PDF auto-sent on payment
- [ ] Offline desktop app syncs when online
- [ ] 3 pilot schools live for 1 full term
- [ ] Documentation: Bursar guide (PDF + video), Parent guide (WhatsApp screenshots)

---

**Bottom Line:** The current codebase is 60% there. The missing 40% (parent channel, WhatsApp, offline, multi-tenant) is what transforms it from a "bursar's tool" into a **school fee platform parents actually use**. Prioritize WhatsApp bot + payment links — that's the distribution channel that gets you into 1,000 schools.