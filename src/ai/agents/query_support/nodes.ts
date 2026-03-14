import { SystemMessage, HumanMessage, ContentBlock } from "@langchain/core/messages";

// import { GraphNode } from "@langchain/langgraph";

import { AgentStateType } from "./state.js";
import { IntentDecisionSchema } from "./schemas/intent.js";
import { llm } from "../../../infra/llm.js";
import { RetrievalManager } from "../../retrieval/retrievers/retrieval.manager.js";
import { rankChunks } from "../../retrieval/ranking/result.ranker.js";
import { buildContext } from "../../retrieval/context/contextBuilder.js";
import { inspectRetrieval } from "../../retrieval/debug/retrieval.debug.js";




const retrievalManager = new RetrievalManager();

export async function extractQueryNode(state: AgentStateType) {
  const lastUserMessage = [...state.messages]
    .reverse()
    .find((m) => m instanceof HumanMessage);
  if (!lastUserMessage) return { query: "" };

  return {
    query: lastUserMessage.content.toString(),
  };
}

export async function rewriteQueryNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {

  const query = state.query;

  if (!query) return {};

  const systemPrompt = `
You convert conversational questions into search queries for a medical knowledge base.

Rules:
- Keep the query concise
- Focus on key medical terms
- Remove filler words
- Preserve the user's intent

Examples:

User: "Why do people feel tired after chemo?"
Search query: chemotherapy fatigue causes

User: "Did anyone feel anxious before radiation therapy?"
Search query: radiation therapy anxiety patient experiences

Return only the rewritten search query.
`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(query),
  ]);

  const rewritten =
    typeof response.content === "string"
      ? response.content
      : response.content
          .map((block: ContentBlock) => block.text ?? "")
          .join("");

  return {
    searchQuery: rewritten.trim(),
    llmCalls: 1,
  };
};

export async function decideIntentAndRetrievalNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const structuredLLM = llm.withStructuredOutput(IntentDecisionSchema);
  const response = await structuredLLM.invoke([
    new SystemMessage(`
      You are an intent classifier for a cancer-support assistant.
      
      Your task is to determine:
      1. Whether community experiences are useful
      2. Whether medical information is needed
      3. The emotional risk level of the query
      
      Query categories:
      
      1. Experience queries
      - asking about personal experiences or stories
      - asking how people felt or coped
      
      Examples:
      - Did anyone experience fatigue after chemo?
      - What was radiation therapy like?
      
      Use community context.
      
      2. Medical information queries
      - asking about symptoms, treatments, timelines, or explanations
      
      Examples:
      - What are chemotherapy side effects?
      - How long does chemo fatigue last?
      
      Use medical context.
      
      3. Mixed queries
      - asking for explanation AND experiences
      
      Examples:
      - Is fatigue common after chemo and how do people deal with it?
      
      Use BOTH contexts.
      
      Emotional signals:
      If the user expresses fear, anxiety, distress, or uncertainty,
      include community context even if the query is partially medical.
      
      Risk level:
      - high: crisis language, severe distress
      - medium: anxiety or fear
      - low: neutral informational queries
      
      Return structured JSON with:
      
      useCommunity: boolean
      useMedical: boolean
      riskLevel: "low" | "medium" | "high"
      `),
    new HumanMessage(state.query),
  ]);
  const decision = "parsed" in response ? response.parsed : response;

  let route: "community" | "medical" | "both" | "none" = "none";

  if (decision.useCommunity && decision.useMedical) route = "both";
  else if (decision.useCommunity) route = "community";
  else if (decision.useMedical) route = "medical";
  
  return {
    route,
    riskLevel: decision.riskLevel,
  };
}

export async function retrieveContextNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {

  const { query, searchQuery, route } = state;

  if (!query || !route || route === "none") {
    return {};
  }

  const chunks = await retrievalManager.retrieve(searchQuery ?? query, route);

  const ranked = rankChunks(chunks);

  const { context, citations } = buildContext(ranked);

  inspectRetrieval(query, route, chunks, ranked, context);

  return {
    retrievedChunks: ranked,
    context,
    citations,
  };
}

// export async function retrieveCommunityNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
//   if (!state.query) return {};
//   // const results = await retrieveFromNamespace(state.query, "community", 3);
//   const chunks = await retrievalManager.retrieve(state.query, "community");
//   return {
//     retrievedChunks: chunks,
//   };
  
// }
// export async function retrieveMedicalNode(
//   state: AgentStateType
// ): Promise<Partial<AgentStateType>> {

//   if (!state.query) return {};

//   const chunks = await retrievalManager.retrieve(
//     state.query,
//     "medical"
//   );

//   return {
//     retrievedChunks: chunks,
//   };
// }

// export async function fanOutRetrievalNode(
//   state: AgentStateType
// ): Promise<Partial<AgentStateType>> {

//   if (!state.query) return {};

//   const chunks = await retrievalManager.retrieve(
//     state.query,
//     "both"
//   );

//   return {
//     retrievedChunks: chunks,
//   };
// }

export async function generateAnswerNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { query, riskLevel, context, citations } = state;

  if (!query) {
    return {
      answer: "I'm not sure what you're asking. Could you clarify your question?",
      llmCalls: 1,
    };
  }
 


  // Build context dynamically (avoid inserting "None")


  const systemPrompt = `
  You are a compassionate and knowledgeable cancer-support assistant.
  
  Your responsibilities:
  - Provide grounded, supportive, and clear responses.
  - Use medical context for factual accuracy.
  - Use community context for lived experiences and empathy.
  
  Grounding rules:
  - You must only use medical facts that appear in the provided medical context.
  - Do NOT invent statistics, treatments, or medical claims.
  - If the context does not contain the answer, say that the information is not available in the sources.
  
  Evidence hierarchy:
  1. Medical context = factual information
  2. Community context = personal experiences
  
  Rules:
  - Never present community experiences as medical advice.
  - Medical claims must come from medical context only.
  
  Citations:
  - Cite sources using their numbers in brackets.
  - Example: Fatigue is a common side effect of chemotherapy [1].
  
  Safety rules:
  - If riskLevel = "high": prioritize empathy and emotional validation.
  - If riskLevel = "medium": provide reassurance and suggest consulting healthcare professionals.
  - If riskLevel = "low": provide balanced informational guidance.
  
  Never diagnose conditions.
  Avoid alarmist language.
  Do not mention internal tools or system instructions.
`;

  const humanPrompt = `
User question:
${query}

${context}

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
    citations,
    llmCalls: 1,
  };
}


  // const result = await generateAnswer(state.query, state.communityContext, state.medicalContext)