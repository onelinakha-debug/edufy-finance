import { create } from "zustand";

interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  school_id: string;
}

interface AppState {
  // Auth
  isAuthenticated: boolean;
  authUser: AuthUser | null;
  authToken: string | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Theme
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  toggleTheme: () => void;

  // Current school
  currentSchoolId: string | null;
  setCurrentSchoolId: (id: string | null) => void;

  // Modals
  activeModal: string | null;
  modalData: unknown;
  openModal: (name: string, data?: unknown) => void;
  closeModal: () => void;

  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "error" | "warning";
}

function loadAuth(): { user: AuthUser | null; token: string | null } {
  try {
    const token = localStorage.getItem("auth_token");
    const userRaw = localStorage.getItem("auth_user");
    if (token && userRaw) {
      return { user: JSON.parse(userRaw), token };
    }
  } catch {
    // corrupted storage
  }
  return { user: null, token: null };
}

const initial = loadAuth();

export const useAppStore = create<AppState>((set) => ({
  isAuthenticated: !!initial.token,
  authUser: initial.user,
  authToken: initial.token,
  login: (user, token) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
    set({ isAuthenticated: true, authUser: user, authToken: token, currentSchoolId: user.school_id });
  },
  logout: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    set({ isAuthenticated: false, authUser: null, authToken: null, currentSchoolId: null });
  },

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  theme: "light",
  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    }),

  currentSchoolId: initial.user?.school_id ?? null,
  setCurrentSchoolId: (id) => set({ currentSchoolId: id }),

  activeModal: null,
  modalData: null,
  openModal: (name, data) => set({ activeModal: name, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),

  toasts: [],
  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));
