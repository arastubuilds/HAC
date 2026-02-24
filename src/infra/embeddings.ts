import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { env } from "../config/env.js"

export const embeddingsModel = new HuggingFaceInferenceEmbeddings({
    apiKey: env.HUGGING_FACE_API_KEY,
    model: "intfloat/e5-base-v2",
    provider: "hf-inference"
});


export const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 100,
  separators: ["\n\n", "\n", ".", "!", "?", " ", ""],
});

// export async function generateChunks(content: string, title?: string) {
//   const docs = await splitter.createDocuments([content]);
//   const chunks = docs.map((d) => d.pageContent);

//   if (title && chunks.length > 0) {
//     chunks[0] = `Title: ${title}\n\n${chunks[0]}`;
//   }
//   return chunks;
// }

// export async function generateEmbeddings(value: string) : 
// Promise<Array<{ embedding: number[]; content: string }>> {
//     const chunks = await generateChunks(value);
//     const embeddings = await embeddingModel.embedDocuments(chunks);
//     return embeddings.map((embedding, i) => ({
//         content: chunks[i],
//         embedding,
//     }));
// }

// export const generateEmbedding = async (value: string): Promise<number[]> => {
//   const input = value.replaceAll('\\n', ' ');
//   const [embedding] = await embeddingModel.embedDocuments([input]);
//   return embedding;
// };
