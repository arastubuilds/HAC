import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  showPasswordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, showPasswordToggle, className = "", type, ...rest }, ref) => {
    const [visible, setVisible] = useState(false);
    const hasError = Boolean(error);
    const inputType = showPasswordToggle && type === "password"
      ? (visible ? "text" : "password")
      : type;

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
        <div className="relative">
          <input
            ref={ref}
            type={inputType}
            className={[
              "w-full rounded-md border bg-surface px-3.5 py-2.5 text-[15px] text-text-body",
              "placeholder:text-text-muted",
              "transition-[border-color,box-shadow] duration-[var(--duration-base)]",
              "focus:outline-none",
              showPasswordToggle ? "pr-10" : "",
              hasError
                ? "border-error focus:border-error focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
                : "border-border focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-glow)]",
              className,
            ].join(" ")}
            {...rest}
          />
          {showPasswordToggle && type === "password" && (
            <button
              type="button"
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={() => setVisible((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-secondary transition-colors duration-[var(--duration-base)]"
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
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

Input.displayName = "Input";
