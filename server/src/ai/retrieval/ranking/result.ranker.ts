import { type RetrievalChunk } from "../types/retrieval.types.js";

const SOURCE_WEIGHT = {
  medical:   1.1,
  community: 1.0,
};

const TYPE_WEIGHT = {
  post:  0.85,
  reply: 0.90,
};

function recencyFactor(createdAt?: string): number {
  if (!createdAt) return 1;

  const ageDays =
    (Date.now() - new Date(createdAt).getTime()) /
    (1000 * 60 * 60 * 24);

  // decay over 1 year
  return Math.max(0.5, 1 - ageDays / 365);
}

export function rankChunks(
  chunks: RetrievalChunk[],
  topK = 8,
  minScore = 0.65
): RetrievalChunk[] {

  const scored = chunks.map((chunk) => {
    const sourceWeight = SOURCE_WEIGHT[chunk.source];
    const typeWeight   = chunk.source === "community"
      ? TYPE_WEIGHT[chunk.type ?? "post"]
      : 1;
    const recency = chunk.source === "community" ? recencyFactor(chunk.createdAt) : 1;
    const finalScore = chunk.score * sourceWeight * typeWeight * recency;

    return {
      ...chunk,
      score: finalScore,
    };
  });

  // sort highest score first
  scored.sort((a, b) => b.score - a.score);

  // deduplicate by document
  const seenDocs = new Set<string>();
  const unique: RetrievalChunk[] = [];

  for (const chunk of scored) {
    const dedupKey = chunk.replyId ?? chunk.sourceId;
    if (!seenDocs.has(dedupKey)) {
      seenDocs.add(dedupKey);
      unique.push(chunk);
    }

    if (unique.length >= topK) break;
  }

  return unique.filter(c => c.score >= minScore);
}