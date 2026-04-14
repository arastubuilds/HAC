import { View, Text } from "react-native";
import { Link } from "expo-router";

export default function NotFoundScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-page-bg px-6">
      <Text className="font-display-bold text-xl text-text-primary">
        Page not found
      </Text>
      <Link href="/" className="mt-4">
        <Text className="font-body text-sm text-primary">Go home</Text>
      </Link>
    </View>
  );
}
