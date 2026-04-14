import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { Button } from "../ui/Button";

interface ReplyFormProps {
  parentReplyId?: string;
  onCancelReply?: () => void;
  onSubmit: (content: string, parentReplyId?: string) => Promise<void>;
}

export function ReplyForm({ parentReplyId, onCancelReply, onSubmit }: ReplyFormProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await onSubmit(trimmed, parentReplyId);
      setContent("");
    } catch (err) {
      console.error("[ReplyForm]", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <View className="border-t border-neutral-200 bg-white px-4 pt-3 pb-4">
        {parentReplyId && (
          <View className="flex-row items-center justify-between mb-2">
            <Text className="font-body text-primary text-xs">Replying to thread</Text>
            <Pressable onPress={onCancelReply} hitSlop={8}>
              <Text className="font-body-semibold text-neutral-500 text-xs">Cancel</Text>
            </Pressable>
          </View>
        )}
        <View className="flex-row items-end gap-2">
          <TextInput
            className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 font-body text-neutral-900 text-sm min-h-[40px] max-h-[120px]"
            placeholder="Add a reply..."
            placeholderTextColor="#9CA3AF"
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={10000}
          />
          <Button
            onPress={handleSubmit}
            isLoading={loading}
            disabled={!content.trim()}
            size="sm"
          >
            Send
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
