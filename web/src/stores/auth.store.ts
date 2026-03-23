import { create } from "zustand";
import type { User } from "@hac/shared/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  setUser: (u: User) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  setUser: (u) => { set({ status: "authenticated", user: u }); },
  clearUser: () => { set({ status: "unauthenticated", user: null }); },
}));
