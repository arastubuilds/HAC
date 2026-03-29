import { prisma } from "../infra/prisma.js";

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
  return prisma.threadReview.findMany({
    where: {
      reviewStatus:       "pending",
      requiresHumanReview: true,
      ...(importRunId && { importRunId }),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getReviewById(id: string) {
  return prisma.threadReview.findUnique({ where: { id } });
}

export async function listReviews(filters?: {
  status?: string | undefined;
  importRunId?: string | undefined;
  publishDecision?: string | undefined;
}) {
  return prisma.threadReview.findMany({
    where: {
      ...(filters?.status && { reviewStatus: filters.status }),
      ...(filters?.importRunId && { importRunId: filters.importRunId }),
      ...(filters?.publishDecision && { publishDecision: filters.publishDecision }),
    },
    orderBy: { createdAt: "asc" },
  });
}
