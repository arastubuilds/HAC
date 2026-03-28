import { Redis } from "ioredis";
import { env } from "../config/env.js";

let _redis: Redis | null = null;

/**
 * Returns the shared Redis connection, creating it on first call.
 * Lazy initialization prevents module-load side effects when this
 * file is imported by scripts that don't use Redis (e.g. eval benchmarks).
 */
export function getRedisConnection(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // required for BullMQ
      enableReadyCheck: false,
    });
    _redis.on("connect", () => { console.log("Redis connected"); });
    _redis.on("error", (err: Error) => { console.error("Redis error:", err); });
    process.on("SIGTERM", () => { void _redis?.quit(); });
  }
  return _redis;
}

/**
 * Backwards-compatible named export. Delegates every property access to the
 * lazily-created connection so existing consumers need no changes.
 */
export const redisConnection = new Proxy({} as Redis, {
  get(_target, prop) {
    return Reflect.get(getRedisConnection(), prop as string);
  },
});
