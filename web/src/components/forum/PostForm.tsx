"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Title"
        id="post-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Give your post a title..."
        error={errors.title}
      />
      <Textarea
        label="Content"
        id="post-content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share your experience or question..."
        error={errors.content}
      />
      <div>
        <Button type="submit" isLoading={isLoading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
