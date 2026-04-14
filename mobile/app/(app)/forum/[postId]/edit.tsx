import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { View, ActivityIndicator, Text } from "react-native";
import { api } from "../../../../src/lib/api";
import { PostForm } from "../../../../src/components/forum/PostForm";

export default function EditPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: post, isLoading } = useQuery({
    queryKey: ["post", postId],
    queryFn: () => api.getPost(postId),
    enabled: !!postId,
  });

  async function handleSubmit(title: string, content: string) {
    await api.updatePost(postId, title, content);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["post", postId] }),
      queryClient.invalidateQueries({ queryKey: ["posts"] }),
    ]);
    router.back();
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#E87EA1" />
      </View>
    );
  }

  if (!post) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <Text className="font-body text-neutral-500">Post not found.</Text>
      </View>
    );
  }

  return (
    <PostForm
      initialTitle={post.title}
      initialContent={post.content}
      submitLabel="Save changes"
      onSubmit={handleSubmit}
    />
  );
}
