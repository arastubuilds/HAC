import { View } from "react-native";
import { Skeleton } from "../ui/Skeleton";

export function PostCardSkeleton() {
  return (
    <View className="bg-white border border-neutral-200 rounded-2xl p-4 mb-3">
      {/* Title */}
      <Skeleton width="80%" height={18} rounded="sm" style={{ marginBottom: 8 }} />
      {/* Content lines */}
      <Skeleton width="100%" height={13} rounded="sm" style={{ marginBottom: 6 }} />
      <Skeleton width="60%" height={13} rounded="sm" style={{ marginBottom: 16 }} />
      {/* Footer row */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Skeleton width={32} height={32} rounded="full" />
          <Skeleton width={72} height={12} rounded="sm" />
        </View>
        <Skeleton width={48} height={12} rounded="sm" />
      </View>
    </View>
  );
}
