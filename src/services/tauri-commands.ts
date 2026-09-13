function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

async function cmd<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriAvailable()) {
    console.warn(`Tauri not available, skipping command: ${command}`);
    return undefined as T;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.error(`Command failed: ${command}`, error);
    throw error;
  }
}

// ═══ SCHOOL ═══
export const schoolApi = {
  create: (data: { name: string; school_type: string; curriculum?: string; county?: string; phone?: string; email?: string }) =>
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
    school_id: string; admission_no: string; first_name: string; last_name: string;
    middle_name?: string; grade: string; stream?: string; enrollment_date?: string;
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
  createStructure: (data: { school_id: string; name: string; grade: string; term: number; academic_year: number }) =>
    cmd<any>("create_fee_structure", data),
  listStructures: (schoolId: string, filters?: { academic_year?: number; term?: number }) =>
    cmd<any[]>("get_fee_structures", { schoolId, ...filters }),
  addVoteHead: (data: { fee_structure_id: string; name: string; category: string; amount: number; is_mandatory?: boolean }) =>
    cmd<any>("add_vote_head", data),
  getVoteHeads: (feeStructureId: string) =>
    cmd<any[]>("get_vote_heads", { feeStructureId }),

  // Discount configs
  listDiscountConfigs: (schoolId: string) =>
    cmd<any[]>("get_discount_configs", { schoolId }),
  addDiscountConfig: (data: { school_id: string; name: string; type: string; rate: number; min_students: number; is_active: boolean }) => {
    const { type, ...rest } = data;
    return cmd<any>("add_discount_config", { ...rest, discount_type: type });
  },
  removeDiscountConfig: (id: string) =>
    cmd<void>("remove_discount_config", { id }),
};

// ═══ INVOICES ═══
export const invoiceApi = {
  generate: (feeStructureId: string, studentIds?: string[]) =>
    cmd<any[]>("generate_invoices", { feeStructureId, studentIds }),
  list: (filters?: { student_id?: string; status?: string; limit?: number; offset?: number }) =>
    cmd<any[]>("get_invoices", { ...filters }),
  detail: (id: string) =>
    cmd<any>("get_invoice_detail", { id }),
};

// ═══ PAYMENTS ═══
export const paymentApi = {
  record: (data: {
    invoice_id: string; amount: number; method: string; reference?: string;
    mpesa_receipt?: string; notes?: string; received_by?: string;
  }) => cmd<any>("record_payment", data),
  list: (filters?: { student_id?: string; method?: string; limit?: number; offset?: number }) =>
    cmd<any[]>("get_payments", { ...filters }),
  detail: (id: string) =>
    cmd<any>("get_payment_detail", { id }),
};

// ═══ M-PESA ═══
export const mpesaApi = {
  getConfig: (schoolId: string) =>
    cmd<any | null>("get_mpesa_config", { schoolId }),
  saveConfig: (data: {
    school_id: string; consumer_key: string; consumer_secret: string;
    passkey: string; shortcode: string; callback_url?: string;
  }) => cmd<any>("save_mpesa_config", data),
  testConnection: (schoolId: string) =>
    cmd<string>("test_mpesa_connection", { schoolId }),
  initiatePayment: (data: {
    school_id: string; invoice_id: string; phone: string; amount: number;
  }) => cmd<any>("initiate_mpesa_payment", data),
  checkStatus: (transactionId: string) =>
    cmd<any>("check_mpesa_status", { transactionId }),
  listTransactions: (schoolId: string, limit?: number) =>
    cmd<any[]>("get_mpesa_transactions", { schoolId, limit }),
  // C2B
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
  collectionSummary: (schoolId: string, academicYear: number, term?: string) =>
    cmd<any>("get_collection_summary", { schoolId, academicYear, term }),
  outstandingReport: (schoolId: string, academicYear: number, term?: string) =>
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

  // School profile
  getSchoolProfile: (schoolId: string) =>
    cmd<any>("get_school_profile", { schoolId }),
  updateSchoolProfile: (schoolId: string, data: Record<string, unknown>) => {
    const { type, ...rest } = data;
    return cmd<any>("update_school_profile", { schoolId, school_type: type, ...rest });
  },

  // User management
  listUsers: (schoolId: string) =>
    cmd<any[]>("list_users", { schoolId }),
  createUser: (schoolId: string, data: { username: string; password: string; full_name: string; role: string }) =>
    cmd<any>("create_user", { schoolId, ...data }),
  updateUser: (userId: string, data: Record<string, unknown>) =>
    cmd<any>("update_user", { userId, ...data }),
  deleteUser: (userId: string) =>
    cmd<void>("delete_user", { userId }),
};

// ═══ GRADES ═══
export const gradeApi = {
  create: (schoolId: string, name: string, level: string, sortOrder?: number) =>
    cmd<any>("create_grade", { schoolId, name, level, sortOrder }),
  list: (schoolId: string) =>
    cmd<any[]>("get_grades", { schoolId }),
  update: (id: string, data: { name?: string; level?: string; sort_order?: number; is_active?: boolean }) =>
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
