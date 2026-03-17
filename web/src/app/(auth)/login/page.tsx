import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign In — HAC" };

export default function LoginPage() {
  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-text-primary">Welcome back</h1>
        <p className="mt-1 text-sm text-text-secondary">Sign in to your account</p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-text-secondary">
        {"Don't have an account? "}
        <Link href="/register" className="font-medium text-primary hover:text-primary-hover">
          Join the community
        </Link>
      </p>
    </>
  );
}
