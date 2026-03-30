"use client";

import { useState } from "react";
import type { ThreadReview } from "@hac/shared/types";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ReviewPreviewModal({ review }: { review: ThreadReview }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-2.5 py-1 rounded bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors"
      >
        View
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-4xl rounded-xl bg-surface border border-border shadow-[var(--shadow-md)] p-5 max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-text-primary">Review Context</h3>
                <p className="text-xs text-text-muted font-mono mt-1">{review.waThreadKey}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-sm text-text-secondary hover:text-text-primary"
                aria-label="Close preview"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <section className="rounded-lg border border-border p-3">
                <h4 className="text-sm font-semibold text-text-primary mb-2">Anchor Message</h4>
                <div className="text-xs text-text-muted mb-2">
                  sender: {review.anchorSenderPseudonym ?? "—"} | time: {fmtDate(review.anchorTimestamp)}
                </div>
                <pre className="text-sm whitespace-pre-wrap text-text-body font-sans">
                  {review.anchorPreview ?? "No anchor message captured."}
                </pre>
              </section>

              <section className="rounded-lg border border-border p-3">
                <h4 className="text-sm font-semibold text-text-primary mb-2">Candidate Thread</h4>
                {!review.candidateThread ? (
                  <p className="text-sm text-text-secondary">No existing candidate thread linked yet.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-text-muted mb-1">Title</div>
                      <div className="text-sm font-medium text-text-primary">{review.candidateThread.title}</div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted mb-1">Post Content</div>
                      <pre className="text-sm whitespace-pre-wrap text-text-body font-sans">
                        {review.candidateThread.content}
                      </pre>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted mb-1">
                        Replies ({review.candidateThread.replies.length})
                      </div>
                      {review.candidateThread.replies.length === 0 ? (
                        <p className="text-sm text-text-secondary">No replies yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {review.candidateThread.replies.map((r) => (
                            <div key={r.id} className="rounded border border-border p-2">
                              <div className="text-[11px] text-text-muted mb-1">
                                {r.authorName} · {fmtDate(r.createdAt)}
                              </div>
                              <pre className="text-sm whitespace-pre-wrap text-text-body font-sans">{r.content}</pre>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

