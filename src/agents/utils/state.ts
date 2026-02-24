import {
    StateSchema,
    MessagesValue,
    ReducedValue,
} from "@langchain/langgraph";
import { z } from "zod";

export const AgentState = new StateSchema({
    // conversation history
    messages: MessagesValue,

    // Track how many LLM calls were made
    llmCalls: new ReducedValue(
        z.number().default(0),
        { reducer: (x, y) => x + y}
    ),

    // Current extracted query
    query: z.string().default(""),

    // Retrieved contexts
    communityContext: z.string().optional(),
    medicalContext: z.string().optional(),

    // Routing flags,
    useCommunity: z.boolean().default(false),
    useMedical: z.boolean().default(false),

    // safety signal
    riskLevel: z.enum(["low", "medium", "high"]).default("low"),

    // answer
    answer: z.string().optional(),
});

export type AgentStateType = typeof AgentState.State;