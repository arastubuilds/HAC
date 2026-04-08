import { Pinecone } from "@pinecone-database/pinecone";
import { env } from "../config/env.js";

const pinecone = new Pinecone({
  apiKey: env.PINECONE_API_KEY,
});

export const pineconeIndex = pinecone.index({name: env.PINECONE_INDEX});
