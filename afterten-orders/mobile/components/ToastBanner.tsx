import { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
};

function toastBottomOffset(insets: { bottom: number }): number {
  // Parent screens use paddingBottom ≈ insets.bottom + (Android ? 10 : 4).
  // Position toast above the system nav bar when inset is 0 (common on Android).
  if (Platform.OS === "android") {
    return Math.max(insets.bottom + 10, 48) + 12;
  }
  return Math.max(insets.bottom, 12) + 12;
}

export function ToastBanner({ message, onDismiss, durationMs = 3800 }: Props) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <View
      style={[styles.wrap, { bottom: toastBottomOffset(insets) }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#1e3a8a",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  },
  text: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
  },
});
