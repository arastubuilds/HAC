import { type RetrievalRoute, type RetrievalChunk } from "../types/retrieval.types.js";
import { CommunityRetriever } from "./community.retriever.js";
import { MedicalRetriever } from "./medical.retriever.js";
import { embeddingsModel } from "../../../infra/embeddings.js";


export class RetrievalManager {
    private communityRetriever = new CommunityRetriever();
    private medicalRetriever = new MedicalRetriever();

    async retrieve(query: string, route: RetrievalRoute): Promise<RetrievalChunk[]> {
      // Embed once, reuse vector across retrievers
      const vector = await embeddingsModel.embedQuery(query);

      if (route === "community") {
        return this.communityRetriever.retrieveWithVector(vector).catch((err: unknown) => {
          console.error("[RetrievalManager] community retriever failed:", err);
          return [] as RetrievalChunk[];
        });
      }

      if (route === "medical") {
        return this.medicalRetriever.retrieveWithVector(vector).catch((err: unknown) => {
          console.error("[RetrievalManager] medical retriever failed:", err);
          return [] as RetrievalChunk[];
        });
      }

      // route === "both"
      const [communityResults, medicalResults] = await Promise.all([
        this.communityRetriever.retrieveWithVector(vector).catch((err: unknown) => {
          console.error("[RetrievalManager] community retriever failed:", err);
          return [] as RetrievalChunk[];
        }),
        this.medicalRetriever.retrieveWithVector(vector).catch((err: unknown) => {
          console.error("[RetrievalManager] medical retriever failed:", err);
          return [] as RetrievalChunk[];
        }),
      ]);
      const COMMUNITY_LIMIT = 4;
      const MEDICAL_LIMIT = 4;
      return [...communityResults.slice(0, COMMUNITY_LIMIT), ...medicalResults.slice(0, MEDICAL_LIMIT)];
    }
}
