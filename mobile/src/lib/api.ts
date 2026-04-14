import { ApiClient } from "@hac/shared/lib";
import { useAuthStore } from "../stores/auth.store";
import { API_BASE_URL } from "./config";

export const api = new ApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => {
    useAuthStore.getState().logout();
  },
});
