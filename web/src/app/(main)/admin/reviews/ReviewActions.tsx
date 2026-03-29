"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<"approved" | "rejected" | null>(null);

  async function submit() {
    if (!pendingDecision || !reason.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: pendingDecision, reason: reason.trim() }),
      });
      router.refresh();
    } finally {
      setBusy(false);
      setOpen(false);
      setReason("");
      setPendingDecision(null);
    }
  }

  function openDialog(decision: "approved" | "rejected") {
    setPendingDecision(decision);
    setOpen(true);
  }

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => openDialog("approved")}
          className="text-xs font-medium px-2.5 py-1 rounded bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => openDialog("rejected")}
          className="text-xs font-medium px-2.5 py-1 rounded bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
        >
          Reject
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              {pendingDecision === "approved" ? "Approve thread" : "Reject thread"}
            </h3>
            <textarea
              className="w-full border border-border rounded-md text-sm px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Reason (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setOpen(false); setReason(""); setPendingDecision(null); }}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || !reason.trim()}
                className="text-sm font-medium px-3 py-1.5 rounded bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {busy ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
