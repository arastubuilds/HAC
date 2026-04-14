import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../src/stores/auth.store";
import { Avatar } from "../../src/components/ui/Avatar";
import { Button } from "../../src/components/ui/Button";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-3.5">
      <Text className="font-body text-sm text-text-secondary">{label}</Text>
      <Text className="font-body-semibold text-sm text-text-primary">{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  const displayName =
    user.firstName
      ? [user.firstName, user.lastName].filter(Boolean).join(" ")
      : user.username;

  return (
    <SafeAreaView className="flex-1 bg-page-bg">
      <ScrollView
        contentContainerClassName="px-4 pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="items-center py-8">
          <Avatar
            username={user.username}
            firstName={user.firstName}
            lastName={user.lastName}
            size="lg"
          />
          <Text className="mt-3 font-display-bold text-xl text-text-primary">
            {displayName}
          </Text>
          <Text className="mt-1 font-body text-sm text-text-secondary">
            @{user.username}
          </Text>
        </View>

        {/* Info card */}
        <View
          className="rounded-xl bg-surface px-4"
          style={{
            elevation: 1,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 2,
          }}
        >
          <InfoRow label="Email" value={user.email} />
          <View className="border-t border-border" />
          <InfoRow label="Member since" value={formatDate(user.createdAt)} />
        </View>

        {/* Sign out */}
        <Button
          variant="outline"
          className="mt-6 w-full"
          onPress={logout}
        >
          Sign out
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
