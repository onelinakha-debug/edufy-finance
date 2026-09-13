import { create } from "zustand";
import { reportApi } from "@/services/tauri-commands";

export interface CollectionSummary {
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  total_discounted: number;
  collection_rate: number;
  by_method: { method: string; count: number; total: number }[];
  by_grade: { grade: string; invoiced: number; paid: number; outstanding: number }[];
  by_vote_head: { name: string; invoiced: number; paid: number }[];
  daily_trend: { date: string; amount: number }[];
}

export interface OutstandingEntry {
  student_id: string;
  student_name: string;
  admission_no: string;
  grade: string;
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
  oldest_unpaid_date: string;
  days_overdue: number;
}

export interface StudentHistoryEntry {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  method: string | null;
  reference: string | null;
}

interface ReportState {
  summary: CollectionSummary | null;
  outstanding: OutstandingEntry[];
  studentHistory: StudentHistoryEntry[];
  loading: boolean;

  fetchSummary: (schoolId: string, academicYear: number, term?: string) => Promise<void>;
  fetchOutstanding: (schoolId: string, academicYear: number, term?: string) => Promise<void>;
  fetchStudentHistory: (studentId: string) => Promise<void>;
}

export const useReportStore = create<ReportState>((set) => ({
  summary: null,
  outstanding: [],
  studentHistory: [],
  loading: false,

  fetchSummary: async (schoolId, academicYear, term) => {
    set({ loading: true });
    try {
      const summary = await reportApi.collectionSummary(schoolId, academicYear, term ? Number(term) : undefined);
      set({ summary, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchOutstanding: async (schoolId, academicYear, term) => {
    set({ loading: true });
    try {
      const outstanding = await reportApi.outstandingReport(schoolId, academicYear, term ? Number(term) : undefined);
      set({ outstanding: outstanding || [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchStudentHistory: async (studentId) => {
    set({ loading: true });
    try {
      const studentHistory = await reportApi.studentHistory(studentId);
      set({ studentHistory: studentHistory || [], loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
