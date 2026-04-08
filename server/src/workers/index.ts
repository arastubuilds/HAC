import { postIngestWorker } from "./postIngest.worker.js";
import { replyIngestWorker } from "./replyIngest.worker.js";
import { prisma } from "../infra/prisma.js";
import { getRedisConnection } from "../infra/redis.js";

console.log("Workers started");

async function shutdown(signal: string) {
  console.log(`Workers received ${signal}. Shutting down...`);
  try {
    await Promise.all([
      postIngestWorker.close(),
      replyIngestWorker.close(),
    ]);
    await prisma.$disconnect();
    getRedisConnection().disconnect();
    console.log("Workers shut down cleanly");
    process.exit(0);
  } catch (err) {
    console.error("Worker shutdown error:", err);
    process.exit(1);
  }
}

process.on("SIGINT", (signal) => { void shutdown(signal); });
process.on("SIGTERM", (signal) => { void shutdown(signal); });
