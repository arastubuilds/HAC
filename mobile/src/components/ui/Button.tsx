import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import type { ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends PressableProps {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, { container: string; text: string; spinner: string }> = {
  primary: {
    container: "bg-primary",
    text: "text-white font-body-semibold",
    spinner: "white",
  },
  outline: {
    container: "border border-border bg-transparent",
    text: "text-text-primary font-body-semibold",
    spinner: "#374151",
  },
  ghost: {
    container: "bg-transparent",
    text: "text-text-secondary font-body-semibold",
    spinner: "#6B7280",
  },
};

const sizeClasses: Record<Size, { container: string; text: string }> = {
  sm: { container: "px-3 py-1.5 rounded-md", text: "text-sm" },
  md: { container: "px-5 py-3 rounded-md", text: "text-sm" },
  lg: { container: "px-6 py-3.5 rounded-lg", text: "text-base" },
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled ?? isLoading;
  const v = variantClasses[variant];
  const s = sizeClasses[size];

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => ({ opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1 })}
      className={`flex-row items-center justify-center gap-2 ${v.container} ${s.container} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={v.spinner} />
      ) : (
        <Text className={`${v.text} ${s.text}`}>{children}</Text>
      )}
    </Pressable>
  );
}
