use crate::models::VoteHead;
use rusqlite::Connection;

/// Calculate total fee for a student given a fee structure
#[allow(dead_code)]
pub fn calculate_total(
    conn: &Connection,
    fee_structure_id: &str,
    discount_percentage: Option<f64>,
    discount_fixed: Option<i64>,
) -> crate::utils::errors::AppResult<i64> {
    let vote_heads = get_vote_heads_for_structure(conn, fee_structure_id)?;

    let base_total: i64 = vote_heads.iter().map(|vh| vh.amount).sum();

    let mut total = base_total;

    // Apply percentage discount
    if let Some(pct) = discount_percentage {
        let discount = ((base_total as f64) * (pct / 100.0)) as i64;
        total -= discount;
    }

    // Apply fixed discount
    if let Some(fixed) = discount_fixed {
        total -= fixed;
    }

    // Ensure non-negative
    Ok(total.max(0))
}

#[allow(dead_code)]
fn get_vote_heads_for_structure(
    conn: &Connection,
    fee_structure_id: &str,
) -> crate::utils::errors::AppResult<Vec<VoteHead>> {
    let mut stmt = conn.prepare(
        "SELECT id, fee_structure_id, name, category, amount, is_mandatory, sort_order
         FROM vote_heads WHERE fee_structure_id = ?1 ORDER BY sort_order",
    )?;

    let rows = stmt.query_map([fee_structure_id], |row| {
        Ok(VoteHead {
            id: row.get(0)?,
            fee_structure_id: row.get(1)?,
            name: row.get(2)?,
            category: row.get(3)?,
            amount: row.get(4)?,
            is_mandatory: row.get::<_, i32>(5)? == 1,
            sort_order: row.get(6)?,
        })
    })?;

    let mut vote_heads = Vec::new();
    for row in rows {
        vote_heads.push(row?);
    }

    Ok(vote_heads)
}

/// Calculate sibling discount based on school's discount policies
#[allow(dead_code)]
pub fn calculate_sibling_discount(
    _conn: &Connection,
    _school_id: &str,
    _sibling_position: i32,
) -> crate::utils::errors::AppResult<Option<f64>> {
    // Default sibling discount tiers (can be overridden by school policies)
    // 2nd child: 5%, 3rd child: 7.5%, 4th+ child: 10%
    let discount = match _sibling_position {
        1 => None, // First child - no discount
        2 => Some(5.0),
        3 => Some(7.5),
        _ => Some(10.0),
    };

    Ok(discount)
}

/// Check if early payment discount applies
#[allow(dead_code)]
pub fn check_early_payment_discount(
    _discount_percentage: f64,
    _payment_deadline: &str,
) -> bool {
    // In a real implementation, compare current date with deadline
    // For now, always return false
    false
}
