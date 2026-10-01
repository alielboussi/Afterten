import { Image, Platform, ScrollView, StyleSheet, useWindowDimensions } from "react-native";

type Props = {
  uri: string;
};

export function ZoomableImage({ uri }: Props) {
  const { width, height } = useWindowDimensions();
  const frameW = width - 48;
  const frameH = height * 0.72;

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
      <Image source={{ uri }} style={{ width: frameW, height: frameH }} resizeMode="contain" />
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
