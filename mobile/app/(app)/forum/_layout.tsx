import { Stack } from "expo-router";

export default function ForumLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#FFFFFF" },
        headerTintColor: "#E87EA1",
        headerTitleStyle: { fontFamily: "PlusJakartaSans_600SemiBold" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Forum" }} />
      <Stack.Screen name="new" options={{ title: "New Post" }} />
      <Stack.Screen name="[postId]/index" options={{ title: "" }} />
      <Stack.Screen name="[postId]/edit" options={{ title: "Edit Post" }} />
    </Stack>
  );
}
