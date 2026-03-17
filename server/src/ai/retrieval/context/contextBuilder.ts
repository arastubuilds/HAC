import { RetrievalChunk, ThreadContext } from "../types/retrieval.types.js";
import { Citation } from "../types/citation.types.js";
import { RetrievalContext } from "../types/context.types.js";


export function buildContext(chunks: RetrievalChunk[]): RetrievalContext {
    const medical = chunks.filter((chunk) => chunk.source === "medical");
    const community = chunks.filter((chunk) => chunk.source === "community");

    const citations: Citation[] = [];
    let citationIndex = 1;
    
    function buildSection(sectionChunks: RetrievalChunk[]) {
        return sectionChunks.map((chunk) => {
            const currIndex = citationIndex++;
            const citation: Citation = {
                index: currIndex,
                source: chunk.source,
                documentId: chunk.sourceId,
                title: chunk.title ?? "",
                ...(chunk.type !== undefined && { type: chunk.type }),
                snippet: chunk.text.slice(0, 120),
                ...(chunk.type === "reply" && { parentPostId: chunk.parentPostId }),
            }
            citations.push(citation);
            return `
            SOURCE [${currIndex}]
            type: ${chunk.source}
            title: ${chunk.title ?? "Unknown"}
            content:
            ${chunk.text}
            `.trim();
        })
        .join("\n\n");
    }

    const medicalSection = buildSection(medical);
    const communitySection = buildSection(community);

    const context = `
    Medical Information:

    ${medicalSection}

    Community Information:

    ${communitySection}
    `.trim();

    return {
        context,
        citations,
    };
}

export function buildContextWithThreads(
  chunks: RetrievalChunk[],
  threads: ThreadContext[]
): RetrievalContext {
  const expandedPostIds = new Set(threads.map(t => t.postId));

  const medicalChunks = chunks.filter(c => c.source === "medical");
  const postChunks = chunks.filter(c => c.source === "community" && c.type === "post");
  const nonExpandedReplyChunks = chunks.filter(
    c => c.source === "community" && c.type === "reply" && !expandedPostIds.has(c.parentPostId ?? "")
  );

  const citations: Citation[] = [];
  let citationIndex = 1;

  function buildSection(sectionChunks: RetrievalChunk[]) {
    return sectionChunks.map(chunk => {
      const currIndex = citationIndex++;
      citations.push({
        index: currIndex,
        source: chunk.source,
        documentId: chunk.sourceId,
        title: chunk.title ?? "",
        ...(chunk.type !== undefined && { type: chunk.type }),
        snippet: chunk.text.slice(0, 120),
        ...(chunk.type === "reply" && { parentPostId: chunk.parentPostId }),
      });
      return `SOURCE [${currIndex}]\ntype: ${chunk.source}\ntitle: ${chunk.title ?? "Unknown"}\ncontent:\n${chunk.text}`;
    }).join("\n\n");
  }

  const medicalSection = buildSection(medicalChunks);
  const communitySection = buildSection([...postChunks, ...nonExpandedReplyChunks]);

  const threadBlocks = threads.map(thread => {
    const startIndex = citationIndex;
    for (const r of thread.replies.filter(r => r.isMatched)) {
      citations.push({
        index: citationIndex++,
        source: "community",
        documentId: r.id,
        title: thread.title,
        type: "reply",
        snippet: r.content.slice(0, 120),
        parentPostId: thread.postId,
      });
    }
    const endIndex = citationIndex - 1;
    const label = startIndex === endIndex ? `${startIndex}` : `${startIndex}-${endIndex}`;
    const replyLines = thread.replies.map((r, i) => {
      const marker = r.isMatched ? "** MATCHED ** " : "";
      return `  [${i + 1}] ${marker}${r.content}`;
    }).join("\n");
    return `THREAD [${label}]\ntitle: ${thread.title}\npost:\n${thread.postContent}\n\nreplies:\n${replyLines}`;
  }).join("\n\n");

  const context = `Medical Information:\n\n${medicalSection}\n\nCommunity Information:\n\n${communitySection}\n\n${threadBlocks}`.trim();

  return { context, citations };
}