import type { Citation } from "@hac/shared/types";
import { StatusIndicator } from "./StatusIndicator";
import { CitationList } from "./CitationList";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  stage?: string;
  citations?: Citation[];
  error?: string;
};

interface ChatMessageProps {
  message: ChatMessage;
}

function renderWithCitationMarkers(text: string) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    if (/^\[\d+\]$/.test(part)) {
      return (
        <sup key={i} className="text-primary font-semibold text-[10px]">
          {part}
        </sup>
      );
    }
    return part;
  });
}

export function ChatMessageItem({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] bg-primary text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div
        className={[
          "max-w-[90%] sm:max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-sm text-[15px] leading-relaxed",
          message.error
            ? "bg-error/10 border border-error/20 text-error"
            : "bg-surface border border-border text-text-body",
        ].join(" ")}
      >
        {message.error ? (
          <p>{message.error}</p>
        ) : message.isStreaming && !message.content ? (
          <StatusIndicator stage={message.stage} />
        ) : (
          <>
            <p className="whitespace-pre-wrap">
              {renderWithCitationMarkers(message.content)}
              {message.isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-text-body ml-0.5 animate-[pulse_1s_step-end_infinite]" />
              )}
            </p>
            {!message.isStreaming && message.citations && message.citations.length > 0 && (
              <CitationList citations={message.citations} />
            )}
          </>
        )}
        {message.isStreaming && message.content && message.stage && (
          <div className="mt-2">
            <StatusIndicator stage={message.stage} />
          </div>
        )}
      </div>
    </div>
  );
}
