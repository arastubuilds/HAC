import { env } from "../../../config/env.js";
import { type RetrievalChunk } from "../types/retrieval.types.js";
const DEBUG_RETRIEVAL = env.NODE_ENV === "development";

export function inspectRetrieval(
  query: string,
  route: string,
  retrieved: RetrievalChunk[],
  ranked: RetrievalChunk[],
  context: string
) {

  if (!DEBUG_RETRIEVAL) return;

  console.log("\n================ RETRIEVAL DEBUG ================\n");

  console.log("Query:");
  console.log(query);

  console.log("\nRoute:");
  console.log(route);

  console.log("\nRetrieved Chunks:");
  retrieved.forEach((chunk, i) => {
    console.log(
      `[${i + 1}]`,
      `${chunk.source}:${chunk.sourceId}`,
      `score=${chunk.score.toFixed(3)}`
    );
  });

  console.log("\nRanked Results:");
  ranked.forEach((chunk, i) => {
    console.log(
      `[${i + 1}]`,
      `${chunk.source}:${chunk.sourceId}`,
      `score=${chunk.score.toFixed(3)}`
    );
  });

  console.log("\nContext Preview:");
  console.log(context.slice(0, 500));

  console.log("\n=================================================\n");
}