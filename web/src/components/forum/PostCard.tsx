import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { PostResponse } from "@hac/shared/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface PostCardProps {
  post: PostResponse;
  index: number;
}

export function PostCard({ post, index }: PostCardProps) {
  return (
    <Link
      href={`/forum/${post.id}`}
      className="block border-b border-border px-0 py-5 transition-colors duration-[var(--duration-base)] hover:bg-primary-subtle animate-card-enter"
      style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
    >
      {/* Author row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Avatar userId={post.userId} size="sm" />
          <span className="text-sm text-text-secondary">By: {post.username}</span>
        </div>
        <span className="text-xs text-text-muted">{formatDate(post.createdAt)}</span>
      </div>

      {/* Title */}
      <h2 className="text-lg font-semibold text-text-primary">{post.title}</h2>

      {/* Excerpt */}
      <p className="text-base text-text-body line-clamp-2 mt-1">{post.content}</p>

      {/* Stats row */}
      <div className="flex items-center gap-1.5 mt-2">
        <svg
          className="h-4 w-4 text-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
          />
        </svg>
        <span className="text-sm text-text-secondary">— replies</span>
      </div>
    </Link>
  );
}
