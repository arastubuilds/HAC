/**
 * Ingestion Pipeline Benchmark
 *
 * Evaluates the three core pipeline stages against labeled fixtures:
 *   - classification  message classification (drop / reply_only / anchor_eligible)
 *   - threading       pairwise attachment scoring (attach / split / skip)
 *   - publish         publish gate decisions (auto_publish / qa_review / archive_only)
 *
 * Usage:
 *   pnpm --filter server exec tsx src/scripts/eval/benchmarkIngestion.ts
 *   pnpm --filter server exec tsx src/scripts/eval/benchmarkIngestion.ts --suite classification
 *   pnpm --filter server exec tsx src/scripts/eval/benchmarkIngestion.ts --suite all --config '{"anchorMinScore":60}'
 *
 * Exit codes:
 *   0  all quality thresholds pass
 *   1  one or more thresholds fail
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  filterNoise,
  classifyMessage,
  classifyContentType,
  topicOverlap,
  hasSharedCategories,
  hasRelatedCategories,
  computeThreadSignals,
  publishGate,
  DEFAULT_CONFIG,
  DEFAULT_SPAM_SENDER_RULES,
} from "../ingestWhatsApp.v2.js";
import type {
  WaMessage,
  RunConfig,
  ThreadSignals,
  WaThread,
  ScoredMessage,
} from "../ingestWhatsApp.v2.js";

// ─── Quality thresholds ───────────────────────────────────────────────────────
// A run "passes" only if all measured metrics meet these minimums.
// These should tighten as the fixture sets grow.

const PASS_THRESHOLDS = {
  noisePrecision:  0.90,  // don't drop real anchors or replies
  anchorF1:        0.80,  // find and classify anchor-eligible messages
  attachPrecision: 0.75,  // topicOverlap above threshold → correct label
  publishAccuracy: 0.85,  // publishGate matches human label
} as const;

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const suiteArg = args.find(a => a.startsWith("--suite="))?.split("=")[1]
  ?? args[args.indexOf("--suite") + 1]
  ?? "all";
const configOverride: Partial<RunConfig> = (() => {
  const raw = args.find(a => a.startsWith("--config="))?.split("=")[1]
    ?? args[args.indexOf("--config") + 1];
  if (!raw) return {};
  try { return JSON.parse(raw) as Partial<RunConfig>; } catch { return {}; }
})();

const cfg: RunConfig = { ...DEFAULT_CONFIG, ...configOverride };

// ─── Fixture types ────────────────────────────────────────────────────────────

interface ClassificationFixture {
  id: string;
  rawBody: string;
  language: "english" | "hinglish";
  label: "anchor_eligible" | "reply_only" | "drop";
  notes?: string;
}

interface ThreadingFixture {
  id: string;
  textA: string;
  textB: string;
  timeDeltaMs: number;
  expectedOverlap: "high" | "medium" | "low" | "none";
  label: "attach" | "split" | "skip";
  notes?: string;
}

interface PublishFixture {
  id: string;
  cohesionScore: number;
  publishConfidenceScore: number;
  substantiveReplyCount: number;
  anchorMedicalScore: number;
  anchorAnchorScore: number;
  anchorCategoryHits: number;
  doctorPresent: boolean;
  medicalDepth: number;
  isMonologue?: boolean;
  label: "auto_publish" | "qa_review" | "archive_only";
  notes?: string;
}

// ─── Fixture loader ───────────────────────────────────────────────────────────

async function loadFixtures<T>(filename: string): Promise<T[]> {
  const path = resolve(__dirname, "fixtures", filename);
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  const rows: T[] = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("//")) rows.push(JSON.parse(trimmed) as T);
  }
  return rows;
}

// ─── Metric helpers ───────────────────────────────────────────────────────────

function precision(tp: number, fp: number): number {
  return tp + fp === 0 ? 1 : tp / (tp + fp);
}
function recall(tp: number, fn: number): number {
  return tp + fn === 0 ? 1 : tp / (tp + fn);
}
function f1(p: number, r: number): number {
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}
function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}
function pad(s: string | number, w: number): string {
  return String(s).padStart(w);
}

// ─── Threshold check helper ───────────────────────────────────────────────────

let anyFailed = false;
function check(name: string, value: number, threshold: number): void {
  const pass = value >= threshold;
  if (!pass) anyFailed = true;
  console.log(
    `  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(22)} ${pct(value)} ${pass ? "≥" : "<"} ${pct(threshold)}`
  );
}

// ─── Synthetic WaMessage builder ──────────────────────────────────────────────

function syntheticMsg(rawBody: string, language: "english" | "hinglish", index = 0): WaMessage {
  return {
    timestamp:         new Date(Date.now() - index * 60_000),
    sender:            "Benchmark User",
    body:              rawBody,
    edited:            false,
    isSystem:          false,
    isMedia:           false,
    waMessageKey:      `bench_${index}_${Buffer.from(rawBody.slice(0, 20)).toString("hex")}`,
    language,
    parseConfidence:   1.0,
    continuationLines: 0,
  };
}

// ─── Classification suite ─────────────────────────────────────────────────────

async function runClassification(): Promise<void> {
  console.log("\n── Classification ───────────────────────────────────────────");

  const fixtures = await loadFixtures<ClassificationFixture>("classification.jsonl");
  console.log(`  Fixtures loaded: ${fixtures.length}`);

  // Confusion: rows=label, cols=predicted
  const labels  = ["anchor_eligible", "reply_only", "drop"] as const;
  type CLabel = typeof labels[number];
  const confusion = new Map<string, number>();
  const disagreements: Array<{ id: string; label: CLabel; got: string; body: string }> = [];

  for (const [i, fix] of fixtures.entries()) {
    const msg = syntheticMsg(fix.rawBody, fix.language, i);
    const noiseResult = filterNoise([msg], DEFAULT_SPAM_SENDER_RULES);
    const isDropped = noiseResult.kept.length === 0;

    let predicted: string;
    if (isDropped) {
      predicted = "drop";
    } else {
      const scores = classifyMessage(msg);
      const meetsExperientialPath =
        scores.categoryHits > 0 &&
        (scores.isExperiential || scores.isSupportSeeking || scores.isQuestion) &&
        scores.anchorLikelihoodScore >= cfg.anchorExperientialScore;
      if (scores.anchorLikelihoodScore >= cfg.anchorMinScore || meetsExperientialPath) {
        predicted = "anchor_eligible";
      } else if (scores.replyLikelihoodScore >= cfg.minReplyScore) {
        predicted = "reply_only";
      } else {
        predicted = "drop";
      }
    }

    const key = `${fix.label}→${predicted}`;
    confusion.set(key, (confusion.get(key) ?? 0) + 1);
    if (predicted !== fix.label) {
      disagreements.push({ id: fix.id, label: fix.label, got: predicted, body: fix.rawBody });
    }
  }

  // Noise filter metrics (label=drop → predicted=drop is TP; label≠drop predicted=drop is FP)
  let noiseTp = 0, noiseFp = 0, noiseFn = 0;
  for (const fix of fixtures) {
    const isLabel = fix.label === "drop";
    const isGot = (confusion.get(`${fix.label}→drop`) ?? 0) > 0;
    const got = [...confusion.entries()]
      .filter(([k]) => k.startsWith(`${fix.label}→`))
      .map(([k, v]) => [k.split("→")[1]!, v] as [string, number]);
    // Per-fixture check
    const msg = syntheticMsg(fix.rawBody, fix.language);
    const noiseResult = filterNoise([msg], DEFAULT_SPAM_SENDER_RULES);
    const predictedDrop = noiseResult.kept.length === 0;
    if (isLabel && predictedDrop) noiseTp++;
    else if (!isLabel && predictedDrop) noiseFp++;
    else if (isLabel && !predictedDrop) noiseFn++;
    void isGot; void got;
  }
  const noisePrec = precision(noiseTp, noiseFp);
  const noiseRec  = recall(noiseTp, noiseFn);

  // Anchor metrics (among non-drop fixtures)
  let anchorTp = 0, anchorFp = 0, anchorFn = 0;
  for (const fix of fixtures) {
    if (fix.label === "drop") continue;
    const msg = syntheticMsg(fix.rawBody, fix.language);
    const noiseResult = filterNoise([msg], DEFAULT_SPAM_SENDER_RULES);
    if (noiseResult.kept.length === 0) {
      if (fix.label === "anchor_eligible") anchorFn++;
      continue;
    }
    const scores = classifyMessage(msg);
    const meetsExperientialPath =
      scores.categoryHits > 0 &&
      (scores.isExperiential || scores.isSupportSeeking || scores.isQuestion) &&
      scores.anchorLikelihoodScore >= cfg.anchorExperientialScore;
    const predictedAnchor =
      scores.anchorLikelihoodScore >= cfg.anchorMinScore || meetsExperientialPath;
    const isAnchor = fix.label === "anchor_eligible";
    if (isAnchor && predictedAnchor) anchorTp++;
    else if (!isAnchor && predictedAnchor) anchorFp++;
    else if (isAnchor && !predictedAnchor) anchorFn++;
  }
  const anchorPrec = precision(anchorTp, anchorFp);
  const anchorRec  = recall(anchorTp, anchorFn);
  const anchorF1v  = f1(anchorPrec, anchorRec);

  // Content type accuracy (among kept messages with non-drop label)
  let ctTotal = 0, ctCorrect = 0;
  for (const fix of fixtures) {
    if (fix.label === "drop") continue;
    const msg = syntheticMsg(fix.rawBody, fix.language);
    const noiseResult = filterNoise([msg], DEFAULT_SPAM_SENDER_RULES);
    if (noiseResult.kept.length === 0) continue;
    const scores = classifyMessage(msg);
    void classifyContentType(msg, scores); // just verify it runs without error
    ctTotal++;
    ctCorrect++; // accuracy check skipped (content type labels not in fixtures)
    void ctCorrect;
  }

  console.log(`\n  Noise filter:   prec=${pct(noisePrec)}  rec=${pct(noiseRec)}`);
  console.log(`  Anchor:         prec=${pct(anchorPrec)}  rec=${pct(anchorRec)}  F1=${pct(anchorF1v)}`);
  console.log(`  Content type:   runs OK on ${ctTotal} kept messages`);
  console.log(`\n  Disagreements (${disagreements.length} of ${fixtures.length}):`);
  for (const d of disagreements.slice(0, 10)) {
    console.log(`    ${pad(d.id, 6)}  label=${d.label.padEnd(16)} got=${d.got.padEnd(16)} "${d.body.slice(0, 55)}"`);
  }

  console.log("");
  check("noise_precision",  noisePrec,  PASS_THRESHOLDS.noisePrecision);
  check("anchor_f1",        anchorF1v,  PASS_THRESHOLDS.anchorF1);
}

// ─── Threading suite ──────────────────────────────────────────────────────────

async function runThreading(): Promise<void> {
  console.log("\n── Threading (overlap scoring) ──────────────────────────────");

  const fixtures = await loadFixtures<ThreadingFixture>("threading.jsonl");
  console.log(`  Fixtures loaded: ${fixtures.length}`);

  // ATTACH_THRESHOLD: same as the default topicOverlap threshold in reconstructThreads
  const ATTACH_THRESHOLD = 0.25;
  const SPLIT_THRESHOLD  = 0.10;

  let attachTp = 0, attachFp = 0, attachFn = 0;
  let overlapByLabel: Record<string, number[]> = { attach: [], split: [], skip: [] };
  const disagreements: Array<{ id: string; label: string; got: string; ov: number }> = [];

  for (const fix of fixtures) {
    const ov = topicOverlap(fix.textA, fix.textB);
    const shared = hasSharedCategories(fix.textA, fix.textB);
    const related = hasRelatedCategories(fix.textA, fix.textB);

    // Simplified attachment decision (mirrors core threading heuristic)
    let predicted: "attach" | "split" | "skip";
    if (ov >= ATTACH_THRESHOLD || shared || related) {
      predicted = "attach";
    } else if (ov < SPLIT_THRESHOLD && !shared && !related) {
      predicted = "split";
    } else {
      predicted = "skip";
    }

    const label = fix.label;
    (overlapByLabel[label] ??= []).push(ov);
    if (label === "attach" && predicted === "attach") attachTp++;
    else if (label !== "attach" && predicted === "attach") attachFp++;
    else if (label === "attach" && predicted !== "attach") attachFn++;

    if (predicted !== label) {
      disagreements.push({ id: fix.id, label, got: predicted, ov });
    }
  }

  const attachPrec = precision(attachTp, attachFp);
  const attachRec  = recall(attachTp, attachFn);

  // Overlap distribution per label
  for (const lbl of ["attach", "split", "skip"] as const) {
    const scores = overlapByLabel[lbl] ?? [];
    if (scores.length === 0) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    console.log(`  topicOverlap [${lbl.padEnd(6)}] n=${pad(scores.length,2)}  avg=${avg.toFixed(3)}  min=${min.toFixed(3)}  max=${max.toFixed(3)}`);
  }

  console.log(`\n  Attachment:     prec=${pct(attachPrec)}  rec=${pct(attachRec)}`);
  console.log(`\n  Disagreements (${disagreements.length} of ${fixtures.length}):`);
  for (const d of disagreements.slice(0, 8)) {
    console.log(`    ${pad(d.id, 6)}  label=${d.label.padEnd(6)} got=${d.got.padEnd(6)} ov=${d.ov.toFixed(3)}`);
  }

  console.log("");
  check("attach_precision", attachPrec, PASS_THRESHOLDS.attachPrecision);
}

// ─── Publish suite ────────────────────────────────────────────────────────────

async function runPublish(): Promise<void> {
  console.log("\n── Publish gate ─────────────────────────────────────────────");

  const fixtures = await loadFixtures<PublishFixture>("publish.jsonl");
  console.log(`  Fixtures loaded: ${fixtures.length}`);

  let correct = 0;
  type PLabel = "auto_publish" | "qa_review" | "archive_only";
  const byLabel: Record<PLabel, { tp: number; fp: number; fn: number }> = {
    auto_publish:  { tp: 0, fp: 0, fn: 0 },
    qa_review:     { tp: 0, fp: 0, fn: 0 },
    archive_only:  { tp: 0, fp: 0, fn: 0 },
  };
  const disagreements: Array<{ id: string; label: string; got: string }> = [];

  for (const fix of fixtures) {
    // Reconstruct a ThreadSignals object from fixture fields.
    const signals: ThreadSignals = {
      cohesionScore:          fix.cohesionScore,
      publishConfidenceScore: fix.publishConfidenceScore,
      medicalDepth:           fix.medicalDepth,
      substantiveReplyCount:  fix.substantiveReplyCount,
      anchorMedicalScore:     fix.anchorMedicalScore,
      anchorAnchorScore:      fix.anchorAnchorScore,
      anchorCategoryHits:     fix.anchorCategoryHits,
      doctorPresent:          fix.doctorPresent,
      isMonologue:            fix.isMonologue ?? false,
    };

    // Minimal mock thread — no replies in llmReviewMessages set.
    const mockThread = {
      anchor:           {} as ScoredMessage,
      replies:          [] as ScoredMessage[],
      waThreadKey:      fix.id,
      threadConfidence: fix.cohesionScore,
      llmAssistedCount: 0,
      llmFailedCount:   0,
      llmDecisions:     [],
    } satisfies WaThread;

    const gate = publishGate(mockThread, cfg, signals, new Set());
    const gateLabel = gate === "auto" ? "auto_publish"
                    : gate === "qa"   ? "qa_review"
                    :                   "archive_only";

    if (gateLabel === fix.label) {
      correct++;
      byLabel[fix.label].tp++;
    } else {
      byLabel[fix.label].fn++;
      byLabel[gateLabel].fp++;
      disagreements.push({ id: fix.id, label: fix.label, got: gateLabel });
    }
  }

  const accuracy = correct / fixtures.length;

  for (const lbl of ["auto_publish", "qa_review", "archive_only"] as const) {
    const { tp, fp, fn } = byLabel[lbl];
    const p = precision(tp, fp);
    const r = recall(tp, fn);
    console.log(`  ${lbl.padEnd(14)} prec=${pct(p)}  rec=${pct(r)}`);
  }

  console.log(`\n  Overall accuracy: ${pct(accuracy)}  (${correct}/${fixtures.length})`);
  console.log(`\n  Disagreements (${disagreements.length} of ${fixtures.length}):`);
  for (const d of disagreements) {
    console.log(`    ${pad(d.id, 6)}  label=${d.label.padEnd(14)} got=${d.got}`);
  }

  console.log("");
  check("publish_accuracy", accuracy, PASS_THRESHOLDS.publishAccuracy);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const suites = suiteArg === "all"
    ? ["classification", "threading", "publish"]
    : [suiteArg];

  console.log(`\nIngestion benchmark  (suite=${suites.join(",")}`
    + (Object.keys(configOverride).length ? `  overrides=${JSON.stringify(configOverride)}` : "")
    + ")");

  if (suites.includes("classification")) await runClassification();
  if (suites.includes("threading"))      await runThreading();
  if (suites.includes("publish"))        await runPublish();

  console.log("\n─────────────────────────────────────────────────────────────");
  if (anyFailed) {
    console.log("Result: FAIL — one or more quality thresholds not met.\n");
    process.exit(1);
  } else {
    console.log("Result: PASS — all quality thresholds met.\n");
  }
}

void main().catch((err: unknown) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
