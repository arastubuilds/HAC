export type RetrievalSource = "community" | "medical";

export type RetrievalRoute = "community" | "medical" | "both";

export type RetrievalChunk = {
    text: string;
    source: RetrievalSource;
    sourceId: string;
    title?: string;
    createdAt?: string;
    chunkIndex?: number;
    citationIndex?: number;
    score: number;
}