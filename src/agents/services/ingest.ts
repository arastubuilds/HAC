import { pineconeIndex } from "../../infra/pinecone.js";
import { embeddingsModel } from "../../infra/embeddings.js";
import { splitter } from "../../infra/embeddings.js";
import { v4 as uuidv4 } from "uuid";

export async function ingestText(
  text: string,
  namespace: "community" | "medical",
  metadata: Record<"source", string>
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
    id: uuidv4(),
    values,
    metadata: {
      ...metadata,
      text: texts[i] ?? "",
    },
  }));

  await pineconeIndex.upsert({
    records,
    namespace,
  });

  console.log("Upserted:", records.length);
}