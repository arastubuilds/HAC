import Link from "next/link";
import type { Metadata } from "next";
import { getPosts } from "@/services/post.service";
import { PostList } from "@/components/forum/PostList";

export const metadata: Metadata = { title: "Forum — HAC" };

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const { data: posts, total, pageSize } = await getPosts(page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-text-primary">Community Forum</h1>
          <Link
            href="/forum/new"
            className="bg-primary text-white font-semibold text-sm px-3 py-1.5 rounded-sm hover:bg-primary-hover transition-colors duration-[var(--duration-base)]"
          >
            New post
          </Link>
        </div>

        <PostList posts={posts} />

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            {page > 1 && (
              <Link
                href={`/forum?page=${page - 1}`}
                className="text-sm border border-border text-text-primary px-3 py-1.5 rounded-sm hover:bg-primary-subtle transition-colors duration-[var(--duration-base)]"
              >
                ← Prev
              </Link>
            )}
            <span className="text-sm text-text-secondary">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/forum?page=${page + 1}`}
                className="text-sm border border-border text-text-primary px-3 py-1.5 rounded-sm hover:bg-primary-subtle transition-colors duration-[var(--duration-base)]"
              >
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
