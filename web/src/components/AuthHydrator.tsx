"use client";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import type { User } from "@hac/shared/types";

export function AuthHydrator() {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? (res.json() as Promise<User>) : Promise.reject()))
      .then((user) => setUser(user))
      .catch(() => setUser(null));
  }, [setUser]);

  return null;
}
