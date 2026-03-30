/**
 * Destructive reset utility for local/dev environments.
 *
 * What it wipes:
 * - Postgres: all tables in schema "public" except "_prisma_migrations"
 * - Pinecone: all namespaces in PINECONE_INDEX (or provided --namespaces)
 * - Redis: current database from REDIS_URL (FLUSHDB)
 *
 * Usage:
 *   pnpm --filter server exec tsx src/scripts/resetAllData.ts --yes
 *   pnpm --filter server exec tsx src/scripts/resetAllData.ts --yes --skip-redis
 *   pnpm --filter server exec tsx src/scripts/resetAllData.ts --yes --namespaces community,medical
 */

import "dotenv/config";
import { prisma } from "../infra/prisma.js";
import { getRedisConnection } from "../infra/redis.js";
import { pineconeIndex } from "../infra/pinecone.js";

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function readArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return args[i + 1];
}

async function resetPostgres(preserveTables: string[] = []): Promise<void> {
  const excluded = ["_prisma_migrations", ...preserveTables]
    .map(t => `'${t}'`)
    .join(", ");
  try {
    await prisma.$executeRawUnsafe(`
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (${excluded})
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', 'public', r.tablename);
  END LOOP;
END $$;
`);
    const extra = preserveTables.length ? ", " + preserveTables.join(", ") : "";
    console.log(`Postgres reset complete (truncated all public tables except: _prisma_migrations${extra}).`);
  } catch (err) {
    throw err;
  }
}

async function resetPinecone(namespaceArg?: string): Promise<void> {
  let namespaces: string[] = [];
  if (namespaceArg) {
    namespaces = namespaceArg
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  } else {
    const stats = await pineconeIndex.describeIndexStats();
    namespaces = Object.keys((stats.namespaces ?? {}) as Record<string, unknown>);
  }

  if (namespaces.length === 0) {
    console.log("Pinecone: no namespaces found to clear.");
    return;
  }

  for (const ns of namespaces) {
    await pineconeIndex.deleteAll({ namespace: ns });
    console.log(`Pinecone namespace cleared: ${ns}`);
  }
}

async function resetRedis(): Promise<void> {
  const redis = getRedisConnection();
  await redis.flushdb();
  console.log("Redis reset complete (FLUSHDB).");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const confirmed = hasFlag(args, "yes");
  if (!confirmed) {
    console.error("Refusing to run. This is destructive.");
    console.error("Re-run with --yes to confirm:");
    console.error("  pnpm --filter server exec tsx src/scripts/resetAllData.ts --yes");
    process.exit(1);
  }

  const skipPg = hasFlag(args, "skip-pg");
  const skipPinecone = hasFlag(args, "skip-pinecone");
  const skipRedis = hasFlag(args, "skip-redis");
  const namespaceArg = readArg(args, "namespaces");
  const preserveTablesArg = readArg(args, "preserve-tables");
  const preserveTables = preserveTablesArg
    ? preserveTablesArg.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  if (!skipPg) {
    await resetPostgres(preserveTables);
  } else {
    console.log("Postgres reset skipped.");
  }

  if (!skipPinecone) {
    await resetPinecone(namespaceArg);
  } else {
    console.log("Pinecone reset skipped.");
  }

  if (!skipRedis) {
    await resetRedis();
  } else {
    console.log("Redis reset skipped.");
  }

  console.log("All requested resets completed.");
}

void main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Reset failed: ${msg}`);
  process.exit(1);
});
