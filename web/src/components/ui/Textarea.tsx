import { forwardRef } from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = "", ...rest }, ref) => {
    const hasError = Boolean(error);
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            {...(rest.id ? { htmlFor: rest.id } : {})}
            className="text-sm font-medium text-text-body"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={[
            "w-full rounded-md border bg-surface px-3.5 py-2.5 text-[15px] text-text-body",
            "placeholder:text-text-muted resize-y min-h-[120px]",
            "transition-[border-color,box-shadow] duration-[var(--duration-base)]",
            "focus:outline-none",
            hasError
              ? "border-error focus:border-error focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
              : "border-border focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-glow)]",
            className,
          ].join(" ")}
          {...rest}
        />
        {hasError && (
          <p role="alert" aria-live="polite" className="text-xs text-error">
            {error}
          </p>
        )}
        {!hasError && hint && (
          <p className="text-xs text-text-muted">{hint}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
