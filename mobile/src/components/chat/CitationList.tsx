import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import type { Citation } from "@hac/shared/types";

interface CitationListProps {
  citations: Citation[];
}

export function CitationList({ citations }: CitationListProps) {
  const router = useRouter();

  if (citations.length === 0) return null;

  return (
    <View className="mt-3 pt-3 border-t border-neutral-100">
      <Text className="font-body-semibold text-neutral-400 text-xs uppercase tracking-wide mb-2">
        Sources
      </Text>
      {citations.map((c) => {
        const isCommunity = c.source === "community";
        const postId = isCommunity
          ? (c.type === "reply" ? c.parentPostId : c.documentId)
          : null;

        const content = (
          <View className="flex-row gap-2 items-start mb-2">
            <View
              className={[
                "rounded px-1.5 py-0.5 mt-0.5",
                isCommunity ? "bg-primary-subtle" : "bg-blue-50",
              ].join(" ")}
            >
              <Text
                className={[
                  "font-body-semibold text-xs",
                  isCommunity ? "text-primary" : "text-blue-600",
                ].join(" ")}
              >
                {c.index}
              </Text>
            </View>
            <View className="flex-1">
              {c.title && (
                <Text className="font-body-semibold text-neutral-700 text-xs" numberOfLines={1}>
                  {c.title}
                </Text>
              )}
              {c.snippet && (
                <Text className="font-body text-neutral-500 text-xs mt-0.5" numberOfLines={2}>
                  {c.snippet}
                </Text>
              )}
              <Text
                className={[
                  "font-body text-xs mt-0.5",
                  isCommunity ? "text-primary" : "text-blue-500",
                ].join(" ")}
              >
                {isCommunity ? "Community" : "Medical"}
                {isCommunity && postId ? " · tap to view" : ""}
              </Text>
            </View>
          </View>
        );

        if (isCommunity && postId) {
          return (
            <Pressable
              key={c.index}
              onPress={() => router.push(`/(app)/forum/${postId}`)}
              className="active:opacity-70"
            >
              {content}
            </Pressable>
          );
        }

        return <View key={c.index}>{content}</View>;
      })}
    </View>
  );
}
