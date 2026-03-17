import { Redis } from "ioredis";
import { env } from "../config/env.js";

/**
 * Shared Redis connection for BullMQ.
 */
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required for BullMQ
  enableReadyCheck: false,
});

/**
 * logging
 */
redisConnection.on("connect", () => {
  console.log("Redis connected");
});

redisConnection.on("error", (err: Error) => {
  console.error("Redis error:", err);
});

/**
 * Graceful shutdown
 */
process.on("SIGTERM", async () => {
  await redisConnection.quit();
});