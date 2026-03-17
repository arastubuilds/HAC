import { Worker } from "bullmq";
import { redisConnection } from "../infra/redis.js";
import { POST_INGEST_QUEUE, PostIngestJob } from "../queues/postIngest.queue.js";
import { prisma } from "../infra/prisma.js";
import { deletePostVectors, ingestText } from "../services/ingest.service.js";

export const postIngestWorker = new Worker<PostIngestJob>(
  POST_INGEST_QUEUE,
  async (job) => {
    try{
        console.log(`Job ${job.id} received`, job.data); 

        const { postId, type } = job.data;
        
        console.log(`Processing ${type} ingestion for post ${postId}`);

        if (type === "delete") {
            await deletePostVectors("community", postId);
            return;
        }
        
        if (type === "update") {
            await deletePostVectors("community", postId);
        }
        // Fetch post from database
        const post = await prisma.post.findUnique({
        where: { id: postId },
        });

        if (!post) {
            console.warn(`Post ${postId} not found, cleaning vectors`);
            await deletePostVectors("community", postId);
            return;
        }

        //  Prepare ingestion text
        const text = `
        Community Post

        Title: ${post.title}

        Content: ${post.content}
        `;

        // Run ingestion pipeline
        await ingestText(text, "community", { source: "community", type: "post", postId, title: post.title, createdAt: post.createdAt.toISOString(), });

        console.log(`Ingestion complete for post ${postId}`);
    } catch(err) {
        console.error("Post ingestion failed", err);
        throw err; // triggers retry
    }
    },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

/**
 * Worker lifecycle logs
 */

postIngestWorker.on("completed", (job) => {
  console.log(`Job completed: ${job.id}`);
});

postIngestWorker.on("failed", (job, err) => {
  console.error(`Job failed: ${job?.id}`, err);
});

console.log("Post ingest worker started");