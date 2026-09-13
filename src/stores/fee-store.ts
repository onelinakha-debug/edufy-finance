import { create } from "zustand";
import { feeApi, invoiceApi } from "@/services/tauri-commands";

export interface FeeStructure {
  id: string;
  school_id: string;
  name: string;
  grade: string;
  term: number;
  academic_year: number;
  is_active: boolean;
  created_at: string;
}

export interface VoteHead {
  id: string;
  fee_structure_id: string;
  name: string;
  category: string;
  amount: number;
  is_mandatory: boolean;
  sort_order: number;
}

export interface Invoice {
  id: string;
  invoice_no: string;
  student_id: string;
  fee_structure_id: string;
  total_amount: number;
  discount_amount: number;
  net_amount: number;
  status: string;
  due_date: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface InvoiceItem {
  id: string;
  vote_head_id: string;
  amount: number;
  description: string | null;
  vote_head_name: string;
}

export interface InvoiceDetail {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Array<{
    id: string;
    payment_no: string;
    amount: number;
    method: string;
    mpesa_receipt: string | null;
    created_at: string;
  }>;
  student_name: string;
  admission_no: string;
}

interface FeeState {
  // Fee structures
  structures: FeeStructure[];
  structuresLoading: boolean;

  // Vote heads per structure
  voteHeads: Record<string, VoteHead[]>;
  voteHeadsLoading: boolean;

  // Invoices
  invoices: Invoice[];
  invoicesLoading: boolean;

  // Selected
  selectedStructure: FeeStructure | null;
  selectedInvoice: InvoiceDetail | null;

  // Actions
  fetchStructures: (schoolId: string, year?: number, term?: number) => Promise<void>;
  createStructure: (data: {
    school_id: string;
    name: string;
    grade: string;
    term: number;
    academic_year: number;
  }) => Promise<FeeStructure>;
  fetchVoteHeads: (feeStructureId: string) => Promise<VoteHead[]>;
  addVoteHead: (data: {
    fee_structure_id: string;
    name: string;
    category: string;
    amount: number;
    is_mandatory?: boolean;
  }) => Promise<VoteHead>;

  // Invoices
  fetchInvoices: (filters?: { student_id?: string; status?: string }) => Promise<void>;
  generateInvoices: (feeStructureId: string, studentIds?: string[]) => Promise<Invoice[]>;
  fetchInvoiceDetail: (id: string) => Promise<InvoiceDetail>;

  // Selection
  setSelectedStructure: (s: FeeStructure | null) => void;
  setSelectedInvoice: (i: InvoiceDetail | null) => void;
}

export interface DiscountConfig {
  id: string;
  school_id: string;
  name: string;
  type: string;
  rate: number;
  min_students: number;
  is_active: boolean;
}

// Merge discount state into FeeState
interface FeeStateWithDiscounts extends FeeState {
  discountConfigs: DiscountConfig[];
  fetchDiscountConfigs: (schoolId: string) => Promise<void>;
  addDiscountConfig: (data: Omit<DiscountConfig, "id">) => Promise<DiscountConfig>;
  removeDiscountConfig: (id: string) => Promise<void>;
}

export const useFeeStore = create<FeeStateWithDiscounts>((set, get) => ({
  structures: [],
  structuresLoading: false,
  voteHeads: {},
  voteHeadsLoading: false,
  invoices: [],
  invoicesLoading: false,
  selectedStructure: null,
  selectedInvoice: null,

  fetchStructures: async (schoolId, year, term) => {
    set({ structuresLoading: true });
    try {
      const structures = await feeApi.listStructures(schoolId, {
        academic_year: year,
        term: term,
      });
      set({ structures: structures || [], structuresLoading: false });
    } catch {
      set({ structuresLoading: false });
    }
  },

  createStructure: async (data) => {
    const structure = await feeApi.createStructure(data);
    if (structure) set((s) => ({ structures: [structure, ...s.structures] }));
    return structure;
  },

  fetchVoteHeads: async (feeStructureId) => {
    set({ voteHeadsLoading: true });
    try {
      const heads = await feeApi.getVoteHeads(feeStructureId);
      set((s) => ({
        voteHeads: { ...s.voteHeads, [feeStructureId]: heads || [] },
        voteHeadsLoading: false,
      }));
      return heads;
    } catch {
      set({ voteHeadsLoading: false });
      return [];
    }
  },

  addVoteHead: async (data) => {
    const head = await feeApi.addVoteHead(data);
    if (head) set((s) => ({
      voteHeads: {
        ...s.voteHeads,
        [data.fee_structure_id]: [...(s.voteHeads[data.fee_structure_id] || []), head],
      },
    }));
    return head;
  },

  fetchInvoices: async (filters) => {
    set({ invoicesLoading: true });
    try {
      const invoices = await invoiceApi.list(filters);
      set({ invoices: invoices || [], invoicesLoading: false });
    } catch {
      set({ invoicesLoading: false });
    }
  },

  generateInvoices: async (feeStructureId, studentIds) => {
    const invoices = await invoiceApi.generate(feeStructureId, studentIds);
    if (invoices) set((s) => ({ invoices: [...invoices, ...s.invoices] }));
    return invoices;
  },

  fetchInvoiceDetail: async (id) => {
    const detail = await invoiceApi.detail(id);
    set({ selectedInvoice: detail });
    return detail;
  },

  setSelectedStructure: (s) => set({ selectedStructure: s }),
  setSelectedInvoice: (i) => set({ selectedInvoice: i }),

  // Discount configs
  discountConfigs: [],
  fetchDiscountConfigs: async (schoolId) => {
    try {
      const configs = await feeApi.listDiscountConfigs(schoolId);
      set({ discountConfigs: configs || [] });
    } catch { /* noop */ }
  },
  addDiscountConfig: async (data) => {
    const config = await feeApi.addDiscountConfig(data);
    if (config) set((s) => ({ discountConfigs: [...s.discountConfigs, config] }));
    return config;
  },
  removeDiscountConfig: async (id) => {
    await feeApi.removeDiscountConfig(id);
    set((s) => ({ discountConfigs: s.discountConfigs.filter((c) => c.id !== id) }));
  },
}));
