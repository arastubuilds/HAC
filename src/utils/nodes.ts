import { SystemMessage, HumanMessage } from "@langchain/core/messages";

import { AgentStateType } from "./state.js";
import { IntentDecisionSchema } from "./schemas/intent.js";
import { retrieveCommunity, retrieveMedical } from "./tools.js";
import { llm } from "../infra/llm.js";


export async function extractQuery(state:AgentStateType) {
    const lastUserMessage = [...state.messages].reverse().find((m) => m instanceof HumanMessage);
    if (!lastUserMessage) return { query: "" };

    return {
        query: lastUserMessage.content.toString(),
    };
}

export async function decideIntentAndRetrieval(state:AgentStateType) {
    const structuredLLM = llm.withStructuredOutput(IntentDecisionSchema);
    const response = await structuredLLM.invoke([
        new SystemMessage(`
            You are an assistant for a cancer-support platform.

            Your task is to decide:
            1. Whether community experiences are useful for this query
            2. Whether medical or professional information is needed
            3. Whether the query shows signs of emotional or safety risk

            Guidelines:
            - Use community context for lived experiences, feelings, support, or opinions
            - Use medical context for symptoms, treatments, side effects, or factual guidance
            - Mark riskLevel as "high" if the query shows distress, fear, or crisis language
            - Mark riskLevel as "medium" if there is uncertainty or anxiety
            - Otherwise mark it as "low"
            `),
            new HumanMessage(state.query),
    ]);
    const decision = "parsed" in response ? response.parsed : response;
    return {
        useCommunity: decision.useCommunity,
        useMedical: decision.useMedical,
        riskLevel: decision.riskLevel,
    }
}

export async function retrieveCommunityNode(state:AgentStateType) {
    const result = await retrieveCommunity(state.query);
    return {
        communtiyContext: result,
    };
}

export async function retrieveMedicalNode(state:AgentStateType) {
    const result = await retrieveMedical(state.query);
    return {
        medicalContext: result,
    };
}

export function fanOutRetrieval() {
    return {};
}