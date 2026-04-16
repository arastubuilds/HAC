import { useCallback, useEffect, useRef, useState } from "react";
import type { Citation } from "@hac/shared/types";
import { API_BASE_URL } from "../lib/config";
import { streamQuery } from "../lib/sse";
import { useAuthStore } from "../stores/auth.store";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  stage?: string;
  citations?: Citation[];
  riskLevel?: string;
  error?: string;
};

function makeId() {
  return Math.random().toString(36).slice(2);
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const isStreaming = messages.some((m) => m.isStreaming);
  const abortRef = useRef<(() => void) | null>(null);
  // Synchronous guard — prevents double-send before state update settles
  const sendingRef = useRef(false);

  // Update the last assistant message immutably
  const updateLast = useCallback((updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev];
      const lastIdx = next.length - 1;
      if (lastIdx >= 0 && next[lastIdx]!.role === "assistant") {
        next[lastIdx] = updater(next[lastIdx]!);
      }
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (isStreaming || sendingRef.current) return;
      sendingRef.current = true;

      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        content: text.trim(),
        isStreaming: false,
      };
      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      const token = useAuthStore.getState().token;

      const abort = streamQuery(
        API_BASE_URL,
        token,
        text.trim(),
        (event) => {
          if (event.type === "token") {
            updateLast((m) => ({ ...m, content: m.content + event.content }));
          } else if (event.type === "status") {
            updateLast((m) => ({ ...m, stage: event.stage }));
          } else if (event.type === "done") {
            sendingRef.current = false;
            updateLast((m) => ({
              ...m,
              isStreaming: false,
              stage: undefined,
              citations: event.citations,
              riskLevel: event.riskLevel,
            }));
          } else if (event.type === "error") {
            sendingRef.current = false;
            updateLast((m) => ({
              ...m,
              isStreaming: false,
              stage: undefined,
              error: event.message,
            }));
          }
        },
        (err) => {
          sendingRef.current = false;
          console.error("[useChat]", err);
          updateLast((m) => ({
            ...m,
            isStreaming: false,
            stage: undefined,
            error: "Something went wrong. Please try again.",
          }));
        }
      );

      abortRef.current = abort;
    },
    [isStreaming, updateLast]
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    sendingRef.current = false;
    setMessages([]);
  }, []);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.();
    };
  }, []);

  return { messages, sendMessage, isStreaming, clearMessages };
}
