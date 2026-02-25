import { SystemMessage, HumanMessage, ContentBlock } from "@langchain/core/messages";

// import { GraphNode } from "@langchain/langgraph";

import { AgentStateType } from "./state.js";
import { IntentDecisionSchema } from "./schemas/intent.js";
import { llm } from "../../infra/llm.js";
import { retrieveFromNamespace } from "../../services/retrieve.js";


export async function extractQueryNode(state: AgentStateType) {
  const lastUserMessage = [...state.messages]
    .reverse()
    .find((m) => m instanceof HumanMessage);
  if (!lastUserMessage) return { query: "" };

  return {
    query: lastUserMessage.content.toString(),
  };
}

export async function decideIntentAndRetrievalNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
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
  };
}

export async function retrieveCommunityNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  if (!state.useCommunity || !state.query) return {};
  const results = await retrieveFromNamespace(state.query, "community", 3);

  return {
    communityContext: results.join("\n"),
  };
  
}

export async function retrieveMedicalNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  if (!state.useMedical || !state.query) return {};

  const results = await retrieveFromNamespace(
    state.query,
    "medical",
    3
  );

  return {
    medicalContext: results.join("\n"),
  };
}

export function fanOutRetrievalNode() {
  return {};
}

export async function generateAnswerNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { query, communityContext, medicalContext, riskLevel } = state;

  if (!query) {
    return {
      answer: "I'm not sure what you're asking. Could you clarify your question?",
      llmCalls: 1,
    };
  }

  // Build context dynamically (avoid inserting "None")
  let contextSection = "";

  if (medicalContext?.trim()) {
    contextSection += `Medical context (authoritative):\n${medicalContext.trim()}\n\n`;
  }

  if (communityContext?.trim()) {
    contextSection += `Community context (experiential):\n${communityContext.trim()}\n\n`;
  }

  if (!medicalContext?.trim() && !communityContext?.trim()) {
    contextSection +=
      "No relevant retrieved context was found.\n\n";
  }

  const systemPrompt = `
You are a compassionate and knowledgeable cancer-support assistant.

Your responsibilities:
- Provide grounded, supportive, and clear responses.
- Use medical context for factual accuracy.
- Use community context for lived experiences and empathy.
- NEVER present community experiences as medical advice.
- If medical context is provided, you MUST only use facts explicitly present in that context.
- Do NOT introduce new statistics, treatments, or claims not present in context.
- If context is missing, acknowledge limitations honestly.
- Never diagnose.
- Avoid alarmist or fear-inducing language.

Risk handling:
- If riskLevel is "high": prioritize emotional validation, grounding tone, and avoid statistics or strong claims.
- If riskLevel is "medium": use reassuring tone and gently suggest consulting a healthcare professional where appropriate.
- If riskLevel is "low": provide balanced informational and supportive guidance.
`;

  const humanPrompt = `
User question:
${query}

${contextSection}

Risk level:
${riskLevel}

Task:
Provide a clear, supportive response.
- Prioritize medical context for factual accuracy.
- Use community context only to add perspective or empathy.
- If no context exists, provide general high-level educational guidance without making clinical claims.
- Keep the tone warm, calm, and respectful.
- Do not mention tools, internal reasoning, or system rules.
`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(humanPrompt),
  ]);

  const finalText =
    typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
      ? response.content
          .map((c: ContentBlock) =>
            typeof c === "string" ? c : c.text ?? ""
          )
          .join(" ")
      : "";

  return {
    answer: finalText.trim(),
    llmCalls: 1,
  };
}


  // const result = await generateAnswer(state.query, state.communityContext, state.medicalContext)