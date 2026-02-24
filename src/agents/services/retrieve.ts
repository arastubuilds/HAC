import { pineconeIndex } from "../../infra/pinecone.js";
import { embeddingsModel } from "../../infra/embeddings.js";

export async function retrieveFromNamespace(
  query: string,
  namespace: "community" | "medical",
  k = 3
): Promise<string[]> {
  const embedding = await embeddingsModel.embedQuery(
    `query: ${query}`
  );

  const res = await pineconeIndex.query({
    vector: embedding,
    topK: k,
    namespace,
    includeMetadata: true,
  });

  if (!res.matches?.length) return [];

  return res.matches
    .map(m => m.metadata?.text)
    .filter((t): t is string => typeof t === "string");
}