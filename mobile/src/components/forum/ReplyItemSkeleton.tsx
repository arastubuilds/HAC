import { View } from "react-native";
import { Skeleton } from "../ui/Skeleton";

interface ReplyItemSkeletonProps {
  depth?: number;
}

export function ReplyItemSkeleton({ depth = 0 }: ReplyItemSkeletonProps) {
  const indent = Math.min(depth, 2) * 16;

  return (
    <View style={{ paddingLeft: indent, marginBottom: 12 }}>
      <View className="bg-white border border-neutral-200 rounded-xl p-3">
        {/* Author row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Skeleton width={32} height={32} rounded="full" />
          <Skeleton width={80} height={12} rounded="sm" />
          <View style={{ flex: 1 }} />
          <Skeleton width={48} height={12} rounded="sm" />
        </View>
        {/* Content lines */}
        <Skeleton width="100%" height={13} rounded="sm" style={{ marginBottom: 6 }} />
        <Skeleton width="70%" height={13} rounded="sm" />
      </View>
    </View>
  );
}
