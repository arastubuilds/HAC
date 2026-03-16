import { z } from "zod";
import { Citation } from "../../ai/retrieval/types/citation.types.js";

export const QueryRequestDTO = z.object({
  message: z.string().min(1),
});

export type TokenEvent  = { type: "token"; content: string };
export type StatusEvent = { type: "status"; stage: string };
export type DoneEvent   = { type: "done"; citations: Citation[]; riskLevel: string; llmCalls: number };
export type ErrorEvent  = { type: "error"; message: string };
export type QueryStreamEvent = TokenEvent | StatusEvent | DoneEvent | ErrorEvent;
