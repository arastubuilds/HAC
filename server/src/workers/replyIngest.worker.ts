import { Worker } from "bullmq";
import { getRedisConnection } from "../infra/redis.js";
import { REPLY_INGEST_QUEUE, type ReplyIngestJob } from "../queues/replyIngest.queue.js";
import { prisma } from "../infra/prisma.js";
import { deleteReplyVectors, ingestText } from "../services/ingest.service.js";

export const replyIngestWorker = new Worker<ReplyIngestJob>(
  REPLY_INGEST_QUEUE,
  async (job) => {
    const { replyId, type } = job.data;
    console.log(`Processing ${type} ingestion for reply ${replyId} (job ${job.id ?? "unknown"})`);

    if (type === "delete") {
      await deleteReplyVectors("community", replyId);
      return;
    }

    const reply = await prisma.reply.findUnique({
      where: { id: replyId },
      include: { post: { select: { title: true } } },
    });

    if (!reply) {
      console.warn(`Reply ${replyId} not found — skipping ingestion`);
      await deleteReplyVectors("community", replyId);
      return; // permanent: don't retry
    }

    const text = `Community Reply\n\nPost: ${reply.post.title}\n\nReply: ${reply.content}`;

    await ingestText(text, "community", {
      source: "community",
      type: "reply",
      replyId: reply.id,
      postId: reply.postId,
      userId: reply.userId,
      title: reply.post.title,
      createdAt: reply.createdAt.toISOString(),
      ...(reply.originPlatform   != null && { originPlatform:        reply.originPlatform }),
      ...(reply.waThreadKey      != null && { waThreadKey:           reply.waThreadKey }),
      ...(reply.importRunId      != null && { importRunId:           reply.importRunId }),
      ...(reply.publishDecision  != null && { publishDecision:       reply.publishDecision }),
      ...(reply.threadConfidence != null && { threadConfidence:      reply.threadConfidence }),
      ...(reply.relevanceScore   != null && { medicalRelevanceScore: reply.relevanceScore }),
      isImportedArchive: reply.originPlatform != null,
    });

    console.log(`Ingestion complete for reply ${replyId}`);
  },
  {
    connection: getRedisConnection(),
    concurrency: 5,
  }
);

replyIngestWorker.on("completed", (job) => {
  console.log(`Reply job completed: ${job.id ?? "unknown"}`);
});

replyIngestWorker.on("failed", (job, err) => {
  console.error(`Reply job failed: ${job?.id ?? "unknown"}`, err);
});

console.log("Reply ingest worker started");
