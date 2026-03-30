import { prisma } from "../infra/prisma.js";

function authorName(user: { username: string; firstName: string | null; lastName: string | null }): string {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  return user.username;
}

async function enrichReviews<T extends { importRunId: string; anchorMessageKey: string; waThreadKey: string }>(
  reviews: T[],
): Promise<Array<T & {
  anchorPreview: string | null;
  anchorSenderPseudonym: string | null;
  anchorTimestamp: string | null;
  candidateThread: {
    postId: string;
    title: string;
    content: string;
    replies: Array<{ id: string; content: string; createdAt: string; authorName: string }>;
  } | null;
}>> {
  if (reviews.length === 0) return [];

  const importRunIds = [...new Set(reviews.map(r => r.importRunId))];
  const anchorKeys = [...new Set(reviews.map(r => r.anchorMessageKey))];
  const waThreadKeys = [...new Set(reviews.map(r => r.waThreadKey))];

  const [anchors, posts] = await Promise.all([
    prisma.messageStaging.findMany({
      where: {
        importRunId: { in: importRunIds },
        waMessageKey: { in: anchorKeys },
      },
      select: {
        importRunId: true,
        waMessageKey: true,
        rawBody: true,
        senderPseudonym: true,
        timestamp: true,
      },
    }),
    prisma.post.findMany({
      where: { waThreadKey: { in: waThreadKeys } },
      select: {
        id: true,
        waThreadKey: true,
        title: true,
        content: true,
        replies: {
          orderBy: { createdAt: "asc" },
          take: 6,
          select: {
            id: true,
            content: true,
            createdAt: true,
            user: { select: { username: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  const anchorByKey = new Map<string, (typeof anchors)[number]>();
  for (const a of anchors) {
    anchorByKey.set(`${a.importRunId}::${a.waMessageKey}`, a);
  }

  const postByThreadKey = new Map<string, (typeof posts)[number]>();
  for (const p of posts) {
    if (!p.waThreadKey) continue;
    postByThreadKey.set(p.waThreadKey, p);
  }

  return reviews.map((r) => {
    const anchor = anchorByKey.get(`${r.importRunId}::${r.anchorMessageKey}`) ?? null;
    const post = postByThreadKey.get(r.waThreadKey) ?? null;
    return {
      ...r,
      anchorPreview: anchor?.rawBody ?? null,
      anchorSenderPseudonym: anchor?.senderPseudonym ?? null,
      anchorTimestamp: anchor?.timestamp.toISOString() ?? null,
      candidateThread: post ? {
        postId: post.id,
        title: post.title,
        content: post.content,
        replies: post.replies.map(rep => ({
          id: rep.id,
          content: rep.content,
          createdAt: rep.createdAt.toISOString(),
          authorName: authorName(rep.user),
        })),
      } : null,
    };
  });
}

export async function resolveThreadReview(
  id: string,
  decision: "approved" | "rejected",
  reason: string,
  reviewedBy: string,
): Promise<void> {
  await prisma.threadReview.update({
    where: { id },
    data: {
      reviewStatus:   decision === "approved" ? "approved" : "rejected",
      reviewDecision: decision,
      reviewReason:   reason,
      reviewedAt:     new Date(),
      reviewedBy,
    },
  });
}

export async function getPendingReviews(importRunId?: string) {
  const rows = await prisma.threadReview.findMany({
    where: {
      reviewStatus:       "pending",
      requiresHumanReview: true,
      ...(importRunId && { importRunId }),
    },
    orderBy: { createdAt: "asc" },
  });
  return enrichReviews(rows);
}

export async function getReviewById(id: string) {
  return prisma.threadReview.findUnique({ where: { id } });
}

export async function listReviews(filters?: {
  status?: string | undefined;
  importRunId?: string | undefined;
  publishDecision?: string | undefined;
}) {
  const rows = await prisma.threadReview.findMany({
    where: {
      ...(filters?.status && { reviewStatus: filters.status }),
      ...(filters?.importRunId && { importRunId: filters.importRunId }),
      ...(filters?.publishDecision && { publishDecision: filters.publishDecision }),
    },
    orderBy: { createdAt: "asc" },
  });
  return enrichReviews(rows);
}
