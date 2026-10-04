import { Image, Platform, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { useCachedRemoteImage } from "../hooks/useCachedRemoteImage";

type Props = {
  uri: string;
};

export function ZoomableImage({ uri }: Props) {
  const { width, height } = useWindowDimensions();
  const frameW = width - 48;
  const frameH = height * 0.72;
  const { uri: displayUri } = useCachedRemoteImage(uri);

  return (
    <ScrollView
      style={{ width: frameW, height: frameH }}
      contentContainerStyle={styles.content}
      maximumZoomScale={Platform.OS === "ios" ? 4 : 1}
      minimumZoomScale={1}
      centerContent
      bouncesZoom={Platform.OS === "ios"}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {displayUri ? (
        <Image source={{ uri: displayUri }} style={{ width: frameW, height: frameH }} resizeMode="contain" />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
