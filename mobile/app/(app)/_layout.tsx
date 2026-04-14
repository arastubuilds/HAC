import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

function tabIcon(focusedName: string, unfocusedName: string) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons
      name={(focused ? focusedName : unfocusedName) as IoniconsName}
      size={24}
      color={color}
    />
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#E87EA1",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E5E7EB",
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: "PlusJakartaSans_400Regular",
          fontSize: 12,
        },
      }}
    >
      <Tabs.Screen
        name="forum"
        options={{
          title: "Forum",
          tabBarIcon: tabIcon("chatbubbles", "chatbubbles-outline"),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: tabIcon("flash", "flash-outline"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: tabIcon("person", "person-outline"),
        }}
      />
    </Tabs>
  );
}
