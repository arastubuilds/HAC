import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

// ─── Posts ────────────────────────────────────────────────────────────────────

export type PostResponse = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  userId: string;
  username: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

// ─── Replies ──────────────────────────────────────────────────────────────────

export type ReplyResponse = {
  id: string;
  postId: string;
  userId: string;
  parentReplyId?: string;
  content: string;
  createdAt: string;
};

// ─── Thread Reviews ───────────────────────────────────────────────────────────

export type ThreadReview = {
  id: string;
  importRunId: string;
  waThreadKey: string;
  anchorMessageKey: string;
  anchorPreview?: string | null;
  anchorSenderPseudonym?: string | null;
  anchorTimestamp?: string | null;
  candidateThread?: {
    postId: string;
    title: string;
    content: string;
    replies: Array<{
      id: string;
      content: string;
      createdAt: string;
      authorName: string;
    }>;
  } | null;
  publishDecision: string;
  threadCohesionScore: number;
  publishConfidenceScore: number;
  decisionReasons: string[];
  llmAssistedCount: number;
  llmFailedCount: number;
  requiresHumanReview: boolean;
  reviewStatus: string;
  reviewDecision: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
};

// ─── Citations ────────────────────────────────────────────────────────────────

export type Citation = {
  index: number;
  source: "community" | "medical";
  documentId: string;
  title?: string;
  type?: "post" | "reply";
  snippet?: string;
  parentPostId?: string;
};

// ─── Query stream events ──────────────────────────────────────────────────────

export type TokenEvent  = { type: "token";  content: string };
export type StatusEvent = { type: "status"; stage: string };
export type DoneEvent   = { type: "done";   citations: Citation[]; riskLevel: string; llmCalls: number };
export type ErrorEvent  = { type: "error";  message: string };

export type QueryStreamEvent = TokenEvent | StatusEvent | DoneEvent | ErrorEvent;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationDTO = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationDTO>;
