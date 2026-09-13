use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Duplicate: {0}")]
    Duplicate(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

// Tauri commands need String errors
impl From<AppError> for String {
    fn from(err: AppError) -> String {
        err.to_string()
    }
}

pub type AppResult<T> = Result<T, AppError>;
