"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { OwnerActions } from "./OwnerActions";
import { ReplySection } from "./ReplySection";
import type { PostResponse } from "@hac/shared/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

interface PostDetailProps {
  post: PostResponse;
}

export function PostDetail({ post }: PostDetailProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [parentReplyId, setParentReplyId] = useState<string | undefined>(undefined);

  function openReply(id?: string) {
    setParentReplyId(id);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setParentReplyId(undefined);
  }

  return (
    <div className="max-w-[800px]">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary transition-colors duration-[var(--duration-base)] mb-6"
      >
        ← Forum
      </Link>

      <div className="flex items-center gap-2 mb-4">
        <Avatar userId={post.userId} size="md" />
        <div className="flex flex-col">
          <span className="text-sm text-text-secondary">By: {post.username}</span>
          <span className="text-xs text-text-muted">{formatDate(post.createdAt)}</span>
        </div>
      </div>

      <h1 className="font-display text-2xl font-bold text-text-primary mb-4">{post.title}</h1>
      <p className="text-base text-text-body whitespace-pre-wrap leading-relaxed mb-6">
        {post.content}
      </p>

      <div className="flex items-center gap-3">
        <OwnerActions postId={post.id} postUserId={post.userId} />
        <button
          onClick={() => openReply()}
          className="p-1.5 rounded-sm border border-border text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors duration-[var(--duration-base)]"
          aria-label="Reply"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <ReplySection
          postId={post.id}
          isModalOpen={isModalOpen}
          onClose={closeModal}
          parentReplyId={parentReplyId}
          onReply={openReply}
        />
      </div>
    </div>
  );
}
