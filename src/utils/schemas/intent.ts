import { z } from "zod";

export const IntentDecisionSchema = z.object({
  useCommunity: z
    .boolean()
    .describe("Whether to retrieve from community posts and lived experiences"),
  useMedical: z
    .boolean()
    .describe(
      "Whether to retrieve from medical guides and professional documents",
    ),
  riskLevel: z
    .enum(["low", "medium", "high"])
    .describe("Estimated emotional or safety risk level of the query"),
});
