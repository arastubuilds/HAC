import { type JobsOptions, Queue } from "bullmq";
import { redisConnection } from "../infra/redis.js";

/**
 * Queue name
 */
export const POST_INGEST_QUEUE = "post_ingest";

/**
 * Job payload type
 */
export interface PostIngestJob {
  type: "create" | "update" | "delete";
  postId: string;
}

/**
 * Queue instance
 */
export const postIngestQueue = new Queue<PostIngestJob>(POST_INGEST_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5, // retry up to 5 times
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

/**
 * Enqueue ingestion job
 */
export async function enqueuePostIngest(postJob: PostIngestJob, options?: Pick<JobsOptions, "jobId">) {
  await postIngestQueue.add("post_ingest_job", postJob, options);
}