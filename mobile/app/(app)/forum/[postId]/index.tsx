import { useState, useRef } from "react";
import {
  FlatList,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth.store";
import { useReplies } from "../../../../src/hooks/useReplies";
import type { FlatReply } from "../../../../src/lib/replyTree";
import { ReplyItem } from "../../../../src/components/forum/ReplyItem";
import { ReplyForm } from "../../../../src/components/forum/ReplyForm";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [replyingTo, setReplyingTo] = useState<string | undefined>(undefined);
  const listRef = useRef<FlatList>(null);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ["post", postId],
    queryFn: () => api.getPost(postId),
    enabled: !!postId,
  });

  const { data: replies = [], isLoading: repliesLoading } = useReplies(postId);

  async function handleSubmitReply(content: string, parentReplyId?: string) {
    await api.createReply(postId, content, parentReplyId);
    await queryClient.invalidateQueries({ queryKey: ["replies", postId] });
    setReplyingTo(undefined);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 300);
  }

  async function handleDeleteReply(replyId: string) {
    Alert.alert("Delete reply", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteReply(postId, replyId);
            await queryClient.invalidateQueries({ queryKey: ["replies", postId] });
          } catch (err) {
            console.error("[deleteReply]", err);
          }
        },
      },
    ]);
  }

  async function handleDeletePost() {
    Alert.alert("Delete post", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deletePost(postId);
            await queryClient.invalidateQueries({ queryKey: ["posts"] });
            router.back();
          } catch (err) {
            console.error("[deletePost]", err);
          }
        },
      },
    ]);
  }

  if (postLoading) {
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

  const isOwner = user?.id === post.userId;
  const displayName = post.username ?? post.userId.slice(0, 8);

  const PostHeader = (
    <View className="bg-white border-b border-neutral-200 px-4 pt-4 pb-5 mb-4">
      <Text className="font-display-bold text-neutral-900 text-xl mb-3 leading-7">
        {post.title}
      </Text>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="font-body-semibold text-neutral-600 text-sm">{displayName}</Text>
        <Text className="font-body text-neutral-400 text-xs">{formatDate(post.createdAt)}</Text>
      </View>
      <Text className="font-body text-neutral-800 text-sm leading-6">{post.content}</Text>
      {isOwner && (
        <View className="flex-row gap-4 mt-4 pt-4 border-t border-neutral-100">
          <Pressable onPress={() => router.push(`/(app)/forum/${postId}/edit`)} hitSlop={8}>
            <Text className="font-body-semibold text-primary text-sm">Edit</Text>
          </Pressable>
          <Pressable onPress={handleDeletePost} hitSlop={8}>
            <Text className="font-body-semibold text-red-400 text-sm">Delete</Text>
          </Pressable>
        </View>
      )}
      {replies.length > 0 && (
        <Text className="font-body text-neutral-400 text-xs mt-4">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </Text>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-surface">
      <FlatList<FlatReply>
        ref={listRef}
        data={replies}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ReplyItem
            reply={item}
            currentUserId={user?.id}
            onReply={(id) => setReplyingTo(id)}
            onDelete={handleDeleteReply}
          />
        )}
        ListHeaderComponent={PostHeader}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        ListFooterComponent={
          repliesLoading ? (
            <ActivityIndicator size="small" color="#E87EA1" style={{ marginVertical: 16 }} />
          ) : replies.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 24, paddingBottom: 8 }}>
              <Text className="font-body text-neutral-400 text-sm">
                No replies yet. Start the conversation.
              </Text>
            </View>
          ) : null
        }
      />
      <ReplyForm
        parentReplyId={replyingTo}
        onCancelReply={() => setReplyingTo(undefined)}
        onSubmit={handleSubmitReply}
      />
    </View>
  );
}
