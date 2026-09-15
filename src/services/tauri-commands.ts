function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

function toSnakeCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== "object") return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
    result[snakeKey] = toSnakeCase(value);
  }
  return result;
}

async function httpCmd<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = args ? toSnakeCase(args) : {};

  const res = await fetch(`/api/${command}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function cmd<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauriAvailable()) {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      console.error(`Command failed: ${command}`, error);
      throw error;
    }
  }
  return httpCmd<T>(command, args);
}

// ═══ AUTH ═══
export const authApi = {
  login: (data: { username: string; password: string; schoolId: string }) =>
    cmd<{ user: { id: string; username: string; fullName: string; role: string }; token: string; schoolId: string }>("login", data),
};

// ═══ SCHOOL ═══
export const schoolApi = {
  create: (data: { name: string; schoolType: string; curriculum?: string; county?: string; phone?: string; email?: string }) =>
    cmd<any>("create_school", data),
  list: () =>
    cmd<any[]>("list_schools"),
  get: (id: string) =>
    cmd<any>("get_school", { id }),
  update: (id: string, data: Record<string, unknown>) =>
    cmd<any>("update_school", { id, ...data }),
};

// ═══ STUDENTS ═══
export const studentApi = {
  create: (data: {
    schoolId: string; admissionNo: string; firstName: string; lastName: string;
    middleName?: string; grade: string; stream?: string; enrollmentDate?: string;
  }) => cmd<any>("create_student", data),
  list: (schoolId: string, filters?: { grade?: string; status?: string }) =>
    cmd<any[]>("get_students", { schoolId, ...filters }),
  detail: (id: string) =>
    cmd<any>("get_student_detail", { id }),
  update: (id: string, data: Record<string, unknown>) =>
    cmd<any>("update_student", { id, ...data }),
  delete: (id: string) =>
    cmd<void>("delete_student", { id }),
};

// ═══ FEE STRUCTURES ═══
export const feeApi = {
  createStructure: (data: { schoolId: string; name: string; grade: string; term: number; academicYear: number }) =>
    cmd<any>("create_fee_structure", data),
  listStructures: (schoolId: string, filters?: { academicYear?: number; term?: number }) =>
    cmd<any[]>("get_fee_structures", { schoolId, ...filters }),
  addVoteHead: (data: { feeStructureId: string; name: string; category: string; amount: number; isMandatory?: boolean }) =>
    cmd<any>("add_vote_head", data),
  getVoteHeads: (feeStructureId: string) =>
    cmd<any[]>("get_vote_heads", { feeStructureId }),

  listDiscountConfigs: (schoolId: string) =>
    cmd<any[]>("get_discount_configs", { schoolId }),
  addDiscountConfig: (data: { schoolId: string; name: string; type: string; rate: number; minStudents: number; isActive: boolean }) => {
    const { type, ...rest } = data;
    return cmd<any>("add_discount_config", { ...rest, discountType: type });
  },
  removeDiscountConfig: (id: string) =>
    cmd<void>("remove_discount_config", { id }),
};

// ═══ INVOICES ═══
export const invoiceApi = {
  generate: (feeStructureId: string, studentIds?: string[]) =>
    cmd<any[]>("generate_invoices", { feeStructureId, studentIds }),
  list: (filters?: { studentId?: string; status?: string; limit?: number; offset?: number }) =>
    cmd<any[]>("get_invoices", { ...filters }),
  detail: (id: string) =>
    cmd<any>("get_invoice_detail", { id }),
};

// ═══ PAYMENTS ═══
export const paymentApi = {
  record: (data: {
    invoiceId: string; amount: number; method: string; reference?: string;
    mpesaReceipt?: string; notes?: string; receivedBy?: string;
  }) => cmd<any>("record_payment", data),
  list: (filters?: { studentId?: string; method?: string; limit?: number; offset?: number }) =>
    cmd<any[]>("get_payments", { ...filters }),
  detail: (id: string) =>
    cmd<any>("get_payment_detail", { id }),
};

// ═══ M-PESA ═══
export const mpesaApi = {
  getConfig: (schoolId: string) =>
    cmd<any | null>("get_mpesa_config", { schoolId }),
  saveConfig: (data: {
    schoolId: string; consumerKey: string; consumerSecret: string;
    passkey: string; shortcode: string; callbackUrl?: string;
  }) => cmd<any>("save_mpesa_config", data),
  testConnection: (schoolId: string) =>
    cmd<string>("test_mpesa_connection", { schoolId }),
  initiatePayment: (data: {
    schoolId: string; invoiceId: string; phone: string; amount: number;
  }) => cmd<any>("initiate_mpesa_payment", data),
  checkStatus: (transactionId: string) =>
    cmd<any>("check_mpesa_status", { transactionId }),
  listTransactions: (schoolId: string, limit?: number) =>
    cmd<any[]>("get_mpesa_transactions", { schoolId, limit }),
  registerC2bUrls: (schoolId: string) =>
    cmd<string>("register_c2b_urls", { schoolId }),
  startC2bServer: (schoolId: string, port?: number) =>
    cmd<string>("start_c2b_server", { schoolId, port }),
  listC2bTransactions: (schoolId: string, limit?: number) =>
    cmd<any[]>("get_c2b_transactions", { schoolId, limit }),
  matchC2bPayment: (transactionId: string, invoiceId: string) =>
    cmd<any>("match_c2b_payment", { transactionId, invoiceId }),
};

// ═══ DASHBOARD & REPORTS ═══
export const dashboardApi = {
  stats: (schoolId: string) =>
    cmd<any>("get_dashboard_stats", { schoolId }),
};

export const reportApi = {
  collectionSummary: (schoolId: string, academicYear: number, term?: number) =>
    cmd<any>("get_collection_summary", { schoolId, academicYear, term }),
  outstandingReport: (schoolId: string, academicYear: number, term?: number) =>
    cmd<any[]>("get_outstanding_report", { schoolId, academicYear, term }),
  studentHistory: (studentId: string) =>
    cmd<any[]>("get_student_history", { studentId }),
  ageAnalysis: (schoolId: string) =>
    cmd<any[]>("get_age_analysis", { schoolId }),
};

// ═══ SETTINGS ═══
export const settingsApi = {
  get: (key: string) =>
    cmd<string | null>("get_setting", { key }),
  set: (key: string, value: string) =>
    cmd<void>("set_setting", { key, value }),
  backup: () =>
    cmd<string>("backup_database"),

  getSchoolProfile: (schoolId: string) =>
    cmd<any>("get_school_profile", { schoolId }),
  updateSchoolProfile: (schoolId: string, data: Record<string, unknown>) => {
    const { type, ...rest } = data;
    return cmd<any>("update_school_profile", { schoolId, schoolType: type, ...rest });
  },

  listUsers: (schoolId: string) =>
    cmd<any[]>("list_users", { schoolId }),
  createUser: (schoolId: string, data: { username: string; password: string; fullName: string; role: string }) =>
    cmd<any>("create_user", { schoolId, ...data }),
  updateUser: (userId: string, data: Record<string, unknown>) =>
    cmd<any>("update_user", { userId, ...data }),
  deleteUser: (userId: string) =>
    cmd<void>("delete_user", { userId }),
};

// ═══ WHATSAPP BOT + PAYMENT LINKS ═══
export const whatsappApi = {
  balances: (phone: string) =>
    cmd<any[]>("lookup_parent_balances", { phone }),
  generateLink: (schoolId: string, invoiceId: string, phone: string) =>
    cmd<any>("generate_payment_link", { schoolId, invoiceId, phone }),
  enqueue: (schoolId: string, parentPhone: string, templateName: string, paramsJson?: string) =>
    cmd<any>("enqueue_whatsapp", { schoolId, parentPhone, templateName, paramsJson }),
};

export const payApi = {
  snapshot: async (token: string) => {
    const res = await fetch(`/pay/${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(res.status === 404 ? "Payment link not found" : `Request failed: ${res.status}`);
    return res.json();
  },
};

// ═══ GRADES ═══
export const gradeApi = {
  create: (schoolId: string, name: string, level: string, sortOrder?: number) =>
    cmd<any>("create_grade", { schoolId, name, level, sortOrder }),
  list: (schoolId: string) =>
    cmd<any[]>("get_grades", { schoolId }),
  update: (id: string, data: { name?: string; level?: string; sortOrder?: number; isActive?: boolean }) =>
    cmd<any>("update_grade", { id, ...data }),
  delete: (id: string) =>
    cmd<void>("delete_grade", { id }),
  countStudents: (schoolId: string, grade: string) =>
    cmd<number>("count_students_in_grade", { schoolId, grade }),
};

// ═══ PROMOTIONS ═══
export const promotionApi = {
  promote: (schoolId: string, fromGrade: string, toGrade: string, academicYear: number, studentIds?: string[]) =>
    cmd<any>("promote_students", { schoolId, fromGrade, toGrade, academicYear, studentIds }),
  history: (schoolId: string) =>
    cmd<any[]>("get_promotion_history", { schoolId }),
};
