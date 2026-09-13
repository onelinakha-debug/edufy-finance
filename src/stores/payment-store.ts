import { create } from "zustand";
import { paymentApi } from "@/services/tauri-commands";

export interface Payment {
  id: string;
  payment_no: string;
  invoice_id: string;
  student_id: string;
  amount: number;
  method: string;
  reference: string | null;
  mpesa_receipt: string | null;
  status: string;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface PaymentDetail {
  payment: Payment;
  student_name: string;
  admission_no: string;
  invoice_no: string;
}

interface PaymentState {
  payments: Payment[];
  loading: boolean;
  selectedPayment: PaymentDetail | null;

  // Filters
  methodFilter: string | null;
  dateFrom: string | null;
  dateTo: string | null;

  // Actions
  fetchPayments: (filters?: { student_id?: string; method?: string }) => Promise<void>;
  recordPayment: (data: {
    invoice_id: string;
    amount: number;
    method: string;
    reference?: string;
    mpesa_receipt?: string;
    notes?: string;
    received_by?: string;
  }) => Promise<Payment>;
  fetchPaymentDetail: (id: string) => Promise<PaymentDetail>;
  setMethodFilter: (method: string | null) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  clearFilters: () => void;
}

export const usePaymentStore = create<PaymentState>((set) => ({
  payments: [],
  loading: false,
  selectedPayment: null,
  methodFilter: null,
  dateFrom: null,
  dateTo: null,

  fetchPayments: async (filters) => {
    set({ loading: true });
    try {
      const payments = await paymentApi.list(filters);
      set({ payments: payments || [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  recordPayment: async (data) => {
    const payment = await paymentApi.record(data);
    if (payment) set((s) => ({ payments: [payment, ...s.payments] }));
    return payment;
  },

  fetchPaymentDetail: async (id) => {
    const detail = await paymentApi.detail(id);
    set({ selectedPayment: detail });
    return detail;
  },

  setMethodFilter: (method) => set({ methodFilter: method }),
  setDateRange: (from, to) => set({ dateFrom: from, dateTo: to }),
  clearFilters: () => set({ methodFilter: null, dateFrom: null, dateTo: null }),
}));
