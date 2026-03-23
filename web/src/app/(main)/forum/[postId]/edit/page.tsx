"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { PostForm } from "@/components/forum/PostForm";
import type { PostResponse } from "@hac/shared/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function EditPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = use(params);
  const router = useRouter();
  const { status, user } = useAuthStore((s) => ({ status: s.status, user: s.user }));

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  const { data: post, isLoading, error } = useQuery({
    queryKey: ["post", postId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/posts/${postId}`);
      if (!res.ok) throw new Error("Failed to load post");
      return res.json() as Promise<PostResponse>;
    },
    enabled: status === "authenticated",
  });

  if (status !== "authenticated" || !user) return null;
  if (isLoading) return <div className="skeleton h-64 w-full rounded-md" />;
  if (error) return <p className="text-error">Failed to load post.</p>;
  if (!post) return null;

  if (post.userId !== user.id) {
    return <p className="text-error">You don&apos;t have permission to edit this post.</p>;
  }

  async function handleSubmit(data: { title: string; content: string }) {
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.status === 403) throw new Error("You don't have permission to edit this post.");
    if (!res.ok) throw new Error("Failed to update post");
    router.push(`/forum/${postId}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href={`/forum/${postId}`} className="text-sm text-text-secondary hover:text-text-primary transition-colors">
          ← Post
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary mt-2">
          Edit post
        </h1>
      </div>
      <PostForm
        defaultValues={{ title: post.title, content: post.content }}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
      />
    </div>
  );
}
