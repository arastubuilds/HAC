import { useEffect, useRef } from "react";
import { Animated, View, Text } from "react-native";

const STAGE_LABELS: Record<string, string> = {
  extractQuery: "Understanding your question",
  rewriteQuery: "Refining search",
  decideIntent: "Analysing intent",
  retrieveContext: "Searching knowledge base",
  expandThreads: "Reading community threads",
  generateAnswer: "Composing response",
};

interface StatusIndicatorProps {
  stage: string;
}

export function StatusIndicator({ stage }: StatusIndicatorProps) {
  const label = STAGE_LABELS[stage] ?? stage;

  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      );

    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 200);
    const a3 = pulse(dot3, 400);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View className="flex-row items-center gap-2 py-1">
      <Text className="font-body text-neutral-500 text-xs">{label}</Text>
      <View className="flex-row gap-1">
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={{ opacity: dot }}
            className="w-1 h-1 rounded-full bg-primary"
          />
        ))}
      </View>
    </View>
  );
}
