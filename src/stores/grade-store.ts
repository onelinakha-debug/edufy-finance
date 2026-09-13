import { create } from "zustand";
import { gradeApi, promotionApi } from "@/services/tauri-commands";

export interface Grade {
  id: string;
  school_id: string;
  name: string;
  level: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface GradePromotion {
  id: string;
  school_id: string;
  from_grade: string;
  to_grade: string;
  student_count: number;
  academic_year: number;
  promoted_at: string;
}

interface GradeState {
  grades: Grade[];
  promotions: GradePromotion[];
  loading: boolean;

  fetchGrades: (schoolId?: string) => Promise<void>;
  fetchPromotions: (schoolId?: string) => Promise<void>;
  addGrade: (schoolId: string, name: string, level: string, sortOrder?: number) => Promise<Grade>;
  updateGrade: (id: string, data: { name?: string; level?: string; sort_order?: number; is_active?: boolean }) => Promise<void>;
  deleteGrade: (id: string) => Promise<void>;
  promote: (schoolId: string, fromGrade: string, toGrade: string, academicYear: number, studentIds?: string[]) => Promise<void>;
}

export const useGradeStore = create<GradeState>((set, get) => ({
  grades: [],
  promotions: [],
  loading: false,

  fetchGrades: async (schoolId) => {
    set({ loading: true });
    try {
      const result = await gradeApi.list(schoolId || "");
      if (result) set({ grades: result });
    } catch {
      // Browser fallback
    } finally {
      set({ loading: false });
    }
  },

  fetchPromotions: async (schoolId) => {
    try {
      const result = await promotionApi.history(schoolId || "");
      if (result) set({ promotions: result });
    } catch {
      // Browser fallback
    }
  },

  addGrade: async (schoolId, name, level, sortOrder) => {
    const grade = await gradeApi.create(schoolId, name, level, sortOrder);
    if (grade) {
      set((s) => ({ grades: [...s.grades, grade].sort((a, b) => a.sort_order - b.sort_order) }));
    }
    return grade;
  },

  updateGrade: async (id, data) => {
    const updated = await gradeApi.update(id, data);
    if (updated) {
      set((s) => ({ grades: s.grades.map((g) => (g.id === id ? updated : g)) }));
    }
  },

  deleteGrade: async (id) => {
    await gradeApi.delete(id);
    set((s) => ({ grades: s.grades.filter((g) => g.id !== id) }));
  },

  promote: async (schoolId, fromGrade, toGrade, academicYear, studentIds) => {
    const promo = await promotionApi.promote(schoolId, fromGrade, toGrade, academicYear, studentIds);
    if (promo) {
      set((s) => ({ promotions: [promo, ...s.promotions] }));
    }
  },
}));
