import { prisma } from "../infra/prisma.js";
import { enqueuePostIngest } from "../queues/postIngest.queue.js";
import { type CreatePostInput, type Post, type UpdatePostInput } from "../domain/posts.js";
import { type DeletePostInput } from "../api/dtos/posts.dto.js";

export async function createPost(input: CreatePostInput): Promise<Post> {
  const post = await prisma.post.create({
    data: {
      title: input.title,
      content: input.content,
      userId: input.userId,
    },
  });
  await enqueuePostIngest({type: "create", postId: post.id});
  return post;
}

export async function updatePost(updates: UpdatePostInput): Promise<Post> {
  const existing = await prisma.post.findUnique({
    where: { id: updates.postId },
    select: { userId: true },
  });
  if (!existing) throw new Error("POST_NOT_FOUND");
  if (existing.userId !== updates.requestingUserId) throw new Error("FORBIDDEN");

  const post = await prisma.post.update({
    where: { id: updates.postId },
    data: {
      title: updates.original.title,
      content: updates.original.content,
    },
  });

  await enqueuePostIngest({type: "update", postId: post.id});
  return post;
}

export async function getPost(postId: string): Promise<Post | null> {
  return prisma.post.findUnique({ where: { id: postId } });
}

export async function listPosts(page: number, limit: number): Promise<{ posts: Post[]; total: number }> {
  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count(),
  ]);
  return { posts, total };
}

export async function deletePost(input: DeletePostInput): Promise<void> {
  const existing = await prisma.post.findUnique({
    where: { id: input.postId },
    select: { userId: true },
  });
  if (!existing) throw new Error("POST_NOT_FOUND");
  if (existing.userId !== input.requestingUserId) throw new Error("FORBIDDEN");

  await prisma.post.delete({ where: { id: input.postId } });
  await enqueuePostIngest({type: "delete", postId: input.postId});
}
