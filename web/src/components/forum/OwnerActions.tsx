"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

interface OwnerActionsProps {
  postId: string;
  postUserId: string;
}

export function OwnerActions({ postId, postUserId }: OwnerActionsProps) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user || user.id !== postUserId) return null;

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        router.push("/forum");
      } else if (res.status === 403) {
        alert("You don't have permission to delete this post.");
        setConfirmDelete(false);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => router.push(`/forum/${postId}/edit`)}
        className="p-1.5 rounded-sm border border-border text-text-secondary hover:text-primary hover:bg-primary-subtle transition-colors duration-[var(--duration-base)]"
        aria-label="Edit post"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      {confirmDelete ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Sure?</span>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-sm font-medium text-error hover:underline disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Yes"}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="p-1.5 rounded-sm text-text-secondary hover:text-error transition-colors duration-[var(--duration-base)]"
          aria-label="Delete post"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
