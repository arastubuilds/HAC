import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createReply, deleteReply, listReplies } from "../../services/replies.service.js";
import type { Reply } from "../../domain/replies.js";
import { CreateReplyDTO, PostIdParamDTO, ReplyIdParamDTO, ReplyResponse } from "../dtos/replies.dto.js";

export async function createReplyHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsedParams = PostIdParamDTO.safeParse(req.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params", details: z.treeifyError(parsedParams.error) });
  }

  const parsedBody = CreateReplyDTO.safeParse(req.body);
  if (!parsedBody.success) {
    return reply.status(400).send({ error: "Invalid request body", details: z.treeifyError(parsedBody.error) });
  }

  try {
    const replyDoc = await createReply(parsedParams.data.postId, req.user.sub, parsedBody.data.content);
    return reply.status(201).send(toReplyResponse(replyDoc));
  } catch (err) {
    if (err instanceof Error && err.message === "POST_NOT_FOUND") {
      return reply.status(404).send({ error: "Post not found" });
    }
    throw err;
  }
}

export async function listRepliesHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsedParams = PostIdParamDTO.safeParse(req.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params", details: z.treeifyError(parsedParams.error) });
  }

  const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
  const { replies, total } = await listReplies(parsedParams.data.postId, Number(page), Number(limit));
  return reply.status(200).send({ replies: replies.map(toReplyResponse), total, page: Number(page), limit: Number(limit) });
}

export async function deleteReplyHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = ReplyIdParamDTO.safeParse(req.params);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid params", details: z.treeifyError(parsed.error) });
  }

  try {
    await deleteReply(parsed.data.replyId, req.user.sub);
    return reply.status(204).send();
  } catch (err) {
    if (err instanceof Error && err.message === "REPLY_NOT_FOUND") {
      return reply.status(404).send({ error: "Reply not found" });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return reply.status(403).send({ error: "Forbidden" });
    }
    throw err;
  }
}

function toReplyResponse(r: Reply): ReplyResponse {
  return {
    id: r.id,
    postId: r.postId,
    userId: r.userId,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  };
}
