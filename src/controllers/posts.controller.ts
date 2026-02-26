import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createPost } from "../services/posts.service.js";
import { Post } from "../domain/posts.js";
import { CreatePostDTO, PostResponse } from "../dtos/posts.dto.js";



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
}

function toPostResponse(post: Post): PostResponse {
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
    };
  }