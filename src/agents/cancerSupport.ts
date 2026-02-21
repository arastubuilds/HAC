import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "../utils/state.js";
import { extractQuery, decideIntentAndRetrieval, retrieveCommunityNode, retrieveMedicalNode, fanOutRetrieval } from "../utils/nodes.js";
import { retrievalRouter } from "../utils/router.js";


export const cancerSupportGraph = new StateGraph(AgentState);

cancerSupportGraph
    .addNode("extractQuery", extractQuery)
    .addNode("decideIntent", decideIntentAndRetrieval)
    .addNode("retrieveCommunity",  retrieveCommunityNode)
    .addNode("retrieveMedical",  retrieveMedicalNode)
    .addNode("fanOutRetrieval", fanOutRetrieval)
    .addEdge(START, "extractQuery")
    .addEdge("extractQuery", "decideIntent")
    .addConditionalEdges
    (
        "decideIntent", retrievalRouter, 
        {
            community_only: "retrieveCommunity",
            medical_only: "retrieveMedical",
            community_and_medical: "fanOutRetrieval",
            no_retrieval: END
        }
    )
    .addEdge("fanOutRetrieval", "retrieveCommunity")
    .addEdge("fanOutRetrieval", "retrieveMedical")
    .addEdge("retrieveCommunity", END)
    .addEdge("retrieveMedical", END)
