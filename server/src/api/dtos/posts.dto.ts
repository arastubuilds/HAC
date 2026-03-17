import { z } from "zod";

export const CreatePostDTO = z.object({
  title: z.string().min(3),
  content: z.string().min(10),
});

export const UpdatePostParmasDTO = z.object({
  postId: z.uuid(),
});

export const UpdatePostDTO = z.object({
  title: z.string().min(3),
  content: z.string().min(10),
})

export const DeletePostDTO = z.object({
  postId: z.uuid(),
});

export type DeletePostInput = z.infer<typeof DeletePostDTO> & { requestingUserId: string };
export type CreatePostInput = z.infer<typeof CreatePostDTO>;

export interface PostResponse {
    id: string;
    title: string;
    content: string;
    createdAt: string; // ISO string for APIs
    userId: string;
}