import { create } from "zustand";
import type { User } from "@hac/shared/types";

interface AuthState {
  user: User | null;
  setUser: (u: User | null) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (u) => { set({ user: u }); },
  clearUser: () => { set({ user: null }); },
}));
