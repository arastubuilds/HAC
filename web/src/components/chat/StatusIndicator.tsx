const STAGE_LABELS: Record<string, string> = {
  extractQuery: "Reading your question…",
  rewriteQuery: "Clarifying search…",
  decideIntent: "Understanding intent…",
  retrieveContext: "Retrieving context…",
  expandThreads: "Loading threads…",
  generateAnswer: "Generating answer…",
};

interface StatusIndicatorProps {
  stage?: string;
}

export function StatusIndicator({ stage }: StatusIndicatorProps) {
  const label = stage ? (STAGE_LABELS[stage] ?? stage) : "Thinking…";
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <span>{label}</span>
      <span className="flex gap-0.5">
        <span className="animate-[pulse_1.2s_ease-in-out_0s_infinite] opacity-50">●</span>
        <span className="animate-[pulse_1.2s_ease-in-out_0.4s_infinite] opacity-50">●</span>
        <span className="animate-[pulse_1.2s_ease-in-out_0.8s_infinite] opacity-50">●</span>
      </span>
    </div>
  );
}
