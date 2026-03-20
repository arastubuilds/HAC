interface RiskBadgeProps {
  riskLevel: "low" | "medium" | "high";
}

const RISK_CONFIG = {
  low: {
    dot: "bg-success",
    pill: "bg-success/10 text-success border border-success/20",
    label: "Low risk",
  },
  medium: {
    dot: "bg-warning",
    pill: "bg-warning/10 text-warning border border-warning/20",
    label: "Consult a doctor",
  },
  high: {
    dot: "bg-error",
    pill: "bg-error/10 text-error border border-error/20",
    label: "Please seek medical advice",
  },
};

export function RiskBadge({ riskLevel }: RiskBadgeProps) {
  const config = RISK_CONFIG[riskLevel];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        config.pill,
      ].join(" ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
