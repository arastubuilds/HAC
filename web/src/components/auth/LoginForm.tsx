"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/auth.store";

const schema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 401) {
        setFormError("Invalid email or password");
        return;
      }
      if (!res.ok) {
        setFormError("Something went wrong. Please try again.");
        return;
      }
      const { user } = (await res.json()) as { user: import("@hac/shared/types").User };
      setUser(user);
      router.push("/forum");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {formError && (
        <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">
          {formError}
        </div>
      )}
      <Input
        id="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
      />
      <Input
        id="password"
        type="password"
        label="Password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        showPasswordToggle
        {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
      />
      <Button type="submit" isLoading={isPending} className="mt-2 w-full">
        Sign in
      </Button>
    </form>
  );
}
