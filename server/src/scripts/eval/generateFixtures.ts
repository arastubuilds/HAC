/**
 * Fixture Generator
 *
 * Reads a completed ImportRun's MessageStaging data and writes candidate
 * fixture files for human labeling. The output files have empty `label` fields
 * that you fill in before using them as benchmark fixtures.
 *
 * Usage:
 *   pnpm --filter server exec tsx src/scripts/eval/generateFixtures.ts --runId <id> [--n 50]
 *
 * Output:
 *   src/scripts/eval/fixtures/classification.candidates.jsonl
 *   src/scripts/eval/fixtures/threading.candidates.jsonl
 *
 * After labeling: copy to classification.jsonl / threading.jsonl
 * (or append to existing fixture files).
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "../../infra/prisma.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name: string, fallback?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1) return args[idx + 1];
  const prefixed = args.find(a => a.startsWith(`${name}=`));
  if (prefixed) return prefixed.split("=")[1];
  return fallback;
}

const runId = arg("--runId");
const n = parseInt(arg("--n", "50") ?? "50", 10);

if (!runId) {
  console.error("Usage: generateFixtures.ts --runId <importRunId> [--n 50]");
  process.exit(1);
}

// ─── Classification candidates ────────────────────────────────────────────────

async function generateClassification(importRunId: string): Promise<number> {
  // Pull a stratified sample: kept messages (mix of content types) + dropped messages.
  const kept = await prisma.messageStaging.findMany({
    where:   { importRunId, wasDropped: false, isSystem: false, isMedia: false },
    orderBy: { timestamp: "asc" },
    take:    Math.ceil(n * 0.7),  // 70% kept
  });
  const dropped = await prisma.messageStaging.findMany({
    where:   { importRunId, wasDropped: true, isSystem: false },
    orderBy: { timestamp: "asc" },
    take:    Math.floor(n * 0.3),  // 30% dropped
  });

  const candidates = [...kept, ...dropped];
  const lines = candidates.map((row, i) => JSON.stringify({
    id:        `c${String(i + 1).padStart(3, "0")}`,
    rawBody:   row.rawBody,
    language:  row.language,
    label:     "",  // ← fill in: anchor_eligible | reply_only | drop
    // Pipeline hints (for your reference when labeling — remove before using as fixture):
    _hint_wasDropped:   row.wasDropped,
    _hint_dropReason:   row.dropReason,
    _hint_contentType:  row.contentType,
    _hint_medScore:     row.medicalRelevanceScore?.toFixed(1),
    _hint_anchorScore:  row.anchorLikelihoodScore?.toFixed(1),
    _hint_replyScore:   row.replyLikelihoodScore?.toFixed(1),
    notes: "",
  }));

  const outPath = resolve(__dirname, "fixtures", "classification.candidates.jsonl");
  writeFileSync(outPath, lines.join("\n") + "\n");
  return candidates.length;
}

// ─── Threading candidates ─────────────────────────────────────────────────────

async function generateThreading(importRunId: string): Promise<number> {
  // Pull adjacent message pairs within a 30-minute window.
  // Mix: similar medical content pairs + unrelated pairs.
  const msgs = await prisma.messageStaging.findMany({
    where:   { importRunId, wasDropped: false, isSystem: false, isMedia: false },
    orderBy: { timestamp: "asc" },
    take:    200,
  });

  const pairs: Array<{
    id: string;
    textA: string;
    textB: string;
    timeDeltaMs: number;
    label: string;
    notes: string;
  }> = [];

  // Adjacent pairs within 30 min (natural candidates)
  for (let i = 0; i < msgs.length - 1 && pairs.length < Math.ceil(n * 0.7); i++) {
    const a = msgs[i];
    const b = msgs[i + 1];
    if (!a || !b) continue;
    const delta = b.timestamp.getTime() - a.timestamp.getTime();
    if (delta > 30 * 60 * 1000) continue;
    pairs.push({
      id:          `t${String(pairs.length + 1).padStart(3, "0")}`,
      textA:        a.normalizedBody,
      textB:        b.normalizedBody,
      timeDeltaMs:  delta,
      label:        "",  // ← fill in: attach | split | skip
      notes:        "",
    });
  }

  // Distant pairs (likely split candidates)
  for (let i = 0; i < msgs.length - 10 && pairs.length < n; i += 10) {
    const a = msgs[i];
    const b = msgs[i + 10];
    if (!a || !b) continue;
    const delta = b.timestamp.getTime() - a.timestamp.getTime();
    pairs.push({
      id:          `t${String(pairs.length + 1).padStart(3, "0")}`,
      textA:        a.normalizedBody,
      textB:        b.normalizedBody,
      timeDeltaMs:  delta,
      label:        "",  // ← fill in: attach | split | skip
      notes:        "",
    });
  }

  const outPath = resolve(__dirname, "fixtures", "threading.candidates.jsonl");
  writeFileSync(outPath, pairs.map(p => JSON.stringify(p)).join("\n") + "\n");
  return pairs.length;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nGenerating fixtures from ImportRun: ${runId}  (n=${n})`);

  // runId is guaranteed defined here — the process.exit(1) guard above fires first.
  const [classCount, threadCount] = await Promise.all([
    generateClassification(runId!),
    generateThreading(runId!),
  ]);

  console.log(`  classification.candidates.jsonl  ${classCount} rows`);
  console.log(`  threading.candidates.jsonl       ${threadCount} rows`);
  console.log(`\nNext step: open the candidate files, fill in the empty "label" fields,`);
  console.log(`  remove "_hint_*" keys, then append/save as the corresponding .jsonl fixture.\n`);

  await prisma.$disconnect();
}

void main().catch((err: unknown) => {
  console.error("Error:", err);
  void prisma.$disconnect();
  process.exit(1);
});
