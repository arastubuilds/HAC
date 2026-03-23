import { z } from "zod";

export const CreateReplyDTO = z.object({
  content: z.string().min(1),
  parentReplyId: z.string().uuid().optional(),
});

export const PostIdParamDTO = z.object({
  postId: z.uuid(),
});

export const ReplyIdParamDTO = z.object({
  replyId: z.uuid(),
});

export const DeleteReplyParamDTO = z.object({
  postId: z.uuid(),
  replyId: z.uuid(),
});

export interface ReplyResponse {
  id: string;
  postId: string;
  userId: string;
  parentReplyId?: string;
  content: string;
  createdAt: string;
}
