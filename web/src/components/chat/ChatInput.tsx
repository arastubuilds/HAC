"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const target = e.currentTarget;
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  }

  return (
    <div className="flex items-end gap-3 p-4 border-t border-border bg-page-bg">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={disabled}
        rows={1}
        placeholder="Ask about your health journey…"
        className={[
          "flex-1 rounded-xl border bg-surface px-4 py-3 text-[15px] text-text-body",
          "placeholder:text-text-muted resize-none overflow-hidden min-h-[48px] max-h-[200px]",
          "transition-[border-color,box-shadow] duration-[var(--duration-base)]",
          "focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-glow)]",
          "border-border disabled:opacity-50 disabled:cursor-not-allowed",
        ].join(" ")}
      />
      <Button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        size="md"
        className="shrink-0 rounded-xl"
      >
        Send
      </Button>
    </div>
  );
}
