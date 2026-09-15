use crate::auth;
use crate::db::connection::DbState;
use crate::models::{SchoolProfile, User};
use crate::utils::generate_id;
use rusqlite::Connection;
use tauri::State;

pub fn get_setting_inner(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let result = stmt.query_row([key], |row| row.get(0)).ok();
    Ok(result)
}

#[tauri::command]
pub fn get_setting(
    state: State<'_, DbState>,
    key: String,
) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_setting_inner(&conn, &key)
}

pub fn set_setting_inner(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_setting(
    state: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    set_setting_inner(&conn, &key, &value)
}

pub fn backup_database_inner(conn: &Connection) -> Result<String, String> {
    let db_path = conn
        .pragma_query_value(None, "database_list", |row| row.get::<_, String>(2))
        .map_err(|e| format!("Failed to get database path: {}", e))?;

    let now = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_dir = std::path::PathBuf::from(&db_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let backup_path = backup_dir.join(format!("edufy_backup_{}.db", now));

    let backup_str = backup_path.to_string_lossy().to_string();
    let sanitized: String = backup_str
        .chars()
        .filter(|c| {
            c.is_alphanumeric()
                || *c == '_'
                || *c == '-'
                || *c == '.'
                || *c == ':'
                || *c == '\\'
                || *c == '/'
                || *c == ' '
        })
        .collect();
    if sanitized.is_empty() || sanitized.len() > 500 {
        return Err("Invalid backup path".to_string());
    }
    conn.execute_batch(&format!(
        "VACUUM INTO '{}';",
        sanitized.replace('\'', "''")
    ))
    .map_err(|e| format!("Backup failed: {}", e))?;

    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn backup_database(
    state: State<'_, DbState>,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    backup_database_inner(&conn)
}

// ═══ SCHOOL PROFILE ═══

pub fn get_school_profile_inner(conn: &Connection, school_id: &str) -> Result<SchoolProfile, String> {
    conn.query_row(
        "SELECT id, name, type, address, phone, email, motto, county FROM schools WHERE id = ?1",
        rusqlite::params![school_id],
        |row| {
            Ok(SchoolProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                school_type: row.get(2)?,
                address: row.get(3)?,
                phone: row.get(4)?,
                email: row.get(5)?,
                motto: row.get(6)?,
                county: row.get(7)?,
            })
        },
    )
    .map_err(|e| format!("School profile not found: {}", e))
}

#[tauri::command]
pub fn get_school_profile(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<SchoolProfile, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_school_profile_inner(&conn, &school_id)
}

pub fn update_school_profile_inner(
    conn: &Connection,
    school_id: &str,
    name: Option<String>,
    school_type: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    motto: Option<String>,
    county: Option<String>,
) -> Result<SchoolProfile, String> {
    let now = chrono::Utc::now().to_rfc3339();

    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = &name {
        updates.push("name = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = &school_type {
        updates.push("type = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = &address {
        updates.push("address = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = &phone {
        updates.push("phone = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = &email {
        updates.push("email = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = &motto {
        updates.push("motto = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = &county {
        updates.push("county = ?");
        params.push(Box::new(v.clone()));
    }

    if updates.is_empty() {
        return get_school_profile_inner(conn, school_id);
    }

    updates.push("updated_at = ?");
    params.push(Box::new(now));
    params.push(Box::new(school_id.to_string()));

    let sql = format!("UPDATE schools SET {} WHERE id = ?", updates.join(", "));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    get_school_profile_inner(conn, school_id)
}

#[tauri::command]
pub fn update_school_profile(
    state: State<'_, DbState>,
    school_id: String,
    name: Option<String>,
    school_type: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    motto: Option<String>,
    county: Option<String>,
) -> Result<SchoolProfile, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    update_school_profile_inner(
        &conn,
        &school_id,
        name,
        school_type,
        address,
        phone,
        email,
        motto,
        county,
    )
}

// ═══ USER MANAGEMENT ═══

pub fn list_users_inner(conn: &Connection, school_id: &str) -> Result<Vec<User>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, username, full_name, role, is_active, last_login, created_at
             FROM users WHERE school_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let users = stmt
        .query_map(rusqlite::params![school_id], |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                full_name: row.get(2)?,
                role: row.get(3)?,
                is_active: row.get::<_, i32>(4)? == 1,
                last_login: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(users)
}

#[tauri::command]
pub fn list_users(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<Vec<User>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    list_users_inner(&conn, &school_id)
}

pub fn create_user_inner(
    conn: &Connection,
    school_id: &str,
    username: &str,
    password: &str,
    full_name: &str,
    role: &str,
) -> Result<User, String> {
    if school_id.trim().is_empty() { return Err("School ID is required".to_string()); }
    if username.trim().is_empty() { return Err("Username is required".to_string()); }
    if username.len() < 3 { return Err("Username must be at least 3 characters".to_string()); }
    if username.len() > 50 { return Err("Username too long (max 50 characters)".to_string()); }
    if password.len() < 6 { return Err("Password must be at least 6 characters".to_string()); }
    if full_name.trim().is_empty() { return Err("Full name is required".to_string()); }
    let valid_roles = ["admin", "bursar", "teacher", "viewer"];
    if !valid_roles.contains(&role) {
        return Err(format!("Invalid role '{}'. Must be one of: admin, bursar, teacher, viewer", role));
    }

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM users WHERE school_id = ?1 AND username = ?2",
            rusqlite::params![school_id, username],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if exists {
        return Err(format!("Username '{}' already exists in this school", username));
    }

    let id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();
    let password_hash = auth::hash_password(password)?;

    conn.execute(
        "INSERT INTO users (id, school_id, username, password_hash, full_name, role, is_active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
        rusqlite::params![id, school_id, username, password_hash, full_name, role, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(User {
        id,
        username: username.to_string(),
        full_name: full_name.to_string(),
        role: role.to_string(),
        is_active: true,
        last_login: None,
        created_at: now,
    })
}

#[tauri::command]
pub fn create_user(
    state: State<'_, DbState>,
    school_id: String,
    username: String,
    password: String,
    full_name: String,
    role: String,
) -> Result<User, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    create_user_inner(&conn, &school_id, &username, &password, &full_name, &role)
}

pub fn update_user_inner(
    conn: &Connection,
    user_id: &str,
    full_name: Option<String>,
    role: Option<String>,
    is_active: Option<bool>,
) -> Result<User, String> {
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = &full_name {
        updates.push("full_name = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = &role {
        updates.push("role = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = is_active {
        updates.push("is_active = ?");
        params.push(Box::new(v as i32));
    }

    if !updates.is_empty() {
        let sql = format!("UPDATE users SET {} WHERE id = ?", updates.join(", "));
        params.push(Box::new(user_id.to_string()));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        "SELECT id, username, full_name, role, is_active, last_login, created_at FROM users WHERE id = ?1",
        rusqlite::params![user_id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                full_name: row.get(2)?,
                role: row.get(3)?,
                is_active: row.get::<_, i32>(4)? == 1,
                last_login: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_user(
    state: State<'_, DbState>,
    user_id: String,
    full_name: Option<String>,
    role: Option<String>,
    is_active: Option<bool>,
) -> Result<User, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    update_user_inner(&conn, &user_id, full_name, role, is_active)
}

pub fn delete_user_inner(conn: &Connection, user_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM users WHERE id = ?1", rusqlite::params![user_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_user(
    state: State<'_, DbState>,
    user_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    delete_user_inner(&conn, &user_id)
}

// ═══ AUTH ═══

#[derive(serde::Serialize)]
pub struct LoginResult {
    pub user: User,
    pub token: String,
    pub school_id: String,
}

pub fn login_inner(conn: &Connection, username: &str, password: &str, school_id: &str) -> Result<LoginResult, String> {
    if username.trim().is_empty() { return Err("Username is required".to_string()); }
    if password.trim().is_empty() { return Err("Password is required".to_string()); }
    if school_id.trim().is_empty() { return Err("School ID is required".to_string()); }

    let (user_id, db_username, full_name, role, is_active, password_hash): (String, String, String, String, bool, String) = conn
        .query_row(
            "SELECT id, username, full_name, role, is_active, password_hash
             FROM users WHERE school_id = ?1 AND username = ?2",
            rusqlite::params![school_id, username],
            |row| Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get::<_, i32>(4)? == 1,
                row.get(5)?,
            )),
        )
        .map_err(|_| "Invalid credentials".to_string())?;

    if !is_active {
        return Err("Account is disabled".to_string());
    }

    // Support both bcrypt and legacy sha256 hashes
    let valid = if password_hash.starts_with("$2") {
        auth::verify_password(password, &password_hash)?
    } else {
        // Legacy sha256 hash
        password_hash == format!("sha256:{}", password)
    };

    if !valid {
        return Err("Invalid credentials".to_string());
    }

    // Update last_login
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE users SET last_login = ?1 WHERE id = ?2",
        rusqlite::params![now, user_id],
    ).map_err(|e| e.to_string())?;

    let user = User {
        id: user_id.clone(),
        username: db_username,
        full_name,
        role: role.clone(),
        is_active: true,
        last_login: Some(now.clone()),
        created_at: now,
    };

    // Generate JWT
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "edufy-finance-dev-secret-change-in-production".into());
    let token = auth::create_token(&user_id, school_id, &role, jwt_secret.as_bytes());

    Ok(LoginResult { user, token, school_id: school_id.to_string() })
}

#[tauri::command]
pub fn login(
    state: State<'_, DbState>,
    username: String,
    password: String,
    school_id: String,
) -> Result<LoginResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    login_inner(&conn, &username, &password, &school_id)
}
