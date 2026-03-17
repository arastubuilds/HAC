import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createPost, deletePost, getPost, listPosts, updatePost } from "../../services/posts.service.js";
import { Post } from "../../domain/posts.js";
import type { UpdatePostInput } from "../../domain/posts.js";
import { CreatePostDTO, DeletePostDTO, PostResponse, UpdatePostDTO, UpdatePostParmasDTO } from "../dtos/posts.dto.js";
import { PaginationDTO } from "@hac/shared/types";

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

  const post = await createPost({ ...parsed.data, userId: req.user.sub });
  const response: PostResponse = toPostResponse(post);
  return reply.status(201).send(response);
}

export async function updatePostHandler(
    req: FastifyRequest,
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

    const data: UpdatePostInput = {
        postId: parsedParams.data.postId,
        original: parsedBody.data,
        requestingUserId: req.user.sub,
    };

    try {
        const post = await updatePost(data);
        return reply.status(200).send(toPostResponse(post));
    } catch (err) {
        if (err instanceof Error && err.message === "POST_NOT_FOUND") {
            return reply.status(404).send({ error: "Post not found" });
        }
        if (err instanceof Error && err.message === "FORBIDDEN") {
            return reply.status(403).send({ error: "Forbidden" });
        }
        throw err;
    }
}


export async function deletePostHandler(req: FastifyRequest, reply: FastifyReply) {
    const parsed = DeletePostDTO.safeParse(req.params);
    if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid params",
          details: z.treeifyError(parsed.error),
        });
    }

    try {
        await deletePost({ ...parsed.data, requestingUserId: req.user.sub });
        return reply.status(204).send();
    } catch (err) {
        if (err instanceof Error && err.message === "POST_NOT_FOUND") {
            return reply.status(404).send({ error: "Post not found" });
        }
        if (err instanceof Error && err.message === "FORBIDDEN") {
            return reply.status(403).send({ error: "Forbidden" });
        }
        throw err;
    }
}

export async function listPostsHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = PaginationDTO.safeParse(req.query);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid query parameters", details: z.treeifyError(parsed.error) });
  }
  const { page, limit } = parsed.data;
  const { posts, total } = await listPosts(page, limit);
  return reply.status(200).send({ posts: posts.map(toPostResponse), total, page, limit });
}

export async function getPostHandler(req: FastifyRequest<{ Params: { postId: string } }>, reply: FastifyReply) {
  const { postId } = req.params;
  const post = await getPost(postId);
  if (!post) return reply.status(404).send({ error: "Post not found" });
  return reply.status(200).send(toPostResponse(post));
}

function toPostResponse(post: Post): PostResponse {
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
      userId: post.userId,
    };
}
