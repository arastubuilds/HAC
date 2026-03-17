import { type Citation } from "./citation.types.js";

export interface RetrievalContext {
    context: string;
    citations: Citation[];
}