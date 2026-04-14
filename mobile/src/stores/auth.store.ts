import { create } from "zustand";
import type { User } from "@hac/shared/types";
import { deleteToken, getToken, setToken } from "../lib/auth";
import { API_BASE_URL } from "../lib/config";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  token: null,
  user: null,

  setAuth: async (token, user) => {
    await setToken(token);
    set({ status: "authenticated", token, user });
  },

  logout: async () => {
    await deleteToken();
    set({ status: "unauthenticated", token: null, user: null });
  },

  hydrate: async () => {
    set({ status: "loading" });
    const token = await getToken();

    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }

    try {
      // Raw fetch — intentionally avoids importing api.ts to prevent circular dep
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        await deleteToken();
        set({ status: "unauthenticated", token: null, user: null });
        return;
      }

      const user = (await res.json()) as User;
      set({ status: "authenticated", token, user });
    } catch (err) {
      console.error("[hydrate]", err);
      await deleteToken();
      set({ status: "unauthenticated", token: null, user: null });
    }
  },
}));
