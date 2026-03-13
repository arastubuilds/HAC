import { pineconeIndex } from "../infra/pinecone.js";
import { embeddingsModel } from "../infra/embeddings.js";


// export async function retrieveCommunityPosts(query:string) {
//   const queryEmbedding = await embeddingsModel.embedQuery(query);
//   const results = await pineconeIndex.query({
//     namespace: "community",
//     vector: queryEmbedding,
//     topK: 20,
//     includeMetadata: true,
//   });

//   return results.matches?.map((m) => {
//     text: m.metadata?.text,
//     postId: m.metadata?.postId,
//     title: m.metadata?.title,

//   })
// }


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