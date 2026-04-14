import { useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  ScrollView,
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
  username: z
    .string()
    .min(3, "At least 3 characters")
    .max(30, "At most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only"),
  password: z.string().min(8, "At least 8 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type FieldErrors = Partial<
  Record<"email" | "username" | "password" | "firstName" | "lastName", string>
>;

export default function RegisterScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    setFieldErrors({});
    setFormError(null);

    const result = schema.safeParse({ email, username, password, firstName, lastName });
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setFieldErrors({
        ...(flat.email?.[0] ? { email: flat.email[0] } : {}),
        ...(flat.username?.[0] ? { username: flat.username[0] } : {}),
        ...(flat.password?.[0] ? { password: flat.password[0] } : {}),
        ...(flat.firstName?.[0] ? { firstName: flat.firstName[0] } : {}),
        ...(flat.lastName?.[0] ? { lastName: flat.lastName[0] } : {}),
      });
      return;
    }

    setIsPending(true);
    try {
      const body = {
        email,
        username,
        password,
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
      };
      const { token, user } = await api.register(body);
      await setAuth(token, user);
      // root layout's useEffect handles redirect to /(app) once status = "authenticated"
    } catch (err) {
      console.error("[register]", err);
      if (err instanceof Error && err.message.includes("409")) {
        setFormError("Email or username already taken");
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
        <ScrollView
          contentContainerClassName="px-6 py-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="mb-8 items-center">
            <Text className="font-display-bold text-3xl text-primary">HAC</Text>
            <Text
              className="mt-3 font-display-bold text-2xl text-text-primary"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Join the community
            </Text>
            <Text className="mt-1 font-body text-sm text-text-secondary">
              Create your HAC account
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
                label="Username"
                placeholder="your_username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                error={fieldErrors.username}
              />
              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                showPasswordToggle
                textContentType="newPassword"
                hint="At least 8 characters"
                error={fieldErrors.password}
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    label="First name"
                    placeholder="Alex"
                    value={firstName}
                    onChangeText={setFirstName}
                    textContentType="givenName"
                    error={fieldErrors.firstName}
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label="Last name"
                    placeholder="Smith"
                    value={lastName}
                    onChangeText={setLastName}
                    textContentType="familyName"
                    error={fieldErrors.lastName}
                  />
                </View>
              </View>
            </View>

            <Button
              className="mt-6 w-full"
              isLoading={isPending}
              onPress={handleSubmit}
            >
              Create account
            </Button>
          </View>

          {/* Footer link */}
          <Text className="mt-6 text-center font-body text-sm text-text-secondary">
            {"Already have an account? "}
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text className="font-body-semibold text-primary">Sign in</Text>
              </TouchableOpacity>
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
