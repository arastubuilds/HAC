import { prisma } from "../infra/prisma.js";
import { ingestText } from "./ingest.service.js";
import { CreatePostInput, Post } from "../domain/posts.js";


export async function createPost(input: CreatePostInput): Promise<Post> {
  const post = await prisma.post.create({
    data: {
      title: input.title,
      content: input.content,
    },
  });

  // Fire-and-forget embedding (can later move to queue)
  await ingestText(
    `Title: ${post.title}\n\n${post.content}`,
    "community",
    { source: "community" }
  ).catch((err) => {
    console.error("Embedding failed for post:", post.id, err);
  });

  return post;
}