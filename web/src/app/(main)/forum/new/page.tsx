"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { PostForm } from "@/components/forum/PostForm";
import type { PostResponse } from "@hac/shared/types";

export default function NewPostPage() {
  const router = useRouter();
  const { status, user } = useAuthStore((s) => ({ status: s.status, user: s.user }));
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") return null;

  async function handleSubmit(data: { title: string; content: string }) {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create post");
    const post = (await res.json()) as PostResponse;
    startTransition(() => {
      router.push(`/forum/${post.id}`);
    });
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/forum" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
          ← Forum
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary mt-2">
          Start a conversation
        </h1>
      </div>
      <PostForm onSubmit={handleSubmit} submitLabel="Publish post" />
    </div>
  );
}
