import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import {
  extractQueryNode,
  decideIntentAndRetrievalNode,
  retrieveCommunityNode,
  retrieveMedicalNode,
  fanOutRetrievalNode,
  generateAnswerNode,
} from "./nodes.js";
import { retrievalRouter } from "./router.js";

export const cancerSupportGraph = new StateGraph(AgentState);

cancerSupportGraph
  .addNode("extractQuery", extractQueryNode)
  .addNode("decideIntent", decideIntentAndRetrievalNode)
  .addNode("retrieveCommunity", retrieveCommunityNode)
  .addNode("retrieveMedical", retrieveMedicalNode)
  .addNode("fanOutRetrieval", fanOutRetrievalNode)
  .addNode("generateAnswer", generateAnswerNode)
  .addEdge(START, "extractQuery")
  .addEdge("extractQuery", "decideIntent")
  .addConditionalEdges("decideIntent", retrievalRouter, {
    community_only: "retrieveCommunity",
    medical_only: "retrieveMedical",
    community_and_medical: "fanOutRetrieval",
    no_retrieval: END,
  })
  .addEdge("fanOutRetrieval", "retrieveCommunity")
  .addEdge("fanOutRetrieval", "retrieveMedical")
  .addEdge("retrieveCommunity", "generateAnswer")
  .addEdge("retrieveMedical", "generateAnswer")
  .addEdge("generateAnswer", END);

  export const cancerSupportAgent = cancerSupportGraph.compile();