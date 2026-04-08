import { Queue } from "bullmq";
import { getRedisConnection } from "../infra/redis.js";

export const REPLY_INGEST_QUEUE = "reply_ingest";

export interface ReplyIngestJob {
  type: "create" | "delete";
  replyId: string;
}

export const replyIngestQueue = new Queue<ReplyIngestJob>(REPLY_INGEST_QUEUE, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 100, age: 86400 },
  },
});

export async function enqueueReplyIngest(job: ReplyIngestJob) {
  await replyIngestQueue.add("reply_ingest_job", job, {
    jobId: `${job.replyId}:${job.type}`,
  });
}
