"use client";

import { useEffect, useRef, useState } from "react";
import type { QueryStreamEvent } from "@hac/shared/types";
import { ChatMessageItem, type ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";

async function* parseSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const json = line.slice(6).trim();
        if (json) yield JSON.parse(json) as QueryStreamEvent;
      }
    }
  }
}

function makeId() {
  return Math.random().toString(36).slice(2);
}

async function readErrorMessage(res: Response): Promise<string> {
  const fallback = `Request failed (${String(res.status)})`;
  const text = await res.text().catch(() => "");
  if (!text) return fallback;

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      const error =
        "error" in parsed && typeof parsed.error === "string"
          ? parsed.error
          : undefined;
      const message =
        "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : undefined;
      return error ?? message ?? fallback;
    }
    return fallback;
  } catch {
    return text;
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(input: string) {
    const userMsg: ChatMessage = { id: makeId(), role: "user", content: input };
    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      if (!res.ok) {
        const errText = await readErrorMessage(res);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: errText }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      if (!res.body) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: "No response body" }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      let endedCleanly = false;

      for await (const event of parseSSE(res.body)) {
        if (event.type === "status") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, stage: event.stage } : m
            )
          );
        } else if (event.type === "token") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + event.content }
                : m
            )
          );
        } else if (event.type === "done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    isStreaming: false,
                    stage: undefined,
                    citations: event.citations,
                  }
                : m
            )
          );
          endedCleanly = true;
          setIsStreaming(false);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false, error: event.message }
                : m
            )
          );
          endedCleanly = true;
          setIsStreaming(false);
        }
      }

      if (!endedCleanly) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: "The response stream ended unexpectedly." }
              : m
          )
        );
        setIsStreaming(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, isStreaming: false, error: message } : m
        )
      );
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mt-8 -mx-6">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border shrink-0">
        <h1 className="font-display text-xl font-bold text-text-primary">HAC AI Support</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Ask questions about your cancer journey — I&apos;ll draw from the community and medical sources.
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="text-4xl">💬</div>
            <p className="font-display text-lg font-semibold text-text-primary">
              What&apos;s on your mind?
            </p>
            <p className="text-sm text-text-muted max-w-sm">
              Ask anything about your health journey. I&apos;ll search community experiences and medical
              sources to give you a thoughtful answer.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="max-w-3xl mx-auto w-full">
        <ChatInput onSend={sendMessage} disabled={isStreaming} />
      </div>
    </div>
  );
}
