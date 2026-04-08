import { Worker } from "bullmq";
import { getRedisConnection } from "../infra/redis.js";
import { POST_INGEST_QUEUE, type PostIngestJob } from "../queues/postIngest.queue.js";
import { prisma } from "../infra/prisma.js";
import { deletePostVectors, ingestText } from "../services/ingest.service.js";

export const postIngestWorker = new Worker<PostIngestJob>(
  POST_INGEST_QUEUE,
  async (job) => {
    const { postId, type } = job.data;
    console.log(`Processing ${type} ingestion for post ${postId} (job ${job.id ?? "unknown"})`);

    if (type === "delete") {
      await deletePostVectors("community", postId);
      return;
    }

    // Fetch post first — bail permanently if it doesn't exist
    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      console.warn(`Post ${postId} not found — skipping ingestion`);
      await deletePostVectors("community", postId);
      return; // permanent: don't retry
    }

    if (type === "update") {
      await deletePostVectors("community", postId);
    }

    const text = `Community Post\n\nTitle: ${post.title}\n\nContent: ${post.content}`;

    await ingestText(text, "community", {
      source: "community",
      type: "post",
      postId,
      title: post.title,
      createdAt: post.createdAt.toISOString(),
      ...(post.originPlatform    != null && { originPlatform:         post.originPlatform }),
      ...(post.waThreadKey       != null && { waThreadKey:            post.waThreadKey }),
      ...(post.importRunId       != null && { importRunId:            post.importRunId }),
      ...(post.publishDecision   != null && { publishDecision:        post.publishDecision }),
      ...(post.threadConfidence  != null && { threadConfidence:       post.threadConfidence }),
      ...(post.relevanceScore    != null && { medicalRelevanceScore:  post.relevanceScore }),
      isImportedArchive: post.originPlatform != null,
    });

    console.log(`Ingestion complete for post ${postId}`);
  },
  {
    connection: getRedisConnection(),
    concurrency: 5,
  }
);

/**
 * Worker lifecycle logs
 */

postIngestWorker.on("completed", (job) => {
  console.log(`Job completed: ${job.id ?? "unknown"}`);
});

postIngestWorker.on("failed", (job, err) => {
  console.error(`Job failed: ${job?.id ?? "unknown"}`, err);
});

console.log("Post ingest worker started");
