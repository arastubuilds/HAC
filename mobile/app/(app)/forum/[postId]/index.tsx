import { useState, useRef, useMemo } from "react";
import {
  FlatList,
  View,
  Text,
  Pressable,
  Alert,
} from "react-native";
import { Skeleton } from "../../../../src/components/ui/Skeleton";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth.store";
import { useReplies } from "../../../../src/hooks/useReplies";
import type { FlatReply } from "../../../../src/lib/replyTree";
import { ReplyItem } from "../../../../src/components/forum/ReplyItem";
import { ReplyItemSkeleton } from "../../../../src/components/forum/ReplyItemSkeleton";
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

  // Derived values — safe to compute before early returns (post may be undefined)
  const isOwner = user?.id === post?.userId;
  const displayName = post ? (post.username.slice(0, 15) ?? post.userId.slice(0, 8)) : "";

  // useMemo must be called unconditionally — before any early returns
  const PostHeader = useMemo(() => {
    if (!post) return null;
    return (
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
  }, [post, displayName, isOwner, replies.length, postId, router, handleDeletePost]);

  if (postLoading) {
    return (
      <View className="flex-1 bg-surface">
        <View className="bg-white border-b border-neutral-200 px-4 pt-4 pb-5">
          <Skeleton width="75%" height={22} rounded="sm" style={{ marginBottom: 12 }} />
          <Skeleton width="45%" height={22} rounded="sm" style={{ marginBottom: 12 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
            <Skeleton width={100} height={12} rounded="sm" />
            <Skeleton width={72} height={12} rounded="sm" />
          </View>
          <Skeleton width="100%" height={13} rounded="sm" style={{ marginBottom: 6 }} />
          <Skeleton width="100%" height={13} rounded="sm" style={{ marginBottom: 6 }} />
          <Skeleton width="100%" height={13} rounded="sm" style={{ marginBottom: 6 }} />
          <Skeleton width="55%" height={13} rounded="sm" />
        </View>
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
            <View style={{ paddingTop: 4 }}>
              <ReplyItemSkeleton depth={0} />
              <ReplyItemSkeleton depth={1} />
              <ReplyItemSkeleton depth={1} />
              <ReplyItemSkeleton depth={0} />
            </View>
          ) : replies.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 32, paddingBottom: 8 }}>
              <Ionicons name="chatbubble-outline" size={32} color="#D1D5DB" style={{ marginBottom: 8 }} />
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
