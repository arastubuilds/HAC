import { z } from "zod";
import { type Citation } from "../../ai/retrieval/types/citation.types.js";

export const QueryRequestDTO = z.object({
  message: z.string().min(1),
});

export interface TokenEvent { type: "token"; content: string }
export interface StatusEvent { type: "status"; stage: string }
export interface DoneEvent { type: "done"; citations: Citation[]; riskLevel: string; llmCalls: number }
export interface ErrorEvent { type: "error"; message: string }
export type QueryStreamEvent = TokenEvent | StatusEvent | DoneEvent | ErrorEvent;
