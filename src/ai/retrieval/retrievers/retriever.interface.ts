import { RetrievalChunk } from "../retrieval.types.js";

export interface Retriever {
  retrieve(query: string): Promise<RetrievalChunk[]>;
}