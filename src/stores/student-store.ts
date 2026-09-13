import { create } from "zustand";
import { studentApi } from "@/services/tauri-commands";

export interface Student {
  id: string;
  admission_no: string;
  school_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  grade: string;
  stream: string | null;
  status: string;
  enrollment_date: string | null;
  created_at: string;
}

interface StudentState {
  students: Student[];
  loading: boolean;
  error: string | null;
  selectedStudent: Student | null;

  // Filters
  gradeFilter: string | null;
  statusFilter: string | null;
  searchQuery: string;

  // Sort
  sortBy: string | null;
  sortOrder: "asc" | "desc";

  // Actions
  fetchStudents: (schoolId?: string) => Promise<void>;
  addStudent: (data: {
    school_id: string;
    admission_no: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    grade: string;
    stream?: string;
  }) => Promise<Student>;
  updateStudent: (id: string, data: Record<string, unknown>) => Promise<void>;
  removeStudent: (id: string) => Promise<void>;
  setSelectedStudent: (student: Student | null) => void;
  setGradeFilter: (grade: string | null) => void;
  setStatusFilter: (status: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSort: (key: string, order: "asc" | "desc") => void;
  clearFilters: () => void;
}

export const useStudentStore = create<StudentState>((set, get) => ({
  students: [],
  loading: false,
  error: null,
  selectedStudent: null,
  gradeFilter: null,
  statusFilter: null,
  searchQuery: "",
  sortBy: null,
  sortOrder: "asc",

  fetchStudents: async (schoolId?: string) => {
    set({ loading: true, error: null });
    try {
      const { gradeFilter, statusFilter } = get();
      const students = await studentApi.list(schoolId, {
        grade: gradeFilter || undefined,
        status: statusFilter || undefined,
      });
      set({ students: students || [], loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  addStudent: async (data) => {
    const student = await studentApi.create(data);
    if (student) set((s) => ({ students: [...s.students, student] }));
    return student;
  },

  updateStudent: async (id, data) => {
    const updated = await studentApi.update(id, data);
    if (updated) set((s) => ({
      students: s.students.map((st) => (st.id === id ? updated : st)),
      selectedStudent: s.selectedStudent?.id === id ? updated : s.selectedStudent,
    }));
  },

  removeStudent: async (id) => {
    await studentApi.delete(id);
    set((s) => ({
      students: s.students.filter((st) => st.id !== id),
      selectedStudent: s.selectedStudent?.id === id ? null : s.selectedStudent,
    }));
  },

  setSelectedStudent: (student) => set({ selectedStudent: student }),
  setGradeFilter: (grade) => set({ gradeFilter: grade }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSort: (key, order) => set({ sortBy: key, sortOrder: order }),
  clearFilters: () => set({ gradeFilter: null, statusFilter: null, searchQuery: "" }),
}));
