import type { QueryStreamEvent } from "@hac/shared/types";

/**
 * Streams a query to POST /query using XMLHttpRequest.
 * Hermes (React Native's JS engine) does not support ReadableStream,
 * so we use XHR onprogress to read incremental chunks instead.
 *
 * Returns an abort function — call it to cancel the request (e.g. on unmount).
 */
export function streamQuery(
  baseUrl: string,
  token: string | null,
  message: string,
  onEvent: (event: QueryStreamEvent) => void,
  onError: (err: Error) => void
): () => void {
  const xhr = new XMLHttpRequest();
  let cursor = 0;

  xhr.open("POST", `${baseUrl}/query`, true);
  xhr.setRequestHeader("Content-Type", "application/json");
  if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

  xhr.onprogress = () => {
    const chunk = xhr.responseText.slice(cursor);
    cursor = xhr.responseText.length;

    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const json = trimmed.slice(6).trim();
      if (!json) continue;
      try {
        const event = JSON.parse(json) as QueryStreamEvent;
        onEvent(event);
      } catch {
        // malformed line — skip
      }
    }
  };

  xhr.onerror = () => onError(new Error("Network error during stream"));
  xhr.ontimeout = () => onError(new Error("Request timed out"));
  xhr.onload = () => {
    if (xhr.status === 401) {
      onError(new Error("Unauthorized"));
    } else if (xhr.status >= 400) {
      onError(new Error(`Server error: ${xhr.status}`));
    }
  };

  xhr.timeout = 120_000; // 2 min — long enough for the full pipeline
  xhr.send(JSON.stringify({ message }));

  return () => xhr.abort();
}
