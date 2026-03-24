import { type JobsOptions, Queue } from "bullmq";
import { redisConnection } from "../infra/redis.js";

export const REPLY_INGEST_QUEUE = "reply_ingest";

export interface ReplyIngestJob {
  type: "create" | "delete";
  replyId: string;
}

export const replyIngestQueue = new Queue<ReplyIngestJob>(REPLY_INGEST_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function enqueueReplyIngest(job: ReplyIngestJob, options?: Pick<JobsOptions, "jobId">) {
  await replyIngestQueue.add("reply_ingest_job", job, options);
}
