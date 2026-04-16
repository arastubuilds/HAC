import { View, Text } from "react-native";
import type { ChatMessage } from "../../hooks/useChat";
import { StatusIndicator } from "./StatusIndicator";
import { CitationList } from "./CitationList";

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <View className="items-end mb-3">
        <View className="bg-primary rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
          <Text className="font-body text-white text-sm leading-5">{message.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="items-start mb-3">
      <View className="bg-white border border-neutral-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[88%]">
        {message.error ? (
          <Text className="font-body text-red-500 text-sm">{message.error}</Text>
        ) : (
          <>
            {message.content.length > 0 && (
              <Text className="font-body text-neutral-800 text-sm leading-6">
                {message.content}
              </Text>
            )}
            {message.isStreaming && message.stage && (
              <StatusIndicator stage={message.stage} />
            )}
            {message.isStreaming && !message.stage && message.content.length === 0 && (
              <StatusIndicator stage="extractQuery" />
            )}
            {!message.isStreaming && message.citations && message.citations.length > 0 && (
              <CitationList citations={message.citations} />
            )}
          </>
        )}
      </View>
    </View>
  );
}
