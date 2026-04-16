import "../global.css";
import { useEffect } from "react";
import { useSegments, useRouter, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Fraunces_400Regular,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { useAuthStore } from "../src/stores/auth.store";
import { Providers } from "../src/providers/Providers";

SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from "expo-router";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const hydrate = useAuthStore((s) => s.hydrate);
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  // Hydrate auth state once on mount
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Hide splash once fonts loaded and auth resolved
  useEffect(() => {
    if ((fontsLoaded || fontError) && status !== "loading") {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, status]);

  // Route protection — runs after hydration settles.
  // setTimeout defers the replace until after the current render cycle so
  // nested navigators ((app) tabs, (auth) stack) have time to register.
  useEffect(() => {
    if (status === "loading") return;
    const inAuthGroup = segments[0] === "(auth)";
    const inAppGroup = segments[0] === "(app)";
    if (status === "unauthenticated" && !inAuthGroup) {
      setTimeout(() => router.replace("/(auth)/login"), 0);
    } else if (status === "authenticated" && !inAppGroup) {
      setTimeout(() => router.replace("/(app)/forum"), 0);
    }
  }, [status, segments, router]);

  // Block render until fonts and auth are ready
  if ((!fontsLoaded && !fontError) || status === "loading") {
    return null;
  }

  return (
    <Providers>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </Providers>
  );
}
