import { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { z } from "zod";
import { api } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth.store";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";

const schema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

export default function LoginScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setFieldErrors({});
    setFormError(null);

    const result = schema.safeParse({ email, password });
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setFieldErrors({
        ...(flat.email?.[0] ? { email: flat.email[0] } : {}),
        ...(flat.password?.[0] ? { password: flat.password[0] } : {}),
      });
      return;
    }

    setIsPending(true);
    try {
      const { token, user } = await api.login(email, password);
      await setAuth(token, user);
      // root layout's useEffect handles redirect to /(app) once status = "authenticated"
    } catch (err) {
      console.error("[login]", err);
      if (err instanceof Error && err.message === "Unauthorized") {
        setFormError("Invalid email or password");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-page-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 justify-center px-6">
          {/* Header */}
          <View className="mb-8 items-center">
            <Text className="font-display-bold text-3xl text-primary">HAC</Text>
            <Text
              className="mt-3 font-display-bold text-2xl text-text-primary"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Welcome Back
            </Text>
            <Text className="mt-1 font-body text-sm text-text-secondary">
              Sign in to your account
            </Text>
          </View>

          {/* Card */}
          <View className="rounded-xl bg-surface p-6" style={{ elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 }}>
            {formError && (
              <View className="mb-4 rounded-md bg-error/10 px-4 py-3">
                <Text className="font-body text-sm text-error">{formError}</Text>
              </View>
            )}

            <View className="gap-4">
              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                error={fieldErrors.email}
              />
              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                showPasswordToggle
                textContentType="password"
                error={fieldErrors.password}
              />
            </View>

            <Button
              className="mt-6 w-full"
              isLoading={isPending}
              onPress={handleSubmit}
            >
              Sign in
            </Button>
          </View>

          {/* Footer link */}
          <Text className="mt-6 text-center font-body text-sm text-text-secondary">
            {"Don't have an account? "}
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text className="font-body-semibold text-primary">
                  Join the community
                </Text>
              </TouchableOpacity>
            </Link>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
