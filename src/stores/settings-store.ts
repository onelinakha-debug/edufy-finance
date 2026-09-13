import { create } from "zustand";
import { settingsApi } from "@/services/tauri-commands";

export interface SchoolProfile {
  id: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  email: string;
  motto: string;
  county: string;
}

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

interface SettingsState {
  profile: SchoolProfile | null;
  users: User[];
  loading: boolean;

  fetchProfile: (schoolId: string) => Promise<void>;
  updateProfile: (schoolId: string, data: Partial<SchoolProfile>) => Promise<void>;
  fetchUsers: (schoolId: string) => Promise<void>;
  createUser: (schoolId: string, data: { username: string; password: string; full_name: string; role: string }) => Promise<User>;
  updateUser: (userId: string, data: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  profile: null,
  users: [],
  loading: false,

  fetchProfile: async (schoolId) => {
    set({ loading: true });
    try {
      const profile = await settingsApi.getSchoolProfile(schoolId);
      set({ profile, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateProfile: async (schoolId, data) => {
    const profile = await settingsApi.updateSchoolProfile(schoolId, data);
    set({ profile });
  },

  fetchUsers: async (schoolId) => {
    set({ loading: true });
    try {
      const users = await settingsApi.listUsers(schoolId);
      set({ users: users || [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createUser: async (schoolId, data) => {
    const user = await settingsApi.createUser(schoolId, data);
    if (user) set((s) => ({ users: [...s.users, user] }));
    return user;
  },

  updateUser: async (userId, data) => {
    const user = await settingsApi.updateUser(userId, data);
    set((s) => ({
      users: s.users.map((u) => (u.id === userId ? { ...u, ...user } : u)),
    }));
  },

  deleteUser: async (userId) => {
    await settingsApi.deleteUser(userId);
    set((s) => ({ users: s.users.filter((u) => u.id !== userId) }));
  },
}));
