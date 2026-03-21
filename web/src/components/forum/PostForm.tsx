"use client";

import { useState } from "react";
import Link from "next/link";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

interface PostFormProps {
  defaultValues?: { title: string; content: string };
  onSubmit: (data: { title: string; content: string }) => Promise<void>;
  submitLabel: string;
}

export function PostForm({ defaultValues, onSubmit, submitLabel }: PostFormProps) {
  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [content, setContent] = useState(defaultValues?.content ?? "");
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: { title?: string; content?: string } = {};
    if (title.trim().length < 3) newErrors.title = "Title must be at least 3 characters.";
    if (content.trim().length < 10) newErrors.content = "Content must be at least 10 characters.";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setIsLoading(true);
    try {
      await onSubmit({ title: title.trim(), content: content.trim() });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5 sm:p-8 shadow-[var(--shadow-card)]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <input
            id="post-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your post a title..."
            className="w-full text-xl sm:text-2xl font-semibold text-text-primary placeholder:text-text-muted bg-transparent border-0 border-b border-border pb-3 mb-1 focus:outline-none focus:border-primary transition-colors"
          />
          {errors.title && (
            <p role="alert" className="text-xs text-error mt-1">{errors.title}</p>
          )}
        </div>
        <Textarea
          label="Content"
          id="post-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share your experience or question..."
          error={errors.content}
          className="min-h-[200px]"
        />
        <div className="flex justify-between items-center mt-6">
          <Link
            href="/forum"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Cancel
          </Link>
          <Button type="submit" isLoading={isLoading}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
