use serde::{Deserialize, Serialize};
use base64::Engine;

const DARAJA_BASE: &str = "https://api.safaricom.co.ke";
#[allow(dead_code)]
const DARAJA_PROD_BASE: &str = "https://api.safaricom.co.ke";

// ═══ OAuth ═══

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct OAuthRequest {
    grant_type: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OAuthResponse {
    pub access_token: String,
    pub expires_in: String,
}

// ═══ STK Push ═══

#[derive(Debug, Serialize)]
pub struct StkPushRequest {
    #[serde(rename = "BusinessShortCode")]
    pub business_short_code: String,
    #[serde(rename = "Password")]
    pub password: String,
    #[serde(rename = "Timestamp")]
    pub timestamp: String,
    #[serde(rename = "TransactionType")]
    pub transaction_type: String,
    #[serde(rename = "Amount")]
    pub amount: i64,
    #[serde(rename = "PartyA")]
    pub party_a: String,
    #[serde(rename = "PartyB")]
    pub party_b: String,
    #[serde(rename = "PhoneNumber")]
    pub phone_number: String,
    #[serde(rename = "CallBackURL")]
    pub callback_url: String,
    #[serde(rename = "AccountReference")]
    pub account_reference: String,
    #[serde(rename = "TransactionDesc")]
    pub transaction_desc: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct StkPushResponse {
    #[serde(rename = "MerchantRequestID")]
    pub merchant_request_id: Option<String>,
    #[serde(rename = "CheckoutRequestID")]
    pub checkout_request_id: Option<String>,
    #[serde(rename = "ResponseCode")]
    pub response_code: Option<String>,
    #[serde(rename = "ResponseDescription")]
    pub response_description: Option<String>,
    #[serde(rename = "CustomerMessage")]
    pub customer_message: Option<String>,
}

// ═══ STK Push Query ═══

#[derive(Debug, Serialize)]
pub struct StkQueryRequest {
    #[serde(rename = "BusinessShortCode")]
    pub business_short_code: String,
    #[serde(rename = "Password")]
    pub password: String,
    #[serde(rename = "Timestamp")]
    pub timestamp: String,
    #[serde(rename = "CheckoutRequestID")]
    pub checkout_request_id: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct StkQueryResponse {
    #[serde(rename = "ResponseCode")]
    pub response_code: Option<String>,
    #[serde(rename = "ResponseDescription")]
    pub response_description: Option<String>,
    #[serde(rename = "MerchantRequestID")]
    pub merchant_request_id: Option<String>,
    #[serde(rename = "CheckoutRequestID")]
    pub checkout_request_id: Option<String>,
    #[serde(rename = "ResultCode")]
    pub result_code: Option<String>,
    #[serde(rename = "ResultDesc")]
    pub result_desc: Option<String>,
}

// ═══ C2B Register URL ═══

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct RegisterUrlRequest {
    #[serde(rename = "ShortCode")]
    pub short_code: String,
    #[serde(rename = "ResponseType")]
    pub response_type: String,
    #[serde(rename = "ConfirmationURL")]
    pub confirmation_url: String,
    #[serde(rename = "ValidationURL")]
    pub validation_url: String,
}

// ═══ Client ═══

pub struct DarajaClient {
    http: reqwest::Client,
}

impl DarajaClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    /// Get OAuth access token from Daraja API
    pub async fn get_access_token(
        &self,
        consumer_key: &str,
        consumer_secret: &str,
    ) -> Result<String, String> {
        let credentials = format!("{}:{}", consumer_key, consumer_secret);
        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);

        let response = self
            .http
            .get(format!("{}/oauth/v1/generate", DARAJA_BASE))
            .header("Authorization", format!("Basic {}", encoded))
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Daraja: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Daraja OAuth failed ({}): {}", status, body));
        }

        let oauth: OAuthResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OAuth response: {}", e))?;

        Ok(oauth.access_token)
    }

    /// Initiate STK Push (Lipa Na M-Pesa Online)
    pub async fn initiate_stk_push(
        &self,
        access_token: &str,
        short_code: &str,
        passkey: &str,
        phone: &str,
        amount: i64,
        callback_url: &str,
        account_reference: &str,
    ) -> Result<StkPushResponse, String> {
        let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S").to_string();

        // Generate password: base64(BusinessShortCode + Passkey + Timestamp)
        let password_raw = format!("{}{}{}", short_code, passkey, timestamp);
        let password = base64::engine::general_purpose::STANDARD.encode(password_raw);

        // Format phone: ensure it starts with 254
        let formatted_phone = format_phone(phone);

        let request = StkPushRequest {
            business_short_code: short_code.to_string(),
            password,
            timestamp,
            transaction_type: "CustomerPayBillOnline".to_string(),
            amount,
            party_a: formatted_phone.clone(),
            party_b: short_code.to_string(),
            phone_number: formatted_phone,
            callback_url: callback_url.to_string(),
            account_reference: account_reference.to_string(),
            transaction_desc: "School Fee Payment".to_string(),
        };

        let response = self
            .http
            .post(format!("{}/mpesa/stkpush/v1/processrequest", DARAJA_BASE))
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("STK Push request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("STK Push failed ({}): {}", status, body));
        }

        let stk_response: StkPushResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse STK Push response: {}", e))?;

        Ok(stk_response)
    }

    /// Query STK Push transaction status
    pub async fn query_stk_push_status(
        &self,
        access_token: &str,
        short_code: &str,
        passkey: &str,
        checkout_request_id: &str,
    ) -> Result<StkQueryResponse, String> {
        let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S").to_string();
        let password_raw = format!("{}{}{}", short_code, passkey, timestamp);
        let password = base64::engine::general_purpose::STANDARD.encode(password_raw);

        let request = StkQueryRequest {
            business_short_code: short_code.to_string(),
            password,
            timestamp,
            checkout_request_id: checkout_request_id.to_string(),
        };

        let response = self
            .http
            .post(format!("{}/mpesa/stkpushquery/v1/query", DARAJA_BASE))
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("STK Query request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("STK Query failed ({}): {}", status, body));
        }

        let query_response: StkQueryResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse STK Query response: {}", e))?;

        Ok(query_response)
    }

    /// Register C2B URLs (for paybill/till)
    #[allow(dead_code)]
    pub async fn register_c2b_urls(
        &self,
        access_token: &str,
        short_code: &str,
        confirmation_url: &str,
        validation_url: &str,
    ) -> Result<(), String> {
        let request = RegisterUrlRequest {
            short_code: short_code.to_string(),
            response_type: "Completed".to_string(),
            confirmation_url: confirmation_url.to_string(),
            validation_url: validation_url.to_string(),
        };

        let response = self
            .http
            .post(format!("{}/mpesa/c2b/v1/registerurl", DARAJA_BASE))
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("C2B Register request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("C2B Register failed ({}): {}", status, body));
        }

        Ok(())
    }
}

/// Format Kenyan phone number to 254XXXXXXXXX format
fn format_phone(phone: &str) -> String {
    let cleaned = phone.replace(&[' ', '-', '(', ')'][..], "");
    if cleaned.starts_with("254") {
        cleaned
    } else if cleaned.starts_with("0") {
        format!("254{}", &cleaned[1..])
    } else if cleaned.starts_with("+254") {
        cleaned[1..].to_string()
    } else {
        format!("254{}", cleaned)
    }
}

/// Generate timestamp in Daraja format (YYYYMMDDHHmmss)
#[allow(dead_code)]
pub fn generate_timestamp() -> String {
    chrono::Utc::now().format("%Y%m%d%H%M%S").to_string()
}

/// Generate password for Daraja API
#[allow(dead_code)]
pub fn generate_password(short_code: &str, passkey: &str, timestamp: &str) -> String {
    let raw = format!("{}{}{}", short_code, passkey, timestamp);
    base64::engine::general_purpose::STANDARD.encode(raw)
}
