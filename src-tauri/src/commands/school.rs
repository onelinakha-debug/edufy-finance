use crate::db::connection::DbState;
use crate::models::School;
use crate::utils::generate_id;
use tauri::State;

#[tauri::command]
pub fn create_school(
    state: State<'_, DbState>,
    name: String,
    school_type: String,
    curriculum: Option<String>,
    county: Option<String>,
    phone: Option<String>,
    email: Option<String>,
) -> Result<School, String> {
    if name.trim().is_empty() { return Err("School name is required".to_string()); }
    if name.len() > 200 { return Err("School name too long (max 200 characters)".to_string()); }
    let valid_types = ["primary", "secondary", "combined"];
    if !valid_types.contains(&school_type.as_str()) {
        return Err(format!("Invalid school type '{}'. Must be one of: primary, secondary, combined", school_type));
    }
    if let Some(ref e) = email {
        if !e.is_empty() && !e.contains('@') { return Err("Invalid email format".to_string()); }
    }
    if let Some(ref p) = phone {
        if !p.is_empty() && p.len() < 10 { return Err("Phone number must be at least 10 characters".to_string()); }
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();
    let curriculum = curriculum.unwrap_or_else(|| "cbc".to_string());

    conn.execute(
        "INSERT INTO schools (id, name, type, curriculum, county, phone, email, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        rusqlite::params![id, name, school_type, curriculum, county, phone, email, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(School {
        id,
        name: name,
        school_type,
        curriculum,
        county,
        sub_county: None,
        registration: None,
        phone,
        email,
        address: None,
        mpesa_paybill: None,
        mpesa_till: None,
        logo_path: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn get_school(state: State<'_, DbState>, id: String) -> Result<School, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, type, curriculum, county, sub_county, registration,
                    phone, email, address, mpesa_paybill, mpesa_till, logo_path,
                    created_at, updated_at
             FROM schools WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    stmt.query_row([&id], |row| {
        Ok(School {
            id: row.get(0)?,
            name: row.get(1)?,
            school_type: row.get(2)?,
            curriculum: row.get(3)?,
            county: row.get(4)?,
            sub_county: row.get(5)?,
            registration: row.get(6)?,
            phone: row.get(7)?,
            email: row.get(8)?,
            address: row.get(9)?,
            mpesa_paybill: row.get(10)?,
            mpesa_till: row.get(11)?,
            logo_path: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })
    .map_err(|e| format!("School not found: {}", e))
}

#[tauri::command]
pub fn update_school(
    state: State<'_, DbState>,
    id: String,
    name: Option<String>,
    school_type: Option<String>,
    county: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    mpesa_paybill: Option<String>,
    mpesa_till: Option<String>,
) -> Result<School, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // Build dynamic update query
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
    if let Some(v) = &county {
        updates.push("county = ?");
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
    if let Some(v) = &mpesa_paybill {
        updates.push("mpesa_paybill = ?");
        params.push(Box::new(v.clone()));
    }
    if let Some(v) = &mpesa_till {
        updates.push("mpesa_till = ?");
        params.push(Box::new(v.clone()));
    }

    updates.push("updated_at = ?");
    params.push(Box::new(now.clone()));

    params.push(Box::new(id.clone()));

    let sql = format!(
        "UPDATE schools SET {} WHERE id = ?",
        updates.join(", ")
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    drop(conn);
    get_school(state, id)
}

#[tauri::command]
pub fn list_schools(state: State<'_, DbState>) -> Result<Vec<School>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, type, curriculum, county, sub_county, registration,
                    phone, email, address, mpesa_paybill, mpesa_till, logo_path,
                    created_at, updated_at
             FROM schools ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let schools = stmt
        .query_map([], |row| {
            Ok(School {
                id: row.get(0)?,
                name: row.get(1)?,
                school_type: row.get(2)?,
                curriculum: row.get(3)?,
                county: row.get(4)?,
                sub_county: row.get(5)?,
                registration: row.get(6)?,
                phone: row.get(7)?,
                email: row.get(8)?,
                address: row.get(9)?,
                mpesa_paybill: row.get(10)?,
                mpesa_till: row.get(11)?,
                logo_path: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(schools)
}
