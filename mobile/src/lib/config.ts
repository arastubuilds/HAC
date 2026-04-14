import { Platform } from "react-native";

// iOS simulator uses localhost; Android emulator routes to host via 10.0.2.2
const fallback =
  Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://localhost:3001";

export const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? fallback).replace(/\/$/, "");
