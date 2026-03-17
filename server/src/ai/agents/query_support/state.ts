import {
    StateSchema,
    MessagesValue,
    ReducedValue,
} from "@langchain/langgraph";

import { z } from "zod";

import { type RetrievalChunk } from "../../retrieval/types/retrieval.types.js";
import { type Citation } from "../../retrieval/types/citation.types.js";

export const AgentState = new StateSchema({
    // conversation history
    messages: MessagesValue,

    // Track how many LLM calls were made
    llmCalls: new ReducedValue(
        z.number().default(0),
        { reducer: (x: number, y: number) => x + y}
    ),

    // original user intent
    query: z.string().default(""),

    // optimized retireval query
    searchQuery: z.string().optional(),
    // Retrieved contexts
    // communityContext: z.string().optional(),
    // medicalContext: z.string().optional(),

    retrievedChunks: z.custom<RetrievalChunk[]>().optional(),
    context: z.string().optional(),
    citations: z.custom<Citation[]>().optional(),

    route: z.enum(["community", "medical", "both", "none"]).optional(),

    // Routing flags,
    // useCommunity: z.boolean().default(false),
    // useMedical: z.boolean().default(false),

    // safety signal
    riskLevel: z.enum(["low", "medium", "high"]).default("low"),

    // answer
    answer: z.string().optional(),
});

export type AgentStateType = typeof AgentState.State;