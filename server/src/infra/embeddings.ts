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
