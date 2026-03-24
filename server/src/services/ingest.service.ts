import { pineconeIndex } from "../infra/pinecone.js";
import { embeddingsModel } from "../infra/embeddings.js";
import { splitter } from "../infra/embeddings.js";
// import { v4 as uuidv4 } from "uuid";

interface IngestMetadata {
  source: string;
  postId?: string;
  replyId?: string;
  userId?: string;
  title?: string;
  createdAt?: string;
  type?: string;
  originPlatform?: string;
}

export async function ingestText(
  text: string,
  namespace: "community" | "medical",
  metadata: IngestMetadata
) {
  let docs: Awaited<ReturnType<typeof splitter.createDocuments>>;
  try {
    docs = await splitter.createDocuments([text]);
  } catch (err) {
    throw new Error(`Text splitting failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  if (!docs.length) {
    throw new Error("No documents after splitting");
  }

  const texts = docs.map(d => `passage: ${d.pageContent}`);

  let vectors: number[][];
  try {
    vectors = await embeddingsModel.embedDocuments(texts);
  } catch (err) {
    throw new Error(`HuggingFace embedding failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  if (!vectors.length) {
    throw new Error("Embedding returned empty result");
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

  try {
    await pineconeIndex.upsert({
      records,
      namespace,
    });
  } catch (err) {
    throw new Error(`Pinecone upsert failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  console.log(`Upserted ${records.length} vectors into ${namespace}`);
}

export async function deletePostVectors(
  namespace: "community" | "medical",
  postId: string
) {
  try {
    await pineconeIndex.deleteMany({
      namespace,
      filter: {
        postId: { $eq : postId },
      },
    });
  } catch (err) {
    throw new Error(`Pinecone delete failed for post ${postId}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  console.log(`Deleted vectors for post ${postId}`);
}

export async function deleteReplyVectors(
  namespace: "community" | "medical",
  replyId: string
) {
  try {
    await pineconeIndex.deleteMany({
      namespace,
      filter: {
        replyId: { $eq: replyId },
      },
    });
  } catch (err) {
    throw new Error(`Pinecone delete failed for reply ${replyId}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  console.log(`Deleted vectors for reply ${replyId}`);
}