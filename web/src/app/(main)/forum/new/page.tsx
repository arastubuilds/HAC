"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { PostForm } from "@/components/forum/PostForm";
import type { PostResponse } from "@hac/shared/types";

export default function NewPostPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (user === null) {
      router.replace("/login");
    }
  }, [user, router]);

  if (user === null) return null;

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
    <div className="max-w-[800px]">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">New Post</h1>
      <PostForm onSubmit={handleSubmit} submitLabel="Publish post" />
    </div>
  );
}
