import { RetrievalChunk } from "../types/retrieval.types.js";
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