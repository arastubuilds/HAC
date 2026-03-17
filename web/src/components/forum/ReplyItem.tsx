import { Avatar } from "@/components/ui/Avatar";
import type { ReplyResponse } from "@hac/shared/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ReplyItemProps {
  reply: ReplyResponse;
  currentUserId?: string;
  onDelete: (id: string) => void;
}

export function ReplyItem({ reply, currentUserId, onDelete }: ReplyItemProps) {
  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 mb-2">
          <Avatar userId={reply.userId} size="sm" />
          <span className="text-sm text-text-secondary">{reply.userId.slice(0, 8)}</span>
          <span className="text-xs text-text-muted">{formatDate(reply.createdAt)}</span>
        </div>
        {currentUserId && reply.userId === currentUserId && (
          <button
            onClick={() => onDelete(reply.id)}
            className="text-xs text-text-muted hover:text-error transition-colors duration-[var(--duration-base)] shrink-0"
          >
            Delete
          </button>
        )}
      </div>
      <p className="text-base text-text-body pl-9">{reply.content}</p>
    </div>
  );
}
