import { useEffect, useMemo } from "react";
import { FlatList, View, Text, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { View as SafeAreaView } from "react-native";
import { useChat, type ChatMessage } from "../../src/hooks/useChat";
import { ChatBubble } from "../../src/components/chat/ChatBubble";
import { ChatInput } from "../../src/components/chat/ChatInput";

export default function ChatScreen() {
  const { messages, sendMessage, isStreaming, clearMessages } = useChat();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        messages.length > 0 ? (
          <Pressable onPress={clearMessages} hitSlop={8} style={{ marginRight: 4 }}>
            <Ionicons name="trash-outline" size={20} color="#9CA3AF" />
          </Pressable>
        ) : null,
    });
  }, [navigation, messages.length, clearMessages]);

  // Inverted FlatList needs items in reverse order so newest renders at bottom
  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {messages.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-display text-neutral-300 text-4xl mb-4">✦</Text>
          <Text className="font-display-bold text-neutral-700 text-lg text-center mb-2">
            How can I help you?
          </Text>
          <Text className="font-body text-neutral-400 text-sm text-center leading-5">
            Ask anything about your cancer journey — treatment, side effects, community experiences, or how others have coped.
          </Text>
        </View>
      ) : (
        <FlatList<ChatMessage>
          data={reversed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          inverted
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
        />
      )}
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </SafeAreaView>
  );
}
