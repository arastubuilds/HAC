"use client";

import { useAuthStore } from "@/stores/auth.store";
import { useReplies } from "@/hooks/useReplies";
import { ReplyList } from "./ReplyList";
import { ReplyForm } from "./ReplyForm";

interface ReplySectionProps {
  postId: string;
}

export function ReplySection({ postId }: ReplySectionProps) {
  const user = useAuthStore((s) => s.user);
  const { query, createReply, deleteReply } = useReplies(postId);

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-text-primary mb-6">Replies</h2>
      <ReplyList
        replies={query.data ?? []}
        isLoading={query.isLoading}
        currentUserId={user?.id}
        onDelete={(id) => deleteReply.mutate(id)}
      />
      <div className="mt-8">
        <ReplyForm createReply={createReply} user={user} />
      </div>
    </div>
  );
}
