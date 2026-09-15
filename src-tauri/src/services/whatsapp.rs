use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

// ═══ CONFIG ═══

#[derive(Debug, Clone)]
pub struct WhatsAppConfig {
    pub phone_number_id: String,
    pub access_token: String,
    #[allow(dead_code)]
    pub verify_token: String,
    #[allow(dead_code)]
    pub app_secret: String,
    pub graph_base: String,
}

impl WhatsAppConfig {
    pub fn from_env() -> Option<Self> {
        Some(Self {
            phone_number_id: std::env::var("WHATSAPP_PHONE_NUMBER_ID").ok()?,
            access_token: std::env::var("WHATSAPP_ACCESS_TOKEN").ok()?,
            verify_token: std::env::var("WHATSAPP_VERIFY_TOKEN").unwrap_or_default(),
            app_secret: std::env::var("WHATSAPP_APP_SECRET").unwrap_or_default(),
            graph_base: std::env::var("WHATSAPP_GRAPH_BASE")
                .unwrap_or_else(|_| "https://graph.facebook.com/v20.0".into()),
        })
    }

    pub fn is_configured(&self) -> bool {
        !self.phone_number_id.is_empty() && !self.access_token.is_empty()
    }
}

// ═══ HELPERS ═══

/// Normalize Kenyan phone to 2547XXXXXXXX. Accepts 0712..., +254712..., 254712..., 712...
pub fn normalize_ke_phone(raw: &str) -> Option<String> {
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.starts_with("254") && digits.len() == 12 {
        return Some(digits);
    }
    if digits.starts_with('0') && digits.len() == 10 {
        return Some(format!("254{}", &digits[1..]));
    }
    if digits.len() == 9 && digits.starts_with('7') {
        return Some(format!("254{}", digits));
    }
    if digits.len() == 9 && digits.starts_with('1') {
        return Some(format!("254{}", digits));
    }
    None
}

/// "KES 30,000" — amounts stored as integer KES in DB.
pub fn format_kes(amount: i64) -> String {
    let neg = amount < 0;
    let mut s = amount.abs().to_string();
    let mut out = String::new();
    while s.len() > 3 {
        let (head, tail) = s.split_at(s.len() - 3);
        out = format!(",{}{}", tail, out);
        s = head.to_string();
    }
    out = format!("{}{}", s, out);
    if neg {
        format!("-KES {}", out)
    } else {
        format!("KES {}", out)
    }
}

/// Verify Meta `X-Hub-Signature-256: sha256=<hex>` over raw body.
pub fn verify_meta_signature(app_secret: &str, body: &[u8], sig_header: &str) -> bool {
    if app_secret.is_empty() {
        return false;
    }
    let hex_part = sig_header.strip_prefix("sha256=").unwrap_or(sig_header);
    let expected = match hex::decode(hex_part) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let mut mac = match HmacSha256::new_from_slice(app_secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(body);
    mac.verify_slice(&expected).is_ok()
}

/// Mask phone for logs: 2547***123
pub fn mask_phone(phone: &str) -> String {
    if phone.len() >= 6 {
        format!("{}***{}", &phone[..4], &phone[phone.len() - 3..])
    } else {
        "***".to_string()
    }
}

// ═══ GRAPH API PAYLOADS ═══

#[derive(Debug, Serialize)]
struct TextMsg {
    messaging_product: String,
    to: String,
    #[serde(rename = "type")]
    msg_type: String,
    text: TextBody,
}

#[derive(Debug, Serialize)]
struct TextBody {
    body: String,
    preview_url: bool,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct InteractiveMsg {
    messaging_product: String,
    to: String,
    #[serde(rename = "type")]
    msg_type: String,
    interactive: InteractiveBody,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct InteractiveBody {
    #[serde(rename = "type")]
    kind: String,
    body: InteractiveText,
    action: InteractiveAction,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct InteractiveText {
    text: String,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct InteractiveAction {
    buttons: Vec<InteractiveButton>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct InteractiveButton {
    #[serde(rename = "type")]
    kind: String,
    reply: ButtonReply,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct ButtonReply {
    id: String,
    title: String,
}

#[derive(Debug, Deserialize)]
struct SendResponse {
    messages: Option<Vec<SentMsg>>,
}

#[derive(Debug, Deserialize)]
struct SentMsg {
    id: Option<String>,
}

// ═══ SENDERS ═══

async fn post_graph(
    cfg: &WhatsAppConfig,
    payload: &impl Serialize,
) -> Result<Option<String>, String> {
    let url = format!(
        "{}/{}/messages",
        cfg.graph_base.trim_end_matches('/'),
        cfg.phone_number_id
    );
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .bearer_auth(&cfg.access_token)
        .json(payload)
        .send()
        .await
        .map_err(|e| format!("WhatsApp send failed: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("WhatsApp API error: {}", body.chars().take(300).collect::<String>()));
    }

    let parsed: SendResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.messages.and_then(|m| m.into_iter().next()).and_then(|m| m.id))
}

pub async fn send_text(cfg: &WhatsAppConfig, to: &str, body: &str) -> Result<Option<String>, String> {
    let payload = TextMsg {
        messaging_product: "whatsapp".into(),
        to: to.into(),
        msg_type: "text".into(),
        text: TextBody { body: body.into(), preview_url: true },
    };
    post_graph(cfg, &payload).await
}

#[allow(dead_code)]
pub async fn send_interactive_buttons(
    cfg: &WhatsAppConfig,
    to: &str,
    body: &str,
    buttons: &[(&str, &str)],
) -> Result<Option<String>, String> {
    let payload = InteractiveMsg {
        messaging_product: "whatsapp".into(),
        to: to.into(),
        msg_type: "interactive".into(),
        interactive: InteractiveBody {
            kind: "button".into(),
            body: InteractiveText { text: body.into() },
            action: InteractiveAction {
                buttons: buttons
                    .iter()
                    .take(3)
                    .map(|(id, title)| InteractiveButton {
                        kind: "reply".into(),
                        reply: ButtonReply { id: id.to_string(), title: title.to_string() },
                    })
                    .collect(),
            },
        },
    };
    post_graph(cfg, &payload).await
}

// ═══ INCOMING WEBHOOK TYPES (minimal subset) ═══

#[derive(Debug, Deserialize, Default)]
pub struct WhatsAppIncoming {
    #[allow(dead_code)]
    #[serde(default)]
    pub object: String,
    #[serde(default)]
    pub entry: Vec<WaEntry>,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaEntry {
    #[serde(default)]
    pub changes: Vec<WaChange>,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaChange {
    #[serde(default)]
    pub value: WaValue,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaValue {
    #[serde(default)]
    pub contacts: Vec<WaContact>,
    #[serde(default)]
    pub messages: Vec<WaMessage>,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaContact {
    #[serde(default)]
    pub wa_id: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaMessage {
    #[serde(default)]
    pub from: String,
    #[serde(rename = "type", default)]
    pub msg_type: String,
    #[serde(default)]
    pub text: Option<WaText>,
    #[serde(default)]
    pub interactive: Option<WaInteractive>,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaText {
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaInteractive {
    #[serde(default)]
    pub button_reply: Option<WaButtonReply>,
    #[serde(default)]
    pub list_reply: Option<WaListReply>,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaButtonReply {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct WaListReply {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
}

/// Extract (sender_phone, text_or_button_id) from a webhook payload.
pub fn extract_inbound(payload: &WhatsAppIncoming) -> Option<(String, String)> {
    let value = payload.entry.first()?.changes.first()?.value.clone();
    let msg = value.messages.first()?;
    let phone = if !msg.from.is_empty() {
        msg.from.clone()
    } else {
        value.contacts.first()?.wa_id.clone()
    };
    if msg.msg_type == "text" {
        let body = msg.text.as_ref()?.body.trim().to_string();
        if body.is_empty() { return None; }
        return Some((phone, body));
    }
    if msg.msg_type == "interactive" {
        let inter = msg.interactive.as_ref()?;
        if let Some(b) = &inter.button_reply {
            if !b.id.is_empty() { return Some((phone, format!("btn:{}", b.id))); }
        }
        if let Some(l) = &inter.list_reply {
            if !l.id.is_empty() { return Some((phone, format!("btn:{}", l.id))); }
        }
    }
    None
}

// WaValue needs Clone for extract_inbound
impl Clone for WaValue {    fn clone(&self) -> Self {
        Self {
            contacts: self.contacts.iter().map(|c| WaContact { wa_id: c.wa_id.clone() }).collect(),
            messages: self.messages.iter().map(|m| WaMessage {
                from: m.from.clone(),
                msg_type: m.msg_type.clone(),
                text: m.text.as_ref().map(|t| WaText { body: t.body.clone() }),
                interactive: m.interactive.as_ref().map(|i| WaInteractive {
                    button_reply: i.button_reply.as_ref().map(|b| WaButtonReply { id: b.id.clone(), title: b.title.clone() }),
                    list_reply: i.list_reply.as_ref().map(|l| WaListReply { id: l.id.clone(), title: l.title.clone() }),
                }),
            }).collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ke_phone_normalizes_all_common_forms() {
        assert_eq!(normalize_ke_phone("0712345678").as_deref(), Some("254712345678"));
        assert_eq!(normalize_ke_phone("+254712345678").as_deref(), Some("254712345678"));
        assert_eq!(normalize_ke_phone("254712345678").as_deref(), Some("254712345678"));
        assert_eq!(normalize_ke_phone("712345678").as_deref(), Some("254712345678"));
        assert_eq!(normalize_ke_phone("0712 345 678").as_deref(), Some("254712345678"));
        assert_eq!(normalize_ke_phone("123"), None);
        assert_eq!(normalize_ke_phone(""), None);
    }

    #[test]
    fn kes_formats_with_thousands() {
        assert_eq!(format_kes(30000), "KES 30,000");
        assert_eq!(format_kes(1500), "KES 1,500");
        assert_eq!(format_kes(500), "KES 500");
        assert_eq!(format_kes(0), "KES 0");
    }

    #[test]
    fn hmac_verify_accepts_known_vector() {
        // echo -n "hello" | openssl dgst -sha256 -hmac "secret" (= .NET HMACSHA256 check)
        let body = b"hello";
        let sig = "sha256=88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b";
        assert!(verify_meta_signature("secret", body, sig));
        assert!(!verify_meta_signature("secret", body, "sha256=deadbeef"));
        assert!(!verify_meta_signature("", body, sig));
    }

    #[test]
    fn inbound_extracts_text_and_buttons() {
        let text_payload: WhatsAppIncoming = serde_json::from_value(serde_json::json!({
            "object": "whatsapp_business_account",
            "entry": [{
                "changes": [{
                    "value": {
                        "contacts": [{"wa_id": "254712345678"}],
                        "messages": [{"from": "254712345678", "type": "text", "text": {"body": "BALANCE"}}]
                    }
                }]
            }]
        })).unwrap();
        assert_eq!(
            extract_inbound(&text_payload),
            Some(("254712345678".to_string(), "BALANCE".to_string()))
        );

        let btn_payload: WhatsAppIncoming = serde_json::from_value(serde_json::json!({
            "entry": [{
                "changes": [{
                    "value": {
                        "contacts": [{"wa_id": "254700000001"}],
                        "messages": [{"from": "", "type": "interactive",
                            "interactive": {"button_reply": {"id": "pay_mpesa", "title": "Pay"}}}]
                    }
                }]
            }]
        })).unwrap();
        assert_eq!(
            extract_inbound(&btn_payload),
            Some(("254700000001".to_string(), "btn:pay_mpesa".to_string()))
        );
    }

    #[test]
    fn phone_masking_hides_middle_digits() {
        assert_eq!(mask_phone("254712345678"), "2547***678");
        assert_eq!(mask_phone("12"), "***");
    }
}
