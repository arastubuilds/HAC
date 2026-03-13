import { z } from "zod";

export const QueryRequestDTO = z.object({
  message: z.string().min(1),
});

export type QueryResponse = {
  answer: string;
  citations: { index: number; source: string; documentId: string; title?: string }[];
  riskLevel: string;
  llmCalls: number;
};
