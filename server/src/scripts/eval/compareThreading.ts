/**
 * Threading Comparison: v1 vs v2
 *
 * Parses pre-generated dry-run outputs from both ingestion scripts and prints
 * a side-by-side stats table plus both thread previews for manual inspection.
 *
 * Usage:
 *   # 1. Generate outputs (run each script directly — they work individually):
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts \
 *     --dry-run --date "24/10/25" --no-llm > /tmp/v1.txt 2>&1
 *
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts \
 *     --dry-run --date "24/10/25" --no-llm > /tmp/v2.txt 2>&1
 *
 *   # 2. Compare:
 *   pnpm --filter server exec tsx src/scripts/eval/compareThreading.ts \
 *     --v1 /tmp/v1.txt --v2 /tmp/v2.txt
 */

import { existsSync, readFileSync } from "fs";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

function argVal(flag: string): string | undefined {
  const idx = rawArgs.indexOf(flag);
  return idx !== -1 ? rawArgs[idx + 1] : undefined;
}

const v1File = argVal("--v1");
const v2File = argVal("--v2");

if (!v1File || !v2File) {
  console.error("Usage: compareThreading.ts --v1 <path> --v2 <path>");
  console.error("");
  console.error("Generate the input files first:");
  console.error("  pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts \\");
  console.error('    --dry-run --date "DD/MM/YY" --no-llm > /tmp/v1.txt 2>&1');
  console.error("  pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts \\");
  console.error('    --dry-run --date "DD/MM/YY" --no-llm > /tmp/v2.txt 2>&1');
  process.exit(1);
}

for (const [flag, path] of [["--v1", v1File], ["--v2", v2File]] as const) {
  if (!existsSync(path)) {
    console.error(`${flag} file not found: ${path}`);
    process.exit(1);
  }
}

const v1Out = readFileSync(v1File, "utf-8");
const v2Out = readFileSync(v2File, "utf-8");

// ─── Stat extraction ──────────────────────────────────────────────────────────

type Stat = number | "?";

function extract(output: string, pattern: RegExp): Stat {
  const m = output.match(pattern);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : "?";
}

function extractStats(output: string) {
  return {
    parsed:   extract(output, /Parsed messages:\s+(\d+)/),
    dropped:  extract(output, /dropped\s+(\d+)\)/),
    threads:  extract(output, /Threads total:\s+(\d+)/),
    auto:     extract(output, /Auto-publish[^:]*:\s+(\d+)/),
    qa:       extract(output, /QA review[^:]*:\s+(\d+)/),
    skipped:  extract(output, /Skipped:\s+(\d+)/),
    backward: extract(output, /Backward-attached replies:\s+(\d+)/),
  };
}

// ─── Thread preview extraction ────────────────────────────────────────────────

function extractPreview(output: string): string {
  const startMarker = "── Thread preview";
  const start = output.indexOf(startMarker);
  if (start === -1) return "  (no preview found)";
  const afterStart = output.indexOf("\n──", start + 1);
  const preview = afterStart !== -1
    ? output.slice(start, afterStart)
    : output.slice(start);
  return preview.trimEnd();
}

// ─── Thread depth distribution ────────────────────────────────────────────────

function depthDist(output: string): Record<string, number> {
  const dist: Record<string, number> = { "0": 0, "1-2": 0, "3-5": 0, "6+": 0 };
  for (const m of output.matchAll(/replies=\s*(\d+)/g)) {
    const n = parseInt(m[1]!, 10);
    if (n === 0)     dist["0"]!++;
    else if (n <= 2) dist["1-2"]!++;
    else if (n <= 5) dist["3-5"]!++;
    else             dist["6+"]!++;
  }
  return dist;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(val: Stat): string {
  return val === "?" ? "  ?" : val.toString().padStart(4);
}

function delta(a: Stat, b: Stat): string {
  if (a === "?" || b === "?") return "  ?";
  const d = (b as number) - (a as number);
  if (d === 0) return "  0";
  return (d > 0 ? "+" : "") + d.toString().padStart(3);
}

function row(label: string, a: Stat, b: Stat, indent = ""): string {
  return `${indent}${label.padEnd(32)}${fmt(a)}    ${fmt(b)}   ${delta(a, b)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SEP  = "═".repeat(62);
const LINE = "─".repeat(62);

const s1 = extractStats(v1Out);
const s2 = extractStats(v2Out);
const d1 = depthDist(v1Out);
const d2 = depthDist(v2Out);

console.log();
console.log(SEP);
console.log(`  Threading Comparison: v1  vs  v2`);
console.log(`  v1: ${v1File}`);
console.log(`  v2: ${v2File}`);
console.log(SEP);
console.log();
console.log(`${"Metric".padEnd(32)}  v1      v2      Δ`);
console.log(LINE);
console.log(row("Messages parsed",           s1.parsed,   s2.parsed));
console.log(row("Messages dropped",          s1.dropped,  s2.dropped));
console.log(row("Threads formed",            s1.threads,  s2.threads));
console.log(row("  Auto-publish",            s1.auto,     s2.auto,    "  "));
console.log(row("  QA review",               s1.qa,       s2.qa,      "  "));
console.log(row("  Skipped",                 s1.skipped,  s2.skipped, "  "));
console.log(row("Backward-attached replies", s1.backward, s2.backward));
console.log(LINE);
console.log();
console.log("Thread depth (from preview sample):");
console.log(`  0 replies   v1=${d1["0"]}  v2=${d2["0"]}`);
console.log(`  1-2 replies v1=${d1["1-2"]}  v2=${d2["1-2"]}`);
console.log(`  3-5 replies v1=${d1["3-5"]}  v2=${d2["3-5"]}`);
console.log(`  6+ replies  v1=${d1["6+"]}  v2=${d2["6+"]}`);
console.log();
console.log(`${"═".repeat(20)} v1 Thread Preview ${"═".repeat(24)}`);
console.log(extractPreview(v1Out));
console.log();
console.log(`${"═".repeat(20)} v2 Thread Preview ${"═".repeat(24)}`);
console.log(extractPreview(v2Out));
console.log();
