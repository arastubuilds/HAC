const PALETTE = [
  "bg-[#E87EA1] text-white",
  "bg-[#9B5DE5] text-white",
  "bg-[#F15BB5] text-white",
  "bg-[#FEE440] text-[#2D1B2E]",
  "bg-[#00BBF9] text-white",
];

const SIZE_CLASSES = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
};

interface AvatarProps {
  userId: string;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ userId, size = "md" }: AvatarProps) {
  const idx = userId.charCodeAt(0) % 5;
  const colorClass = PALETTE[idx] ?? "bg-primary text-white";
  const initial = userId[0]?.toUpperCase() ?? "?";
  return (
    <div
      className={[
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0",
        SIZE_CLASSES[size],
        colorClass,
      ].join(" ")}
      aria-label={`Avatar for ${userId}`}
    >
      {initial}
    </div>
  );
}
