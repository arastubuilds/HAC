export interface Reply {
  id: string;
  postId: string;
  userId: string;
  parentReplyId: string | null;
  content: string;
  createdAt: Date;
}
