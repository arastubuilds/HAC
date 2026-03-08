import { AgentStateType } from "./state.js";

export type RetrievalRoute = "community_only" | "medical_only" | "community_and_medical" | "no_retrieval";

export function retrievalRouter(state: AgentStateType): RetrievalRoute {
    const { useCommunity, useMedical } = state;
    
    if (useCommunity && useMedical) return "community_and_medical";
    if (useCommunity) return "community_only";
    if (useMedical) return "medical_only";
    return "no_retrieval";
}

