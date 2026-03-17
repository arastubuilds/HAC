import { z } from "zod";

export const CreateReplyDTO = z.object({
  content: z.string().min(1),
});

export const PostIdParamDTO = z.object({
  postId: z.uuid(),
});

export const ReplyIdParamDTO = z.object({
  replyId: z.uuid(),
});

export type ReplyResponse = {
  id: string;
  postId: string;
  userId: string;
  content: string;
  createdAt: string;
};
