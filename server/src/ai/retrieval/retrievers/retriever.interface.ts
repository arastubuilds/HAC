import { type RetrievalChunk } from "../types/retrieval.types.js";

export interface Retriever {
  retrieve(query: string): Promise<RetrievalChunk[]>;
  retrieveWithVector(vector: number[]): Promise<RetrievalChunk[]>;
}