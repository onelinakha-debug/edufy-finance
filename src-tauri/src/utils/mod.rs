pub mod errors;

/// Generate a unique ID (UUID without hyphens)
pub fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string().replace('-', "")
}

/// Format KES currency amount
#[allow(dead_code)]
pub fn format_kes(amount: i64) -> String {
    let formatted = amount
        .to_string()
        .as_bytes()
        .rchunks(3)
        .rev()
        .map(std::str::from_utf8)
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default()
        .join(",");
    format!("KES {}", formatted)
}

/// Parse KES amount from string (removes commas, KES prefix)
#[allow(dead_code)]
pub fn parse_kes(s: &str) -> AppResult<i64> {
    let cleaned = s.replace("KES", "").replace(",", "").trim().to_string();
    cleaned
        .parse::<i64>()
        .map_err(|_| errors::AppError::Validation(format!("Invalid amount: {}", s)))
}

use errors::AppResult;

/// Generate sequential number with prefix
pub fn generate_sequential(prefix: &str, count: i64) -> String {
    format!("{}-{:05}", prefix, count)
}
