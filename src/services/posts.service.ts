import { prisma } from "../infra/prisma.js";
import { enqueuePostIngest } from "../queues/postIngest.queue.js";
import { CreatePostInput, Post, UpdatePostInput } from "../domain/posts.js";
import { DeletePostInput } from "../api/dtos/posts.dto.js";

export async function createPost(input: CreatePostInput): Promise<Post> {
  const post = await prisma.post.create({
    data: {
      title: input.title,
      content: input.content,
    },
  });
  // enqueue background ingestion job
  await enqueuePostIngest({type: "create", postId: post.id});

  return post;
}
export async function updatePost(updates: UpdatePostInput): Promise<Post> {
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

export async function deletePost(input: DeletePostInput):Promise<void> {
    await prisma.post.delete({
        where: {id : input.postId},
    });

    await enqueuePostIngest({type: "delete", postId: input.postId});
    
    return;
}