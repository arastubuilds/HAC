import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface InputProps extends Omit<TextInputProps, "onChange"> {
  label?: string;
  error?: string;
  hint?: string;
  showPasswordToggle?: boolean;
}

export function Input({
  label,
  error,
  hint,
  showPasswordToggle = false,
  secureTextEntry,
  className = "",
  ...rest
}: InputProps) {
  const [visible, setVisible] = useState(false);
  const hasError = Boolean(error);
  const isSecure = showPasswordToggle ? !visible : (secureTextEntry ?? false);

  return (
    <View className="gap-1.5">
      {label && (
        <Text className="text-sm font-body-semibold text-text-body">{label}</Text>
      )}
      <View className="relative">
        <TextInput
          secureTextEntry={isSecure}
          placeholderTextColor="#9CA3AF"
          className={[
            "w-full rounded-md border bg-surface px-3.5 py-3 text-[15px] font-body text-text-body",
            showPasswordToggle ? "pr-11" : "",
            hasError ? "border-error" : "border-border",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
        {showPasswordToggle && (
          <TouchableOpacity
            onPress={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 w-11 items-center justify-center"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={18}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        )}
      </View>
      {hasError && (
        <Text className="text-xs font-body text-error">{error}</Text>
      )}
      {!hasError && hint && (
        <Text className="text-xs font-body text-text-muted">{hint}</Text>
      )}
    </View>
  );
}
