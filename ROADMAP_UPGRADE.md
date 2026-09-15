# Upgrade Roadmap — From Desktop Tool to Kenyan School Platform

**Companion to:** `PROPOSAL_KENYAN_SCHOOL_ADOPTION.md` (why) and `WHATSAPP_BOT_TECHNICAL_SPEC.md` (how, WhatsApp detail).
**Principle:** every phase ships to a pilot school. No big-bang rewrites. Desktop keeps working throughout.

---

## Phase 0 — Stabilize & Instrument (Week 1) ✅ STARTED

Goal: stop silent failures, make the next phases measurable.

- [x] `toSnakeCase()` bridge in `tauri-commands.ts` (Tauri camelCase ↔ HTTP snake_case)
- [x] `tsc --noEmit` 0 errors, `cargo check` 0 errors, 58/58 unit tests
- [ ] Add structured logging: every `cmd()` failure logs `{command, school_id?, ms}` (no PII)
- [ ] Add `/health` details: `{db_ok, mpesa_configured, outbox_pending, version}`
- [ ] Add `settings` keys: `school_phone`, `school_hours`, `reminder_schedule`, `preferred_lang_default`
- [ ] Backfill `parents.phone_e164` (normalize all existing phones to `2547XXXXXXXX`)
- [ ] Create `whatsapp_sessions`, `whatsapp_outbox`, `payment_links` tables (this repo: `connection.rs` — DONE in this upgrade commit)
- [ ] Create `.env.example` with all new vars (DONE in this upgrade commit)

**Exit criteria:** fresh-DB onboard → login → dashboard works; health endpoint reports pending outbox count.

## Phase 1 — Web-Ready Multi-Tenant Core (Weeks 2–4)

Finish `WEB_MIGRATION_PLAN.md` Phases 1–5 (already ~80% done), then:

| Task | Files |
|------|-------|
| JWT + bcrypt enforced; reject `sha256:` logins after migration script | `auth.rs`, `commands/settings.rs`, migration script |
| Postgres behind `sqlx::PgPool`; SQLite stays for desktop/offline | `Cargo.toml`, `db/pool.rs` (new), `connection.rs` |
| Versioned migrations (`sqlx::migrate!`) replacing raw `run_migrations` | `migrations/*.sql` |
| Tenant resolution: subdomain → `school_id`; RLS policies | `server.rs`, Postgres policies |
| Deploy to Railway/Fly: `Dockerfile` + `PORT/HOST/DATABASE_URL/JWT_SECRET` | `Dockerfile`, docs |

**Exit:** one deployment serves 2 pilot schools on separate subdomains.

## Phase 2 — Parent Payment Links (Weeks 5–6) — HIGHEST ROI, DO FIRST

Self-service payment without bursar involvement. Builds on existing `initiate_mpesa_payment` + `check_mpesa_status`.

| Task | Files |
|------|-------|
| `POST /api/whatsapp/generate-link` (auth) → 32-char token, 10-min TTL, amount snapshot | `server.rs`, `commands/whatsapp.rs` (new) |
| `GET /pay/:token` (public) → invoice snapshot JSON (no PII beyond name+amount) | `server.rs` |
| `POST /pay/:token/confirm` (public) → STK Push via existing Daraja path | `server.rs`, reuse `mpesa.rs` inner |
| Frontend: minimal `/pay/:token` page (amount, phone input, Pay button, status poll) | `src/pages/pay.tsx` (new), `App.tsx` route |
| QR code on invoice print + "Copy pay link" button in bursar UI | `invoice-detail.tsx`, `payment-hub.tsx` |

**Exit:** bursar copies link → parent pays on own phone → invoice auto-marks paid → receipt generated.

## Phase 3 — WhatsApp Bot v1 (Weeks 7–9)

Per `WHATSAPP_BOT_TECHNICAL_SPEC.md`:

| Task | Files |
|------|-------|
| `services/whatsapp.rs`: config, HMAC verify, send text/buttons/document | `services/whatsapp.rs`, `services/mod.rs` |
| `commands/whatsapp.rs`: `lookup_balance_inner`, `link_parent_otp_inner`, `enqueue_reminder_inner` | `commands/whatsapp.rs`, `commands/mod.rs`, `lib.rs` |
| Webhook `GET/POST /webhook/whatsapp` (public, signature-verified, async spawn) | `server.rs` |
| State machine: menu → adm_no → OTP → balance → pay-link | `commands/whatsapp.rs` |
| Outbox worker: 5s drain, retry/backoff, WhatsApp→SMS fallback | `server.rs` (`outbox_worker`), Africa's Talking client |
| Meta approval: Business Account, phone verify, 6 templates (EN+SW) | Meta dashboard (ops task, start Week 7) |

**Exit:** parent sends `BALANCE` → balance + pay button in <3s. Bursar does nothing.

## Phase 4 — Reminders, Receipts, Capitation (Weeks 10–12)

| Task | Files |
|------|-------|
| Cron scheduler → `whatsapp_outbox.scheduled_for` (14d/7d/1d/overdue) | `services/scheduler.rs` (new) |
| KRA-compliant receipt PDF auto-send (WhatsApp doc + SMS link) | `services/invoice_gen.rs`, `whatsapp.rs` |
| Capitation CSV import → auto-apply oldest-first → Ministry report | `commands/capitation.rs` (new), `pages/capitation.tsx` |
| Ministry/County report templates (Gazette return, KRA VAT) | `reports/`, `lib/pdf.ts` |

**Exit:** term-close runs with one click: reminders sent, capitation applied, reports exported.

## Phase 5 — Offline-First (Weeks 13–16)

| Task | Files |
|------|-------|
| Tauri: local SQLite authoritative; sync queue table `sync_queue` | `db/connection.rs`, `services/sync.rs` (new) |
| Conflict policy: payments last-write-wins; invoices server-authoritative | `services/sync.rs` |
| Sync dashboard: last-sync, pending count, conflict resolver UI | `settings/sync-panel.tsx` (new) |
| PWA: service worker + IndexedDB read cache + background sync | `vite.config.ts`, `src/sw.ts` |

**Exit:** 4-hour blackout → 50 cash payments recorded → auto-sync on reconnect, zero loss.

---

## File Map (new/changed, cumulative)

```
NEW
src-tauri/src/services/whatsapp.rs      WhatsApp Cloud API client
src-tauri/src/services/scheduler.rs     Reminder cron → outbox
src-tauri/src/services/sync.rs          Offline sync engine
src-tauri/src/commands/whatsapp.rs      Balance/OTP/link *_inner fns
src-tauri/src/commands/capitation.rs    Capitation apply + report
src-tauri/src/db/pool.rs                Postgres pool (web), SQLite stays (desktop)
migrations/*.sql                        Versioned DDL (incl. wa_* + payment_links)
src/pages/pay.tsx                       Public payment page
src/pages/capitation.tsx                Capitation import + apply
src/components/settings/sync-panel.tsx  Sync status + conflicts
e2e/whatsapp.spec.ts                    Webhook + pay-link E2E

CHANGED
src-tauri/Cargo.toml                    +hmac,sha2,hex,sqlx,redis(opt)
src-tauri/src/services/mod.rs           +whatsapp,scheduler,sync
src-tauri/src/commands/mod.rs           +whatsapp,capitation
src-tauri/src/lib.rs                    register new Tauri commands
src-tauri/src/server.rs                 webhook + /pay/* + outbox worker + tenant resolve
src-tauri/src/db/connection.rs          wa_* + payment_links + phone_e164 + opt_out
src-tauri/src/models/mod.rs             WhatsApp + PaymentLink structs
src/services/tauri-commands.ts          +whatsappApi, +payApi
.env.example                            all new env vars
```

## Env Vars (new)

```
WHATSAPP_PHONE_NUMBER_ID=     # Meta Cloud API
WHATSAPP_ACCESS_TOKEN=        # system-user token, rotate quarterly
WHATSAPP_VERIFY_TOKEN=        # webhook verification (random 32ch)
WHATSAPP_APP_SECRET=          # HMAC verify
WHATSAPP_GRAPH_BASE=https://graph.facebook.com/v20.0
AT_API_KEY= / AT_USERNAME=    # Africa's Talking SMS fallback
PUBLIC_BASE_URL=https://school.edufy.finance  # pay links + webhook callbacks
PAY_LINK_TTL_MIN=10
REMINDER_SCHEDULE=14,7,1      # days before due
```

## Pilot Plan

1. **School A (private primary, ~400 pupils, Nairobi):** payment links + WhatsApp balance (Phase 2–3).
2. **School B (public primary, ~800 pupils, Kisumu):** + capitation (Phase 4).
3. **School C (rural, unreliable power):** + offline (Phase 5).
4. Each pilot: 1-hour onboarding call, Excel data migration, dedicated WhatsApp support group, weekly check-in for one term.

## What NOT to Build (v1)

USSD, AI chat, voice notes, parent mobile app (WhatsApp IS the app), multi-currency, payroll, timetable, exams module. Stay a fee platform.
