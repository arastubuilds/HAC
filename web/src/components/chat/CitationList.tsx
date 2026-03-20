import Link from "next/link";
import type { Citation } from "@hac/shared/types";

interface CitationListProps {
  citations: Citation[];
}

export function CitationList({ citations }: CitationListProps) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sources</p>
      <ol className="flex flex-col gap-2">
        {citations.map((citation) => (
          <li key={citation.index} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-primary">[{citation.index}]</span>
              {citation.source === "community" ? (
                <Link
                  href={`/forum/${citation.parentPostId ?? citation.documentId}`}
                  className="text-xs text-text-secondary hover:text-primary transition-colors duration-[var(--duration-base)] truncate"
                >
                  {citation.title ?? citation.documentId}
                </Link>
              ) : (
                <span className="text-xs text-text-secondary truncate">
                  {citation.title ?? citation.documentId}
                </span>
              )}
              {citation.type && (
                <span className="shrink-0 text-[10px] font-medium bg-primary-subtle text-primary px-1.5 py-0.5 rounded-sm">
                  {citation.type === "post" ? "Post" : "Reply"}
                </span>
              )}
            </div>
            {citation.snippet && (
              <p className="ml-5 text-xs text-text-muted line-clamp-2">{citation.snippet}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
