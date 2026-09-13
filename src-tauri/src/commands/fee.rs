use crate::db::connection::DbState;
use crate::models::{FeeStructure, VoteHead, DiscountConfig};
use crate::utils::generate_id;
use tauri::State;

#[tauri::command]
pub fn create_fee_structure(
    state: State<'_, DbState>,
    school_id: String,
    name: String,
    grade: String,
    term: i32,
    academic_year: i32,
) -> Result<FeeStructure, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO fee_structures (id, school_id, name, grade, term, academic_year, is_active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
        rusqlite::params![id, school_id, name, grade, term, academic_year, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(FeeStructure {
        id,
        school_id,
        name,
        grade,
        term,
        academic_year,
        is_active: true,
        created_at: now,
    })
}

#[tauri::command]
pub fn get_fee_structures(
    state: State<'_, DbState>,
    school_id: String,
    academic_year: Option<i32>,
    term: Option<i32>,
) -> Result<Vec<FeeStructure>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sql = "SELECT id, school_id, name, grade, term, academic_year, is_active, created_at
                   FROM fee_structures WHERE school_id = ?1 AND is_active = 1".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(school_id)];

    if let Some(y) = academic_year {
        sql.push_str(" AND academic_year = ?");
        params.push(Box::new(y));
    }
    if let Some(t) = term {
        sql.push_str(" AND term = ?");
        params.push(Box::new(t));
    }

    sql.push_str(" ORDER BY academic_year DESC, term DESC, grade");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(FeeStructure {
                id: row.get(0)?,
                school_id: row.get(1)?,
                name: row.get(2)?,
                grade: row.get(3)?,
                term: row.get(4)?,
                academic_year: row.get(5)?,
                is_active: row.get::<_, i32>(6)? == 1,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut structures = Vec::new();
    for row in rows {
        structures.push(row.map_err(|e| e.to_string())?);
    }

    Ok(structures)
}

#[tauri::command]
pub fn add_vote_head(
    state: State<'_, DbState>,
    fee_structure_id: String,
    name: String,
    category: String,
    amount: i64,
    is_mandatory: Option<bool>,
    sort_order: Option<i32>,
) -> Result<VoteHead, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id();
    let mandatory = is_mandatory.unwrap_or(true);
    let order = sort_order.unwrap_or(0);

    conn.execute(
        "INSERT INTO vote_heads (id, fee_structure_id, name, category, amount, is_mandatory, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, fee_structure_id, name, category, amount, mandatory as i32, order],
    )
    .map_err(|e| e.to_string())?;

    Ok(VoteHead {
        id,
        fee_structure_id,
        name,
        category,
        amount,
        is_mandatory: mandatory,
        sort_order: order,
    })
}

#[tauri::command]
pub fn get_vote_heads(
    state: State<'_, DbState>,
    fee_structure_id: String,
) -> Result<Vec<VoteHead>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, fee_structure_id, name, category, amount, is_mandatory, sort_order
             FROM vote_heads WHERE fee_structure_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([&fee_structure_id], |row| {
            Ok(VoteHead {
                id: row.get(0)?,
                fee_structure_id: row.get(1)?,
                name: row.get(2)?,
                category: row.get(3)?,
                amount: row.get(4)?,
                is_mandatory: row.get::<_, i32>(5)? == 1,
                sort_order: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut vote_heads = Vec::new();
    for row in rows {
        vote_heads.push(row.map_err(|e| e.to_string())?);
    }

    Ok(vote_heads)
}

// ═══ DISCOUNT CONFIGS ═══

#[tauri::command]
pub fn get_discount_configs(
    state: State<'_, DbState>,
    school_id: String,
) -> Result<Vec<DiscountConfig>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, school_id, name, type, rate, min_students, is_active
             FROM discount_configs WHERE school_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let configs = stmt
        .query_map(rusqlite::params![school_id], |row| {
            Ok(DiscountConfig {
                id: row.get(0)?,
                school_id: row.get(1)?,
                name: row.get(2)?,
                discount_type: row.get(3)?,
                rate: row.get(4)?,
                min_students: row.get(5)?,
                is_active: row.get::<_, i32>(6)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(configs)
}

#[tauri::command]
pub fn add_discount_config(
    state: State<'_, DbState>,
    school_id: String,
    name: String,
    discount_type: String,
    rate: f64,
    min_students: i32,
    is_active: bool,
) -> Result<DiscountConfig, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id();

    conn.execute(
        "INSERT INTO discount_configs (id, school_id, name, type, rate, min_students, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, school_id, name, discount_type, rate, min_students, is_active as i32],
    )
    .map_err(|e| e.to_string())?;

    Ok(DiscountConfig {
        id,
        school_id,
        name,
        discount_type,
        rate,
        min_students,
        is_active,
    })
}

#[tauri::command]
pub fn remove_discount_config(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM discount_configs WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
