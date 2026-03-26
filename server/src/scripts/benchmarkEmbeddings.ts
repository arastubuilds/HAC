/**
 * Embedding Model Benchmark
 *
 * Compares embedding models on real WhatsApp message pairs to evaluate
 * which model best separates similar vs. dissimilar messages.
 *
 * Usage:
 *   pnpm --filter server exec tsx src/scripts/benchmarkEmbeddings.ts
 */

import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { env } from "../config/env.js";

// ─── Models to benchmark ─────────────────────────────────────────────────────

interface ModelConfig {
  name: string;
  model: string;
  prefix: string; // e5 models need "passage: " prefix; others may not
}

const MODELS: ModelConfig[] = [
  { name: "e5-base-v2 (current)",       model: "intfloat/e5-base-v2",              prefix: "passage: " },
  { name: "embeddinggemma-300m",         model: "google/embeddinggemma-300m",       prefix: "" },
  { name: "bge-m3",                      model: "BAAI/bge-m3",                     prefix: "" },
  { name: "all-MiniLM-L6-v2",            model: "sentence-transformers/all-MiniLM-L6-v2", prefix: "" },
];

// ─── Test pairs from 24/10/25 chat data ──────────────────────────────────────

interface TestPair {
  label: string;
  a: string;
  b: string;
  expected: "similar" | "dissimilar";
}

const TEST_PAIRS: TestPair[] = [
  // Similar: same zoladex discussion
  {
    label: "Zoladex Q → Zoladex experience",
    a: "Hello….is anyone on zoladex injection for hormone positive breast cancer? What are the side effects?",
    b: "I have been on Zoladex fr 5 yrs. It's like induced menopause. Hot flashes, mood swings, joint pain, weight gain.",
    expected: "similar",
  },
  // Similar: chemo side effects Q → advice
  {
    label: "Chemo side effects Q → advice",
    a: "Hello friends, I need your help and advice. After my mom's chemotherapy she is experiencing nausea, weakness and hair loss.",
    b: "Dear Shweta, many people experience weakness, nausea and pain after chemo. Make sure she stays hydrated and eats protein rich food.",
    expected: "similar",
  },
  // Similar: hormone therapy sweating (26/10 pair)
  {
    label: "Hormone therapy sweating → reply",
    a: "Good morning all I'm on hormone therapy but having excessive sweating especially on the face. Anyone else?",
    b: "Good morning, Excessive sweating — especially on the face and neck — is a very common side effect of hormone therapy.",
    expected: "similar",
  },
  // Dissimilar: chemo side effects vs kadhi chawal
  {
    label: "Chemo side effects vs kadhi food",
    a: "Hello friends, I need your help and advice. After my mom's chemotherapy she is experiencing nausea, weakness and hair loss.",
    b: "Good afternoon Can you eat kadhi chawal during chemotherapy? Please suggest.",
    expected: "dissimilar",
  },
  // Dissimilar: sugar intake vs weight gain
  {
    label: "Sugar myth vs weight training",
    a: "Another question that keeps bothering me at times is of sugar intake. Does sugar feed cancer?",
    b: "I do weight training and exercise 4-5 days a week but not able to control weight.",
    expected: "dissimilar",
  },
  // Hinglish → English equivalence
  {
    label: "Hinglish medical → English equiv",
    a: "mujhe chemo ke baad bahut thakan aur bukhar ho raha hai, koi bataye kya kare",
    b: "I am experiencing fatigue and fever after chemotherapy, what should I do?",
    expected: "similar",
  },
  // Hinglish → English dissimilar
  {
    label: "Hinglish medical vs English unrelated",
    a: "mujhe chemo ke baad bahut thakan aur bukhar ho raha hai",
    b: "Shall we start a eat clean challenge and motivate each other?",
    expected: "dissimilar",
  },
  // Short reply similarity
  {
    label: "Short agreement → parent topic",
    a: "Same here, I also had this problem",
    b: "Zoladex causes weight gain. You have to work really hard to avoid it.",
    expected: "similar",
  },
];

// ─── Cosine similarity ──────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const filterArg = process.argv[2]?.toLowerCase();
  const filtered = filterArg
    ? MODELS.filter(m => m.name.toLowerCase().includes(filterArg) || m.model.toLowerCase().includes(filterArg))
    : MODELS;

  if (filtered.length === 0) {
    console.log(`No model matching "${filterArg}". Available: ${MODELS.map(m => m.name).join(", ")}`);
    return;
  }

  console.log("Embedding Model Benchmark");
  console.log("=".repeat(70));

  for (const cfg of filtered) {
    console.log(`\n── ${cfg.name} (${cfg.model}) ──`);

    const client = new HuggingFaceInferenceEmbeddings({
      apiKey: env.HUGGING_FACE_API_KEY,
      model: cfg.model,
      provider: "hf-inference",
    });

    // Collect all unique texts to embed in one batch
    const textSet = new Set<string>();
    for (const pair of TEST_PAIRS) {
      textSet.add(pair.a);
      textSet.add(pair.b);
    }
    const texts = [...textSet];
    const prefixed = texts.map(t => cfg.prefix + t);

    console.log(`  Embedding ${texts.length} unique texts...`);
    let vectors: number[][];
    try {
      vectors = await client.embedDocuments(prefixed);
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const vecMap = new Map<string, number[]>();
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const v = vectors[i];
      if (t !== undefined && v !== undefined) {
        vecMap.set(t, v);
      }
    }

    console.log(`  Dims: ${vectors[0]?.length ?? "?"}\n`);

    let simSum = 0, simCount = 0;
    let disSum = 0, disCount = 0;

    for (const pair of TEST_PAIRS) {
      const vecA = vecMap.get(pair.a);
      const vecB = vecMap.get(pair.b);
      if (!vecA || !vecB) { console.log(`  SKIP: ${pair.label}`); continue; }

      const sim = cosine(vecA, vecB);
      const tag = pair.expected === "similar" ? "SIM" : "DIS";
      const indicator = pair.expected === "similar"
        ? (sim >= 0.5 ? "OK" : "LOW")
        : (sim < 0.5 ? "OK" : "HIGH");

      console.log(`  [${tag}] ${sim.toFixed(3)} ${indicator.padEnd(4)} | ${pair.label}`);

      if (pair.expected === "similar") { simSum += sim; simCount++; }
      else { disSum += sim; disCount++; }
    }

    const avgSim = simCount > 0 ? simSum / simCount : 0;
    const avgDis = disCount > 0 ? disSum / disCount : 0;
    const gap = avgSim - avgDis;

    console.log(`\n  Avg similar:    ${avgSim.toFixed(3)}`);
    console.log(`  Avg dissimilar: ${avgDis.toFixed(3)}`);
    console.log(`  GAP (higher=better): ${gap.toFixed(3)}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("Pick the model with the highest GAP and good Hinglish scores.");
}

void main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
