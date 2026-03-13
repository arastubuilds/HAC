import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import {
  extractQueryNode,
  decideIntentAndRetrievalNode,
  // retrieveCommunityNode,
  // retrieveMedicalNode,
  // fanOutRetrievalNode,
  generateAnswerNode,
  retrieveContextNode,
} from "./nodes.js";
import { retrievalRouter } from "./router.js";

export const cancerSupportGraph = new StateGraph(AgentState);

cancerSupportGraph
  .addNode("extractQuery", extractQueryNode)
  .addNode("decideIntent", decideIntentAndRetrievalNode)
  .addNode("retrieveContext", retrieveContextNode)
  .addNode("generateAnswer", generateAnswerNode)
  .addEdge(START, "extractQuery")
  .addEdge("extractQuery", "decideIntent")
  .addConditionalEdges("decideIntent", retrievalRouter, {
    community_only: "retrieveContext",
    medical_only: "retrieveContext",
    community_and_medical: "retrieveContext",
    no_retrieval: "generateAnswer",
  })
  .addEdge("retrieveContext", "generateAnswer")
  .addEdge("generateAnswer", END);

  export const cancerSupportAgent = cancerSupportGraph.compile();