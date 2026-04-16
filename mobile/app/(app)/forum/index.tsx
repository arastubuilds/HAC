import { useCallback, useEffect, useMemo } from "react";
import {
  FlatList,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { PostResponse } from "@hac/shared/types";
import { usePosts } from "../../../src/hooks/usePosts";
import { PostCard } from "../../../src/components/forum/PostCard";
import { PostCardSkeleton } from "../../../src/components/forum/PostCardSkeleton";

const SKELETON_COUNT = 6;
const SKELETONS = Array.from({ length: SKELETON_COUNT }, (_, i) => i);

export default function ForumIndexScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isRefetching, isError, refetch } =
    usePosts();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => router.push("/(app)/forum/new")}
          hitSlop={8}
          style={{ marginRight: 4 }}
        >
          <Ionicons name="add" size={26} color="#E87EA1" />
        </Pressable>
      ),
    });
  }, [navigation, router]);

  const posts = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data]
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F9FAFB", padding: 16 }}>
        {SKELETONS.map((i) => (
          <PostCardSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <Ionicons name="cloud-offline-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
        <Text className="font-body text-neutral-500 text-center mb-4">
          Failed to load posts.
        </Text>
        <Pressable onPress={() => refetch()} style={{ opacity: 1 }}>
          <Text className="font-body-semibold text-primary">Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList<PostResponse>
      data={posts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <PostCard post={item} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      style={{ flex: 1, backgroundColor: "#F9FAFB" }}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#E87EA1" />
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <ActivityIndicator size="small" color="#E87EA1" style={{ marginVertical: 16 }} />
        ) : null
      }
      ListEmptyComponent={
        <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 32 }}>
          <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
          <Text className="font-body-semibold text-neutral-500 text-center mb-2">
            No posts yet
          </Text>
          <Text className="font-body text-neutral-400 text-center text-sm mb-6">
            Be the first to share your experience or ask a question.
          </Text>
          <Pressable
            onPress={() => router.push("/(app)/forum/new")}
            className="bg-primary px-5 py-2.5 rounded-full active:opacity-80"
          >
            <Text className="font-body-semibold text-white text-sm">Start a post</Text>
          </Pressable>
        </View>
      }
    />
  );
}
