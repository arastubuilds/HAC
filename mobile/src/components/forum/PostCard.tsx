import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { PostResponse } from "@hac/shared/types";
import { Avatar } from "../ui/Avatar";

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface PostCardProps {
  post: PostResponse;
}

export function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const displayName = post.username ?? post.userId.slice(0, 8);

  return (
    <Pressable
      className="bg-white border border-neutral-200 rounded-2xl p-4 mb-3 active:opacity-80"
      onPress={() => router.push(`/(app)/forum/${post.id}`)}
    >
      <Text
        className="font-display-bold text-neutral-900 text-base mb-2"
        numberOfLines={2}
      >
        {post.title}
      </Text>
      <Text className="font-body text-neutral-600 text-sm mb-3" numberOfLines={3}>
        {post.content}
      </Text>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Avatar name={displayName} size="sm" />
          <Text className="font-body-semibold text-neutral-700 text-xs">{displayName}</Text>
        </View>
        <Text className="font-body text-neutral-400 text-xs">
          {formatRelativeDate(post.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}
