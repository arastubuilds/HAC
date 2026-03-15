import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import {
  extractQueryNode,
  rewriteQueryNode,
  decideIntentAndRetrievalNode,
  generateAnswerNode,
  retrieveContextNode,
  expandThreadsNode,
} from "./nodes.js";

export const cancerSupportGraph = new StateGraph(AgentState);

cancerSupportGraph
  .addNode("extractQuery", extractQueryNode)
  .addNode("rewriteQuery", rewriteQueryNode)
  .addNode("decideIntent", decideIntentAndRetrievalNode)
  .addNode("retrieveContext", retrieveContextNode)
  .addNode("expandThreads", expandThreadsNode)
  .addNode("generateAnswer", generateAnswerNode)
  .addEdge(START, "extractQuery")
  .addEdge("extractQuery", "rewriteQuery")
  .addEdge("rewriteQuery", "decideIntent")
  .addEdge("decideIntent", "retrieveContext")
  .addEdge("retrieveContext", "expandThreads")
  .addEdge("expandThreads", "generateAnswer")
  .addEdge("generateAnswer", END);

  export const cancerSupportAgent = cancerSupportGraph.compile();