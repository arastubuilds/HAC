import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPendingReviews } from "@/services/review.service";
import { ReviewActions } from "./ReviewActions";
import { ReviewPreviewModal } from "./ReviewPreviewModal";
import type { ThreadReview } from "@hac/shared/types";

export const metadata: Metadata = { title: "Review Queue — HAC" };

export default async function AdminReviewsPage() {
  let reviews: ThreadReview[] = [];
  let loadError: string | null = null;
  try {
    reviews = await getPendingReviews();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load review queue";
    if (/unauthorized|401/i.test(message)) {
      redirect("/login");
    }
    loadError = message;
    reviews = [];
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Review Queue</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {reviews.length} thread{reviews.length !== 1 ? "s" : ""} pending human review
          </p>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-border bg-card px-4 py-3 text-sm text-error">
          Failed to load reviews: {loadError}
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-text-secondary">
          No threads pending review.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-page-bg text-text-secondary border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Thread key</th>
                <th className="px-4 py-3 text-left font-medium">Decision</th>
                <th className="px-4 py-3 text-left font-medium">Cohesion</th>
                <th className="px-4 py-3 text-left font-medium">Confidence</th>
                <th className="px-4 py-3 text-left font-medium">LLM failures</th>
                <th className="px-4 py-3 text-left font-medium">Reason</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {reviews.map((review) => (
                <tr key={review.id} className="hover:bg-page-bg transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary max-w-[160px] truncate">
                    {review.waThreadKey}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-primary-subtle text-primary">
                      {review.publishDecision}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {(review.threadCohesionScore * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {(review.publishConfidenceScore * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    {review.llmFailedCount > 0 ? (
                      <span className="text-red-600 font-semibold">{review.llmFailedCount}</span>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary max-w-[240px]">
                    <ul className="space-y-0.5">
                      {review.decisionReasons.slice(0, 2).map((r, i) => (
                        <li key={i} className="truncate text-xs">{r}</li>
                      ))}
                      {review.decisionReasons.length > 2 && (
                        <li className="text-xs text-text-secondary italic">
                          +{review.decisionReasons.length - 2} more
                        </li>
                      )}
                    </ul>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <ReviewPreviewModal review={review} />
                      <ReviewActions id={review.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
