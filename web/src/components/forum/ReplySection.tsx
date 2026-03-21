"use client";

import { useAuthStore } from "@/stores/auth.store";
import { useReplies } from "@/hooks/useReplies";
import { ReplyList } from "./ReplyList";
import { ReplyForm } from "./ReplyForm";
import { Modal } from "@/components/ui/Modal";

interface ReplySectionProps {
  postId: string;
  isModalOpen: boolean;
  onClose: () => void;
  parentReplyId: string | undefined;
  onReply: (parentReplyId: string) => void;
}

export function ReplySection({ postId, isModalOpen, onClose, parentReplyId, onReply }: ReplySectionProps) {
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
        onReply={onReply}
      />
      <Modal
        isOpen={isModalOpen}
        onClose={onClose}
        title="Add a reply"
      >
        <ReplyForm
          createReply={createReply}
          user={user}
          onClose={onClose}
          parentReplyId={parentReplyId}
        />
      </Modal>
    </div>
  );
}
