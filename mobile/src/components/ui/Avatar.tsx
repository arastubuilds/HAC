import { View, Text } from "react-native";

interface AvatarProps {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: { container: "w-8 h-8", text: "text-xs" },
  md: { container: "w-10 h-10", text: "text-sm" },
  lg: { container: "w-14 h-14", text: "text-lg" },
};

function getInitials(username: string, firstName?: string | null, lastName?: string | null): string {
  if (firstName) {
    return `${firstName[0]}${lastName?.[0] ?? ""}`.toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

export function Avatar({ username, firstName, lastName, size = "md" }: AvatarProps) {
  const s = sizeClasses[size];
  const initials = getInitials(username, firstName, lastName);

  return (
    <View className={`${s.container} items-center justify-center rounded-full bg-primary-subtle`}>
      <Text className={`${s.text} font-body-bold text-primary`}>{initials}</Text>
    </View>
  );
}
