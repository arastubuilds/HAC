import { Worker } from "bullmq";
import { redisConnection } from "../infra/redis.js";
import { REPLY_INGEST_QUEUE, type ReplyIngestJob } from "../queues/replyIngest.queue.js";
import { prisma } from "../infra/prisma.js";
import { deleteReplyVectors, ingestText } from "../services/ingest.service.js";

export const replyIngestWorker = new Worker<ReplyIngestJob>(
  REPLY_INGEST_QUEUE,
  async (job) => {
    try {
      console.log(`Reply job ${job.id ?? "unknown"} received`, job.data);

      const { replyId, type } = job.data;

      console.log(`Processing ${type} ingestion for reply ${replyId}`);

      if (type === "delete") {
        await deleteReplyVectors("community", replyId);
        return;
      }

      const reply = await prisma.reply.findUnique({
        where: { id: replyId },
        include: { post: { select: { title: true } } },
      });

      if (!reply) {
        console.warn(`Reply ${replyId} not found, cleaning vectors`);
        await deleteReplyVectors("community", replyId);
        return;
      }

      const text = `
Community Reply

Post: ${reply.post.title}

Reply: ${reply.content}
      `;

      await ingestText(text, "community", {
        source: "community",
        type: "reply",
        replyId: reply.id,
        postId: reply.postId,
        userId: reply.userId,
        title: reply.post.title,
        createdAt: reply.createdAt.toISOString(),
        ...(reply.originPlatform && { originPlatform: reply.originPlatform }),
      });

      console.log(`Ingestion complete for reply ${replyId}`);
    } catch (err) {
      console.error("Reply ingestion failed", err);
      throw err;
    }
  },
  {
    connection: redisConnection,
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
