import { Pinecone } from "@pinecone-database/pinecone";
// import { PineconeStore } from "@langchain/pinecone";
// import { embeddingsModel } from "./embeddings.js";
import { env } from "../config/env.js";


const pinecone = new Pinecone({
  apiKey: env.PINECONE_API_KEY!,
});

export const pineconeIndex = pinecone.index({name: env.PINECONE_INDEX});

// export const vectorStore = await PineconeStore.fromExistingIndex(
//   embeddingsModel,
//   {
//     pineconeIndex,
//     maxConcurrency: 5,
//     maxRetries: 5,
//   }
// );

