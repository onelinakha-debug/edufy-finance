//! Africa's Talking SMS fallback.
//! Used when WhatsApp delivery fails or the parent has no WhatsApp.
//! Env-gated: AT_USERNAME + AT_API_KEY. Sandbox: https://api.sandbox.africastalking.com

#[derive(Debug, Clone)]
pub struct SmsConfig {
    pub username: String,
    pub api_key: String,
    pub sender_id: Option<String>,
    pub sandbox: bool,
}

impl SmsConfig {
    pub fn from_env() -> Option<Self> {
        Some(Self {
            username: std::env::var("AT_USERNAME").ok()?,
            api_key: std::env::var("AT_API_KEY").ok()?,
            sender_id: std::env::var("AT_SENDER_ID").ok(),
            sandbox: std::env::var("AT_SANDBOX").map(|v| v == "1").unwrap_or(false),
        })
    }

    fn base_url(&self) -> &'static str {
        if self.sandbox {
            "https://api.sandbox.africastalking.com/version1/messaging"
        } else {
            "https://api.africastalking.com/version1/messaging"
        }
    }
}

/// Send a plain-text SMS. Numbers must be +2547XXXXXXXX (AT requires the +).
pub async fn send_sms(cfg: &SmsConfig, to_e164: &str, message: &str) -> Result<(), String> {
    let to = if to_e164.starts_with('+') {
        to_e164.to_string()
    } else {
        format!("+{}", to_e164)
    };
    let client = reqwest::Client::new();
    let mut form = vec![
        ("username", cfg.username.as_str()),
        ("to", to.as_str()),
        ("message", message),
    ];
    let sender;
    if let Some(s) = cfg.sender_id.as_deref() {
        sender = s.to_string();
        form.push(("from", sender.as_str()));
    }
    let resp = client
        .post(cfg.base_url())
        .header("apiKey", &cfg.api_key)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("SMS send failed: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("SMS API error: {}", body.chars().take(200).collect::<String>()));
    }
    Ok(())
}
