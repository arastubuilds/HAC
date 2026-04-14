import { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

interface PostFormProps {
  initialTitle?: string;
  initialContent?: string;
  submitLabel?: string;
  onSubmit: (title: string, content: string) => Promise<void>;
}

export function PostForm({
  initialTitle = "",
  initialContent = "",
  submitLabel = "Post",
  onSubmit,
}: PostFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(title.trim(), content.trim());
    } catch (err) {
      console.error("[PostForm]", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 px-4 pt-4"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <Input
          label="Title"
          placeholder="What's on your mind?"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
        <View className="h-4" />
        <Input
          label="Content"
          placeholder="Share your experience, question, or support..."
          value={content}
          onChangeText={setContent}
          multiline
          numberOfLines={8}
          maxLength={10000}
          className="min-h-[160px] pt-3"
        />
        {error && (
          <Text className="font-body text-red-500 text-sm mt-2">{error}</Text>
        )}
        <View className="mt-6">
          <Button onPress={handleSubmit} isLoading={loading}>{submitLabel}</Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
