"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/auth.store";

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

type FieldErrors = Partial<Record<"email" | "username" | "password" | "firstName" | "lastName", string>>;

export function RegisterForm() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    startTransition(async () => {
      const body = {
        email,
        username,
        password,
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
      };

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        setFormError("Email or username already taken");
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
        id="username"
        type="text"
        label="Username"
        placeholder="your_username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        {...(fieldErrors.username ? { error: fieldErrors.username } : {})}
      />
      <Input
        id="password"
        type="password"
        label="Password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        hint="At least 8 characters"
        showPasswordToggle
        {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
      />
      <div className="flex gap-3">
        <Input
          id="firstName"
          type="text"
          label="First name"
          placeholder="Alex"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          {...(fieldErrors.firstName ? { error: fieldErrors.firstName } : {})}
        />
        <Input
          id="lastName"
          type="text"
          label="Last name"
          placeholder="Smith"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          {...(fieldErrors.lastName ? { error: fieldErrors.lastName } : {})}
        />
      </div>
      <Button type="submit" isLoading={isPending} className="mt-2 w-full">
        Create account
      </Button>
    </form>
  );
}
