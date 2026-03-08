import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createPost, deletePost, updatePost } from "../../services/posts.service.js";
import { Post, UpdatePostInput } from "../../domain/posts.js";
import { CreatePostDTO, DeletePostDTO, PostResponse, UpdatePostDTO, UpdatePostParmasDTO } from "../dtos/posts.dto.js";

export async function createPostHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = CreatePostDTO.safeParse(req.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid request body",
      details: z.treeifyError(parsed.error),
    });
  }

  const post = await createPost(parsed.data);
  const response: PostResponse = toPostResponse(post);
  return reply.status(201).send(response);
};

type UpdatePostParams = {
    postId: string;
};
export async function updatePostHandler(
    req: FastifyRequest<{Params: UpdatePostParams}>,
    reply: FastifyReply,
) {
    const parsedParams = UpdatePostParmasDTO.safeParse(req.params);
    if (!parsedParams.success) {
        return reply.status(400).send({
          error: "Invalid params",
          details: z.treeifyError(parsedParams.error),
        });
    }

    const parsedBody = UpdatePostDTO.safeParse(req.body);

    if (!parsedBody.success) {
    return reply.status(400).send({
        error: "Invalid request body",
        details: z.treeifyError(parsedBody.error),
        });
    }
    const data: UpdatePostInput = {postId: parsedParams.data.postId, original: parsedBody.data}
    const post = await updatePost(data);
    
    const response: PostResponse = toPostResponse(post);
    return reply.status(200).send(response);
}


type DeletePostParams = {
    postId: string;
};
export async function deletePostHandler(req: FastifyRequest<{Params: DeletePostParams}>, reply: FastifyReply) {
    const parsed = DeletePostDTO.safeParse(req.params);
    if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid params",
          details: z.treeifyError(parsed.error),
        });
    }
    await deletePost(parsed.data);
    return reply.status(204).send();
}

function toPostResponse(post: Post): PostResponse {
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
    };
}