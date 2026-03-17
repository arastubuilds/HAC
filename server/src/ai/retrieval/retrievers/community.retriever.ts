import { embeddingsModel } from "../../../infra/embeddings.js";
import { pineconeIndex } from "../../../infra/pinecone.js";
import { type RetrievalChunk } from "../types/retrieval.types.js";
import { type Retriever } from "./retriever.interface.js";

import { asNumber, asString } from "../utils/metadata.js";

export class CommunityRetriever implements Retriever {
    async retrieve(query: string): Promise<RetrievalChunk[]> {
      const embedding = await embeddingsModel.embedQuery(query);
  
      const results = await pineconeIndex.query({
        namespace: "community",
        vector: embedding,
        topK: 10,
        includeMetadata: true,
      });
  
      return (
        results.matches.flatMap((match) => {
          const metaType = asString(match.metadata?.type);
          const replyId = asString(match.metadata?.replyId);
          const postId = asString(match.metadata?.postId);

          const isReply = metaType === "reply";
          const sourceId = isReply ? replyId : postId;
          if (!sourceId) return [];

          const chunk: RetrievalChunk = {
            text: asString(match.metadata?.text) ?? "",
            source: "community",
            type: isReply ? "reply" : "post",
            sourceId,
            score: asNumber(match.score) ?? 0,
          };

          if (isReply) {
            if (replyId) chunk.replyId = replyId;
            if (postId) chunk.parentPostId = postId;
          }

          const title = asString(match.metadata?.title);
          if (title) chunk.title = title;

          const createdAt = asString(match.metadata?.createdAt);
          if (createdAt) chunk.createdAt = createdAt;

          const chunkIndex = asNumber(match.metadata?.chunkIndex);
          if (chunkIndex !== undefined) chunk.chunkIndex = chunkIndex;

          return [chunk];
        })
      );
    }
  }