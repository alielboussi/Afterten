import { useMemo } from "react";
import { Dimensions, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Budget phones (e.g. Galaxy A7/A16) — slightly tighter layout, same features. */
const COMPACT_WINDOW_HEIGHT = 740;

const ANDROID_NAV_EXTRA = 10;

export type AppScreenLayout = {
  paddingTop: number;
  paddingBottom: number;
  paddingHorizontal: number;
  gridGap: number;
  gridPadding: number;
  listBottomPad: number;
  catalogImageHeight: number;
  compact: boolean;
  gridItemWidth: number;
};

export function useAppScreenLayout(): AppScreenLayout {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get("window");

  return useMemo(() => {
    const compact = height < COMPACT_WINDOW_HEIGHT;
    const paddingHorizontal = compact ? 12 : 14;
    const gridGap = compact ? 8 : 10;
    const gridPadding = paddingHorizontal;
    const bottomInset =
      insets.bottom + (Platform.OS === "android" ? ANDROID_NAV_EXTRA : 4);
    const paddingTop = Math.max(insets.top, Platform.OS === "android" ? 6 : 8) + (compact ? 2 : 6);
    const paddingBottom = bottomInset;
    const gridItemWidth = (width - gridPadding * 2 - gridGap) / 2;

    return {
      paddingTop,
      paddingBottom,
      paddingHorizontal,
      gridGap,
      gridPadding,
      listBottomPad: bottomInset + 16,
      catalogImageHeight: compact ? 172 : 192,
      compact,
      gridItemWidth,
    };
  }, [height, insets.bottom, insets.top, width]);
}
