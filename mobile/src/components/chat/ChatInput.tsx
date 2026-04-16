import { useState } from "react";
import { View, TextInput, Pressable, Platform, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [text, setText] = useState("");

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View className="border-t border-neutral-200 bg-white px-4 pt-3 pb-4">
        <View className="flex-row items-end gap-2">
          <TextInput
            className="flex-1 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-2.5 font-body text-neutral-900 text-sm min-h-[42px] max-h-[120px]"
            placeholder="Ask anything about your cancer journey..."
            placeholderTextColor="#9CA3AF"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            editable={!disabled}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={handleSend}
          />
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || disabled}
            style={({ pressed }) => ({
              opacity: !text.trim() || disabled ? 0.4 : pressed ? 0.7 : 1,
            })}
            className="w-10 h-10 rounded-full bg-primary items-center justify-center mb-0.5"
            hitSlop={4}
          >
            <Ionicons name="arrow-up" size={18} color="white" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
