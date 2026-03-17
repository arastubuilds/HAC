"use client";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white font-semibold hover:bg-primary-hover hover:shadow-[var(--shadow-pink)] active:scale-[0.97]",
  outline:
    "border border-border bg-transparent text-text-primary hover:bg-primary-subtle active:scale-[0.97]",
  ghost:
    "bg-transparent text-text-secondary hover:text-text-primary hover:bg-primary-subtle",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-sm",
  md: "px-5 py-2.5 text-sm rounded-md",
  lg: "px-6 py-3 text-base rounded-md",
};

const Spinner = () => (
  <svg aria-hidden className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, disabled, children, className = "", ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled ?? isLoading}
        aria-busy={isLoading}
        className={[
          "inline-flex items-center justify-center gap-2 transition-[color,background-color,box-shadow,transform]",
          `duration-[var(--duration-base)]`,
          variantClasses[variant],
          sizeClasses[size],
          (disabled ?? isLoading) ? "opacity-50 cursor-not-allowed" : "",
          className,
        ].join(" ")}
        {...rest}
      >
        {isLoading ? <Spinner /> : children}
      </button>
    );
  }
);

Button.displayName = "Button";
