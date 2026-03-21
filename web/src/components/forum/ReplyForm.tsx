"use client";

import { useState } from "react";
import Link from "next/link";
import type { User } from "@hac/shared/types";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import type { useReplies } from "@/hooks/useReplies";

type CreateReplyMutation = ReturnType<typeof useReplies>["createReply"];

interface ReplyFormProps {
  createReply: CreateReplyMutation;
  user: User | null;
  onClose?: () => void;
  parentReplyId?: string;
}

export function ReplyForm({ createReply, user, onClose, parentReplyId }: ReplyFormProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | undefined>();

  if (!user) {
    return (
      <p className="text-sm text-text-secondary">
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>{" "}
        to reply.
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (content.trim().length < 1) {
      setError("Reply cannot be empty.");
      return;
    }
    setError(undefined);
    createReply.mutate({ content: content.trim(), parentReplyId }, {
      onSuccess: () => {
        setContent("");
        onClose?.();
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Textarea
        label="Your reply"
        id="reply-content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share your thoughts..."
        error={error}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" isLoading={createReply.isPending} size="md">
          Post reply
        </Button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
