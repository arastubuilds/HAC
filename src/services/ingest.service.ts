import { pineconeIndex } from "../infra/pinecone.js";
import { embeddingsModel } from "../infra/embeddings.js";
import { splitter } from "../infra/embeddings.js";
// import { v4 as uuidv4 } from "uuid";

type IngestMetadata = {
  source: string;
  postId?: string;
  replyId?: string;
  userId?: string;
  title?: string;
  createdAt?: string;
  type?: string;
};

export async function ingestText(
  text: string,
  namespace: "community" | "medical",
  metadata: IngestMetadata
) {
  const docs = await splitter.createDocuments([text]);

  if (!docs.length) {
    throw new Error("No documents after splitting");
  }

  const texts = docs.map(d => `passage: ${d.pageContent}`);

  const vectors = await embeddingsModel.embedDocuments(texts);

  if (!vectors.length) {
    throw new Error("Embedding failed");
  }

  const records = vectors.map((values, i) => ({
    id: metadata.replyId
      ? `reply_${metadata.replyId}_chunk_${i}`
      : metadata.postId
        ? `${metadata.postId}_${i}`
        : crypto.randomUUID(),
    values,
    metadata: {
      ...metadata,
      chunkIndex: i,
      text: texts[i] ?? "",
    },
  }));

  await pineconeIndex.upsert({
    records,
    namespace,
  });

  console.log(`Upserted ${records.length} vectors into ${namespace}`);
}

export async function deletePostVectors(
  namespace: "community" | "medical",
  postId: string
) {
  await pineconeIndex.deleteMany({
    namespace,
    filter: {
      postId: { $eq : postId },
    },
  });
  console.log(`Deleted vectors for post ${postId}`);
}

export async function deleteReplyVectors(
  namespace: "community" | "medical",
  replyId: string
) {
  await pineconeIndex.deleteMany({
    namespace,
    filter: {
      replyId: { $eq: replyId },
    },
  });
  console.log(`Deleted vectors for reply ${replyId}`);
}