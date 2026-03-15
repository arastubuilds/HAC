export type RetrievalSource = "community" | "medical";
export type RetrievalType   = "post" | "reply";

export type RetrievalRoute = "community" | "medical" | "both";

export type RetrievalChunk = {
    text: string;
    source: RetrievalSource;
    type?: RetrievalType;
    sourceId: string;
    replyId?: string;
    parentPostId?: string;
    title?: string;
    createdAt?: string;
    chunkIndex?: number;
    citationIndex?: number;
    score: number;
}

export type ThreadReply = {
  id: string;
  content: string;
  createdAt: string;
  isMatched: boolean;
};

export type ThreadContext = {
  postId: string;
  title: string;
  postContent: string;
  postCreatedAt: string;
  replies: ThreadReply[];
};