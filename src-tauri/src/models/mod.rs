use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct School {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub school_type: String,
    pub curriculum: String,
    pub county: Option<String>,
    pub sub_county: Option<String>,
    pub registration: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub mpesa_paybill: Option<String>,
    pub mpesa_till: Option<String>,
    pub logo_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeStructure {
    pub id: String,
    pub school_id: String,
    pub name: String,
    pub grade: String,
    pub term: i32,
    pub academic_year: i32,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoteHead {
    pub id: String,
    pub fee_structure_id: String,
    pub name: String,
    pub category: String,
    pub amount: i64,
    pub is_mandatory: bool,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Student {
    pub id: String,
    pub admission_no: String,
    pub school_id: String,
    pub first_name: String,
    pub middle_name: Option<String>,
    pub last_name: String,
    pub grade: String,
    pub stream: Option<String>,
    pub status: String,
    pub enrollment_date: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentDetail {
    pub student: Student,
    pub parents: Vec<Parent>,
    pub outstanding_fees: i64,
    pub total_paid: i64,
    pub invoices: Vec<InvoiceSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parent {
    pub id: String,
    pub name: String,
    pub phone: String,
    pub email: Option<String>,
    pub relationship: Option<String>,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: String,
    pub invoice_no: String,
    pub student_id: String,
    pub fee_structure_id: String,
    pub total_amount: i64,
    pub discount_amount: i64,
    pub net_amount: i64,
    pub status: String,
    pub due_date: Option<String>,
    pub created_at: String,
    pub paid_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceSummary {
    pub id: String,
    pub invoice_no: String,
    pub net_amount: i64,
    pub amount_paid: i64,
    pub outstanding: i64,
    pub status: String,
    pub grade: String,
    pub term: i32,
    pub academic_year: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceDetail {
    pub invoice: Invoice,
    pub items: Vec<InvoiceItem>,
    pub payments: Vec<Payment>,
    pub student_name: String,
    pub admission_no: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceItem {
    pub id: String,
    pub vote_head_id: String,
    pub amount: i64,
    pub description: Option<String>,
    pub vote_head_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payment {
    pub id: String,
    pub payment_no: String,
    pub invoice_id: String,
    pub student_id: String,
    pub amount: i64,
    pub method: String,
    pub reference: Option<String>,
    pub mpesa_receipt: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub received_by: Option<String>,
    pub created_at: String,
    pub confirmed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentDetail {
    pub payment: Payment,
    pub student_name: String,
    pub admission_no: String,
    pub invoice_no: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_students: i64,
    pub total_collected: i64,
    pub total_outstanding: i64,
    pub collection_rate: f64,
    pub recent_payments: Vec<Payment>,
    pub top_outstanding: Vec<StudentOutstanding>,
    pub term_summary: TermSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TermSummary {
    pub term: i32,
    pub academic_year: i32,
    pub invoiced: i64,
    pub collected: i64,
    pub outstanding: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionSummary {
    pub total_invoiced: i64,
    pub total_paid: i64,
    pub total_outstanding: i64,
    pub total_discounted: i64,
    pub collection_rate: f64,
    pub by_grade: Vec<GradeCollection>,
    pub by_method: Vec<MethodCollection>,
    pub by_vote_head: Vec<VoteHeadCollection>,
    pub daily_trend: Vec<DailyCollection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeCollection {
    pub grade: String,
    pub invoiced: i64,
    pub paid: i64,
    pub outstanding: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodCollection {
    pub method: String,
    pub count: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoteHeadCollection {
    pub name: String,
    pub invoiced: i64,
    pub paid: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCollection {
    pub date: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentOutstanding {
    pub student_id: String,
    pub student_name: String,
    pub admission_no: String,
    pub grade: String,
    pub total_invoiced: i64,
    pub total_paid: i64,
    pub outstanding: i64,
    pub oldest_unpaid_date: String,
    pub days_overdue: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentHistoryEntry {
    pub date: String,
    pub description: String,
    pub debit: i64,
    pub credit: i64,
    pub balance: i64,
    pub method: Option<String>,
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgeBucket {
    pub bucket: String,
    pub count: i64,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grade {
    pub id: String,
    pub school_id: String,
    pub name: String,
    pub level: String,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchoolProfile {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub school_type: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub motto: Option<String>,
    pub county: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub is_active: bool,
    pub last_login: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscountConfig {
    pub id: String,
    pub school_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub discount_type: String,
    pub rate: f64,
    pub min_students: i32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradePromotion {
    pub id: String,
    pub school_id: String,
    pub from_grade: String,
    pub to_grade: String,
    pub student_count: i32,
    pub academic_year: i32,
    pub promoted_at: String,
}

// ═══ M-PESA ═══

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpesaConfig {
    pub id: String,
    pub school_id: String,
    pub consumer_key: String,
    pub consumer_secret: String,
    pub passkey: String,
    pub shortcode: String,
    pub callback_url: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpesaTransaction {
    pub id: String,
    pub school_id: String,
    pub invoice_id: Option<String>,
    pub merchant_request_id: Option<String>,
    pub checkout_request_id: Option<String>,
    pub phone: String,
    pub amount: i64,
    pub account_reference: Option<String>,
    pub status: String,
    pub result_code: Option<i32>,
    pub result_description: Option<String>,
    pub mpesa_receipt: Option<String>,
    pub raw_callback: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ═══ C2B ═══

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct C2bCallbackPayload {
    #[serde(rename = "TransactionType")]
    pub transaction_type: String,
    #[serde(rename = "TransID")]
    pub trans_id: String,
    #[serde(rename = "TransTime")]
    pub trans_time: String,
    #[serde(rename = "TransAmount")]
    pub trans_amount: String,
    #[serde(rename = "BusinessShortCode")]
    pub business_shortcode: String,
    #[serde(rename = "BillRefNumber")]
    pub bill_ref_number: String,
    #[serde(rename = "InvoiceNumber")]
    pub invoice_number: Option<String>,
    #[serde(rename = "OrgAccountBalance")]
    pub org_account_balance: String,
    #[serde(rename = "ThirdPartyTransID")]
    pub third_party_trans_id: Option<String>,
    #[serde(rename = "MSISDN")]
    pub msisdn: String,
    #[serde(rename = "FirstName")]
    pub first_name: Option<String>,
    #[serde(rename = "MiddleName")]
    pub middle_name: Option<String>,
    #[serde(rename = "LastName")]
    pub last_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct C2bValidationResponse {
    #[serde(rename = "ResultCode")]
    pub result_code: i32,
    #[serde(rename = "ResultDesc")]
    pub result_desc: String,
}
