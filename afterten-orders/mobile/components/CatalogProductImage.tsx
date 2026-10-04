import { useCallback, useEffect, useState } from "react";
import {
  Image,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageLoadEventData,
} from "react-native";
import { useCachedRemoteImage } from "../hooks/useCachedRemoteImage";

type Props = {
  imageUrl: string | null;
  label: string;
  onPress?: () => void;
  frameHeight?: number;
};

/** Scale up small-looking assets so bottles fill the frame similarly (still fully visible). */
const MIN_FILL_RATIO = 0.88;
const DEFAULT_FRAME_HEIGHT = 192;

function fitImageSize(
  frameW: number,
  frameH: number,
  imgW: number,
  imgH: number,
): { width: number; height: number } {
  if (frameW <= 0 || frameH <= 0 || imgW <= 0 || imgH <= 0) {
    return { width: frameW, height: frameH };
  }

  let scale = Math.min(frameW / imgW, frameH / imgH);
  let width = imgW * scale;
  let height = imgH * scale;

  const minHeight = frameH * MIN_FILL_RATIO;
  if (height < minHeight) {
    const boost = minHeight / height;
    const boostedW = width * boost;
    const boostedH = height * boost;
    if (boostedW <= frameW && boostedH <= frameH) {
      width = boostedW;
      height = boostedH;
    }
  }

  return { width, height };
}

/** Full product visible (contain), matching portal catalog — not cropped cover. */
export function CatalogProductImage({ imageUrl, label, onPress, frameHeight }: Props) {
  const frameH = frameHeight ?? DEFAULT_FRAME_HEIGHT;
  const { uri: cachedUri, loading, failed: cacheFailed } = useCachedRemoteImage(imageUrl);
  const [frameW, setFrameW] = useState(0);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setImgSize(null);
    setLoadFailed(false);
  }, [cachedUri]);

  const onFrameLayout = useCallback((e: LayoutChangeEvent) => {
    setFrameW(e.nativeEvent.layout.width);
  }, []);

  const onImageLoad = useCallback((e: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = e.nativeEvent.source;
    if (width > 0 && height > 0) {
      setImgSize({ w: width, h: height });
    }
    setLoadFailed(false);
  }, []);

  const displayUri = cachedUri && !loadFailed && !cacheFailed ? cachedUri : null;
  const fitted =
    displayUri && imgSize && frameW > 0
      ? fitImageSize(frameW, frameH, imgSize.w, imgSize.h)
      : null;

  const frame = (
    <View style={[styles.frame, { height: frameH }]} onLayout={onFrameLayout}>
      {loading && !displayUri ? (
        <Text style={styles.placeholder}>…</Text>
      ) : displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={fitted ?? styles.imageFallback}
          resizeMode="contain"
          accessibilityLabel=""
          onLoad={onImageLoad}
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <Text style={styles.placeholder}>—</Text>
      )}
    </View>
  );

  if (!onPress || !displayUri) {
    return frame;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View larger image for ${label}`}
    >
      {frame}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  imageFallback: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    color: "#a8a29e",
    fontSize: 18,
  },
});
