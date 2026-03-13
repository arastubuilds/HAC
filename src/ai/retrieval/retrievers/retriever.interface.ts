import { RetrievalChunk } from "../types/retrieval.types.js";

export interface Retriever {
  retrieve(query: string): Promise<RetrievalChunk[]>;
}