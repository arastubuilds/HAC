import { prisma } from "../infra/prisma.js";
import { enqueueReplyIngest } from "../queues/replyIngest.queue.js";
import type { Reply } from "../domain/replies.js";

export async function createReply(
  postId: string,
  userId: string,
  content: string,
  parentReplyId?: string
): Promise<Reply> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) throw new Error("POST_NOT_FOUND");

  if (parentReplyId) {
    const parent = await prisma.reply.findUnique({ where: { id: parentReplyId }, select: { postId: true } });
    if (!parent || parent.postId !== postId) throw new Error("PARENT_REPLY_NOT_FOUND");
  }

  const created = await prisma.reply.create({
    data: { postId, userId, content, parentReplyId: parentReplyId ?? null },
    include: { user: { select: { username: true } } },
  });

  await enqueueReplyIngest({ type: "create", replyId: created.id });
  return { ...created, username: created.user.username };
}

export async function listReplies(
  postId: string,
  page: number,
  limit: number
): Promise<{ replies: Reply[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.reply.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { username: true } } },
    }),
    prisma.reply.count({ where: { postId } }),
  ]);
  const replies = rows.map((r) => ({ ...r, username: r.user.username }));
  return { replies, total };
}

export async function deleteReply(
  replyId: string,
  requestingUserId: string,
  postId: string
): Promise<void> {
  const existing = await prisma.reply.findUnique({
    where: { id: replyId },
    select: { userId: true, postId: true },
  });
  if (!existing || existing.postId !== postId) throw new Error("REPLY_NOT_FOUND");
  if (existing.userId !== requestingUserId) throw new Error("FORBIDDEN");

  await enqueueReplyIngest({ type: "delete", replyId });
  await prisma.reply.delete({ where: { id: replyId } });
}
