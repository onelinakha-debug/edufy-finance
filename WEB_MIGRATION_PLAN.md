# Edufy Finance — Web Deployment Migration Plan

**Goal:** Make the Tauri desktop app accessible online from any device (browser, mobile, tablet)
**Approach:** Dual-target — same Rust backend serves both Tauri IPC and HTTP REST API
**Estimated effort:** 5-7 phases, ~2-3 weeks

---

## Current State Assessment

| Layer | Status | Notes |
|---|---|---|
| Frontend (React) | 95% web-ready | All Tauri calls behind `isTauri()` guards with browser fallbacks |
| API layer (`tauri-commands.ts`) | Single abstraction | `cmd<T>()` function — swap `invoke()` for `fetch()` in one place |
| Rust backend | 80% web-ready | axum + tower-http already in Cargo.toml, all models serde-serializable |
| Auth | Needs work | `sha256:{password}` — must add bcrypt + JWT for web |
| Database | Portable | SQLite via rusqlite works for both desktop and small-to-medium web |
| C2B server | Already axum | Can merge into main HTTP server |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   Rust Binary (main.rs)              │
│                                                      │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  Tauri IPC Mode  │  │   HTTP Server Mode       │  │
│  │  (desktop app)   │  │   (web deployment)       │  │
│  │                  │  │                          │  │
│  │  invoke("cmd")   │  │  POST /api/cmd           │  │
│  │       │          │  │       │                  │  │
│  └───────┼──────────┘  └───────┼──────────────────┘  │
│          │                      │                     │
│          └──────────┬───────────┘                     │
│                     ▼                                 │
│          ┌─────────────────────┐                      │
│          │  Shared Commands    │                      │
│          │  (business logic)   │                      │
│          └─────────┬───────────┘                      │
│                    ▼                                  │
│          ┌─────────────────────┐                      │
│          │  SQLite (WAL mode)  │                      │
│          └─────────────────────┘                      │
└──────────────────────────────────────────────────────┘
```

The key insight: **the Rust command functions contain ALL business logic**. We don't duplicate anything — the HTTP server calls the same functions, just with a different state extractor.

---

## Phase 1: Extract Business Logic into Shared Layer

**Why:** Currently every command takes `State<'_, DbState>` (Tauri-specific type). We need the logic callable from both Tauri and axum. Instead of duplicating, we extract the core logic into functions that take `&Connection` directly.

### Files to create/modify:

**1. Create `src-tauri/src/commands/mod.rs` — already exists, just reorganize**

Each command module stays the same. We add a thin wrapper pattern:

```rust
// In each command file, the core logic stays as-is.
// We add a second entry point that takes &Connection directly.
// Example for payment.rs:

// Existing Tauri command (unchanged)
#[tauri::command]
pub fn record_payment(state: State<'_, DbState>, ...) -> Result<Payment, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    record_payment_inner(&conn, ...)
}

// New: pure logic function callable from HTTP handlers
pub fn record_payment_inner(conn: &Connection, ...) -> Result<Payment, String> {
    // ... all the existing logic moved here
}
```

**Effort:** ~1 day. Mechanical refactor of 43 commands — extract `*_inner` functions.

### Commands to extract (43 total):

| Module | Commands | Complexity |
|---|---|---|
| `school.rs` | `create_school`, `get_school`, `update_school`, `list_schools` | Low |
| `student.rs` | `create_student`, `get_students`, `get_student_detail`, `update_student`, `delete_student` | Medium |
| `fee.rs` | `create_fee_structure`, `get_fee_structures`, `add_vote_head`, `get_vote_heads`, `get_discount_configs`, `add_discount_config`, `remove_discount_config` | Low |
| `invoice.rs` | `generate_invoices`, `get_invoices`, `get_invoice_detail` | Medium |
| `payment.rs` | `record_payment`, `get_payments`, `get_payment_detail` | Medium |
| `mpesa.rs` | `get_mpesa_config`, `save_mpesa_config`, `test_mpesa_connection`, `initiate_mpesa_payment`, `check_mpesa_status`, `get_mpesa_transactions`, `register_c2b_urls`, `start_c2b_server`, `get_c2b_transactions`, `match_c2b_payment` | High (async) |
| `dashboard.rs` | `get_dashboard_stats` | Medium |
| `report.rs` | `get_collection_summary`, `get_outstanding_report`, `get_age_analysis`, `get_student_history` | Medium |
| `settings.rs` | `get_setting`, `set_setting`, `backup_database`, `get_school_profile`, `update_school_profile`, `list_users`, `create_user`, `update_user`, `delete_user` | Low-Medium |
| `grade.rs` | `create_grade`, `get_grades`, `update_grade`, `delete_grade`, `promote_students`, `get_promotion_history`, `count_students_in_grade` | Medium |

### Async M-Pesa commands:
- `initiate_mpesa_payment` — uses `DarajaClient::get_access_token().await` and `initiate_stk_push().await`
- `check_mpesa_status` — uses `DarajaClient::query_stk_push_status().await`
- `test_mpesa_connection` — uses `tokio::runtime::Runtime::new()` to block on async

These need special handling: the `_inner` function stays async, and the HTTP handler calls it with axum's async support.

---

## Phase 2: Create Axum HTTP Server

**File to create:** `src-tauri/src/server.rs`

This file contains:
1. Route definitions mapping REST endpoints to command functions
2. Auth middleware (JWT)
3. CORS configuration
4. Static file serving for the React SPA

### 2a. Route structure

Every frontend API call maps to a POST endpoint. The request body is JSON matching the Tauri command args.

```
POST /api/create_school          → school::create_school_inner
POST /api/list_schools           → school::list_schools_inner
POST /api/get_school             → school::get_school_inner
POST /api/update_school          → school::update_school_inner

POST /api/create_student         → student::create_student_inner
POST /api/get_students           → student::get_students_inner
POST /api/get_student_detail     → student::get_student_detail_inner
POST /api/update_student         → student::update_student_inner
POST /api/delete_student         → student::delete_student_inner

POST /api/create_fee_structure   → fee::create_fee_structure_inner
POST /api/get_fee_structures     → fee::get_fee_structures_inner
POST /api/add_vote_head          → fee::add_vote_head_inner
POST /api/get_vote_heads         → fee::get_vote_heads_inner
POST /api/get_discount_configs   → fee::get_discount_configs_inner
POST /api/add_discount_config    → fee::add_discount_config_inner
POST /api/remove_discount_config → fee::remove_discount_config_inner

POST /api/generate_invoices      → invoice::generate_invoices_inner
POST /api/get_invoices           → invoice::get_invoices_inner
POST /api/get_invoice_detail     → invoice::get_invoice_detail_inner

POST /api/record_payment         → payment::record_payment_inner
POST /api/get_payments           → payment::get_payments_inner
POST /api/get_payment_detail     → payment::get_payment_detail_inner

POST /api/get_mpesa_config       → mpesa::get_mpesa_config_inner
POST /api/save_mpesa_config      → mpesa::save_mpesa_config_inner
POST /api/test_mpesa_connection  → mpesa::test_mpesa_connection_inner
POST /api/initiate_mpesa_payment → mpesa::initiate_mpesa_payment_inner (async)
POST /api/check_mpesa_status     → mpesa::check_mpesa_status_inner (async)
POST /api/get_mpesa_transactions → mpesa::get_mpesa_transactions_inner
POST /api/register_c2b_urls      → mpesa::register_c2b_urls_inner
POST /api/start_c2b_server       → mpesa::start_c2b_server_inner
POST /api/get_c2b_transactions   → mpesa::get_c2b_transactions_inner
POST /api/match_c2b_payment      → mpesa::match_c2b_payment_inner

POST /api/get_dashboard_stats    → dashboard::get_dashboard_stats_inner

POST /api/get_collection_summary → report::get_collection_summary_inner
POST /api/get_outstanding_report → report::get_outstanding_report_inner
POST /api/get_student_history    → report::get_student_history_inner
POST /api/get_age_analysis       → report::get_age_analysis_inner

POST /api/get_setting            → settings::get_setting_inner
POST /api/set_setting            → settings::set_setting_inner
POST /api/backup_database        → settings::backup_database_inner
POST /api/get_school_profile     → settings::get_school_profile_inner
POST /api/update_school_profile  → settings::update_school_profile_inner
POST /api/list_users             → settings::list_users_inner
POST /api/create_user            → settings::create_user_inner
POST /api/update_user            → settings::update_user_inner
POST /api/delete_user            → settings::delete_user_inner

POST /api/create_grade           → grade::create_grade_inner
POST /api/get_grades             → grade::get_grades_inner
POST /api/update_grade           → grade::update_grade_inner
POST /api/delete_grade           → grade::delete_grade_inner
POST /api/promote_students       → grade::promote_students_inner
POST /api/get_promotion_history  → grade::get_promotion_history_inner
POST /api/count_students_in_grade → grade::count_students_in_grade_inner

POST /api/auth/login             → settings::login_inner (NEW)
```

### 2b. Generic route handler macro

Since all routes follow the same pattern (POST JSON → call function → return JSON), we create a macro or generic handler:

```rust
async fn handle_command<F, T, R>(
    State(state): State<Arc<DbState>>,
    Json(args): Json<T>,
    handler: F,
) -> Result<Json<R>, (StatusCode, String)>
where
    F: FnOnce(&Connection, T) -> Result<R, String> + Send + 'static,
    T: Send + 'static,
    R: Serialize,
{
    let conn = state.0.lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let result = handler(&conn, args)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(result))
}
```

### 2c. Auth middleware

```rust
// JWT claims
struct Claims {
    sub: String,      // user_id
    school_id: String,
    role: String,
    exp: usize,
}

// Middleware that extracts Bearer token from Authorization header
async fn auth_middleware(
    headers: HeaderMap,
    State(state): State<Arc<DbState>>,
) -> Result<Claims, StatusCode> {
    let token = headers.get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));
    
    match token {
        Some(t) => verify_jwt(t, &state.jwt_secret),
        None => Err(StatusCode::UNAUTHORIZED),
    }
}
```

### 2d. CORS configuration

```rust
let cors = CorsLayer::new()
    .allow_origin(Any)  // Restrict to specific origins in production
    .allow_methods([Method::POST, Method::GET, Method::OPTIONS])
    .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);
```

### 2e. Static file serving

For web mode, serve the built React SPA:

```rust
let app = Router::new()
    .nest("/api", api_routes)
    .fallback_service(ServeDir::new("dist")
        .append_index_html_on_directories(true))
    .layer(cors)
    .with_state(state);
```

### 2f. Login endpoint (NEW)

```rust
#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
    school_id: String,
}

#[derive(Serialize)]
struct LoginResponse {
    token: String,
    user: User,
    school_id: String,
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    // Verify credentials against users table
    // Check password_hash matches
    // Generate JWT token
    // Return token + user info
}
```

**Effort:** ~2-3 days

---

## Phase 3: Add JWT Authentication

### 3a. New dependencies in `Cargo.toml`

```toml
jsonwebtoken = "9"
bcrypt = "0.15"
```

### 3b. New file: `src-tauri/src/auth.rs`

```rust
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use bcrypt::{hash, verify, DEFAULT_COST};

pub fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
    hash(password, DEFAULT_COST)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, bcrypt::BcryptError> {
    verify(password, hash)
}

pub fn create_token(user_id: &str, school_id: &str, role: &str, secret: &[u8]) -> String {
    let claims = Claims {
        sub: user_id.to_string(),
        school_id: school_id.to_string(),
        role: role.to_string(),
        exp: chrono::Utc::now()
            .checked_add_signed(chrono::Duration::hours(24))
            .unwrap()
            .timestamp() as usize,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret)).unwrap()
}

pub fn verify_token(token: &str, secret: &[u8]) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(token, &DecodingKey::from_secret(secret), &Validation::default())?;
    Ok(data.claims)
}
```

### 3c. Password hashing migration

Update `create_user_inner` to use bcrypt:
```rust
let password_hash = bcrypt::hash(&password, DEFAULT_COST)
    .map_err(|e| format!("Failed to hash password: {}", e))?;
```

### 3d. Login endpoint

Add `login` command to settings.rs:
```rust
pub fn login_inner(conn: &Connection, username: &str, password: &str, school_id: &str) -> Result<(User, String), String> {
    let user = conn.query_row(
        "SELECT id, username, full_name, role, is_active, password_hash FROM users WHERE school_id = ?1 AND username = ?2",
        rusqlite::params![school_id, username],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i32>(4)? == 1, row.get::<_, String>(5)?)),
    ).map_err(|_| "Invalid credentials".to_string())?;
    
    if !user.4 { return Err("Account disabled".to_string()); }
    verify_password(password, &user.5).map_err(|_| "Invalid credentials".to_string())?;
    
    // Update last_login
    // Generate JWT
    // Return (User, token)
}
```

**Effort:** ~1-2 days

---

## Phase 4: Frontend HTTP Client

### 4a. Modify `src/services/tauri-commands.ts`

Replace the `cmd<T>()` function to auto-detect and use HTTP when not in Tauri:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '';

function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// Auth state
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('edufy_token', token);
  } else {
    localStorage.removeItem('edufy_token');
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('edufy_token');
  }
  return authToken;
}

async function cmd<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauriAvailable()) {
    // Desktop: use Tauri IPC
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      console.error(`Command failed: ${command}`, error);
      throw error;
    }
  }

  // Web: use HTTP API
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}/api/${command}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args || {}),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// New: Login function
export async function login(username: string, password: string, schoolId: string) {
  const result = await cmd<{ token: string; user: any; school_id: string }>('auth/login', {
    username, password, school_id: schoolId,
  });
  setAuthToken(result.token);
  return result;
}

// New: Logout function
export function logout() {
  setAuthToken(null);
}
```

### 4b. Add auth state to Zustand store

Add to `src/stores/app-store.ts`:
```typescript
interface AppState {
  // ... existing
  user: { id: string; username: string; full_name: string; role: string } | null;
  setUser: (user: AppState['user']) => void;
  token: string | null;
  setToken: (token: string | null) => void;
}
```

### 4c. Create login page

**File:** `src/pages/login.tsx`

Simple login form with username, password, and school selector (or school code input).

### 4d. Add auth guard to routes

Wrap `AppShell` with auth check — redirect to `/login` if no token in web mode.

### 4e. Persist `currentSchoolId` in localStorage

Currently lost on refresh. Add:
```typescript
currentSchoolId: localStorage.getItem('schoolId') || null,
setCurrentSchoolId: (id) => {
  if (id) localStorage.setItem('schoolId', id);
  else localStorage.removeItem('schoolId');
  set({ currentSchoolId: id });
},
```

**Effort:** ~2-3 days

---

## Phase 5: Entry Point & Deployment

### 5a. Modify `src-tauri/src/main.rs`

Add a `--web` flag or `WEB_MODE` env var to start as HTTP server:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    env_logger::init();
    
    let web_mode = std::env::args().any(|arg| arg == "--web") 
        || std::env::var("WEB_MODE").unwrap_or_default() == "1";
    
    if web_mode {
        // Run as HTTP server (blocks on tokio runtime)
        app_lib::run_web_server();
    } else {
        // Run as Tauri desktop app
        app_lib::run();
    }
}
```

### 5b. Add `run_web_server()` to `src-tauri/src/lib.rs`

```rust
pub fn run_web_server() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(server::start());
}
```

### 5c. Server startup in `src-tauri/src/server.rs`

```rust
pub async fn start() {
    let db_path = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| {
            let dirs = dirs::data_local_dir().unwrap_or_else(|| ".".into());
            std::path::PathBuf::from(dirs).join("edufy").join("edufy.db")
        });
    
    // Ensure parent exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    
    let conn = db::connection::init_database(&db_path).expect("Failed to init DB");
    let state = Arc::new(AppState {
        db: DbState(Mutex::new(conn)),
        jwt_secret: std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "edufy-default-secret-change-in-production".into())
            .into_bytes(),
    });
    
    let app = build_router(state);
    
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("PORT").unwrap_or_else(|_| "8080".into())
        .parse().unwrap_or(8080);
    
    let listener = tokio::net::TcpListener::bind(format!("{}:{}", host, port))
        .await.unwrap();
    
    log::info!("Edufy Finance web server running on {}:{}", host, port);
    axum::serve(listener, app).await.unwrap();
}
```

### 5d. Environment variables

| Variable | Default | Description |
|---|---|---|
| `WEB_MODE` | `0` | Set to `1` to run as HTTP server |
| `PORT` | `8080` | HTTP server port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | `{local_data_dir}/edufy/edufy.db` | SQLite path |
| `JWT_SECRET` | (random) | JWT signing secret |
| `VITE_API_URL` | `` (empty = same origin) | Frontend API base URL |

### 5e. Dockerfile

```dockerfile
# Build stage
FROM rust:1.77 as builder
WORKDIR /app
COPY src-tauri/ ./src-tauri/
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
RUN cd src-tauri && cargo build --release --features custom-protocol

# Runtime stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libgtk-3-0 libwebkit2gtk-4.1-0 libappindicator3-1 librsvg2-0
COPY --from=builder /app/src-tauri/target/release/edufy-finance /usr/local/bin/
COPY dist/ /app/dist/

ENV WEB_MODE=1
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["edufy-finance", "--web"]
```

### 5f. Hosting options

| Option | Cost | Best for |
|---|---|---|
| **Railway** | $5/mo | Easiest — auto-deploy from GitHub |
| **Fly.io** | Free tier | Good for global deployment |
| **VPS (Hetzner/DigitalOcean)** | $5-10/mo | Full control |
| **Render** | Free tier | Simple, auto-deploy |

For Kenya-specific: **Hetzner** has good Africa connectivity, or use a Kenyan VPS provider.

**Effort:** ~1-2 days

---

## Phase 6: Testing & Polish

### 6a. E2E tests for web mode

Add Playwright tests that run against the HTTP server (not Tauri):

```typescript
// e2e/web.spec.ts
test.describe('Web Mode', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('http://localhost:8080/login');
    await expect(page.getByText('Edufy Finance')).toBeVisible();
  });
  
  test('can login and see dashboard', async ({ page }) => {
    await page.goto('http://localhost:8080/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });
});
```

### 6b. Mobile responsiveness audit

The UI is already responsive (Tailwind), but verify:
- Tables scroll horizontally on mobile
- Modals fit on small screens
- Touch targets are large enough (48px minimum)
- Navigation works on mobile (hamburger menu)

### 6c. Performance checks

- SQLite WAL mode is already enabled
- Consider connection pooling for high-traffic web (currently Mutex<Connection> — single writer)
- Add response caching headers for static assets
- Gzip compression via tower-http

### 6d. Security audit

- [ ] CSRF protection (SameSite cookies or custom header check)
- [ ] Rate limiting on login endpoint
- [ ] Input validation (already exists for most commands)
- [ ] SQL injection audit (already done — all parameterized)
- [ ] JWT expiration handling
- [ ] HTTPS in production (reverse proxy handles this)

---

## File Changes Summary

| File | Action | Description |
|---|---|---|
| `src-tauri/src/server.rs` | CREATE | Axum HTTP server, routes, auth middleware |
| `src-tauri/src/auth.rs` | CREATE | JWT + bcrypt utilities |
| `src-tauri/src/main.rs` | MODIFY | Add `--web` flag |
| `src-tauri/src/lib.rs` | MODIFY | Add `run_web_server()` |
| `src-tauri/Cargo.toml` | MODIFY | Add `jsonwebtoken`, `bcrypt`, `dirs` |
| `src-tauri/src/commands/*.rs` | MODIFY | Extract `*_inner` functions |
| `src-tauri/src/commands/settings.rs` | MODIFY | Add `login` command |
| `src/services/tauri-commands.ts` | MODIFY | HTTP client for web mode |
| `src/stores/app-store.ts` | MODIFY | Add auth state |
| `src/pages/login.tsx` | CREATE | Login page |
| `src/App.tsx` | MODIFY | Add auth guard + login route |
| `Dockerfile` | CREATE | Container build |
| `.env.example` | CREATE | Environment variables |
| `e2e/web.spec.ts` | CREATE | Web mode E2E tests |
| `playwright.config.ts` | MODIFY | Add web server config |

---

## Execution Order

1. **Phase 1** — Extract `*_inner` functions (1 day)
2. **Phase 2** — Create axum HTTP server + routes (2-3 days)
3. **Phase 3** — Add JWT auth (1-2 days)
4. **Phase 4** — Frontend HTTP client + login (2-3 days)
5. **Phase 5** — Entry point + Dockerfile (1-2 days)
6. **Phase 6** — Testing + polish (1-2 days)

---

## What Stays the Same

- ✅ All 43 Rust command functions — unchanged, just wrapped
- ✅ All React pages, components, stores — unchanged
- ✅ All E2E tests for desktop — unchanged
- ✅ Tauri desktop app — works exactly as before
- ✅ SQLite database schema — unchanged
- ✅ M-Pesa integration — unchanged
- ✅ PDF generation — unchanged
- ✅ CSV import/export — unchanged (already has browser fallbacks)

---

## Success Criteria

- [ ] Desktop app works exactly as before (no regressions)
- [ ] Web version accessible at `http://localhost:8080` with `--web` flag
- [ ] Login page with JWT authentication
- [ ] All pages load and function in browser
- [ ] Mobile responsive on phone/tablet
- [ ] Docker build succeeds
- [ ] 26 existing E2E tests still pass
- [ ] New web E2E tests pass
- [ ] Can deploy to Railway/Fly.io/VPS
