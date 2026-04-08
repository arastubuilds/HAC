/**
 * WhatsApp Chat Ingestion Script
 *
 * Parses _chat.txt and seeds the platform's post/reply model.
 * See docs/WHATSAPP.md for full pipeline documentation.
 *
 * Usage:
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --dry-run
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --lines 114-143
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --date 25/10/25
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --week 01/11/25
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --month 01/11/25
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --file /path/to/_chat.txt
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --spam-senders "Name1,Name2"
 *   pnpm --filter server exec tsx src/scripts/ingestWhatsApp.ts --spam-markers "prefix1,prefix2"
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { basename, resolve } from "path";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { embeddingsModel } from "../infra/embeddings.js";
import { llm } from "../infra/llm.js";
import { prisma } from "../infra/prisma.js";
import { redisConnection } from "../infra/redis.js";
import { splitHumanName, whatsappUsernameForSender } from "../utils/userDisplay.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let enqueuePostIngest!: Awaited<typeof import("../queues/postIngest.queue.js")>["enqueuePostIngest"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let enqueueReplyIngest!: Awaited<typeof import("../queues/replyIngest.queue.js")>["enqueueReplyIngest"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDoctor(sender: string): boolean {
  return sender.startsWith("Dr.") || sender.startsWith("Dr ");
}

function parseArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1) return args[idx + 1];
  return args.find(a => a.startsWith(`--${name}=`))?.slice(`--${name}=`.length);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaMessage {
  timestamp: Date;
  sender: string;
  body: string;
  edited: boolean;
  isSystem: boolean;
  isMedia: boolean;
  waMessageKey: string;
  language: "english" | "hinglish";
}

interface ScoredMessage extends WaMessage {
  relevanceScore: number;
  categoryHits: number;  // keyword-matched medical categories (word-boundary safe)
}

interface WaThread {
  anchor: ScoredMessage;
  replies: ScoredMessage[];
  waThreadKey: string;
  threadConfidence: number;
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Medical terms grouped into semantic categories so scoring counts unique
// categories hit rather than unique list entries (prevents "chemo" +
// "chemotherapy" both counting as separate signals).
const TREATMENT_TERMS    = ["chemo", "chemotherapy", "radiation", "hormone", "tamoxifen", "zoladex", "letrozole", "anastrozole", "herceptin", "immunotherapy", "surgery", "mastectomy", "lumpectomy", "biopsy"];
const SCAN_TERMS         = ["scan", "mri", "pet", "ct"];
const SIDE_EFFECT_TERMS  = ["nausea", "vomiting", "fatigue", "weakness", "swelling", "fever", "infection", "pain", "hair loss", "weight", "appetite", "dryness", "hot flash", "menopause", "neutropenia", "loose motion", "diarrhea", "constipation", "digestion", "acidity", "gastro", "mouth sore", "neuropathy", "numbness", "tingling", "joint pain", "bone pain", "mood swing", "anxiety", "body ache", "joint", "ache", "insomnia", "headache", "rash", "bloating"];
const SYMPTOM_TERMS      = ["hemoglobin", "platelet", "wbc", "port", "recurrence", "metastasis", "stage"];
const CARE_TERMS         = ["oncologist", "doctor", "treatment", "nutrition", "diet", "exercise", "gym", "calorie", "protein"];
const LOGISTICS_TERMS    = ["appointment", "hospital", "insurance", "report", "admit", "discharge", "lab", "blood test", "follow up", "second opinion", "referral", "prescription", "medicine", "pharmacy", "bill", "cost"];
const REMEDY_TERMS       = ["gel", "cream", "ointment", "mouthwash", "mouthpaint", "gargle", "oil pulling", "coconut oil", "aloe vera", "alsi", "turmeric", "haldi", "peppermint", "ginger", "honey", "supplement", "multivitamin", "vitamin", "home remedy", "nuskha", "gharelu", "ayurvedic", "homeopathy"];

const TERM_CATEGORIES = [TREATMENT_TERMS, SCAN_TERMS, SIDE_EFFECT_TERMS, SYMPTOM_TERMS, CARE_TERMS, LOGISTICS_TERMS, REMEDY_TERMS];

// Reference topic texts for embedding-based relevance scoring.
// Each message's embedding is compared against these; high cosine → relevant content.
const REFERENCE_TOPICS = [
  "chemotherapy side effects and treatment",
  "emotional support and mental health during cancer",
  "diet nutrition and exercise during cancer",
  "medical appointments and hospital logistics",
  "cancer diagnosis staging and prognosis",
];

// Romanized Hinglish synonyms for canonical medical terms.
// Used to boost topic-overlap for Hinglish speakers who transliterate the
// same concept differently ("kimo" == "chemo").
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
  "i had", "for me", "in my case", "my doctor", "my oncologist",
  "i was on", "i am on", "i'm on", "im on", "m on ",
  "same here", "i too", "mujhe bhi",
  "mere liye", "mera doctor", "mere saath", "meri mummy", "meri mom",
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

// Back-reference openers: phrases that signal the message is directly responding
// to whatever was just asked, even when token overlap is near zero.
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

// ── Configurable noise filters ──
// Person-specific spam filters: override via --spam-senders CLI flag (comma-separated).
// Each entry: { sender, patterns } — messages from sender matching any pattern are dropped.
// If no --spam-senders is provided, defaults below are used.
interface SpamSenderRule {
  sender: string;
  patterns: RegExp[];
}

const DEFAULT_SPAM_SENDER_RULES: SpamSenderRule[] = [
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

// Content markers that are always filtered regardless of sender.
// Override via --spam-markers CLI flag (comma-separated strings).
let SPAM_CONTENT_MARKERS = ["Designs that listen.."];

// ── Adaptive thresholds ──
// These score-based thresholds are recomputed per-run by computeAdaptiveThresholds()
// using percentiles of the actual score distribution, with hard floors to prevent
// garbage days from producing garbage threads.
const DEFAULT_HARD_WINDOW_MS    = 5 * 60 * 60 * 1000;
const DEFAULT_GAP_NEW_THREAD_MS = 90 * 60 * 1000;
let HARD_WINDOW_MS    = DEFAULT_HARD_WINDOW_MS;
let GAP_NEW_THREAD_MS = DEFAULT_GAP_NEW_THREAD_MS;
const ATTACH_THRESHOLD  = 0.35;
const SPLIT_THRESHOLD   = 0.20;
const SOFT_REPLY_CAP    = 15;
let MIN_RELEVANCE     = 30;
let ANCHOR_MIN_SCORE          = 55;  // minimum score to start a new thread anchor (question/seeking)
let ANCHOR_EXPERIENTIAL_SCORE = 35;  // lower anchor bar for experiential symptom posts (no ? required)
let MIN_REPLY_SCORE           = 35;  // minimum score to attach a reply via high overlap
let AUTO_PUBLISH_CONF = 45;
let QA_CONF           = 28;

// Sender-aware threading: boost effective overlap when sender matches thread participants
const SENDER_BONUS_REPLIER = 0.08;  // sender matches a recent replier
const SENDER_BONUS_ANCHOR  = 0.12;  // sender matches the thread anchor author

// Middle band (0.20–0.35 overlap) tightening: require extra signal before attaching
let MIDDLE_BAND_MIN_SCORE  = 50;
const MIDDLE_BAND_RECENCY_MS = 15 * 60 * 1000;  // 15min — recent thread activity overrides middle-band gate

// Near-thread relaxation: allow sub-MIN_RELEVANCE messages to attach if thread is very recent
let NEAR_THREAD_RELAXED_MIN = 15;
const NEAR_THREAD_WINDOW_MS  = 30 * 60 * 1000;  // 30 minutes

// Backward-looking reply attachment: second pass over unattached messages
const BACKWARD_WINDOW_MS         = 3 * 60 * 60 * 1000;  // 3h window
const BACKWARD_ATTACH_THRESHOLD  = 0.35;                 // match forward-pass ATTACH_THRESHOLD
let BACKWARD_MIN_SCORE         = 20;                   // low floor OK — backward pass has its own overlap gate (0.30)

// ─── Adaptive Threshold Computation ──────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function computeAdaptiveThresholds(scores: number[], verbose = false): void {
  // Filter out pure noise (score 0-10) to avoid skewing percentiles
  const meaningful = scores.filter(s => s > 10).sort((a, b) => a - b);

  if (meaningful.length < 3) {
    if (verbose) console.log("  [ADAPTIVE] Too few meaningful scores — keeping defaults");
    return;
  }

  const p40 = percentile(meaningful, 40);
  const p50 = percentile(meaningful, 50);
  const p60 = percentile(meaningful, 60);
  const p75 = percentile(meaningful, 75);

  // Apply percentiles with hard floors so bad data can't produce absurd thresholds
  MIN_RELEVANCE              = Math.max(p40, 20);
  ANCHOR_MIN_SCORE           = Math.max(p75, 35);
  ANCHOR_EXPERIENTIAL_SCORE  = Math.max(p40, 25);
  MIN_REPLY_SCORE            = Math.max(p40, 25);
  MIDDLE_BAND_MIN_SCORE      = Math.max(p60, 35);
  NEAR_THREAD_RELAXED_MIN    = Math.max(Math.round(p40 * 0.5), 10);
  BACKWARD_MIN_SCORE         = Math.max(Math.round(p40 * 0.6), 15);
  AUTO_PUBLISH_CONF          = Math.max(p60, 35);
  QA_CONF                    = Math.max(p40, 20);

  if (verbose) {
    console.log("  [ADAPTIVE] Score distribution:");
    console.log(`    P40=${p40} P50=${p50} P60=${p60} P75=${p75}`);
    console.log(`    → MIN_RELEVANCE=${MIN_RELEVANCE} ANCHOR_MIN=${ANCHOR_MIN_SCORE} ` +
      `ANCHOR_EXP=${ANCHOR_EXPERIENTIAL_SCORE} MIN_REPLY=${MIN_REPLY_SCORE}`);
    console.log(`    → MIDDLE_BAND_MIN=${MIDDLE_BAND_MIN_SCORE} NEAR_RELAXED=${NEAR_THREAD_RELAXED_MIN} ` +
      `BACKWARD_MIN=${BACKWARD_MIN_SCORE}`);
    console.log(`    → AUTO_PUBLISH=${AUTO_PUBLISH_CONF} QA=${QA_CONF}`);
  }
}

// ─── Density-Adaptive Time Windows ──────────────────────────────────────────

function computeAdaptiveWindows(messages: WaMessage[], verbose = false): void {
  if (messages.length < 2) return;

  const sorted = messages.map(m => m.timestamp.getTime()).sort((a, b) => a - b);
  const first = sorted[0] ?? 0;
  const last  = sorted[sorted.length - 1] ?? 0;
  const totalSpanHours = (last - first) / (1000 * 60 * 60);

  if (totalSpanHours < 0.5) return;

  // Compute density over active segments only (split at gaps > 60min)
  // to avoid diluting density when messages cluster in a few active windows.
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
  // Final segment
  const lastTs = sorted[sorted.length - 1] ?? 0;
  const lastSegHours = (lastTs - segStart) / (1000 * 60 * 60);
  if (lastSegHours > 0.1) segDensities.push(segCount / lastSegHours);

  // Use median segment density; fall back to raw average if no valid segments
  const msgsPerHour = segDensities.length > 0
    ? segDensities.sort((a, b) => a - b)[Math.floor(segDensities.length / 2)] ?? messages.length / totalSpanHours
    : messages.length / totalSpanHours;

  // Scale windows based on density:
  //   < 5 msg/hr  → slow chat: widen windows (180min gap, 8hr hard)
  //   5-20 msg/hr → normal: keep defaults (90min gap, 5hr hard)
  //   > 20 msg/hr → rapid: tighten windows (45min gap, 3hr hard)
  if (msgsPerHour < 5) {
    GAP_NEW_THREAD_MS = 180 * 60 * 1000;
    HARD_WINDOW_MS    = 8 * 60 * 60 * 1000;
  } else if (msgsPerHour > 20) {
    GAP_NEW_THREAD_MS = 45 * 60 * 1000;
    HARD_WINDOW_MS    = 3 * 60 * 60 * 1000;
  }
  // else: keep defaults (90min gap, 5hr hard)

  if (verbose) {
    console.log(`  [DENSITY] ${messages.length} msgs, ${segDensities.length} active segments → ${msgsPerHour.toFixed(1)} msg/hr (median)`);
    console.log(`    → GAP=${GAP_NEW_THREAD_MS / 60000}min HARD=${HARD_WINDOW_MS / 3600000}hr`);
  }
}

// ─── Phase 0: Normalize ───────────────────────────────────────────────────────

function normalize(raw: string): string[] {
  return raw
    .replace(/[\u200e\u200f\u202a-\u202e\uFEFF\u200B]/g, "")  // LRM, RLM, bidi marks
    .replace(/\u202F/g, " ")   // narrow no-break space → ASCII space (WhatsApp time separator)
    .replace(/\u00A0/g, " ")   // non-breaking space → ASCII space
    .replace(/\r/g, "")        // strip CR from Windows CRLF line endings
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

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

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

// A message is media-only when stripping all media markers leaves nothing alphanumeric.
// This preserves messages that contain substantive text AND an attached image/video.
function stripMediaSuffixes(body: string): string {
  let s = body;
  for (const suffix of MEDIA_SUFFIXES) s = s.replace(suffix, "");
  return s.trim();
}

function parse(lines: string[]): { messages: WaMessage[]; failures: number } {
  // Two-pass: first collect raw messages (body may grow via continuation lines),
  // then compute waMessageKey from the final assembled body.
  interface RawMessage {
    timestamp: Date;
    sender: string;
    body: string;
    edited: boolean;
    isSystem: boolean;
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
        if (consecutiveFailures >= 10) {
          throw new Error("10 consecutive parse failures — aborting");
        }
        continue;
      }

      raw.push({ timestamp, sender, body, edited, isSystem });

    } else if (line.trim() && raw.length > 0 && !line.startsWith("[")) {
      // Continuation line — append to last message's body
      const last = raw[raw.length - 1];
      if (last) last.body += "\n" + line;

    } else if (line.startsWith("[")) {
      failures++;
      timestampedLines++;
      consecutiveFailures++;
      if (consecutiveFailures >= 10) {
        throw new Error("10 consecutive parse failures — aborting");
      }
    }
  }

  if (timestampedLines > 0 && failures / timestampedLines > 0.03) {
    throw new Error(
      `Parse failure rate ${((failures / timestampedLines) * 100).toFixed(1)}% exceeds 3% threshold`
    );
  }

  // Second pass: compute waMessageKey from the final body (after all continuations),
  // and determine isMedia based on the full assembled body.
  const messages: WaMessage[] = raw.map(m => {
    const stripped = stripMediaSuffixes(m.body);
    const isMedia  = !hasAlphanumeric(stripped);
    // Key uses the body with media suffixes stripped so it's stable across reruns
    // regardless of whether the media marker was on the first or a continuation line.
    const keyBody  = isMedia ? m.body : stripped;
    const waMessageKey = sha256(m.timestamp.toISOString() + m.sender + keyBody);
    const language = detectLanguage(m.body);
    return { ...m, isMedia, waMessageKey, language };
  });

  return { messages, failures };
}

// ─── Phase 2: Filter Noise ────────────────────────────────────────────────────

function hasAlphanumeric(s: string): boolean {
  // eslint-disable-next-line no-misleading-character-class -- intentional: detect any Devanagari code point
  return /[a-zA-Z0-9\u0900-\u097F]/u.test(s);
}

function isBareUrl(s: string): boolean {
  return /^https?:\/\/\S+$/.test(s.trim());
}

function filterNoise(messages: WaMessage[], spamRules: SpamSenderRule[]): WaMessage[] {
  return messages.filter(msg => {
    if (msg.isSystem || msg.isMedia) return false;

    const trimmed = msg.body.trim();

    if (!hasAlphanumeric(trimmed) || trimmed.length < 3) return false;

    // Configurable per-sender spam rules
    for (const rule of spamRules) {
      if (msg.sender === rule.sender && rule.patterns.some(p => p.test(trimmed))) {
        return false;
      }
    }

    // Configurable content markers
    if (SPAM_CONTENT_MARKERS.some(marker => trimmed.startsWith(marker))) return false;
    if (isBareUrl(trimmed)) return false;

    // Promo / event announcements: contain a meeting URL + event keywords
    const lower = trimmed.toLowerCase();
    const hasMeetingUrl = /zoom\.us|meet\.google|teams\.microsoft/.test(lower);
    const hasEventKeyword = ["join", "meeting", "register", "webinar", "support group"].some(k => lower.includes(k));
    if (hasMeetingUrl && hasEventKeyword) return false;

    // Social media reel / link forwards that are purely motivational or art-related.
    // Keep them only if they contain at least one medical term (e.g. a doctor sharing
    // a cancer-specific reel).
    const hasSocialUrl = /instagram\.com|youtu\.be|youtube\.com|facebook\.com|twitter\.com|t\.co\//.test(lower);
    if (hasSocialUrl) {
      const bodyWithoutUrl = trimmed.replace(/https?:\/\/\S+/g, " ").trim();
      const hasMedContent = TERM_CATEGORIES.some(cat =>
        cat.some(t => matchesMedTerm(bodyWithoutUrl.toLowerCase(), t))
      );
      if (!hasMedContent) return false;
    }

    return true;
  });
}

// ─── Embedding utilities ─────────────────────────────────────────────────────

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

// ─── Phase 3: Relevance Scoring ───────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

// Expands Hinglish synonyms into their canonical English terms so that
// scoreRelevance() category matching works for transliterated messages.
function expandSynonyms(text: string): string {
  const lower = text.toLowerCase();
  const expansions: string[] = [];
  for (const [canonical, variants] of Object.entries(MEDICAL_SYNONYMS)) {
    if (variants.some(v => lower.includes(v))) {
      expansions.push(canonical);
    }
  }
  return expansions.length > 0 ? lower + " " + expansions.join(" ") : lower;
}

// Word-boundary safe medical term check. Prevents "pain" matching "paintings",
// "ache" matching "reached", "ct" matching "doctor", etc.
// Fast path: substring check first, then boundary regex only on a hit.
function matchesMedTerm(text: string, term: string): boolean {
  if (!text.includes(term)) return false;
  // Multi-word terms (e.g. "hair loss") only need leading boundary — trailing
  // space is enough to avoid "hair loss…" false positives but isn't needed for
  // single-word terms where \b handles both sides cleanly.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function scoreRelevance(
  msg: WaMessage,
  embMap?: Map<string, number[]>,
  refVecs?: number[][],
): { score: number; categoryHits: number } {
  const lower = normalizeSpaces(expandSynonyms(msg.body));
  let score = 0;

  // Count unique semantic *categories* hit, not unique list entries, so
  // "chemo" + "chemotherapy" in the same message count as one signal.
  // Word-boundary matching prevents substring false positives ("pain" in "paintings").
  const categoryHits = TERM_CATEGORIES.filter(cat => cat.some(t => matchesMedTerm(lower, t))).length;
  score += Math.min(categoryHits * 12, 48);

  // Density bonus: listing multiple distinct side effects is more substantive than one.
  const sideEffectHits = SIDE_EFFECT_TERMS.filter(t => matchesMedTerm(lower, t)).length;
  if (sideEffectHits >= 3) score += 12;
  else if (sideEffectHits >= 2) score += 6;

  if (msg.body.includes("?") || QUESTION_WORDS.some(w => lower.startsWith(w))) {
    score += 20;
  }

  if (EXPERIENTIAL_PATTERNS.some(p => lower.includes(p))) score += 15;
  if (SUPPORT_SEEKING_PATTERNS.some(p => lower.includes(p))) score += 15;
  if (RECOMMENDATION_PATTERNS.some(p => lower.includes(p))) score += 10;

  // Embedding-based relevance: cosine similarity to reference medical topics.
  // Catches semantically relevant messages that use no mapped keywords.
  if (embMap && refVecs && refVecs.length > 0) {
    const msgVec = embMap.get(msg.body);
    if (msgVec) {
      const maxCos = Math.max(...refVecs.map(rv => cosineSimilarity(msgVec, rv)));
      if (maxCos > 0.5) score += 15;
    }
  }

  // Penalties
  if (msg.body.trim().length < 20 && categoryHits === 0) score -= 10;
  if (/^(thank|thanks|ok|okay|noted|sure|yes|no|👍|🙏|great|good)\W*$/i.test(msg.body.trim())) {
    score -= 10;
  }

  // Doctor-authored messages carry authoritative weight.
  if (isDoctor(msg.sender)) score += 15;

  return { score: clamp(score, 0, 100), categoryHits };
}

// ─── Phase 4: Pseudonymous Users ──────────────────────────────────────────────

const userCache = new Map<string, string>();

async function resolveUser(sender: string): Promise<string> {
  const cached = userCache.get(sender);
  if (cached) return cached;

  const username = whatsappUsernameForSender(sender);
  const email    = `${username}@hac.internal`;
  const { firstName, lastName } = splitHumanName(sender);

  // No Account row — these users are never meant to log in.
  // verifyCredentials() looks up provider:"local" accounts; absence of any
  // account means login attempts fail naturally without any special-casing.
  const user = await prisma.user.upsert({
    where: { username },
    create: { username, email, firstName, lastName },
    update: { firstName, lastName },
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

// Returns canonical medical terms matched in a string, checking both the
// canonical name and all romanized Hinglish synonyms.
function medicalCategorySet(s: string): Set<string> {
  const lower = s.toLowerCase();
  const hits = new Set<string>();
  for (const [canonical, variants] of Object.entries(MEDICAL_SYNONYMS)) {
    if (lower.includes(canonical) || variants.some(v => lower.includes(v))) {
      hits.add(canonical);
    }
  }
  return hits;
}

// Blends semantic similarity (60%) with medical-category Jaccard (40%).
// When embeddings are available, the 60% component is normalized cosine similarity;
// otherwise falls back to lexical Jaccard (keyword-only mode).
// `a` is the thread context string (anchor + recent replies) used for keyword matching.
// `embKeyA` is the anchor body used for embedding lookup (since context strings aren't embedded).
function topicOverlap(a: string, b: string, embMap?: Map<string, number[]>, embKeyA?: string): number {
  // 60% component: cosine similarity (normalized) or lexical Jaccard fallback
  let semanticScore: number;
  const vecA = embMap?.get(embKeyA ?? a);
  const vecB = embMap?.get(b);
  if (vecA && vecB) {
    // e5-base-v2 cosine range is ~[0.7, 1.0] — normalize to [0, 1]
    const rawCos = cosineSimilarity(vecA, vecB);
    semanticScore = clamp((rawCos - 0.75) / 0.20, 0, 1);
  } else {
    // Fallback: lexical Jaccard
    const lexA = tokenize(a);
    const lexB = tokenize(b);
    if (lexA.size === 0 || lexB.size === 0) {
      semanticScore = 0;
    } else {
      const inter = [...lexA].filter(t => lexB.has(t)).length;
      semanticScore = inter / new Set([...lexA, ...lexB]).size;
    }
  }

  // Medical-category Jaccard (always keyword-based, uses full context string)
  const medA = medicalCategorySet(a);
  const medB = medicalCategorySet(b);
  const medJaccard = (() => {
    if (medA.size === 0 || medB.size === 0) return 0;
    const inter = [...medA].filter(t => medB.has(t)).length;
    return inter / new Set([...medA, ...medB]).size;
  })();

  // Shift weights when Hinglish is detected — embeddings (e5-base-v2) are
  // English-biased and produce near-zero similarity for Hindi text.
  const hinglish = detectLanguage(a) === "hinglish" || detectLanguage(b) === "hinglish";
  const semWeight = hinglish ? 0.35 : 0.6;
  const medWeight = hinglish ? 0.65 : 0.4;

  return semWeight * semanticScore + medWeight * medJaccard;
}

function threadContextStr(t: { anchor: ScoredMessage; replies: ScoredMessage[] }): string {
  const recent = t.replies.slice(-3).map(r => r.body).join(" ");
  return t.anchor.body + " " + recent;
}

function senderBonus(msg: ScoredMessage, t: { anchor: ScoredMessage; replies: ScoredMessage[] }): number {
  if (msg.sender === t.anchor.sender) return SENDER_BONUS_ANCHOR;
  const recentRepliers = t.replies.slice(-3).map(r => r.sender);
  if (recentRepliers.includes(msg.sender)) return SENDER_BONUS_REPLIER;
  return 0;
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ");
}

function hasSharedCategories(textA: string, textB: string, maxCats = TERM_CATEGORIES.length): boolean {
  const lowerA = normalizeSpaces(textA.toLowerCase());
  const lowerB = normalizeSpaces(textB.toLowerCase());
  return TERM_CATEGORIES.slice(0, maxCats).some(cat => {
    const hitA = cat.some(t => lowerA.includes(t));
    const hitB = cat.some(t => lowerB.includes(t));
    return hitA && hitB;
  });
}

// SIDE_EFFECT ↔ REMEDY are related: a reply mentioning a remedy for a thread
// discussing a side effect (or vice versa) is a strong topical signal.
const RELATED_CATEGORY_PAIRS: [number, number][] = [
  [TERM_CATEGORIES.indexOf(SIDE_EFFECT_TERMS), TERM_CATEGORIES.indexOf(REMEDY_TERMS)],
  [TERM_CATEGORIES.indexOf(CARE_TERMS), TERM_CATEGORIES.indexOf(REMEDY_TERMS)],
];

function hasRelatedCategories(textA: string, textB: string): boolean {
  const lowerA = normalizeSpaces(textA.toLowerCase());
  const lowerB = normalizeSpaces(textB.toLowerCase());
  const hitsA = new Set(
    TERM_CATEGORIES.map((cat, i) => cat.some(t => lowerA.includes(t)) ? i : -1).filter(i => i >= 0)
  );
  const hitsB = new Set(
    TERM_CATEGORIES.map((cat, i) => cat.some(t => lowerB.includes(t)) ? i : -1).filter(i => i >= 0)
  );
  return RELATED_CATEGORY_PAIRS.some(([a, b]) =>
    (hitsA.has(a) && hitsB.has(b)) || (hitsA.has(b) && hitsB.has(a))
  );
}

// ─── LLM-assisted thread attachment ──────────────────────────────────────────

const LLM_SYSTEM_PROMPT = `You decide if a WhatsApp message belongs in a conversation thread from a cancer support group. Reply YES if the message is responding to, continuing, or directly related to the thread topic. Reply NO if it introduces a different topic. Reply with only YES or NO.`;

let llmCallCount = 0;
let llmCacheHits = 0;

// Sliding-window rate limiter for Gemini free tier (5 RPM).
// Tracks timestamps of the last 5 actual API calls; if the oldest is less
// than 60 s ago we wait until the window clears before firing the next call.
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

async function shouldAttachLLM(
  thread: { anchor: ScoredMessage; replies: ScoredMessage[] },
  msg: ScoredMessage,
  cache: Map<string, boolean>,
  verbose: boolean,
): Promise<boolean> {
  const cacheKey = sha256(thread.anchor.body + "|" + msg.body);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    llmCacheHits++;
    if (verbose) {
      console.log(
        `    [MIDDLE-LLM] ${cached ? "YES" : "NO"} (cached) | ${msg.body.slice(0, 50).replace(/\n/g, " ")}`
      );
    }
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
    const decision = text.trim().toUpperCase().startsWith("YES");

    cache.set(cacheKey, decision);
    if (verbose) {
      console.log(
        `    [MIDDLE-LLM] ${decision ? "YES" : "NO"} | ${msg.body.slice(0, 50).replace(/\n/g, " ")}`
      );
    }
    return decision;
  } catch (err) {
    if (verbose) {
      console.log(
        `    [MIDDLE-LLM] ERROR fallback=NO | ${err instanceof Error ? err.message : String(err)}`
      );
    }
    cache.set(cacheKey, false);
    return false;
  }
}

function isQuestionLike(msg: ScoredMessage): boolean {
  const lower = msg.body.toLowerCase();
  return msg.body.includes("?") || QUESTION_WORDS.some(w => lower.startsWith(w));
}

const SUPPORT_SEEKING_PATTERNS = [
  "i need", "need help", "looking for", "please help",
  "has anyone", "can anyone", "anyone help", "any advice", "any suggestions",
  "koi bata", "koi bataye", "koi suggest",
];

function isSupportSeeking(msg: ScoredMessage): boolean {
  const lower = msg.body.toLowerCase();
  return SUPPORT_SEEKING_PATTERNS.some(p => lower.includes(p));
}

function isBackReference(msg: ScoredMessage): boolean {
  const trimmed = msg.body.trim();
  return BACK_REFERENCE_PATTERNS.some(p => p.test(trimmed));
}

// Detects short follow-up questions whose topic is carried entirely by a deictic
// pronoun ("this", "it", "that", "these", "such") with no independent medical terms.
// E.g. "How often this should be done?" or "Can Murabba be consumed??" — these
// have zero overlap with the thread they follow because they rely on conversational
// context rather than repeating the topic keywords.
function isDeictic(msg: ScoredMessage): boolean {
  if (!msg.body.includes("?")) return false;
  const words = msg.body.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;  // longer questions are more self-contained
  const hasDeictic = words.some(w => ["this", "it", "that", "these", "such", "same"].includes(w));
  if (!hasDeictic) return false;
  // Exclude if message already contains independent medical terms (overlap would work)
  const lower = msg.body.toLowerCase();
  const hasMedTerms = TERM_CATEGORIES.some(cat => cat.some(t => matchesMedTerm(lower, t)));
  return !hasMedTerms;
}

function isShortContextualReply(msg: ScoredMessage): boolean {
  const trimmed = msg.body.trim();
  return trimmed.length <= 60 &&
    SHORT_CONTEXTUAL_REPLY_PATTERNS.some(p => p.test(trimmed));
}

function calcThreadConfidence(t: { anchor: ScoredMessage; replies: ScoredMessage[] }, embMap?: Map<string, number[]>): number {
  const anchorScore = t.anchor.relevanceScore;
  const subst       = t.replies.filter(r => r.relevanceScore >= MIN_RELEVANCE);
  const avgReply    = subst.length > 0
    ? subst.reduce((s, r) => s + r.relevanceScore, 0) / subst.length
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


async function reconstructThreads(scored: ScoredMessage[], verbose = false, embMap?: Map<string, number[]>, useLLM = true): Promise<{ threads: WaThread[]; backwardAttached: number }> {
  const llmCache = new Map<string, boolean>();
  llmCallCount = 0;
  llmCacheHits = 0;
  interface ActiveThread {
    anchor: ScoredMessage;
    replies: ScoredMessage[];
    lastTime: number;
  }

  const active: ActiveThread[]     = [];
  const finalized: WaThread[]      = [];
  const unattached: ScoredMessage[] = [];

  function finalize(t: ActiveThread): void {
    finalized.push({
      anchor: t.anchor,
      replies: t.replies,
      waThreadKey: t.anchor.waMessageKey,
      threadConfidence: calcThreadConfidence(t, embMap),
    });
  }

  function evictWeakest(): void {
    let weakIdx = 0;
    let weakScore = Infinity;
    for (let i = 0; i < active.length; i++) {
      const t = active[i]!;
      const score = t.anchor.relevanceScore + t.replies.length * 5;
      if (score < weakScore) { weakScore = score; weakIdx = i; }
    }
    const weakest = active[weakIdx];
    if (weakest) { finalize(weakest); active.splice(weakIdx, 1); }
  }

  for (const msg of scored) {
    if (msg.relevanceScore < MIN_RELEVANCE) {
      // Short contextual replies (yes, same here, etc.) attach by time proximity
      // to the most recently active thread — they cannot anchor a new one.
      if (isShortContextualReply(msg) && active.length > 0 && msg.relevanceScore >= NEAR_THREAD_RELAXED_MIN) {
        const now = msg.timestamp.getTime();
        const best = active.reduce((a, b) => a.lastTime > b.lastTime ? a : b);
        if (now - best.lastTime <= GAP_NEW_THREAD_MS) {
          best.replies.push(msg);
          best.lastTime = now;
        } else {
          unattached.push(msg);
        }
      } else if (active.length > 0 && msg.relevanceScore >= NEAR_THREAD_RELAXED_MIN) {
        // Near-thread relaxation: borderline messages (15-29) can attach to
        // very recently active threads via overlap, but never anchor new ones.
        const now = msg.timestamp.getTime();
        const recentThread = active.find(t => (now - t.lastTime) <= NEAR_THREAD_WINDOW_MS);
        if (recentThread) {
          // For near-thread relaxation, time proximity is the main signal.
          // Require any shared medical category OR sender match — not Jaccard overlap,
          // which is too low for short conversational replies.
          // Match on medical + care categories (treatment, scans, side effects, symptoms, care)
          // — within 30min window, time proximity constrains false positives
          const ctx = threadContextStr(recentThread);
          const hasAnyCategoryMatch = hasSharedCategories(msg.body, ctx, 5);
          const hasRelated = hasRelatedCategories(msg.body, ctx);
          const hasSender = senderBonus(msg, recentThread) > 0;
          const shouldAttach = hasAnyCategoryMatch || hasRelated || hasSender || isDoctor(msg.sender);
          if (verbose) {
            const gap = now - recentThread.lastTime;
            console.log(
              `    [RELAX] catMatch=${hasAnyCategoryMatch} related=${hasRelated} sender=${hasSender} doctor=${isDoctor(msg.sender)} ` +
              `gap=${Math.round(gap / 60000)}min score=${msg.relevanceScore} ` +
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
            console.log(
              `    [RELAX] no recent thread score=${msg.relevanceScore} ` +
              `| ${msg.body.slice(0, 50).replace(/\n/g, " ")}`
            );
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
      if (t && now - t.anchor.timestamp.getTime() > HARD_WINDOW_MS) {
        finalize(t);
        active.splice(i, 1);
      }
    }

    const question    = isQuestionLike(msg);
    const seeking     = isSupportSeeking(msg);

    // Experiential symptom posts (e.g. "I had loose motion after treatment")
    // are high-signal even without a '?' — allow them to anchor at a lower bar.
    const msgLower = msg.body.toLowerCase();
    const isExperientialWithMed =
      EXPERIENTIAL_PATTERNS.some(p => msgLower.includes(p)) &&
      TERM_CATEGORIES.some(cat => cat.some(t => msgLower.includes(t)));
    const isSupportSeekingWithMed =
      seeking &&
      TERM_CATEGORIES.some(cat => cat.some(t => msgLower.includes(t)));
    const isQuestionWithMed =
      question &&
      TERM_CATEGORIES.some(cat => cat.some(t => msgLower.includes(t)));

    const independent =
      msg.relevanceScore >= ANCHOR_MIN_SCORE ||
      (isExperientialWithMed   && msg.relevanceScore >= ANCHOR_EXPERIENTIAL_SCORE) ||
      (isSupportSeekingWithMed && msg.relevanceScore >= ANCHOR_EXPERIENTIAL_SCORE) ||
      (isQuestionWithMed       && msg.relevanceScore >= ANCHOR_EXPERIENTIAL_SCORE);

    const canAnchor = question || seeking || isExperientialWithMed;

    if (active.length === 0) {
      if (canAnchor && independent) {
        active.push({ anchor: msg, replies: [], lastTime: now });
      }
      continue;
    }

    // Find best-overlapping thread (sender-aware: effective overlap includes sender bonus)
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
        `gap=${Math.round(gap / 60000)}min score=${msg.relevanceScore} ` +
        `| ${msg.body.slice(0, 50).replace(/\n/g, " ")}`
      );
    }

    if (bestEffective >= ATTACH_THRESHOLD) {
      // Use raw overlap (not sender-inflated) for the soft-cap override
      if (msg.relevanceScore >= MIN_REPLY_SCORE &&
          (best.replies.length < SOFT_REPLY_CAP || bestRawOv >= 0.5)) {
        best.replies.push(msg);
        best.lastTime = now;
      } else {
        unattached.push(msg);
      }

    } else if (bestEffective < SPLIT_THRESHOLD && canAnchor && independent) {
      // Before splitting, check if this is a direct answer to a recent open question.
      // Q-A pairs often have near-zero token overlap — "I also had the same issue"
      // shares no tokens with "Does exemestane increase blood pressure?".
      // Heuristic fast-path: back-reference opener + recency. LLM fallback for the rest.
      const gapFromAnchor = now - best.anchor.timestamp.getTime();
      const recentThread = gapFromAnchor < GAP_NEW_THREAD_MS;
      const recentOpenQuestion = recentThread &&
        (isQuestionLike(best.anchor) || isSupportSeeking(best.anchor));

      if (recentOpenQuestion && isBackReference(msg)) {
        // Heuristic fast-path: clear back-reference opener, no LLM needed
        if (verbose) console.log(`    [SPLIT→ATTACH] back-reference opener within open-question window`);
        best.replies.push(msg);
        best.lastTime = now;
      } else if ((recentOpenQuestion || (recentThread && isDeictic(msg))) && useLLM) {
        // Deictic follow-up ("How often this should be done?") or answer to an open
        // question — overlap is always near zero but the LLM can read the context.
        // eslint-disable-next-line no-await-in-loop -- sequential threading requires ordered decisions
        const attach = await shouldAttachLLM(best, msg, llmCache, verbose);
        if (attach) {
          if (verbose) console.log(`    [SPLIT→ATTACH] deictic/answer LLM=YES`);
          best.replies.push(msg);
          best.lastTime = now;
        } else {
          if (active.length >= 3) evictWeakest();
          active.push({ anchor: msg, replies: [], lastTime: now });
        }
      } else {
        if (active.length >= 3) evictWeakest();
        active.push({ anchor: msg, replies: [], lastTime: now });
      }

    } else {
      // Middle band — require extra signal before attaching
      const gap = now - best.lastTime;
      if (gap > GAP_NEW_THREAD_MS && canAnchor && independent) {
        if (active.length >= 3) evictWeakest();
        active.push({ anchor: msg, replies: [], lastTime: now });

      // A+E: strong anchor candidates in MIDDLE band prefer SPLIT unless overlap
      // reaches full ATTACH level — high-score messages are valuable enough to
      // start their own thread rather than being absorbed by a loosely related one.
      } else if (canAnchor && independent && bestEffective < ATTACH_THRESHOLD) {
        if (active.length >= 3) evictWeakest();
        active.push({ anchor: msg, replies: [], lastTime: now });

      } else if (msg.relevanceScore >= MIN_RELEVANCE) {
        // Fast-path: sender match or doctor with minimum overlap — skip LLM only when
        // there is at least some topical connection (eff > 0.05). Zero-overlap doctor
        // messages (e.g. an art comment inside a mouth-care thread) fall through to the
        // LLM so topic relevance is still checked.
        const DOCTOR_ATTACH_MIN = 0.05;
        const hasSenderMatch = senderBonus(msg, best) > 0;
        const hasStrongSignal = (hasSenderMatch || isDoctor(msg.sender)) && bestEffective > DOCTOR_ATTACH_MIN;
        if (hasStrongSignal) {
          best.replies.push(msg);
          best.lastTime = now;
        } else if (useLLM) {
          // Pre-filter: skip LLM for messages with no medical/care/remedy terms
          const msgLower2 = normalizeSpaces(msg.body.toLowerCase());
          const hasMedTerms = TERM_CATEGORIES.some(cat => cat.some(t => msgLower2.includes(t)));
          if (!hasMedTerms) {
            unattached.push(msg);
          } else {
            // eslint-disable-next-line no-await-in-loop -- sequential threading requires ordered decisions
            const attach = await shouldAttachLLM(best, msg, llmCache, verbose);
            if (attach) {
              best.replies.push(msg);
              best.lastTime = now;
            } else {
              unattached.push(msg);
            }
          }
        } else {
          // --no-llm fallback: use old heuristic signals
          const bestCtx = threadContextStr(best);
          const hasHighRelevance = msg.relevanceScore >= MIDDLE_BAND_MIN_SCORE;
          const hasSharedMedical = hasSharedCategories(msg.body, bestCtx);
          const hasRecentActivity = (now - best.lastTime) <= MIDDLE_BAND_RECENCY_MS;
          const hasRelated = hasRelatedCategories(msg.body, bestCtx);

          const hasHighWithOverlap = hasHighRelevance && bestEffective >= 0.16;
          const hasRecentWithOverlap = hasRecentActivity && bestEffective >= 0.25;
          const hasMedicalWithOverlap = hasSharedMedical && bestEffective >= 0.20;
          const hasRelatedWithRecency = hasRelated && hasRecentActivity;
          if (hasHighWithOverlap || hasMedicalWithOverlap || hasRecentWithOverlap || hasRelatedWithRecency) {
            best.replies.push(msg);
            best.lastTime = now;
          } else {
            unattached.push(msg);
          }
        }
      }
    }
  }

  for (const t of active) finalize(t);

  // ── Backward pass: attach delayed replies to finalized threads ──
  let backwardCount = 0;
  for (const msg of unattached) {
    if (msg.relevanceScore < BACKWARD_MIN_SCORE) continue;

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
      bestThread.threadConfidence = calcThreadConfidence(bestThread, embMap);
      backwardCount++;
    }
  }

  return { threads: finalized, backwardAttached: backwardCount };
}

// ─── Phase 6: Title Cleaning ──────────────────────────────────────────────────

function cleanTitle(body: string): string {
  let s = body.trim();

  // Strip leading greeting
  s = s.replace(
    /^(hello\s+friends|hello|hi\s+everyone|hi|dear\s+\w+|good\s+morning|good\s+afternoon|good\s+evening)\s*[,.]?\s*/i,
    "",
  ).trim();

  // Strip leading emoji sequence
  s = s.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\s]+/u, "").trim();

  // Prefer the first question sentence — it's usually the actual topic.
  // Fall back to first sentence/clause if no '?' is present.
  const questionMatch = /[^.!?\n]*\?/.exec(s);
  if (questionMatch) {
    s = questionMatch[0].trim();
  } else {
    const breakIdx = /[.!?\n]/.exec(s.slice(10))?.index;
    if (breakIdx !== undefined) s = s.slice(0, 10 + breakIdx + 1).trim();
  }

  // Truncate at 80 chars on word boundary
  if (s.length > 80) {
    const sub = s.slice(0, 80);
    const lastSpace = sub.lastIndexOf(" ");
    s = (lastSpace > 20 ? sub.slice(0, lastSpace) : sub) + "...";
  }

  // Capitalise first letter
  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s || body.slice(0, 60);
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
      await enqueueReplyIngest({ type: "create", replyId: existingReply.id });
      continue;
    }

    const replyUserId = await resolveUser(reply.sender);
    const replyRow = await prisma.reply.create({
      data: {
        postId,
        userId:          replyUserId,
        content:         reply.body,
        createdAt:       reply.timestamp,
        originPlatform:  "whatsapp",
        waMessageKey:    reply.waMessageKey,
        waThreadKey:     thread.waThreadKey,
        importRunId:     runId,
        relevanceScore:  reply.relevanceScore,
        threadConfidence: thread.threadConfidence,
        medicalRisk:     "low",
      },
    });
    stats.createdReplies++;
    await enqueueReplyIngest({ type: "create", replyId: replyRow.id });
  }
}

async function seedThread(thread: WaThread, runId: string, stats: RunStats): Promise<void> {
  const existing = await prisma.post.findUnique({
    where: { waMessageKey: thread.anchor.waMessageKey },
    select: { id: true },
  });

  if (existing) {
    // Post already exists — re-enqueue for idempotent Pinecone repair, then backfill
    // any replies missed on a prior run (e.g. partial failure after post creation).
    stats.skippedDuplicates++;
    await enqueuePostIngest({ type: "create", postId: existing.id });
    await seedReplies(thread, existing.id, runId, stats);
    return;
  }

  const userId = await resolveUser(thread.anchor.sender);

  const post = await prisma.post.create({
    data: {
      title:           cleanTitle(thread.anchor.body),
      content:         thread.anchor.body,
      userId,
      createdAt:       thread.anchor.timestamp,
      originPlatform:  "whatsapp",
      waMessageKey:    thread.anchor.waMessageKey,
      waThreadKey:     thread.waThreadKey,
      importRunId:     runId,
      relevanceScore:  thread.anchor.relevanceScore,
      threadConfidence: thread.threadConfidence,
      medicalRisk:     "low",
    },
  });
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

  if (!dryRun) {
    ({ enqueuePostIngest }  = await import("../queues/postIngest.queue.js"));
    ({ enqueueReplyIngest } = await import("../queues/replyIngest.queue.js"));
  }

  const linesArg       = parseArg(args, "lines");
  const dateArg        = parseArg(args, "date");
  const weekArg        = parseArg(args, "week");
  const monthArg       = parseArg(args, "month");
  const fileArg        = parseArg(args, "file");
  const spamSendersArg = parseArg(args, "spam-senders");
  const spamMarkersArg = parseArg(args, "spam-markers");

  // Build spam rules: defaults + CLI overrides
  const spamRules: SpamSenderRule[] = [...DEFAULT_SPAM_SENDER_RULES];
  if (spamSendersArg) {
    for (const name of spamSendersArg.split(",").map(s => s.trim()).filter(Boolean)) {
      // CLI-added senders drop ALL their messages (match-everything pattern)
      spamRules.push({ sender: name, patterns: [/[\s\S]*/] });
    }
  }
  if (spamMarkersArg) {
    SPAM_CONTENT_MARKERS = spamMarkersArg.split(",").map(s => s.trim()).filter(Boolean);
  }

  // Compute date list for --week: 7 consecutive days starting from the given date
  function weekDates(start: string): string[] {
    const [dd, mm, yy] = start.split("/").map(Number);
    if (dd === undefined || mm === undefined || yy === undefined) {
      throw new Error(`Invalid --week date format: ${start} (expected DD/MM/YY)`);
    }
    const base = new Date(2000 + yy, mm - 1, dd);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const day = d.getDate().toString().padStart(2, "0");
      const mon = (d.getMonth() + 1).toString().padStart(2, "0");
      const yr  = (d.getFullYear() - 2000).toString().padStart(2, "0");
      dates.push(`${day}/${mon}/${yr}`);
    }
    return dates;
  }

  function monthDates(start: string): string[] {
    const [dd, mm, yy] = start.split("/").map(Number);
    if (dd === undefined || mm === undefined || yy === undefined) {
      throw new Error(`Invalid --month date format: ${start} (expected DD/MM/YY)`);
    }
    const base = new Date(2000 + yy, mm - 1, dd);
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const remaining = daysInMonth - dd + 1;
    const dates: string[] = [];
    for (let i = 0; i < remaining; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const day = d.getDate().toString().padStart(2, "0");
      const mon = (d.getMonth() + 1).toString().padStart(2, "0");
      const yr  = (d.getFullYear() - 2000).toString().padStart(2, "0");
      dates.push(`${day}/${mon}/${yr}`);
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
  // Reset density-adaptive windows to defaults so each day starts fresh
  GAP_NEW_THREAD_MS = DEFAULT_GAP_NEW_THREAD_MS;
  HARD_WINDOW_MS    = DEFAULT_HARD_WINDOW_MS;

  let lines: string[];
  if (currentDate) {
    const prefix = `[${currentDate}`;
    const dateLines: string[] = [];
    let inDate = false;
    for (const line of allLines) {
      if (line.startsWith("[")) {
        inDate = line.startsWith(prefix);
      }
      if (inDate) dateLines.push(line);
    }
    lines = dateLines;
    if (datesToProcess.length > 1) {
      console.log(`\n${"═".repeat(60)}`);
      console.log(`  ${currentDate}`);
      console.log(`${"═".repeat(60)}`);
    }
    console.log(`Filtered to date ${currentDate} (${lines.length} lines)\n`);
    if (lines.length === 0) {
      console.log("  No messages for this date — skipping.\n");
      continue;
    }
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
  };

  // ── Parse ──
  const { messages, failures } = parse(lines);
  stats.parsedMessages = messages.length;
  stats.parseFailures  = failures;

  // ── Filter ──
  const filtered = filterNoise(messages, spamRules);
  stats.droppedMessages = messages.length - filtered.length;

  // ── Adaptive time windows ──
  computeAdaptiveWindows(filtered, verbose);

  // ── Embed ──
  // Batch-embed all message bodies + reference topics in a single API call.
  // Map is keyed by raw body text so topicOverlap() can look up any string.
  let embMap: Map<string, number[]> | undefined;
  let refVecs: number[][] | undefined;

  if (!noEmbed) {
    const uniqueBodies = [...new Set(filtered.map(m => m.body))];
    const allTexts = [...uniqueBodies, ...REFERENCE_TOPICS];
    const prefixed = allTexts.map(t => "passage: " + t);

    console.log(`\n  Embedding ${uniqueBodies.length} messages + ${REFERENCE_TOPICS.length} reference topics...`);
    try {
      const vectors = await embeddingsModel.embedDocuments(prefixed);
      embMap = new Map<string, number[]>();
      for (let i = 0; i < allTexts.length; i++) {
        const text = allTexts[i];
        const vec = vectors[i];
        if (text !== undefined && vec !== undefined) {
          embMap.set(text, vec);
        }
      }
      refVecs = REFERENCE_TOPICS.map(t => embMap!.get(t)).filter((v): v is number[] => v !== undefined);
      console.log(`  Embedded ${embMap.size} texts (${vectors[0]?.length ?? "?"} dims)`);
    } catch (err) {
      console.log(`  Embedding failed: ${err instanceof Error ? err.message : String(err)}`);
      console.log("  Falling back to keyword-only mode");
      embMap = undefined;
      refVecs = undefined;
    }
  }

  // ── Score ──
  const scored: ScoredMessage[] = filtered.map(m => {
    const { score, categoryHits } = scoreRelevance(m, embMap, refVecs);
    return { ...m, relevanceScore: score, categoryHits };
  });

  // ── Adaptive thresholds ──
  computeAdaptiveThresholds(scored.map(m => m.relevanceScore), verbose);

  const buckets = { drop: 0, borderline: 0, eligible: 0 };
  for (const m of scored) {
    if (m.relevanceScore < MIN_RELEVANCE) buckets.drop++;
    else if (m.relevanceScore < ANCHOR_MIN_SCORE) buckets.borderline++;
    else buckets.eligible++;
  }

  console.log("── Parse & Filter ──────────────────────────────");
  console.log(`  Total lines:        ${stats.totalLines}`);
  console.log(`  Parsed messages:    ${stats.parsedMessages}`);
  console.log(`  Parse failures:     ${stats.parseFailures}`);
  console.log(`  After noise filter: ${filtered.length} (dropped ${stats.droppedMessages})`);
  console.log(`  Score < ${MIN_RELEVANCE} (drop):  ${buckets.drop}`);
  console.log(`  Score ${MIN_RELEVANCE}–${ANCHOR_MIN_SCORE - 1} (border): ${buckets.borderline}`);
  console.log(`  Score >= ${ANCHOR_MIN_SCORE} (anchor): ${buckets.eligible}`);

  if (verbose) {
    console.log("\n── Per-message scores (verbose) ─────────────────");
    for (const m of scored) {
      const lower = m.body.toLowerCase();
      const cats = TERM_CATEGORIES.filter(cat => cat.some(t => lower.includes(t)));
      const signals: string[] = [];
      if (cats.length > 0) signals.push(`cats=${cats.length}`);
      if (m.body.includes("?") || QUESTION_WORDS.some(w => lower.startsWith(w))) signals.push("question");
      if (EXPERIENTIAL_PATTERNS.some(p => lower.includes(p))) signals.push("experiential");
      if (SUPPORT_SEEKING_PATTERNS.some(p => lower.includes(p))) signals.push("seeking");
      if (RECOMMENDATION_PATTERNS.some(p => lower.includes(p))) signals.push("recommend");
      if (isDoctor(m.sender)) signals.push("doctor");
      if (m.body.trim().length < 20 && cats.length === 0) signals.push("short-penalty");
      if (/^(thank|thanks|ok|okay|noted|sure|yes|no|👍|🙏|great|good)\W*$/i.test(m.body.trim())) signals.push("ack-penalty");

      const flag = m.relevanceScore < MIN_RELEVANCE ? "DROP" : m.relevanceScore < ANCHOR_MIN_SCORE ? "BORD" : "ELIG";
      console.log(
        `  [${flag}] score=${m.relevanceScore.toString().padStart(3)} ` +
        `[${signals.join(", ") || "none"}] ` +
        `${m.sender.slice(0, 15).padEnd(15)} | ${m.body.slice(0, 60).replace(/\n/g, " ")}`
      );
    }
  }

  // ── Thread reconstruction (runs in both dry-run and live mode) ──
  const { threads, backwardAttached } = await reconstructThreads(scored, verbose, embMap, !noLLM);
  stats.backwardAttached = backwardAttached;

  // Shared publish-gate helper so tStats, dry-run preview, and live seed loop
  // all use identical logic.
  function publishGate(t: WaThread): "auto" | "qa" | "skip" {
    // Unanswered posts: keep genuine unanswered medical questions as standalone
    // posts, but require at least one real keyword-matched medical category hit.
    // This guards against embedding-only anchors (art, motivational content)
    // that score well on cosine similarity but contain no medical terminology.
    const substantiveReplies = t.replies.filter(r => r.relevanceScore >= MIN_RELEVANCE).length;
    if (substantiveReplies === 0 &&
        t.anchor.relevanceScore >= ANCHOR_EXPERIENTIAL_SCORE &&
        t.anchor.categoryHits >= 1) {
      return "auto";
    }

    // Multi-reply threads: use confidence formula.
    if (t.threadConfidence >= AUTO_PUBLISH_CONF) return "auto";
    if (t.threadConfidence >= QA_CONF)           return "qa";
    return "skip";
  }

  const tStats = { autoPublish: 0, qa: 0, skip: 0 };
  for (const t of threads) {
    const gate = publishGate(t);
    if (gate === "auto") tStats.autoPublish++;
    else if (gate === "qa") tStats.qa++;
    else tStats.skip++;
  }

  console.log("\n── Threading ───────────────────────────────────");
  console.log(`  Threads total:                   ${threads.length}`);
  console.log(`  Auto-publish (conf≥${AUTO_PUBLISH_CONF} | 0-reply): ${tStats.autoPublish}`);
  console.log(`  QA review    (conf ${QA_CONF}–${AUTO_PUBLISH_CONF - 1}):         ${tStats.qa}`);
  console.log(`  Skipped:                           ${tStats.skip}`);
  console.log(`  Backward-attached replies:         ${stats.backwardAttached}`);
  if (!noLLM) {
    console.log(`  LLM calls (middle band):           ${llmCallCount} (${llmCacheHits} cached)`);
  }

  if (dryRun) {
    console.log("\n── Thread preview (dry-run, no DB writes) ──────");
    threads.slice(0, 8).forEach((t, i) => {
      const gate = publishGate(t);
      const flag = gate === "auto" ? "AUTO" : gate === "qa" ? " QA " : "SKIP";
      const lang = t.anchor.language === "hinglish" ? " [hi]" : "      ";
      console.log(
        `  [${flag}] conf=${t.threadConfidence.toFixed(0).padStart(3)}${lang} ` +
        `replies=${t.replies.length.toString().padStart(2)} | ${t.anchor.body.slice(0, 70).replace(/\n/g, " ")}`
      );
      t.replies.forEach((r, ri) => {
        const score = r.relevanceScore.toString().padStart(3);
        console.log(
          `         reply ${(ri + 1).toString().padStart(2)} [score=${score}] ${r.body.slice(0, 60).replace(/\n/g, " ")}`
        );
      });
      if (i === 7 && threads.length > 8) console.log(`  … and ${threads.length - 8} more`);
    });
    console.log("\nDry-run complete — no DB writes.");
    continue;
  }

  // ── ImportRun ──
  const run = await prisma.importRun.create({
    data: {
      sourceFile:      basename(chatPath),
      status:          "running",
      totalLines:      stats.totalLines,
      parsedMessages:  stats.parsedMessages,
      droppedMessages: stats.droppedMessages,
      parseFailures:   stats.parseFailures,
    },
  });
  console.log(`\n  ImportRun ID: ${run.id}`);

  const reviewThreads: WaThread[] = [];

  try {
    for (const thread of threads) {
      const gate = publishGate(thread);

      if (gate === "auto") {
        await seedThread(thread, run.id, stats);
      } else if (gate === "qa") {
        stats.qaReviewThreads++;
        reviewThreads.push(thread);
      }
    }

    if (reviewThreads.length > 0) {
      const artifact = resolve(process.cwd(), `../import-review-${run.id}.json`);
      const scrubbedReview = reviewThreads.map(t => ({
        ...t,
        anchor: { ...t.anchor, sender: toPseudonym(t.anchor.sender) },
        replies: t.replies.map(r => ({ ...r, sender: toPseudonym(r.sender) })),
      }));
      writeFileSync(artifact, JSON.stringify(scrubbedReview, null, 2));
      console.log(`\n  Review artifact: import-review-${run.id}.json (${reviewThreads.length} threads)`);
    }

    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status:           "completed",
        completedAt:      new Date(),
        createdPosts:     stats.createdPosts,
        createdReplies:   stats.createdReplies,
        skippedDuplicates: stats.skippedDuplicates,
        qaReviewThreads:   stats.qaReviewThreads,
      },
    });

  } catch (err) {
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date() },
    }).catch(() => undefined);
    throw err;
  }

  console.log("\n── Seed Results ────────────────────────────────");
  console.log(`  Posts created:       ${stats.createdPosts}`);
  console.log(`  Replies created:     ${stats.createdReplies}`);
  console.log(`  Skipped (dupes):     ${stats.skippedDuplicates}`);
  console.log(`  QA review threads:   ${stats.qaReviewThreads}`);
  console.log("\nDone. Run `pnpm dev:worker` to process the Pinecone ingestion queue.");

  } // end for (const currentDate of datesToProcess)

  if (!dryRun) await redisConnection.quit();
}

void main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
