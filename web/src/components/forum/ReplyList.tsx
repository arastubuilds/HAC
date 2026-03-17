import { ReplyItem } from "./ReplyItem";
import type { ReplyResponse } from "@hac/shared/types";

interface ReplyListProps {
  replies: ReplyResponse[];
  isLoading: boolean;
  currentUserId?: string;
  onDelete: (id: string) => void;
}

export function ReplyList({ replies, isLoading, currentUserId, onDelete }: ReplyListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="py-4 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="skeleton h-7 w-7 rounded-full" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
            <div className="skeleton h-4 w-full rounded mt-2" />
            <div className="skeleton h-4 w-3/4 rounded mt-1" />
          </div>
        ))}
      </div>
    );
  }

  if (replies.length === 0) {
    return <p className="text-text-muted text-sm py-4">Be the first to reply.</p>;
  }

  return (
    <div>
      {replies?.map((reply) => (
        <ReplyItem
          key={reply.id}
          reply={reply}
          currentUserId={currentUserId}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
