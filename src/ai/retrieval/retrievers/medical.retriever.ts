import { embeddingsModel } from "../../../infra/embeddings.js";
import { pineconeIndex } from "../../../infra/pinecone.js";

import { RetrievalChunk } from "../types/retrieval.types.js";
import { Retriever } from "./retriever.interface.js";

import { asNumber, asString } from "../utils/metadata.js";

export class MedicalRetriever implements Retriever {
  async retrieve(query: string): Promise<RetrievalChunk[]> {
    const embedding = await embeddingsModel.embedQuery(query);

    const results = await pineconeIndex.query({
      namespace: "medical",
      vector: embedding,
      topK: 10,
      includeMetadata: true,
    });

    return (
      results.matches?.flatMap((match) => {
        const sourceId = asString(match.metadata?.sourceId);
        if (!sourceId) return [];

        const chunk: RetrievalChunk = {
          text: asString(match.metadata?.text) ?? "",
          source: "medical",
          sourceId,
          score: asNumber(match.score) ?? 0,
        };

        const title = asString(match.metadata?.title);
        if (title) chunk.title = title;

        const chunkIndex = asNumber(match.metadata?.chunkIndex);
        if (chunkIndex !== undefined) chunk.chunkIndex = chunkIndex;

        return [chunk];
      }) ?? []
    );
  }
}