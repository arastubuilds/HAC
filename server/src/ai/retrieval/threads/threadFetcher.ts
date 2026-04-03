import { prisma } from "../../../infra/prisma.js";
import type { RetrievalChunk, ThreadContext } from "../types/retrieval.types.js";

const MAX_THREADS = 3;
const MAX_REPLIES_PER_THREAD = 10;

export async function fetchThreads(replyChunks: RetrievalChunk[]): Promise<ThreadContext[]> {
  // Step 1: group by parentPostId, track matched replyIds
  const postToMatchedReplies = new Map<string, Set<string>>();
  for (const chunk of replyChunks) {
    if (!chunk.parentPostId || !chunk.replyId) continue;
    const set = postToMatchedReplies.get(chunk.parentPostId) ?? new Set();
    set.add(chunk.replyId);
    postToMatchedReplies.set(chunk.parentPostId, set);
  }

  // Step 2: sort by match count desc, cap at MAX_THREADS
  const sorted = [...postToMatchedReplies.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, MAX_THREADS);

  // Step 3: parallel Prisma fetch
  const results = await Promise.all(
    sorted.map(([postId]) =>
      prisma.post.findUnique({
        where: { id: postId },
        select: {
          id: true, title: true, content: true, createdAt: true, threadConfidence: true,
          replies: {
            orderBy: { createdAt: "asc" },
            take: MAX_REPLIES_PER_THREAD,
            select: { id: true, content: true, createdAt: true },
          },
        },
      }).catch((err: unknown) => {
        console.error(`[fetchThreads] DB fetch failed for post ${postId}:`, err);
        return null;
      })
    )
  );

  // Step 4: assemble ThreadContext (skip deleted posts and low-quality threads)
  return results.flatMap((post) => {
    if (!post) return [];
    if (post.threadConfidence != null && post.threadConfidence < 30) return [];
    const matchedIds = postToMatchedReplies.get(post.id) ?? new Set<string>();
    return [{
      postId: post.id,
      title: post.title,
      postContent: post.content,
      postCreatedAt: post.createdAt.toISOString(),
      replies: post.replies.map(r => ({
        id: r.id,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        isMatched: matchedIds.has(r.id),
      })),
    }];
  });
}
