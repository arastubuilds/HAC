import { useEffect, useRef } from "react";
import { Animated, View, type ViewProps } from "react-native";

interface SkeletonProps extends ViewProps {
  width?: number | `${number}%`;
  height?: number;
  rounded?: "sm" | "md" | "full";
}

const radiusMap = { sm: 4, md: 8, full: 9999 };

export function Skeleton({ width, height = 16, rounded = "md", style, ...rest }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radiusMap[rounded],
          backgroundColor: "#E5E7EB",
          opacity,
        },
        style,
      ]}
      {...rest}
    />
  );
}
