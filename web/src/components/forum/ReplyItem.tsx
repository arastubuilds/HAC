import { Avatar } from "@/components/ui/Avatar";
import type { ReplyResponse } from "@hac/shared/types";

export interface ReplyNode extends ReplyResponse {
  children: ReplyNode[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ReplyItemProps {
  node: ReplyNode;
  currentUserId?: string;
  onDelete: (id: string) => void;
  onReply: (parentReplyId: string) => void;
  depth: number;
}

export function ReplyItem({ node, currentUserId, onDelete, onReply, depth }: ReplyItemProps) {
  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 mb-2">
          <Avatar userId={node.userId} size="sm" />
          <span className="text-sm text-text-secondary">{node.userId.slice(0, 8)}</span>
          <span className="text-xs text-text-muted">{formatDate(node.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onReply(node.id)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors duration-[var(--duration-base)]"
            aria-label="Reply to this comment"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Reply
          </button>
          {currentUserId && node.userId === currentUserId && (
            <button
              onClick={() => onDelete(node.id)}
              className="flex items-center text-text-muted hover:text-error transition-colors duration-[var(--duration-base)]"
              aria-label="Delete reply"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="sr-only">Delete</span>
            </button>
          )}
        </div>
      </div>
      <p className="text-base text-text-body pl-9">{node.content}</p>
      {node.children.length > 0 && (
        <div className={`mt-3 ${depth < 3 ? "pl-4 sm:pl-6 border-l-2 border-border" : ""}`}>
          {node.children.map((child) => (
            <ReplyItem
              key={child.id}
              node={child}
              currentUserId={currentUserId}
              onDelete={onDelete}
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
