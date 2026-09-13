export const APP_NAME = "Edufy Finance";
export const APP_VERSION = "0.1.0";

export const GRADES_CBC = [
  "PP1", "PP2",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9",
  "Grade 10", "Grade 11", "Grade 12",
];

export const GRADES_844 = [
  "Form 1", "Form 2", "Form 3", "Form 4",
];

export const TERMS = [
  { value: 1, label: "Term 1" },
  { value: 2, label: "Term 2" },
  { value: 3, label: "Term 3" },
];

export const SCHOOL_TYPES = [
  { value: "public_day", label: "Public Day" },
  { value: "public_boarding", label: "Public Boarding" },
  { value: "private_day", label: "Private Day" },
  { value: "private_boarding", label: "Private Boarding" },
  { value: "international", label: "International" },
];

export const PAYMENT_METHODS = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "airtel", label: "Airtel Money" },
  { value: "bank", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
];

export const VOTE_HEAD_CATEGORIES = [
  { value: "tuition", label: "Tuition" },
  { value: "boarding", label: "Boarding" },
  { value: "activity", label: "Co-curricular Activities" },
  { value: "medical", label: "Medical & Insurance" },
  { value: "cbc_projects", label: "CBC Projects & Coding" },
  { value: "transport", label: "Transport" },
  { value: "lunch", label: "Lunch / Meals" },
  { value: "caution", label: "Caution Fee" },
  { value: "other", label: "Other" },
];

export const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "graduated", label: "Graduated" },
  { value: "transferred", label: "Transferred" },
];

export const INVOICE_STATUS = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "waived", label: "Waived" },
];
