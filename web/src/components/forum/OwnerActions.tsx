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
        className="text-sm font-medium border border-border text-text-primary px-3 py-1.5 rounded-sm hover:bg-primary-subtle transition-colors duration-[var(--duration-base)]"
      >
        Edit
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
          className="text-sm font-medium text-error hover:underline"
        >
          Delete
        </button>
      )}
    </div>
  );
}
