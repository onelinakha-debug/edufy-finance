use crate::db::connection::DbState;
use crate::models::{Grade, GradePromotion};
use crate::utils::generate_id;
use tauri::State;

#[tauri::command]
pub fn create_grade(
    state: State<'_, DbState>,
    school_id: String,
    name: String,
    level: String,
    sort_order: Option<i32>,
) -> Result<Grade, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = generate_id();
    let order = sort_order.unwrap_or(0);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO grades (id, school_id, name, level, sort_order, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)",
        rusqlite::params![id, school_id, name, level, order, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Grade {
        id,
        school_id,
        name,
        level,
        sort_order: order,
        is_active: true,
        created_at: now,
    })
}

#[tauri::command]
pub fn get_grades(state: State<'_, DbState>, school_id: String) -> Result<Vec<Grade>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, school_id, name, level, sort_order, is_active, created_at FROM grades WHERE school_id = ?1 ORDER BY sort_order ASC, name ASC")
        .map_err(|e| e.to_string())?;

    let grades = stmt
        .query_map(rusqlite::params![school_id], |row| {
            Ok(Grade {
                id: row.get(0)?,
                school_id: row.get(1)?,
                name: row.get(2)?,
                level: row.get(3)?,
                sort_order: row.get(4)?,
                is_active: row.get::<_, i32>(5)? == 1,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(grades)
}

#[tauri::command]
pub fn update_grade(
    state: State<'_, DbState>,
    id: String,
    name: Option<String>,
    level: Option<String>,
    sort_order: Option<i32>,
    is_active: Option<bool>,
) -> Result<Grade, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(n) = &name {
        conn.execute("UPDATE grades SET name = ?1 WHERE id = ?2", rusqlite::params![n, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(l) = &level {
        conn.execute("UPDATE grades SET level = ?1 WHERE id = ?2", rusqlite::params![l, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(o) = sort_order {
        conn.execute("UPDATE grades SET sort_order = ?1 WHERE id = ?2", rusqlite::params![o, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(a) = is_active {
        conn.execute("UPDATE grades SET is_active = ?1 WHERE id = ?2", rusqlite::params![a as i32, id])
            .map_err(|e| e.to_string())?;
    }

    let grade = conn
        .query_row(
            "SELECT id, school_id, name, level, sort_order, is_active, created_at FROM grades WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(Grade {
                    id: row.get(0)?,
                    school_id: row.get(1)?,
                    name: row.get(2)?,
                    level: row.get(3)?,
                    sort_order: row.get(4)?,
                    is_active: row.get::<_, i32>(5)? == 1,
                    created_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(grade)
}

#[tauri::command]
pub fn delete_grade(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Check if any students are enrolled in this grade
    let grade_name: String = conn
        .query_row("SELECT name FROM grades WHERE id = ?1", rusqlite::params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let student_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM students WHERE grade = ?1",
            rusqlite::params![grade_name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if student_count > 0 {
        return Err(format!("Cannot delete '{}': {} student(s) enrolled", grade_name, student_count));
    }

    conn.execute("DELETE FROM grades WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn promote_students(
    state: State<'_, DbState>,
    school_id: String,
    from_grade: String,
    to_grade: String,
    student_ids: Option<Vec<String>>,
    academic_year: i32,
) -> Result<GradePromotion, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Wrap in transaction
    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<i32, String> {
        let ids = student_ids.unwrap_or_default();
        let count = if ids.is_empty() {
            let c: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM students WHERE school_id = ?1 AND grade = ?2 AND status = 'active'",
                    rusqlite::params![school_id, from_grade],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            conn.execute(
                "UPDATE students SET grade = ?1 WHERE school_id = ?2 AND grade = ?3 AND status = 'active'",
                rusqlite::params![to_grade, school_id, from_grade],
            )
            .map_err(|e| e.to_string())?;

            c as i32
        } else {
            let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!(
                "UPDATE students SET grade = ?1 WHERE id IN ({}) AND school_id = ?2",
                placeholders
            );
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(to_grade.clone()), Box::new(school_id.clone())];
            for id in &ids {
                params.push(Box::new(id.clone()));
            }
            let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
            conn.execute(&sql, param_refs.as_slice()).map_err(|e| e.to_string())?;
            ids.len() as i32
        };
        Ok(count)
    })();

    let count = match result {
        Ok(c) => c,
        Err(e) => { let _ = conn.execute("ROLLBACK", []); return Err(e); }
    };

    let id = generate_id();
    let now = chrono::Utc::now().to_rfc3339();

    let insert_result = conn.execute(
        "INSERT INTO grade_promotions (id, school_id, from_grade, to_grade, student_count, academic_year, promoted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, school_id, from_grade.clone(), to_grade.clone(), count, academic_year, now],
    ).map_err(|e| e.to_string());

    match insert_result {
        Ok(_) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            return Err(e);
        }
    }

    Ok(GradePromotion {
        id,
        school_id,
        from_grade,
        to_grade,
        student_count: count,
        academic_year,
        promoted_at: now,
    })
}

#[tauri::command]
pub fn get_promotion_history(state: State<'_, DbState>, school_id: String) -> Result<Vec<GradePromotion>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, school_id, from_grade, to_grade, student_count, academic_year, promoted_at FROM grade_promotions WHERE school_id = ?1 ORDER BY promoted_at DESC")
        .map_err(|e| e.to_string())?;

    let promotions = stmt
        .query_map(rusqlite::params![school_id], |row| {
            Ok(GradePromotion {
                id: row.get(0)?,
                school_id: row.get(1)?,
                from_grade: row.get(2)?,
                to_grade: row.get(3)?,
                student_count: row.get(4)?,
                academic_year: row.get(5)?,
                promoted_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(promotions)
}

#[tauri::command]
pub fn count_students_in_grade(
    state: State<'_, DbState>,
    school_id: String,
    grade: String,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM students WHERE school_id = ?1 AND grade = ?2 AND status = 'active'",
            rusqlite::params![school_id, grade],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count)
}
