import { Citation } from "./citation.types.js";

export type RetrievalContext = {
    context: string;
    citations: Citation[];
};