/**
 * WhatsApp Chat Ingestion Script — v2
 *
 * Phase 1 stabilization over ingestWhatsApp.ts (kept as reference):
 *   - RunConfig: no global mutable thresholds; all thresholds pass explicitly
 *   - MessageScores: relevanceScore split into medicalRelevanceScore,
 *     anchorLikelihoodScore, replyLikelihoodScore
 *   - LLMDecision: three-way "yes"|"no"|"review"; failures → QA, not silent NO
 *   - ThreadDecisionRecord: typed JSONL artifact per run
 *   - ImportRun: version fields + failure sub-type counters
 *
 * Usage:
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --dry-run
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --print-config
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --lines 114-143
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --date 25/10/25
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --week 01/11/25
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --month 01/11/25
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --file /path/to/_chat.txt
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --no-llm
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --spam-senders "Name1,Name2"
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.v2.ts --spam-markers "prefix1,prefix2"
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { basename, resolve } from "path";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { embeddingsModel } from "../infra/embeddings.js";
import { llm } from "../infra/llm.js";
import { prisma } from "../infra/prisma.js";
import { getRedisConnection } from "../infra/redis.js";

// Queue modules create BullMQ Queue instances (and connect to Redis) at load time.
// Defer their import to main() so importing this module for benchmarking or testing
// does not trigger a Redis connection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let enqueuePostIngest!: Awaited<typeof import("../queues/postIngest.queue.js")>["enqueuePostIngest"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let enqueueReplyIngest!: Awaited<typeof import("../queues/replyIngest.queue.js")>["enqueueReplyIngest"];

// ─── Version constants ────────────────────────────────────────────────────────
// Bump these when the corresponding logic changes so ImportRun records are
// comparable across reruns.

const PARSER_VERSION     = "2.0.0";
const CLASSIFIER_VERSION = "2.0.0";
const THREADING_VERSION  = "3.1.0";
const PUBLISH_VERSION    = "3.0.0";
const EMBEDDING_MODEL    = "intfloat/e5-base-v2";
const LLM_MODEL          = "gemini-2.5-flash";
const LLM_PROMPT_VERSION = "1.0.0";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDoctor(sender: string): boolean {
  return sender.startsWith("Dr.") || sender.startsWith("Dr ");
}

function parseArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1) return args[idx + 1];
  return args.find(a => a.startsWith(`--${name}=`))?.slice(`--${name}=`.length);
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaMessage {
  timestamp: Date;
  sender: string;
  body: string;
  edited: boolean;
  isSystem: boolean;
  isMedia: boolean;
  waMessageKey: string;
  language: "english" | "hinglish";
  parseConfidence: number;  // 1.0 normal, 0.9 edited, 0.8 multi-line continuation
  continuationLines: number; // number of continuation lines joined
}

// Per-message scores — each field has a single purpose.
export interface MessageScores {
  medicalRelevanceScore: number;   // medical term density + embedding proximity
  anchorLikelihoodScore: number;   // question / experiential / recommendation signals
  replyLikelihoodScore: number;    // back-reference / ack / support-seeking signals
  categoryHits: number;            // raw count of matched semantic categories
  // Signal flags — used by the benchmark to mirror the pipeline's experiential-path gate
  isExperiential:  boolean;        // EXPERIENTIAL_PATTERNS matched
  isSupportSeeking: boolean;       // SUPPORT_SEEKING_PATTERNS matched
  isQuestion:      boolean;        // "?" or QUESTION_WORDS startsWith
}

export interface ScoredMessage extends WaMessage {
  scores: MessageScores;
  // Combined scalar kept for backward compat with calcThreadConfidence and DB write.
  // Stores medicalRelevanceScore so Pinecone/ranking signals are correct.
  relevanceScore: number;
  categoryHits: number;
}

export interface WaThread {
  anchor:           ScoredMessage;
  replies:          ScoredMessage[];
  waThreadKey:      string;
  threadConfidence: number;
  llmAssistedCount: number;
  llmFailedCount:   number;
  llmDecisions:     LLMDecisionEntry[];
}

// Three-way LLM decision: failures route to QA instead of silently becoming NO.
export type LLMDecision = "yes" | "no" | "review";

export interface LLMDecisionEntry {
  waMessageKey:  string;
  branch:        "split" | "middle";
  decision:      LLMDecision;
  promptVersion: string;
}

// Typed per-thread decision record written to JSONL artifact.
interface ThreadDecisionRecord {
  waThreadKey: string;
  importRunId: string;
  publishDecision: "auto_publish" | "qa_review" | "archive_only" | "drop";
  threadCohesionScore: number;
  publishConfidenceScore: number;
  anchorMedicalScore: number;
  anchorAnchorScore: number;
  replyCount: number;
  decisionReasons: string[];
  llmAssistedAttachments: number;
  llmFailedAttachments:   number;
  requiresHumanReview:    boolean;
  llmDecisions:           LLMDecisionEntry[];
}

interface RunStats {
  totalLines: number;
  parsedMessages: number;
  droppedMessages: number;
  parseFailures: number;
  createdPosts: number;
  createdReplies: number;
  skippedDuplicates: number;
  qaReviewThreads: number;
  backwardAttached: number;
  llmFailures: number;
  embedFailures: number;
  dbWriteFailures: number;
}

// ─── RunConfig ────────────────────────────────────────────────────────────────
// All thresholds and time windows live here. Functions receive this as a
// parameter — no module-level mutable state.

export interface RunConfig {
  // Score thresholds
  minRelevance: number;
  anchorMinScore: number;
  anchorExperientialScore: number;
  minReplyScore: number;
  autoPublishConf: number;
  qaConf: number;
  middleBandMinScore: number;
  nearThreadRelaxedMin: number;
  backwardMinScore: number;
  // Time windows (ms)
  hardWindowMs: number;
  gapNewThreadMs: number;
}

export const DEFAULT_CONFIG: RunConfig = {
  minRelevance:             30,
  anchorMinScore:           55,
  anchorExperientialScore:  30,
  minReplyScore:            35,
  autoPublishConf:          60,
  qaConf:                   28,
  middleBandMinScore:       50,
  nearThreadRelaxedMin:     15,
  backwardMinScore:         20,
  hardWindowMs:             5 * 60 * 60 * 1000,   // 5 hr
  gapNewThreadMs:           90 * 60 * 1000,        // 90 min
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

export function computeAdaptiveThresholds(scores: number[], base: RunConfig, verbose = false): RunConfig {
  const meaningful = scores.filter(s => s > 10).sort((a, b) => a - b);
  if (meaningful.length < 3) {
    if (verbose) console.log("  [ADAPTIVE] Too few meaningful scores — keeping defaults");
    return base;
  }

  const p40 = percentile(meaningful, 40);
  const p50 = percentile(meaningful, 50);
  const p60 = percentile(meaningful, 60);
  const p75 = percentile(meaningful, 75);

  const cfg: RunConfig = {
    ...base,
    minRelevance:            Math.max(p40, 20),
    anchorMinScore:          Math.max(p75, 35),
    anchorExperientialScore: Math.max(p40, 25),
    minReplyScore:           Math.max(p40, 25),
    middleBandMinScore:      Math.max(p60, 35),
    nearThreadRelaxedMin:    Math.max(Math.round(p40 * 0.5), 10),
    backwardMinScore:        Math.max(Math.round(p40 * 0.6), 15),
    autoPublishConf:         Math.max(p60, 35),
    qaConf:                  Math.max(p40, 20),
  };

  if (verbose) {
    console.log("  [ADAPTIVE] Score distribution:");
    console.log(`    P40=${p40} P50=${p50} P60=${p60} P75=${p75}`);
    console.log(`    → minRelevance=${cfg.minRelevance} anchorMin=${cfg.anchorMinScore} ` +
      `anchorExp=${cfg.anchorExperientialScore} minReply=${cfg.minReplyScore}`);
    console.log(`    → middleBandMin=${cfg.middleBandMinScore} nearRelaxed=${cfg.nearThreadRelaxedMin} ` +
      `backwardMin=${cfg.backwardMinScore}`);
    console.log(`    → autoPublish=${cfg.autoPublishConf} qa=${cfg.qaConf}`);
  }

  return cfg;
}

function computeAdaptiveWindows(messages: WaMessage[], base: RunConfig, verbose = false): RunConfig {
  if (messages.length < 2) return base;

  const sorted = messages.map(m => m.timestamp.getTime()).sort((a, b) => a - b);
  const first = sorted[0] ?? 0;
  const last  = sorted[sorted.length - 1] ?? 0;
  const totalSpanHours = (last - first) / (1000 * 60 * 60);
  if (totalSpanHours < 0.5) return base;

  const GAP_SPLIT = 60 * 60 * 1000;
  const segDensities: number[] = [];
  let segStart = sorted[0] ?? 0;
  let segCount = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] ?? 0;
    const curr = sorted[i] ?? 0;
    if (curr - prev > GAP_SPLIT) {
      const segHours = (prev - segStart) / (1000 * 60 * 60);
      if (segHours > 0.1) segDensities.push(segCount / segHours);
      segStart = curr;
      segCount = 0;
    }
    segCount++;
  }
  const lastTs = sorted[sorted.length - 1] ?? 0;
  const lastSegHours = (lastTs - segStart) / (1000 * 60 * 60);
  if (lastSegHours > 0.1) segDensities.push(segCount / lastSegHours);

  const msgsPerHour = segDensities.length > 0
    ? segDensities.sort((a, b) => a - b)[Math.floor(segDensities.length / 2)] ?? messages.length / totalSpanHours
    : messages.length / totalSpanHours;

  let hardWindowMs   = base.hardWindowMs;
  let gapNewThreadMs = base.gapNewThreadMs;

  if (msgsPerHour < 5) {
    gapNewThreadMs = 180 * 60 * 1000;
    hardWindowMs   = 8 * 60 * 60 * 1000;
  } else if (msgsPerHour > 20) {
    gapNewThreadMs = 45 * 60 * 1000;
    hardWindowMs   = 3 * 60 * 60 * 1000;
  }

  if (verbose) {
    console.log(`  [DENSITY] ${messages.length} msgs, ${segDensities.length} active segments → ${msgsPerHour.toFixed(1)} msg/hr (median)`);
    console.log(`    → GAP=${gapNewThreadMs / 60000}min HARD=${hardWindowMs / 3600000}hr`);
  }

  return { ...base, hardWindowMs, gapNewThreadMs };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TREATMENT_TERMS   = ["chemo", "chemotherapy", "radiation", "hormone", "tamoxifen", "zoladex", "letrozole", "anastrozole", "herceptin", "immunotherapy", "surgery", "mastectomy", "lumpectomy", "biopsy"];
const SCAN_TERMS        = ["scan", "mri", "pet", "ct"];
const SIDE_EFFECT_TERMS = ["nausea", "vomiting", "fatigue", "weakness", "swelling", "fever", "infection", "pain", "hair loss", "weight", "appetite", "dryness", "hot flash", "menopause", "neutropenia", "loose motion", "diarrhea", "constipation", "digestion", "acidity", "gastro", "mouth sore", "neuropathy", "numbness", "tingling", "joint pain", "bone pain", "mood swing", "anxiety", "body ache", "joint", "ache", "insomnia", "headache", "rash", "bloating"];
const SYMPTOM_TERMS     = ["hemoglobin", "platelet", "wbc", "port", "recurrence", "metastasis", "stage", "cancer"];
const CARE_TERMS        = ["oncologist", "doctor", "treatment", "nutrition", "diet", "exercise", "gym", "calorie", "protein"];
const LOGISTICS_TERMS   = ["appointment", "hospital", "insurance", "report", "admit", "discharge", "lab", "blood test", "follow up", "second opinion", "referral", "prescription", "medicine", "pharmacy", "bill", "cost"];
const REMEDY_TERMS      = ["gel", "cream", "ointment", "mouthwash", "mouthpaint", "gargle", "oil pulling", "coconut oil", "aloe vera", "alsi", "turmeric", "haldi", "peppermint", "ginger", "honey", "supplement", "multivitamin", "vitamin", "home remedy", "nuskha", "gharelu", "ayurvedic", "homeopathy"];

export const TERM_CATEGORIES = [TREATMENT_TERMS, SCAN_TERMS, SIDE_EFFECT_TERMS, SYMPTOM_TERMS, CARE_TERMS, LOGISTICS_TERMS, REMEDY_TERMS];

const REFERENCE_TOPICS = [
  "chemotherapy side effects and treatment",
  "emotional support and mental health during cancer",
  "diet nutrition and exercise during cancer",
  "medical appointments and hospital logistics",
  "cancer diagnosis staging and prognosis",
];

const MEDICAL_SYNONYMS: Record<string, string[]> = {
  chemo:        ["kimo", "kemo", "chemothe"],
  radiation:    ["radiyation", "radiat", "radiotherapy"],
  tamoxifen:    ["tamox", "tamoksifen"],
  hormone:      ["hormon"],
  surgery:      ["surgeri", "sarjari", "operation"],
  nausea:       ["nausiya", "ji machlana"],
  pain:         ["dard", "durd", "takleef", "peeda"],
  doctor:       ["daktar", "doc"],
  fatigue:      ["thakan", "kamzori", "weakness"],
  fever:        ["bukhar", "tapman", "temperature"],
  weight:       ["vajan", "wazan", "motapa"],
  hair:         ["baal", "baal jharna"],
  anxiety:      ["chinta", "tension", "ghabrahat"],
  appetite:     ["bhook", "khana nahi"],
  swelling:     ["sujan", "sooj"],
  vomiting:     ["ulti", "vomit"],
  constipation: ["kabz", "qabz", "pet saaf nahi"],
  diarrhea:     ["dast", "loose motion", "pet kharab"],
  headache:     ["sir dard", "sar dard"],
  insomnia:     ["neend nahi", "nind nahi"],
  hospital:     ["aspatal", "haspatal"],
  report:       ["riport"],
  medicine:     ["dawai", "dawa", "goli"],
  blood:        ["khoon"],
  appointment:  ["milne", "dikhane"],
};

const EXPERIENTIAL_PATTERNS = [
  "i had", "i have been", "i've been", "for me", "in my case",
  "i was on", "i am on", "i'm on", "im on", "m on ",
  "same here", "i too", "mujhe bhi",
  "mere liye", "mera doctor", "mere saath", "meri mummy", "meri mom",
  "pe hun", "pe hai", "le raha", "se hun",
  "i experienced", "i went through", "i was given", "i took",
  "it happened to me", "i also had", "i also felt", "when i had",
];

const QUESTION_WORDS = [
  "how ", "what ", "why ", "when ", "where ", "who ", "is ",
  "does ", "can ", "should ", "any ", "anyone", "kindly", "please suggest",
  "kya ", "kaise ", "kaun ",
];

const RECOMMENDATION_PATTERNS = [
  "suggest", "recommend", "try ", "works for", "helped me",
  "avoid", "do not", "make sure",
];

const SUPPORT_SEEKING_PATTERNS = [
  "i need", "need help", "looking for", "please help",
  "has anyone", "can anyone", "anyone help", "any advice", "any suggestions",
  "koi bata", "koi bataye", "koi suggest",
];

const SHORT_CONTEXTUAL_REPLY_PATTERNS = [
  /^(yes|yeah|yep|yaa|haan|han|ji)\b/i,
  /^(same|same here|same problem|same issue)\b/i,
  /^(me too|i too|same with me|happened to me|same for me)\b/i,
  /^i had this too/i,
  /^i have this (too|as well)/i,
  /^(sahi|bilkul|exactly|totally|agreed)\b/i,
  /^(mera bhi|mere saath bhi|mere bhi)\b/i,
  /^(try karo|try karna|try kar)\b/i,
  /^(correct|right|true)\b/i,
];

const BACK_REFERENCE_PATTERNS = [
  /^i also had\b/i,
  /^i had (the )?same\b/i,
  /^i (too|also) (had|have|faced|experienced)\b/i,
  /^same (issue|problem|experience|thing|here)\b/i,
  /^similar (issue|problem|experience)\b/i,
  /^mujhe bhi\b/i,
  /^mere saath bhi\b/i,
  /^hamara bhi\b/i,
];

const HINGLISH_MARKERS = [
  "mujhe", "mere", "mera", "meri", "kya ", "kaise", "kaun", "bhi ",
  "acha", "theek", "haan", "nahi", "bahut", "thoda", "zaroor",
  "koi bata", "koi suggest", "koi bataye", "doctor ko",
];

const STOP_WORDS = new Set([
  "i", "me", "my", "we", "you", "the", "a", "an", "is", "are", "was",
  "and", "or", "but", "in", "on", "at", "to", "for", "of", "it", "this",
  "that", "have", "has", "do", "does", "not", "with", "so", "be", "will",
  "can", "ko", "ka", "ki", "ke", "hai", "hain", "se", "ne", "bhi", "hi",
  "its", "been", "from", "by", "an", "as",
]);

interface SpamSenderRule {
  sender: string;
  patterns: RegExp[];
}

export const DEFAULT_SPAM_SENDER_RULES: SpamSenderRule[] = [
  {
    sender: "Ritika Makkar",
    patterns: [
      /^my lord/i,
      /^shukrana/i,
      /^शुक्रना/,
      /^शुक्राना/,
      /^मेरे प्रभु/,
      /^मेरे भगवान/,
    ],
  },
];

let SPAM_CONTENT_MARKERS = ["Designs that listen.."];

const ATTACH_THRESHOLD  = 0.35;
const SPLIT_THRESHOLD   = 0.20;
const SOFT_REPLY_CAP    = 15;
const SENDER_BONUS_REPLIER = 0.08;
const SENDER_BONUS_ANCHOR  = 0.12;
const MIDDLE_BAND_RECENCY_MS = 15 * 60 * 1000;
const NEAR_THREAD_WINDOW_MS  = 30 * 60 * 1000;
const BACKWARD_WINDOW_MS     = 3 * 60 * 60 * 1000;
const BACKWARD_ATTACH_THRESHOLD = 0.35;

// ─── Phase 0: Normalize ───────────────────────────────────────────────────────

function normalize(raw: string): string[] {
  return raw
    .replace(/[\u200e\u200f\u202a-\u202e\uFEFF\u200B]/g, "")
    .replace(/\u202F/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .split("\n");
}

// ─── Language Detection ───────────────────────────────────────────────────────

function detectLanguage(body: string): "english" | "hinglish" {
  const lower = body.toLowerCase();
  return HINGLISH_MARKERS.some(m => lower.includes(m)) ? "hinglish" : "english";
}

// ─── Phase 1: Parse ───────────────────────────────────────────────────────────

const MSG_REGEX = /^\[(\d{2}\/\d{2}\/\d{2}, \d{1,2}:\d{2}:\d{2} [AP]M)\] ([^:]+): ([\s\S]+)/;

const SYSTEM_PATTERNS = [
  /\bleft\b/i,
  /\badded\b.+\bto the group\b/i,
  /changed their phone number/i,
  /end-to-end encrypted/i,
  /Messages and calls are/i,
  /changed the group/i,
  /created group/i,
  /joined using this group/i,
];

const MEDIA_SUFFIXES = [
  "image omitted", "video omitted", "sticker omitted",
  "document omitted", "audio omitted", "GIF omitted",
  "Contact card omitted",
];

function toPseudonym(sender: string): string {
  const prefix = isDoctor(sender) ? "wa_doctor" : "wa_member";
  return `${prefix}_${sha256(sender.toLowerCase()).slice(0, 8)}`;
}

function parseTimestamp(ts: string): Date {
  const commaIdx = ts.indexOf(", ");
  if (commaIdx === -1) throw new Error(`Bad timestamp: ${ts}`);
  const datePart = ts.slice(0, commaIdx);
  const timePart = ts.slice(commaIdx + 2);

  const dateParts = datePart.split("/");
  const d = parseInt(dateParts[0] ?? "1", 10);
  const m = parseInt(dateParts[1] ?? "1", 10);
  const y = parseInt(dateParts[2] ?? "0", 10);

  const spaceIdx = timePart.lastIndexOf(" ");
  const timeStr  = timePart.slice(0, spaceIdx);
  const meridiem = timePart.slice(spaceIdx + 1);

  const timeParts = timeStr.split(":");
  let h   = parseInt(timeParts[0] ?? "0", 10);
  const min = parseInt(timeParts[1] ?? "0", 10);
  const sec = parseInt(timeParts[2] ?? "0", 10);

  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;

  return new Date(2000 + y, m - 1, d, h, min, sec);
}

function hasAlphanumeric(s: string): boolean {
  // eslint-disable-next-line no-misleading-character-class
  return /[a-zA-Z0-9\u0900-\u097F]/u.test(s);
}

function stripMediaSuffixes(body: string): string {
  let s = body;
  for (const suffix of MEDIA_SUFFIXES) s = s.replace(suffix, "");
  return s.trim();
}

function parse(lines: string[]): { messages: WaMessage[]; failures: number } {
  interface RawMessage {
    timestamp: Date;
    sender: string;
    body: string;
    edited: boolean;
    isSystem: boolean;
    continuationLines: number;
  }

  const raw: RawMessage[] = [];
  let failures = 0;
  let consecutiveFailures = 0;
  let timestampedLines = 0;

  for (const line of lines) {
    const match = MSG_REGEX.exec(line);

    if (match) {
      consecutiveFailures = 0;
      timestampedLines++;

      const tsRaw     = match[1] ?? "";
      const senderRaw = match[2] ?? "";
      const bodyRaw   = match[3] ?? "";

      const edited   = bodyRaw.includes("<This message was edited>");
      const body     = bodyRaw.replace(/<This message was edited>/g, "").trim();
      const sender   = senderRaw.replace(/^~ /, "").trim();
      const isSystem = SYSTEM_PATTERNS.some(p => p.test(body));

      let timestamp: Date;
      try {
        timestamp = parseTimestamp(tsRaw);
      } catch {
        failures++;
        consecutiveFailures++;
        if (consecutiveFailures >= 10) throw new Error("10 consecutive parse failures — aborting");
        continue;
      }

      raw.push({ timestamp, sender, body, edited, isSystem, continuationLines: 0 });

    } else if (line.trim() && raw.length > 0 && !line.startsWith("[")) {
      const last = raw[raw.length - 1];
      if (last) { last.body += "\n" + line; last.continuationLines++; }

    } else if (line.startsWith("[")) {
      failures++;
      timestampedLines++;
      consecutiveFailures++;
      if (consecutiveFailures >= 10) throw new Error("10 consecutive parse failures — aborting");
    }
  }

  if (timestampedLines > 0 && failures / timestampedLines > 0.03) {
    throw new Error(
      `Parse failure rate ${((failures / timestampedLines) * 100).toFixed(1)}% exceeds 3% threshold`
    );
  }

  const messages: WaMessage[] = raw.map(m => {
    const stripped = stripMediaSuffixes(m.body);
    const isMedia  = !hasAlphanumeric(stripped);
    const keyBody  = isMedia ? m.body : stripped;
    const waMessageKey = sha256(m.timestamp.toISOString() + m.sender + keyBody);
    const language = detectLanguage(m.body);
    const parseConfidence = m.edited ? 0.9 : m.continuationLines >= 2 ? 0.8 : 1.0;
    return { ...m, isMedia, waMessageKey, language, parseConfidence };
  });

  return { messages, failures };
}

// ─── Phase 2: Filter Noise ────────────────────────────────────────────────────

export function matchesMedTerm(text: string, term: string): boolean {
  if (!text.includes(term)) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function isBareUrl(s: string): boolean {
  return /^https?:\/\/\S+$/.test(s.trim());
}

export interface NoiseFilterResult {
  kept: WaMessage[];
  dropped: Array<{ msg: WaMessage; reason: string }>;
}

export function filterNoise(messages: WaMessage[], spamRules: SpamSenderRule[]): NoiseFilterResult {
  const kept: WaMessage[] = [];
  const dropped: Array<{ msg: WaMessage; reason: string }> = [];

  for (const msg of messages) {
    const drop = (reason: string) => dropped.push({ msg, reason });

    if (msg.isSystem) { drop("system_message"); continue; }
    if (msg.isMedia)  { drop("media_only"); continue; }

    const trimmed = msg.body.trim();
    if (!hasAlphanumeric(trimmed)) { drop("no_alphanumeric"); continue; }
    if (trimmed.length < 3)        { drop("too_short"); continue; }

    let spamMatch = false;
    for (const rule of spamRules) {
      if (msg.sender === rule.sender && rule.patterns.some(p => p.test(trimmed))) {
        spamMatch = true; break;
      }
    }
    if (spamMatch) { drop("spam_sender"); continue; }

    if (SPAM_CONTENT_MARKERS.some(marker => trimmed.startsWith(marker))) { drop("spam_content"); continue; }
    if (isBareUrl(trimmed)) { drop("bare_url"); continue; }

    const lower = trimmed.toLowerCase();
    const hasMeetingUrl = /zoom\.us|meet\.google|teams\.microsoft/.test(lower);
    const hasEventKeyword = ["join", "meeting", "register", "webinar", "support group"].some(k => lower.includes(k));
    if (hasMeetingUrl && hasEventKeyword) { drop("meeting_link"); continue; }

    const hasSocialUrl = /instagram\.com|youtu\.be|youtube\.com|facebook\.com|twitter\.com|t\.co\//.test(lower);
    if (hasSocialUrl) {
      const bodyWithoutUrl = trimmed.replace(/https?:\/\/\S+/g, " ").trim();
      const hasMedContent = TERM_CATEGORIES.some(cat =>
        cat.some(t => matchesMedTerm(bodyWithoutUrl.toLowerCase(), t))
      );
      if (!hasMedContent) { drop("social_link_no_med"); continue; }
    }

    kept.push(msg);
  }

  return { kept, dropped };
}

// ─── Embedding utilities ──────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Phase 3: Classification (split scores) ───────────────────────────────────

export function expandSynonyms(text: string): string {
  const lower = text.toLowerCase();
  const expansions: string[] = [];
  for (const [canonical, variants] of Object.entries(MEDICAL_SYNONYMS)) {
    if (variants.some(v => lower.includes(v))) expansions.push(canonical);
  }
  return expansions.length > 0 ? lower + " " + expansions.join(" ") : lower;
}

export function classifyMessage(
  msg: WaMessage,
  embMap?: Map<string, number[]>,
  refVecs?: number[][],
): MessageScores {
  const lower = normalizeSpaces(expandSynonyms(msg.body));

  // ── medicalRelevanceScore: medical term density + embedding proximity ──
  const categoryHits = TERM_CATEGORIES.filter(cat => cat.some(t => matchesMedTerm(lower, t))).length;
  let medScore = Math.min(categoryHits * 12, 48);

  const sideEffectHits = SIDE_EFFECT_TERMS.filter(t => matchesMedTerm(lower, t)).length;
  if (sideEffectHits >= 3) medScore += 12;
  else if (sideEffectHits >= 2) medScore += 6;

  if (embMap && refVecs && refVecs.length > 0) {
    const msgVec = embMap.get(msg.body);
    if (msgVec) {
      const maxCos = Math.max(...refVecs.map(rv => cosineSimilarity(msgVec, rv)));
      if (maxCos > 0.5) medScore += 15;
    }
  }

  // Short non-medical penalty applies to medScore
  if (msg.body.trim().length < 20 && categoryHits === 0) medScore -= 10;

  // ── anchorLikelihoodScore: question / experiential / recommendation / doctor signals ──
  let anchorScore = 0;

  const isQuestion      = msg.body.includes("?") || QUESTION_WORDS.some(w => lower.startsWith(w));
  const isExperiential  = EXPERIENTIAL_PATTERNS.some(p => lower.includes(p));
  const isSupportSeeking = SUPPORT_SEEKING_PATTERNS.some(p => lower.includes(p));

  if (isQuestion)     anchorScore += 20;
  if (isExperiential) anchorScore += 15;
  if (RECOMMENDATION_PATTERNS.some(p => lower.includes(p))) anchorScore += 10;
  if (isDoctor(msg.sender)) anchorScore += 15;

  // Carry medical signal into anchor score too — a question with medical terms is a strong anchor
  anchorScore += Math.min(categoryHits * 6, 24);

  // ── replyLikelihoodScore: back-reference / ack / support-seeking signals ──
  let replyScore = 0;

  if (isSupportSeeking) replyScore += 15;

  const trimmed = msg.body.trim();
  if (BACK_REFERENCE_PATTERNS.some(p => p.test(trimmed))) replyScore += 25;
  if (SHORT_CONTEXTUAL_REPLY_PATTERNS.some(p => p.test(trimmed)) && trimmed.length <= 60) replyScore += 15;

  // Ack-only messages: penalise both medical and anchor scores
  if (/^(thank|thanks|ok|okay|noted|sure|yes|no|👍|🙏|great|good)\W*$/i.test(trimmed)) {
    medScore    -= 10;
    anchorScore -= 10;
  }

  return {
    medicalRelevanceScore: clamp(medScore, 0, 100),
    anchorLikelihoodScore: clamp(anchorScore, 0, 100),
    replyLikelihoodScore:  clamp(replyScore, 0, 100),
    categoryHits,
    isExperiential,
    isSupportSeeking,
    isQuestion,
  };
}

export type ContentType = "question" | "experience" | "recommendation" | "ack" | "logistics" | "noise";

export function classifyContentType(msg: WaMessage, scores: MessageScores): ContentType {
  const lower = msg.body.toLowerCase();
  const trimmed = msg.body.trim();

  // ack — simple affirmative/thanks with no substantive content
  if (/^(thank|thanks|ok|okay|noted|sure|yes|no|👍|🙏|great|good)\W*$/i.test(trimmed)) return "ack";

  // logistics — logistics category hit with no treatment/medical category overlap
  const logisticsIdx = TERM_CATEGORIES.indexOf(LOGISTICS_TERMS);
  const hasLogistics = LOGISTICS_TERMS.some(t => matchesMedTerm(lower, t));
  const hasMedOther  = TERM_CATEGORIES.some((cat, i) => i !== logisticsIdx && cat.some(t => matchesMedTerm(lower, t)));
  if (hasLogistics && !hasMedOther && scores.categoryHits <= 1) return "logistics";

  // question — has question signal from anchorLikelihoodScore computation
  if (msg.body.includes("?") || QUESTION_WORDS.some(w => lower.startsWith(w))) return "question";

  // experience — first-person experiential language
  if (EXPERIENTIAL_PATTERNS.some(p => lower.includes(p))) return "experience";

  // recommendation — suggestion or advice
  if (RECOMMENDATION_PATTERNS.some(p => lower.includes(p))) return "recommendation";

  return "noise";
}

// ─── Phase 4: Pseudonymous Users ──────────────────────────────────────────────

const userCache = new Map<string, string>();

async function resolveUser(sender: string): Promise<string> {
  const cached = userCache.get(sender);
  if (cached) return cached;

  const prefix   = isDoctor(sender) ? "wa_doctor" : "wa_member";
  const hash8    = sha256(sender.toLowerCase()).slice(0, 8);
  const username = `${prefix}_${hash8}`;
  const email    = `${username}@hac.internal`;

  const user = await prisma.user.upsert({
    where: { username },
    create: { username, email },
    update: {},
    select: { id: true },
  });

  userCache.set(sender, user.id);
  return user.id;
}

// ─── Phase 5: Thread Reconstruction ──────────────────────────────────────────

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\u0900-\u097F\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t))
  );
}

function medicalCategorySet(s: string): Set<string> {
  const lower = s.toLowerCase();
  const hits = new Set<string>();
  for (const [canonical, variants] of Object.entries(MEDICAL_SYNONYMS)) {
    if (matchesMedTerm(lower, canonical) || variants.some(v => matchesMedTerm(lower, v))) hits.add(canonical);
  }
  return hits;
}

export function topicOverlap(a: string, b: string, embMap?: Map<string, number[]>, embKeyA?: string): number {
  let semanticScore: number;
  const vecA = embMap?.get(embKeyA ?? a);
  const vecB = embMap?.get(b);
  if (vecA && vecB) {
    const rawCos = cosineSimilarity(vecA, vecB);
    semanticScore = clamp((rawCos - 0.75) / 0.20, 0, 1);
  } else {
    const lexA = tokenize(a);
    const lexB = tokenize(b);
    if (lexA.size === 0 || lexB.size === 0) {
      semanticScore = 0;
    } else {
      const inter = [...lexA].filter(t => lexB.has(t)).length;
      semanticScore = inter / new Set([...lexA, ...lexB]).size;
    }
  }

  const medA = medicalCategorySet(a);
  const medB = medicalCategorySet(b);
  const medJaccard = (() => {
    if (medA.size === 0 || medB.size === 0) return 0;
    const inter = [...medA].filter(t => medB.has(t)).length;
    return inter / new Set([...medA, ...medB]).size;
  })();

  const hinglish = detectLanguage(a) === "hinglish" || detectLanguage(b) === "hinglish";
  const semWeight = hinglish ? 0.35 : 0.6;
  const medWeight = hinglish ? 0.65 : 0.4;

  return semWeight * semanticScore + medWeight * medJaccard;
}

function threadContextStr(t: { anchor: ScoredMessage; replies: ScoredMessage[] }): string {
  // Weight the anchor twice so early-thread topic signal stays dominant even as
  // later replies accumulate. Reduces context drift that pulls unrelated messages in.
  const recent = t.replies.slice(-2).map(r => r.body).join(" ");
  return t.anchor.body + " " + t.anchor.body + " " + recent;
}

function senderBonus(msg: ScoredMessage, t: { anchor: ScoredMessage; replies: ScoredMessage[] }): number {
  if (msg.sender === t.anchor.sender) return SENDER_BONUS_ANCHOR;
  const recentRepliers = t.replies.slice(-3).map(r => r.sender);
  if (recentRepliers.includes(msg.sender)) return SENDER_BONUS_REPLIER;
  return 0;
}

export function hasSharedCategories(textA: string, textB: string, maxCats = TERM_CATEGORIES.length): boolean {
  const lowerA = normalizeSpaces(textA.toLowerCase());
  const lowerB = normalizeSpaces(textB.toLowerCase());
  return TERM_CATEGORIES.slice(0, maxCats).some(cat => {
    const hitA = cat.some(t => matchesMedTerm(lowerA, t));
    const hitB = cat.some(t => matchesMedTerm(lowerB, t));
    return hitA && hitB;
  });
}

const RELATED_CATEGORY_PAIRS: [number, number][] = [
  [TERM_CATEGORIES.indexOf(SIDE_EFFECT_TERMS), TERM_CATEGORIES.indexOf(REMEDY_TERMS)],
  [TERM_CATEGORIES.indexOf(CARE_TERMS), TERM_CATEGORIES.indexOf(REMEDY_TERMS)],
];

export function hasRelatedCategories(textA: string, textB: string): boolean {
  const lowerA = normalizeSpaces(textA.toLowerCase());
  const lowerB = normalizeSpaces(textB.toLowerCase());
  const hitsA = new Set(
    TERM_CATEGORIES.map((cat, i) => cat.some(t => matchesMedTerm(lowerA, t)) ? i : -1).filter(i => i >= 0)
  );
  const hitsB = new Set(
    TERM_CATEGORIES.map((cat, i) => cat.some(t => matchesMedTerm(lowerB, t)) ? i : -1).filter(i => i >= 0)
  );
  return RELATED_CATEGORY_PAIRS.some(([a, b]) =>
    (hitsA.has(a) && hitsB.has(b)) || (hitsA.has(b) && hitsB.has(a))
  );
}

// ─── LLM-assisted thread attachment ──────────────────────────────────────────

const LLM_SYSTEM_PROMPT = `You decide if a WhatsApp message belongs in a conversation thread from a cancer support group. Reply YES if the message is responding to, continuing, or directly related to the thread topic. Reply NO if it introduces a different topic. Reply with only YES or NO.`;

let llmCallCount  = 0;
let llmCacheHits  = 0;

const LLM_RATE_WINDOW_MS = 60_000;
const LLM_MAX_RPM = 5;
const llmCallTimestamps: number[] = [];

async function rateLimitedLLMInvoke(
  messages: [SystemMessage, HumanMessage],
  verbose: boolean,
): Promise<Awaited<ReturnType<typeof llm.invoke>>> {
  if (llmCallTimestamps.length >= LLM_MAX_RPM) {
    const oldest = llmCallTimestamps[0]!;
    const waitMs = LLM_RATE_WINDOW_MS - (Date.now() - oldest);
    if (waitMs > 0) {
      if (verbose) {
        console.log(`    [MIDDLE-LLM] rate-limit: waiting ${(waitMs / 1000).toFixed(1)}s (5 RPM cap)`);
      } else {
        process.stdout.write(`\r  [LLM] rate-limit: waiting ${(waitMs / 1000).toFixed(1)}s...   `);
      }
      await new Promise(resolve => setTimeout(resolve, waitMs));
      if (!verbose) process.stdout.write("\r" + " ".repeat(50) + "\r");
    }
    llmCallTimestamps.shift();
  }
  llmCallTimestamps.push(Date.now());
  return llm.invoke(messages);
}

// Returns "yes" | "no" | "review".
// Failures return "review" — they route to QA holdback rather than silently
// becoming NO, so transient API errors are visible and reviewable.
async function shouldAttachLLM(
  thread: { anchor: ScoredMessage; replies: ScoredMessage[] },
  msg: ScoredMessage,
  cache: Map<string, LLMDecision>,
  verbose: boolean,
  stats: RunStats,
): Promise<LLMDecision> {
  const cacheKey = sha256(thread.anchor.body + "|" + msg.body);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    llmCacheHits++;
    if (verbose) console.log(`    [MIDDLE-LLM] ${cached} (cached) | ${msg.body.slice(0, 50).replace(/\n/g, " ")}`);
    return cached;
  }

  const recentReplies = thread.replies.slice(-3).map(r => r.body).join("\n");
  const humanPrompt = recentReplies
    ? `Thread anchor: "${thread.anchor.body}"\nRecent replies:\n${recentReplies}\n---\nNew message: "${msg.body}"`
    : `Thread anchor: "${thread.anchor.body}"\n---\nNew message: "${msg.body}"`;

  try {
    const response = await rateLimitedLLMInvoke([
      new SystemMessage(LLM_SYSTEM_PROMPT),
      new HumanMessage(humanPrompt),
    ], verbose);
    llmCallCount++;

    const text = typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content.map((b: unknown) => typeof b === "string" ? b : (b as { text?: string }).text ?? "").join("")
        : "";
    const decision: LLMDecision = text.trim().toUpperCase().startsWith("YES") ? "yes" : "no";

    cache.set(cacheKey, decision);
    if (verbose) console.log(`    [MIDDLE-LLM] ${decision} | ${msg.body.slice(0, 50).replace(/\n/g, " ")}`);
    return decision;

  } catch (err) {
    stats.llmFailures++;
    const errMsg = err instanceof Error ? err.message : String(err);
    if (verbose) console.log(`    [MIDDLE-LLM] ERROR → review | ${errMsg}`);
    // Do not cache failures — the next run might succeed.
    return "review";
  }
}

function isQuestionLike(msg: ScoredMessage): boolean {
  const lower = msg.body.toLowerCase();
  return msg.body.includes("?") || QUESTION_WORDS.some(w => lower.startsWith(w));
}

function isSupportSeeking(msg: ScoredMessage): boolean {
  const lower = msg.body.toLowerCase();
  return SUPPORT_SEEKING_PATTERNS.some(p => lower.includes(p));
}

function isBackReference(msg: ScoredMessage): boolean {
  const trimmed = msg.body.trim();
  return BACK_REFERENCE_PATTERNS.some(p => p.test(trimmed));
}

function isDeictic(msg: ScoredMessage): boolean {
  if (!msg.body.includes("?")) return false;
  const words = msg.body.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;
  const hasDeictic = words.some(w => ["this", "it", "that", "these", "such", "same"].includes(w));
  if (!hasDeictic) return false;
  const lower = msg.body.toLowerCase();
  const hasMedTerms = TERM_CATEGORIES.some(cat => cat.some(t => matchesMedTerm(lower, t)));
  return !hasMedTerms;
}

function isShortContextualReply(msg: ScoredMessage): boolean {
  const trimmed = msg.body.trim();
  return trimmed.length <= 60 && SHORT_CONTEXTUAL_REPLY_PATTERNS.some(p => p.test(trimmed));
}

function calcThreadConfidence(t: { anchor: ScoredMessage; replies: ScoredMessage[] }, cfg: RunConfig, embMap?: Map<string, number[]>): number {
  const anchorScore = t.anchor.scores.medicalRelevanceScore;
  const subst       = t.replies.filter(r => r.scores.medicalRelevanceScore >= cfg.minRelevance);
  const avgReply    = subst.length > 0
    ? subst.reduce((s, r) => s + r.scores.medicalRelevanceScore, 0) / subst.length
    : 0;
  const avgOverlap  = subst.length > 0
    ? subst.reduce((s, r) => s + topicOverlap(t.anchor.body, r.body, embMap, t.anchor.body), 0) / subst.length
    : 0;
  const replyRatio  = Math.min(subst.length / 5, 1.0);
  const doctorPresent = subst.some(r => isDoctor(r.sender));
  const doctorBonus   = doctorPresent ? 10 : 0;

  return clamp(
    anchorScore * 0.35 + avgReply * 0.25 + avgOverlap * 100 * 0.25 + replyRatio * 100 * 0.15 + doctorBonus,
    0, 100,
  );
}

// ─── Thread signals (publish-stage bundle) ───────────────────────────────────
// computeThreadSignals() is the only publish-stage function that reads
// per-message scores. publishGate() and buildDecisionRecord() work exclusively
// from this pre-computed bundle.

export interface ThreadSignals {
  cohesionScore: number;          // structural quality — calcThreadConfidence() output
  publishConfidenceScore: number; // final weighted publishability signal
  medicalDepth: number;           // fraction of replies with medScore >= cfg.minRelevance
  substantiveReplyCount: number;
  anchorMedicalScore: number;     // anchor's medicalRelevanceScore
  anchorAnchorScore: number;      // anchor's anchorLikelihoodScore
  anchorCategoryHits: number;     // anchor's raw categoryHits count
  doctorPresent: boolean;
}

export function computeThreadSignals(t: WaThread, cfg: RunConfig): ThreadSignals {
  const substantive = t.replies.filter(
    r => r.scores.medicalRelevanceScore >= cfg.minRelevance,
  );
  const medicalDepth   = t.replies.length > 0 ? substantive.length / t.replies.length : 0;
  const doctorPresent  = substantive.some(r => isDoctor(r.sender));
  const anchorMedical  = t.anchor.scores.medicalRelevanceScore;
  const anchorAnchor   = t.anchor.scores.anchorLikelihoodScore;

  // publishConfidenceScore: cohesion is primary; medical depth, anchor strength,
  // and doctor presence add bonuses. Weights are independently tunable.
  const publishConfidenceScore = clamp(
    t.threadConfidence * 0.70
    + medicalDepth * 25
    + (anchorAnchor / 100) * 12
    + (doctorPresent ? 8 : 0),
    0, 100,
  );

  return {
    cohesionScore:         t.threadConfidence,
    publishConfidenceScore,
    medicalDepth,
    substantiveReplyCount: substantive.length,
    anchorMedicalScore:    anchorMedical,
    anchorAnchorScore:     anchorAnchor,
    anchorCategoryHits:    t.anchor.scores.categoryHits,
    doctorPresent,
  };
}

// ─── Thread reconstruction ────────────────────────────────────────────────────

async function reconstructThreads(
  scored: ScoredMessage[],
  cfg: RunConfig,
  verbose = false,
  embMap?: Map<string, number[]>,
  useLLM = true,
  stats: RunStats = { totalLines: 0, parsedMessages: 0, droppedMessages: 0, parseFailures: 0, createdPosts: 0, createdReplies: 0, skippedDuplicates: 0, qaReviewThreads: 0, backwardAttached: 0, llmFailures: 0, embedFailures: 0, dbWriteFailures: 0 },
): Promise<{ threads: WaThread[]; backwardAttached: number; llmReviewMessages: Set<string> }> {
  const llmCache = new Map<string, LLMDecision>();
  llmCallCount = 0;
  llmCacheHits = 0;
  llmCallTimestamps.length = 0;

  // Track message keys that were routed to review due to LLM failures
  const llmReviewMessages = new Set<string>();

  interface ActiveThread {
    anchor:           ScoredMessage;
    replies:          ScoredMessage[];
    lastTime:         number;
    llmAssistedCount: number;
    llmFailedCount:   number;
    llmDecisions:     LLMDecisionEntry[];
  }

  const active: ActiveThread[]      = [];
  const finalized: WaThread[]       = [];
  const unattached: ScoredMessage[] = [];

  function finalize(t: ActiveThread): void {
    finalized.push({
      anchor:           t.anchor,
      replies:          t.replies,
      waThreadKey:      t.anchor.waMessageKey,
      threadConfidence: calcThreadConfidence(t, cfg, embMap),
      llmAssistedCount: t.llmAssistedCount,
      llmFailedCount:   t.llmFailedCount,
      llmDecisions:     t.llmDecisions,
    });
  }

  function evictWeakest(): void {
    let weakIdx = 0;
    let weakScore = Infinity;
    for (let i = 0; i < active.length; i++) {
      const t = active[i]!;
      const score = t.anchor.scores.medicalRelevanceScore + t.replies.length * 5;
      if (score < weakScore) { weakScore = score; weakIdx = i; }
    }
    const weakest = active[weakIdx];
    if (weakest) { finalize(weakest); active.splice(weakIdx, 1); }
  }

  for (const msg of scored) {
    const medScore    = msg.scores.medicalRelevanceScore;
    const anchorScore = msg.scores.anchorLikelihoodScore;

    if (medScore < cfg.minRelevance) {
      if (isShortContextualReply(msg) && active.length > 0 && medScore >= cfg.nearThreadRelaxedMin) {
        const now = msg.timestamp.getTime();
        const best = active.reduce((a, b) => a.lastTime > b.lastTime ? a : b);
        if (now - best.lastTime <= cfg.gapNewThreadMs) {
          best.replies.push(msg);
          best.lastTime = now;
        } else {
          unattached.push(msg);
        }
      } else if (active.length > 0 && medScore >= cfg.nearThreadRelaxedMin) {
        const now = msg.timestamp.getTime();
        const recentThread = active.find(t => (now - t.lastTime) <= NEAR_THREAD_WINDOW_MS);
        if (recentThread) {
          const ctx = threadContextStr(recentThread);
          const hasAnyCategoryMatch = hasSharedCategories(msg.body, ctx, 5);
          const hasRelated = hasRelatedCategories(msg.body, ctx);
          const hasSender = senderBonus(msg, recentThread) > 0;
          const shouldAttach = hasAnyCategoryMatch || hasRelated || hasSender || isDoctor(msg.sender);
          if (verbose) {
            const gap = now - recentThread.lastTime;
            console.log(
              `    [RELAX] catMatch=${hasAnyCategoryMatch} related=${hasRelated} sender=${hasSender} doctor=${isDoctor(msg.sender)} ` +
              `gap=${Math.round(gap / 60000)}min score=${medScore} ` +
              `${shouldAttach ? "→ATTACH" : "→SKIP"} ` +
              `| ${msg.body.slice(0, 50).replace(/\n/g, " ")}`
            );
          }
          if (shouldAttach) {
            recentThread.replies.push(msg);
            recentThread.lastTime = now;
          } else {
            unattached.push(msg);
          }
        } else {
          if (verbose) {
            console.log(`    [RELAX] no recent thread score=${medScore} | ${msg.body.slice(0, 50).replace(/\n/g, " ")}`);
          }
          unattached.push(msg);
        }
      } else if (active.length > 0) {
        unattached.push(msg);
      }
      continue;
    }

    const now = msg.timestamp.getTime();

    // Expire threads past hard window
    for (let i = active.length - 1; i >= 0; i--) {
      const t = active[i];
      if (t && now - t.anchor.timestamp.getTime() > cfg.hardWindowMs) {
        finalize(t);
        active.splice(i, 1);
      }
    }

    const question = isQuestionLike(msg);
    const seeking  = isSupportSeeking(msg);

    const msgLower = msg.body.toLowerCase();
    const isExperientialWithMed =
      EXPERIENTIAL_PATTERNS.some(p => msgLower.includes(p)) &&
      TERM_CATEGORIES.some(cat => cat.some(t => matchesMedTerm(msgLower, t)));
    const isSupportSeekingWithMed =
      seeking &&
      TERM_CATEGORIES.some(cat => cat.some(t => matchesMedTerm(msgLower, t)));
    const isQuestionWithMed =
      question &&
      TERM_CATEGORIES.some(cat => cat.some(t => matchesMedTerm(msgLower, t)));

    const independent =
      anchorScore >= cfg.anchorMinScore ||
      (isExperientialWithMed   && anchorScore >= cfg.anchorExperientialScore) ||
      (isSupportSeekingWithMed && anchorScore >= cfg.anchorExperientialScore) ||
      (isQuestionWithMed       && anchorScore >= cfg.anchorExperientialScore);

    const canAnchor = question || seeking || isExperientialWithMed;

    if (active.length === 0) {
      if (canAnchor && independent) {
        active.push({ anchor: msg, replies: [], lastTime: now, llmAssistedCount: 0, llmFailedCount: 0, llmDecisions: [] });
      }
      continue;
    }

    const first = active[0];
    if (!first) continue;
    let bestIdx       = 0;
    let bestRawOv     = topicOverlap(threadContextStr(first), msg.body, embMap, first.anchor.body);
    let bestEffective = bestRawOv + senderBonus(msg, first);
    for (let i = 1; i < active.length; i++) {
      const t = active[i];
      if (!t) continue;
      const rawOv = topicOverlap(threadContextStr(t), msg.body, embMap, t.anchor.body);
      const effOv = rawOv + senderBonus(msg, t);
      if (effOv > bestEffective) { bestRawOv = rawOv; bestEffective = effOv; bestIdx = i; }
    }

    const best = active[bestIdx];
    if (!best) continue;

    if (verbose) {
      const gap = now - best.lastTime;
      const branch = bestEffective >= ATTACH_THRESHOLD ? "ATTACH" :
        bestEffective < SPLIT_THRESHOLD ? "SPLIT" : "MIDDLE";
      console.log(
        `    [${branch}] ov=${bestRawOv.toFixed(3)} eff=${bestEffective.toFixed(3)} ` +
        `gap=${Math.round(gap / 60000)}min medScore=${medScore} anchorScore=${anchorScore} ` +
        `| ${msg.body.slice(0, 50).replace(/\n/g, " ")}`
      );
    }

    if (bestEffective >= ATTACH_THRESHOLD) {
      // New-thread escape: a message that is actively asking for something new
      // (question or support-seeking) starts its own thread even when overlap is high.
      // Restricted to questions/seekers only — experiential messages ("I have been on X")
      // are almost always replies to an existing question, not new anchors.
      const isNewAnchor = (question || seeking) && independent && !isDeictic(msg) && !isBackReference(msg);
      if (isNewAnchor) {
        if (active.length >= 3) evictWeakest();
        active.push({ anchor: msg, replies: [], lastTime: now, llmAssistedCount: 0, llmFailedCount: 0, llmDecisions: [] });
      } else if (msg.scores.replyLikelihoodScore >= cfg.minReplyScore || medScore >= cfg.minReplyScore) {
        if (best.replies.length < SOFT_REPLY_CAP || bestRawOv >= 0.5) {
          best.replies.push(msg);
          best.lastTime = now;
        } else {
          unattached.push(msg);
        }
      } else {
        unattached.push(msg);
      }

    } else if (bestEffective < SPLIT_THRESHOLD && canAnchor && independent) {
      const gapFromAnchor = now - best.anchor.timestamp.getTime();
      const recentThread = gapFromAnchor < cfg.gapNewThreadMs;
      const recentOpenQuestion = recentThread &&
        (isQuestionLike(best.anchor) || isSupportSeeking(best.anchor));

      if (recentOpenQuestion && isBackReference(msg)) {
        if (verbose) console.log(`    [SPLIT→ATTACH] back-reference opener within open-question window`);
        best.replies.push(msg);
        best.lastTime = now;
      } else if ((recentOpenQuestion || (recentThread && isDeictic(msg))) && useLLM) {
        // Fast path: shared medical categories → attach without calling LLM
        if (hasSharedCategories(msg.body, threadContextStr(best))) {
          if (verbose) console.log(`    [SPLIT→ATTACH] shared categories fast path`);
          best.replies.push(msg);
          best.lastTime = now;
        } else {
          // eslint-disable-next-line no-await-in-loop
          const decision = await shouldAttachLLM(best, msg, llmCache, verbose, stats);
          best.llmDecisions.push({ waMessageKey: msg.waMessageKey, branch: "split", decision, promptVersion: LLM_PROMPT_VERSION });
          if (decision === "yes") {
            if (verbose) console.log(`    [SPLIT→ATTACH] deictic/answer LLM=YES`);
            best.replies.push(msg);
            best.lastTime = now;
            best.llmAssistedCount++;
          } else if (decision === "review") {
            // LLM failed — route to QA rather than silently splitting.
            // Do NOT increment best.llmFailedCount here: the message goes to
            // unattached, not to best.replies. Attribution happens in the
            // backward pass if the message is later attached to a thread.
            if (verbose) console.log(`    [SPLIT→REVIEW] LLM failure → QA`);
            llmReviewMessages.add(msg.waMessageKey);
            unattached.push(msg);
          } else {
            if (active.length >= 3) evictWeakest();
            active.push({ anchor: msg, replies: [], lastTime: now, llmAssistedCount: 0, llmFailedCount: 0, llmDecisions: [] });
          }
        }
      } else {
        if (active.length >= 3) evictWeakest();
        active.push({ anchor: msg, replies: [], lastTime: now, llmAssistedCount: 0, llmFailedCount: 0, llmDecisions: [] });
      }

    } else {
      // Middle band
      const gap = now - best.lastTime;
      if (gap > cfg.gapNewThreadMs && canAnchor && independent) {
        if (active.length >= 3) evictWeakest();
        active.push({ anchor: msg, replies: [], lastTime: now, llmAssistedCount: 0, llmFailedCount: 0, llmDecisions: [] });
      } else if (canAnchor && independent && bestEffective < ATTACH_THRESHOLD) {
        if (active.length >= 3) evictWeakest();
        active.push({ anchor: msg, replies: [], lastTime: now, llmAssistedCount: 0, llmFailedCount: 0, llmDecisions: [] });
      } else if (medScore >= cfg.minRelevance) {
        const DOCTOR_ATTACH_MIN = 0.05;
        const bestCtx           = threadContextStr(best);
        const hasSenderMatch    = senderBonus(msg, best) > 0;
        const hasStrongSignal   = (hasSenderMatch || isDoctor(msg.sender)) && bestEffective > DOCTOR_ATTACH_MIN;
        const hasHighRelevance  = medScore >= cfg.middleBandMinScore;
        const hasSharedMedical  = hasSharedCategories(msg.body, bestCtx);
        const hasRecentActivity = (now - best.lastTime) <= MIDDLE_BAND_RECENCY_MS;
        const hasRelated        = hasRelatedCategories(msg.body, bestCtx);

        const hasHighWithOverlap    = hasHighRelevance && bestEffective >= 0.22;
        const hasRecentWithOverlap  = hasRecentActivity && bestEffective >= 0.25;
        const hasMedicalWithOverlap = hasSharedMedical && bestEffective >= 0.20;
        const hasRelatedWithRecency = hasRelated && hasRecentActivity && bestEffective >= 0.25;

        // Deterministic path: resolve without LLM when signal is clear enough.
        const deterministicAttach = hasStrongSignal || hasHighWithOverlap
          || hasMedicalWithOverlap || hasRecentWithOverlap || hasRelatedWithRecency;

        if (deterministicAttach) {
          best.replies.push(msg);
          best.lastTime = now;
        } else if (useLLM) {
          // LLM only for messages with enough signal to be worth querying.
          const msgLower2   = normalizeSpaces(msg.body.toLowerCase());
          const hasMedTerms = TERM_CATEGORIES.some(cat => cat.some(t => matchesMedTerm(msgLower2, t)));
          const worthLLM    = hasMedTerms && (hasSharedMedical || hasRelated || bestEffective >= SPLIT_THRESHOLD);
          if (!worthLLM) {
            unattached.push(msg);
          } else {
            // eslint-disable-next-line no-await-in-loop
            const decision = await shouldAttachLLM(best, msg, llmCache, verbose, stats);
            best.llmDecisions.push({ waMessageKey: msg.waMessageKey, branch: "middle", decision, promptVersion: LLM_PROMPT_VERSION });
            if (decision === "yes") {
              best.replies.push(msg);
              best.lastTime = now;
              best.llmAssistedCount++;
            } else if (decision === "review") {
              if (verbose) console.log(`    [MIDDLE→REVIEW] LLM failure → QA`);
              llmReviewMessages.add(msg.waMessageKey);
              unattached.push(msg);
            } else {
              unattached.push(msg);
            }
          }
        } else {
          unattached.push(msg);
        }
      }
    }
  }

  for (const t of active) finalize(t);

  // Backward pass
  let backwardCount = 0;
  for (const msg of unattached) {
    if (msg.scores.medicalRelevanceScore < cfg.backwardMinScore) continue;

    const msgTime = msg.timestamp.getTime();
    let bestThread: WaThread | null = null;
    let bestOv = 0;

    for (const t of finalized) {
      const anchorTime = t.anchor.timestamp.getTime();
      if (msgTime < anchorTime) continue;
      if (msgTime - anchorTime > BACKWARD_WINDOW_MS) continue;

      const ctx = t.anchor.body + " " + t.replies.slice(-3).map(r => r.body).join(" ");
      let ov = topicOverlap(ctx, msg.body, embMap, t.anchor.body);
      ov += senderBonus(msg, t);

      if (ov > bestOv) { bestOv = ov; bestThread = t; }
    }

    if (bestThread && bestOv >= BACKWARD_ATTACH_THRESHOLD) {
      bestThread.replies.push(msg);
      bestThread.replies.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      bestThread.threadConfidence = calcThreadConfidence(bestThread, cfg, embMap);
      // If this message was an LLM-review failure, credit the thread it actually landed in.
      if (llmReviewMessages.has(msg.waMessageKey)) bestThread.llmFailedCount++;
      backwardCount++;
    }
  }

  // Guarantee QA visibility: any LLM-failure message that survived neither forward
  // threading nor backward attach gets a synthetic singleton thread so it always
  // appears in the decision-record JSONL with requiresHumanReview=true.
  const attachedKeys = new Set<string>();
  for (const t of finalized) {
    for (const r of t.replies) attachedKeys.add(r.waMessageKey);
  }
  for (const msg of unattached) {
    if (!llmReviewMessages.has(msg.waMessageKey)) continue;
    if (attachedKeys.has(msg.waMessageKey)) continue;
    finalized.push({
      anchor:           msg,
      replies:          [],
      waThreadKey:      msg.waMessageKey,
      threadConfidence: 0,
      llmAssistedCount: 0,
      llmFailedCount:   1,
      llmDecisions:     [],
    });
  }

  return { threads: finalized, backwardAttached: backwardCount, llmReviewMessages };
}

// ─── Phase 6: Title Cleaning ──────────────────────────────────────────────────

function cleanTitle(body: string): string {
  let s = body.trim();
  s = s.replace(
    /^(hello\s+friends|hello|hi\s+everyone|hi|dear\s+\w+|good\s+morning|good\s+afternoon|good\s+evening)\s*[,.]?\s*/i,
    "",
  ).trim();
  s = s.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\s]+/u, "").trim();

  const questionMatch = /[^.!?\n]*\?/.exec(s);
  if (questionMatch) {
    s = questionMatch[0].trim();
  } else {
    const breakIdx = /[.!?\n]/.exec(s.slice(10))?.index;
    if (breakIdx !== undefined) s = s.slice(0, 10 + breakIdx + 1).trim();
  }

  if (s.length > 80) {
    const sub = s.slice(0, 80);
    const lastSpace = sub.lastIndexOf(" ");
    s = (lastSpace > 20 ? sub.slice(0, lastSpace) : sub) + "...";
  }

  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s || body.slice(0, 60);
}

// ─── Publish gate ─────────────────────────────────────────────────────────────

export function publishGate(
  t: WaThread,
  cfg: RunConfig,
  signals: ThreadSignals,
  llmReviewMessages: Set<string>,
): "auto" | "qa" | "skip" {
  if (
    llmReviewMessages.has(t.anchor.waMessageKey) ||
    t.replies.some(r => llmReviewMessages.has(r.waMessageKey))
  ) return "qa";

  // Standalone strong medical post — no substantive replies yet, but anchor is solid.
  // Require 3+ medical category hits to avoid promoting borderline anchors.
  if (
    signals.substantiveReplyCount === 0 &&
    signals.anchorMedicalScore >= cfg.anchorExperientialScore &&
    signals.anchorCategoryHits >= 3
  ) {
    return "auto";
  }

  if (signals.publishConfidenceScore >= cfg.autoPublishConf) return "auto";
  if (signals.publishConfidenceScore >= cfg.qaConf)          return "qa";

  // Standalone question with at least one medical category hit → auto-publish.
  // Catches genuine diet/treatment queries (e.g. "Can I eat X during chemo?") whose
  // anchor vocabulary doesn't span 3+ categories but is clearly medically grounded.
  if (
    signals.substantiveReplyCount === 0 &&
    isQuestionLike(t.anchor) &&
    signals.anchorCategoryHits >= 1 &&
    signals.anchorMedicalScore >= cfg.minRelevance
  ) return "auto";

  return "skip";
}

// ─── Decision record builder ──────────────────────────────────────────────────

function buildDecisionRecord(
  t: WaThread,
  gate: "auto" | "qa" | "skip",
  importRunId: string,
  signals: ThreadSignals,
  cfg: RunConfig,
  llmReviewMessages: Set<string>,
): ThreadDecisionRecord {
  const reasons: string[] = [];

  if (
    llmReviewMessages.has(t.anchor.waMessageKey) ||
    t.replies.some(r => llmReviewMessages.has(r.waMessageKey))
  ) {
    reasons.push("llm_failure_in_attachment");
  }

  if (signals.substantiveReplyCount === 0 && gate === "auto") {
    reasons.push("standalone_anchor");
  }
  if (signals.doctorPresent) {
    reasons.push("doctor_present");
  }
  if (signals.medicalDepth > 0) {
    reasons.push(`medical_depth_${Math.round(signals.medicalDepth * 100)}pct`);
  }
  if (signals.publishConfidenceScore >= cfg.autoPublishConf && gate === "auto") {
    reasons.push(`pub_conf_${signals.publishConfidenceScore.toFixed(0)}_above_auto_threshold`);
  }
  if (signals.publishConfidenceScore < cfg.autoPublishConf && signals.publishConfidenceScore >= cfg.qaConf) {
    reasons.push(`pub_conf_${signals.publishConfidenceScore.toFixed(0)}_in_qa_band`);
  }
  if (gate === "skip") {
    reasons.push(`pub_conf_${signals.publishConfidenceScore.toFixed(0)}_below_qa_threshold`);
  }

  const publishDecisionMap = {
    auto: "auto_publish",
    qa:   "qa_review",
    skip: "archive_only",
  } as const;

  return {
    waThreadKey:            t.waThreadKey,
    importRunId,
    publishDecision:        publishDecisionMap[gate],
    threadCohesionScore:    signals.cohesionScore,
    publishConfidenceScore: signals.publishConfidenceScore,
    anchorMedicalScore:     signals.anchorMedicalScore,
    anchorAnchorScore:      signals.anchorAnchorScore,
    replyCount:             t.replies.length,
    decisionReasons:        reasons.length > 0 ? reasons : ["heuristic_gate"],
    llmAssistedAttachments: t.llmAssistedCount,
    llmFailedAttachments:   t.llmFailedCount,
    requiresHumanReview:    gate === "qa",
    llmDecisions:           t.llmDecisions,
  };
}

// ─── Phase D: Seed ────────────────────────────────────────────────────────────

async function seedReplies(
  thread: WaThread,
  postId: string,
  runId: string,
  stats: RunStats,
): Promise<void> {
  for (const reply of thread.replies) {
    const existingReply = await prisma.reply.findUnique({
      where: { waMessageKey: reply.waMessageKey },
      select: { id: true },
    });
    if (existingReply) {
      stats.skippedDuplicates++;
      await enqueueReplyIngest({ type: "create", replyId: existingReply.id }, { jobId: existingReply.id });
      continue;
    }

    const replyUserId = await resolveUser(reply.sender);
    try {
      const replyRow = await prisma.reply.create({
        data: {
          postId,
          userId:           replyUserId,
          content:          reply.body,
          createdAt:        reply.timestamp,
          originPlatform:   "whatsapp",
          waMessageKey:     reply.waMessageKey,
          waThreadKey:      thread.waThreadKey,
          importRunId:      runId,
          relevanceScore:   reply.scores.medicalRelevanceScore,
          threadConfidence: thread.threadConfidence,
          medicalRisk:      "low",
        },
      });
      stats.createdReplies++;
      await enqueueReplyIngest({ type: "create", replyId: replyRow.id });
    } catch (err) {
      stats.dbWriteFailures++;
      console.error(`  [SEED] reply write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function seedThread(thread: WaThread, runId: string, stats: RunStats): Promise<void> {
  const existing = await prisma.post.findUnique({
    where: { waMessageKey: thread.anchor.waMessageKey },
    select: { id: true },
  });

  if (existing) {
    stats.skippedDuplicates++;
    await enqueuePostIngest({ type: "create", postId: existing.id }, { jobId: existing.id });
    await seedReplies(thread, existing.id, runId, stats);
    return;
  }

  const userId = await resolveUser(thread.anchor.sender);

  let post: { id: string };
  try {
    post = await prisma.post.create({
      data: {
        title:            cleanTitle(thread.anchor.body),
        content:          thread.anchor.body,
        userId,
        createdAt:        thread.anchor.timestamp,
        originPlatform:   "whatsapp",
        waMessageKey:     thread.anchor.waMessageKey,
        waThreadKey:      thread.waThreadKey,
        importRunId:      runId,
        relevanceScore:   thread.anchor.scores.medicalRelevanceScore,
        threadConfidence: thread.threadConfidence,
        medicalRisk:      "low",
      },
    });
  } catch (err) {
    stats.dbWriteFailures++;
    console.error(`  [SEED] post write failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  stats.createdPosts++;

  await enqueuePostIngest({ type: "create", postId: post.id });
  await new Promise<void>(r => setTimeout(r, 50));

  await seedReplies(thread, post.id, runId, stats);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args    = process.argv.slice(2);
  const dryRun  = args.includes("--dry-run");
  const verbose = args.includes("--verbose");
  const noEmbed = args.includes("--no-embed");
  const noLLM   = args.includes("--no-llm");
  const printConfig = args.includes("--print-config");

  // Load queue modules (and their Redis connections) only in live mode.
  if (!dryRun) {
    ({ enqueuePostIngest } = await import("../queues/postIngest.queue.js"));
    ({ enqueueReplyIngest } = await import("../queues/replyIngest.queue.js"));
  }

  const linesArg       = parseArg(args, "lines");
  const dateArg        = parseArg(args, "date");
  const weekArg        = parseArg(args, "week");
  const monthArg       = parseArg(args, "month");
  const fileArg        = parseArg(args, "file");
  const importModeArg  = parseArg(args, "mode");
  const spamSendersArg = parseArg(args, "spam-senders");
  const spamMarkersArg = parseArg(args, "spam-markers");

  const spamRules: SpamSenderRule[] = [...DEFAULT_SPAM_SENDER_RULES];
  if (spamSendersArg) {
    for (const name of spamSendersArg.split(",").map(s => s.trim()).filter(Boolean)) {
      spamRules.push({ sender: name, patterns: [/[\s\S]*/] });
    }
  }
  if (spamMarkersArg) {
    SPAM_CONTENT_MARKERS = spamMarkersArg.split(",").map(s => s.trim()).filter(Boolean);
  }

  function weekDates(start: string): string[] {
    const [dd, mm, yy] = start.split("/").map(Number);
    if (dd === undefined || mm === undefined || yy === undefined) throw new Error(`Invalid --week date format: ${start}`);
    const base = new Date(2000 + yy, mm - 1, dd);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(`${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${(d.getFullYear() - 2000).toString().padStart(2, "0")}`);
    }
    return dates;
  }

  function monthDates(start: string): string[] {
    const [dd, mm, yy] = start.split("/").map(Number);
    if (dd === undefined || mm === undefined || yy === undefined) throw new Error(`Invalid --month date format: ${start}`);
    const base = new Date(2000 + yy, mm - 1, dd);
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const remaining = daysInMonth - dd + 1;
    const dates: string[] = [];
    for (let i = 0; i < remaining; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(`${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${(d.getFullYear() - 2000).toString().padStart(2, "0")}`);
    }
    return dates;
  }

  const datesToProcess = monthArg ? monthDates(monthArg)
    : weekArg ? weekDates(weekArg)
    : dateArg ? [dateArg]
    : [undefined];

  const chatPath = fileArg
    ? resolve(fileArg)
    : resolve(process.cwd(), "../_chat.txt");

  console.log(`Reading: ${chatPath}`);
  if (dryRun) console.log("Mode: dry-run (no DB writes)\n");

  const raw = readFileSync(chatPath, "utf-8");
  const allLines = normalize(raw);

  for (const currentDate of datesToProcess) {
    let lines: string[];
    if (currentDate) {
      const prefix = `[${currentDate}`;
      const dateLines: string[] = [];
      let inDate = false;
      for (const line of allLines) {
        if (line.startsWith("[")) inDate = line.startsWith(prefix);
        if (inDate) dateLines.push(line);
      }
      lines = dateLines;
      if (datesToProcess.length > 1) {
        console.log(`\n${"═".repeat(60)}`);
        console.log(`  ${currentDate}`);
        console.log(`${"═".repeat(60)}`);
      }
      console.log(`Filtered to date ${currentDate} (${lines.length} lines)\n`);
      if (lines.length === 0) { console.log("  No messages for this date — skipping.\n"); continue; }
    } else {
      lines = allLines;
    }

    if (linesArg) {
      const parts = linesArg.split("-");
      const start = Math.max(0, parseInt(parts[0] ?? "1", 10) - 1);
      const end   = parseInt(parts[1] ?? String(lines.length), 10);
      lines = lines.slice(start, end);
      console.log(`Sliced to lines ${start + 1}–${end} (${lines.length} lines)\n`);
    }

    const stats: RunStats = {
      totalLines: lines.length, parsedMessages: 0, droppedMessages: 0,
      parseFailures: 0, createdPosts: 0, createdReplies: 0,
      skippedDuplicates: 0, qaReviewThreads: 0, backwardAttached: 0,
      llmFailures: 0, embedFailures: 0, dbWriteFailures: 0,
    };

    // ── Parse ──
    const { messages, failures } = parse(lines);
    stats.parsedMessages = messages.length;
    stats.parseFailures  = failures;

    // ── Filter ──
    const { kept: filteredKept, dropped: filteredDropped } = filterNoise(messages, spamRules);
    stats.droppedMessages = filteredDropped.length;

    // ── Embed ──
    let embMap: Map<string, number[]> | undefined;
    let refVecs: number[][] | undefined;

    if (!noEmbed) {
      const uniqueBodies = [...new Set(filteredKept.map(m => m.body))];
      const allTexts = [...uniqueBodies, ...REFERENCE_TOPICS];
      const prefixed = allTexts.map(t => "passage: " + t);

      console.log(`\n  Embedding ${uniqueBodies.length} messages + ${REFERENCE_TOPICS.length} reference topics...`);
      try {
        const vectors = await embeddingsModel.embedDocuments(prefixed);
        embMap = new Map<string, number[]>();
        for (let i = 0; i < allTexts.length; i++) {
          const text = allTexts[i];
          const vec  = vectors[i];
          if (text !== undefined && vec !== undefined) embMap.set(text, vec);
        }
        refVecs = REFERENCE_TOPICS.map(t => embMap!.get(t)).filter((v): v is number[] => v !== undefined);
        console.log(`  Embedded ${embMap.size} texts (${vectors[0]?.length ?? "?"} dims)`);
      } catch (err) {
        stats.embedFailures++;
        console.log(`  Embedding failed: ${err instanceof Error ? err.message : String(err)}`);
        console.log("  Falling back to keyword-only mode");
      }
    }

    // ── Classify (split scores) ──
    const scored: ScoredMessage[] = filteredKept.map(m => {
      const scores = classifyMessage(m, embMap, refVecs);
      return { ...m, scores, relevanceScore: scores.medicalRelevanceScore, categoryHits: scores.categoryHits };
    });

    // ── Adaptive config (per run segment, no global mutations) ──
    let cfg = computeAdaptiveThresholds(scored.map(m => m.scores.medicalRelevanceScore), DEFAULT_CONFIG, verbose);
    cfg = computeAdaptiveWindows(filteredKept, cfg, verbose);

    if (printConfig) {
      console.log("\n── RunConfig ───────────────────────────────────");
      console.log(JSON.stringify(cfg, null, 2));
      console.log("\n(--print-config: exiting without processing)");
      await getRedisConnection().quit();
      return;
    }

    const buckets = { drop: 0, borderline: 0, eligible: 0 };
    for (const m of scored) {
      if (m.scores.medicalRelevanceScore < cfg.minRelevance) buckets.drop++;
      else if (m.scores.anchorLikelihoodScore < cfg.anchorMinScore) buckets.borderline++;
      else buckets.eligible++;
    }

    console.log("── Parse & Filter ──────────────────────────────");
    console.log(`  Total lines:        ${stats.totalLines}`);
    console.log(`  Parsed messages:    ${stats.parsedMessages}`);
    console.log(`  Parse failures:     ${stats.parseFailures}`);
    console.log(`  After noise filter: ${filteredKept.length} (dropped ${stats.droppedMessages})`);
    console.log(`  medScore < ${cfg.minRelevance} (drop):  ${buckets.drop}`);
    console.log(`  anchorScore < ${cfg.anchorMinScore} (border): ${buckets.borderline}`);
    console.log(`  anchorScore >= ${cfg.anchorMinScore} (anchor): ${buckets.eligible}`);

    if (verbose) {
      console.log("\n── Per-message scores (verbose) ─────────────────");
      for (const m of scored) {
        const { medicalRelevanceScore: med, anchorLikelihoodScore: anc, replyLikelihoodScore: rep } = m.scores;
        const flag = med < cfg.minRelevance ? "DROP" : anc < cfg.anchorMinScore ? "BORD" : "ELIG";
        console.log(
          `  [${flag}] med=${med.toString().padStart(3)} anc=${anc.toString().padStart(3)} rep=${rep.toString().padStart(3)} ` +
          `${m.sender.slice(0, 15).padEnd(15)} | ${m.body.slice(0, 60).replace(/\n/g, " ")}`
        );
      }
    }

    // ── ImportRun + staging (before threading — durable even if threading fails) ──
    let run: { id: string } | undefined;
    if (!dryRun) {
      const configVersion = sha256(JSON.stringify(cfg)).slice(0, 8);
      run = await prisma.importRun.create({
        data: {
          sourceFile:        basename(chatPath),
          status:            "running",
          totalLines:        stats.totalLines,
          parsedMessages:    stats.parsedMessages,
          droppedMessages:   stats.droppedMessages,
          parseFailures:     stats.parseFailures,
          parserVersion:     PARSER_VERSION,
          classifierVersion: CLASSIFIER_VERSION,
          threadingVersion:  THREADING_VERSION,
          publishVersion:    PUBLISH_VERSION,
          embeddingModel:    noEmbed ? null : EMBEDDING_MODEL,
          llmModel:          noLLM   ? null : LLM_MODEL,
          configVersion,
          importMode:        importModeArg ?? (currentDate ? "partial_range" : "backfill"),
        },
      });
      console.log(`\n  ImportRun ID: ${run.id}  (configVersion=${configVersion})`);

      const scoredByKey = new Map<string, ScoredMessage>(scored.map(m => [m.waMessageKey, m]));
      const droppedByKey = new Map<string, string>(
        filteredDropped.map(d => [d.msg.waMessageKey, d.reason])
      );
      const stagingRows = messages.map(msg => {
        const sm         = scoredByKey.get(msg.waMessageKey);
        const dropReason = droppedByKey.get(msg.waMessageKey) ?? null;
        const wasDropped = dropReason !== null || sm === undefined;
        const scores_    = sm?.scores;
        const contentType: string | null = scores_ ? classifyContentType(msg, scores_) : null;
        return {
          waMessageKey:          msg.waMessageKey,
          importRunId:           run!.id,
          timestamp:             msg.timestamp,
          senderPseudonym:       toPseudonym(msg.sender),
          rawBody:               msg.body,
          normalizedBody:        normalizeSpaces(expandSynonyms(msg.body)),
          isSystem:              msg.isSystem,
          isMedia:               msg.isMedia,
          language:              msg.language,
          parseConfidence:       msg.parseConfidence,
          wasDropped,
          dropReason,
          medicalRelevanceScore: scores_?.medicalRelevanceScore ?? null,
          anchorLikelihoodScore: scores_?.anchorLikelihoodScore ?? null,
          replyLikelihoodScore:  scores_?.replyLikelihoodScore  ?? null,
          categoryHits:          scores_?.categoryHits          ?? null,
          contentType,
        };
      });
      const CHUNK = 500;
      for (let i = 0; i < stagingRows.length; i += CHUNK) {
        await prisma.messageStaging.createMany({
          data: stagingRows.slice(i, i + CHUNK),
          skipDuplicates: true,
        });
      }
      console.log(`  Staged ${stagingRows.length} messages to MessageStaging`);
    }

    // ── Thread reconstruction ──
    const { threads, backwardAttached, llmReviewMessages } = await reconstructThreads(scored, cfg, verbose, embMap, !noLLM, stats);
    stats.backwardAttached = backwardAttached;

    const tStats = { autoPublish: 0, qa: 0, skip: 0 };
    for (const t of threads) {
      const signals = computeThreadSignals(t, cfg);
      const gate    = publishGate(t, cfg, signals, llmReviewMessages);
      if (gate === "auto") tStats.autoPublish++;
      else if (gate === "qa") tStats.qa++;
      else tStats.skip++;
    }

    console.log("\n── Threading ───────────────────────────────────");
    console.log(`  Threads total:                   ${threads.length}`);
    console.log(`  Auto-publish (conf≥${cfg.autoPublishConf} | 0-reply): ${tStats.autoPublish}`);
    console.log(`  QA review    (conf ${cfg.qaConf}–${cfg.autoPublishConf - 1}):         ${tStats.qa}`);
    console.log(`  Skipped:                           ${tStats.skip}`);
    console.log(`  Backward-attached replies:         ${stats.backwardAttached}`);
    if (!noLLM) {
      console.log(`  LLM calls (middle band):           ${llmCallCount} (${llmCacheHits} cached)`);
      console.log(`  LLM failures → QA:                 ${stats.llmFailures}`);
    }

    if (dryRun) {
      console.log("\n── Thread preview (dry-run, no DB writes) ──────");
      threads.slice(0, 8).forEach((t, i) => {
        const gate = publishGate(t, cfg, computeThreadSignals(t, cfg), llmReviewMessages);
        const flag = gate === "auto" ? "AUTO" : gate === "qa" ? " QA " : "SKIP";
        const lang = t.anchor.language === "hinglish" ? " [hi]" : "      ";
        const med  = t.anchor.scores.medicalRelevanceScore.toFixed(0).padStart(3);
        const anc  = t.anchor.scores.anchorLikelihoodScore.toFixed(0).padStart(3);
        console.log(
          `  [${flag}] conf=${t.threadConfidence.toFixed(0).padStart(3)}${lang} med=${med} anc=${anc} ` +
          `replies=${t.replies.length.toString().padStart(2)} | ${t.anchor.body.slice(0, 60).replace(/\n/g, " ")}`
        );
        t.replies.forEach((r, ri) => {
          console.log(
            `         reply ${(ri + 1).toString().padStart(2)} [med=${r.scores.medicalRelevanceScore.toString().padStart(3)}] ${r.body.slice(0, 60).replace(/\n/g, " ")}`
          );
        });
        if (i === 7 && threads.length > 8) console.log(`  … and ${threads.length - 8} more`);
      });
      console.log("\nDry-run complete — no DB writes.");
      continue;
    }

    // Invariant: !dryRun → run was initialized above.
    if (!run) throw new Error("BUG: ImportRun not initialized in live mode");

    const decisionRecords: ThreadDecisionRecord[] = [];

    try {
      for (const thread of threads) {
        const signals = computeThreadSignals(thread, cfg);
        const gate    = publishGate(thread, cfg, signals, llmReviewMessages);
        const record  = buildDecisionRecord(thread, gate, run.id, signals, cfg, llmReviewMessages);
        decisionRecords.push(record);

        if (gate === "auto") {
          await seedThread(thread, run.id, stats);
        } else if (gate === "qa") {
          stats.qaReviewThreads++;
        }
      }

      // Write JSONL decision artifact (all threads, not just QA)
      const artifactPath = resolve(process.cwd(), `../import-decisions-${run.id}.jsonl`);
      writeFileSync(artifactPath, decisionRecords.map(r => JSON.stringify(r)).join("\n") + "\n");
      console.log(`\n  Decision artifact: import-decisions-${run.id}.jsonl (${decisionRecords.length} records)`);

      // Also write a scrubbed QA-only JSON for human review
      const qaThreads = threads.filter((_, i) => decisionRecords[i]?.requiresHumanReview);
      if (qaThreads.length > 0) {
        const reviewPath = resolve(process.cwd(), `../import-review-${run.id}.json`);
        const scrubbed = qaThreads.map(t => ({
          ...t,
          anchor:  { ...t.anchor,  sender: toPseudonym(t.anchor.sender) },
          replies: t.replies.map(r => ({ ...r, sender: toPseudonym(r.sender) })),
        }));
        writeFileSync(reviewPath, JSON.stringify(scrubbed, null, 2));
        console.log(`  Review artifact:   import-review-${run.id}.json (${qaThreads.length} threads)`);
      }

      await prisma.importRun.update({
        where: { id: run.id },
        data: {
          status:            "completed",
          completedAt:       new Date(),
          createdPosts:      stats.createdPosts,
          createdReplies:    stats.createdReplies,
          skippedDuplicates: stats.skippedDuplicates,
          qaReviewThreads:   stats.qaReviewThreads,
          llmFailures:       stats.llmFailures,
          embedFailures:     stats.embedFailures,
          dbWriteFailures:   stats.dbWriteFailures,
        },
      });

    } catch (err) {
      await prisma.importRun.update({
        where: { id: run.id },
        data: {
          status:          "failed",
          completedAt:     new Date(),
          llmFailures:     stats.llmFailures,
          embedFailures:   stats.embedFailures,
          dbWriteFailures: stats.dbWriteFailures,
        },
      }).catch(() => undefined);
      throw err;
    }

    console.log("\n── Seed Results ────────────────────────────────");
    console.log(`  Posts created:       ${stats.createdPosts}`);
    console.log(`  Replies created:     ${stats.createdReplies}`);
    console.log(`  Skipped (dupes):     ${stats.skippedDuplicates}`);
    console.log(`  QA review threads:   ${stats.qaReviewThreads}`);
    console.log(`  LLM failures:        ${stats.llmFailures}`);
    console.log(`  Embed failures:      ${stats.embedFailures}`);
    console.log(`  DB write failures:   ${stats.dbWriteFailures}`);
    console.log("\nDone. Run `pnpm dev:worker` to process the Pinecone ingestion queue.");

  } // end for (const currentDate of datesToProcess)

  await getRedisConnection().quit();
}

// Only invoke main() when this file is the direct entry point, not when imported
// by the evaluation harness or other modules.
const scriptPath = new URL(import.meta.url).pathname;
if (process.argv[1] === scriptPath) {
  void main().catch((err: unknown) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
