import { RetrievalRoute, RetrievalChunk } from "../types/retrieval.types.js";
import { CommunityRetriever } from "./community.retriever.js";
import { MedicalRetriever } from "./medical.retriever.js";


export class RetrievalManager {
    private communityRetriever = new CommunityRetriever();
    private medicalRetriever = new MedicalRetriever();
  
    async retrieve(query: string, route: RetrievalRoute): Promise<RetrievalChunk[]> {
  
      if (route === "community") {
        return this.communityRetriever.retrieve(query).catch(err => {
          console.error("[RetrievalManager] community retriever failed:", err);
          return [] as RetrievalChunk[];
        });
      }

      if (route === "medical") {
        return this.medicalRetriever.retrieve(query).catch(err => {
          console.error("[RetrievalManager] medical retriever failed:", err);
          return [] as RetrievalChunk[];
        });
      }

      // route === "both"
      const [communityResults, medicalResults] = await Promise.all([
        this.communityRetriever.retrieve(query).catch(err => {
          console.error("[RetrievalManager] community retriever failed:", err);
          return [] as RetrievalChunk[];
        }),
        this.medicalRetriever.retrieve(query).catch(err => {
          console.error("[RetrievalManager] medical retriever failed:", err);
          return [] as RetrievalChunk[];
        }),
      ]);
      const COMMUNITY_LIMIT = 4;
      const MEDICAL_LIMIT = 4;
      return [...communityResults.slice(0, COMMUNITY_LIMIT), ...medicalResults.slice(0, MEDICAL_LIMIT)];
    }
}
