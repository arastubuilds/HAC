import { RetrievalChunk } from "../types/retrieval.types.js";

const SOURCE_WEIGHT = {
  medical: 1.1,
  community: 0.9,
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
  topK = 8
): RetrievalChunk[] {

  const scored = chunks.map((chunk) => {
    const sourceWeight = SOURCE_WEIGHT[chunk.source];

    const recency =
      chunk.source === "community"
        ? recencyFactor(chunk.createdAt)
        : 1;

    const finalScore = chunk.score * sourceWeight * recency;

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
    if (!seenDocs.has(chunk.sourceId)) {
      seenDocs.add(chunk.sourceId);
      unique.push(chunk);
    }

    if (unique.length >= topK) break;
  }

  return unique;
}