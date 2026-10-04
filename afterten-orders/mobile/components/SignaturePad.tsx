import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import {
  validateSignatureStrokes,
  type SignaturePoint,
  type SignatureStroke,
} from "../lib/signature-validation";

export type SignaturePadHandle = {
  capturePngUri: () => Promise<string | null>;
  isValid: () => boolean;
  validationMessage: () => string | undefined;
  clear: () => void;
};

type Props = {
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
};

function strokeToPath(stroke: SignaturePoint[]): string {
  if (stroke.length === 0) return "";
  const [first, ...rest] = stroke;
  let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (const p of rest) {
    d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d;
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { disabled = false, onValidityChange },
  ref,
) {
  const shotRef = useRef<ViewShotRef>(null);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<SignatureStroke>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const allStrokes = currentStroke.length > 0 ? [...strokes, currentStroke] : strokes;
  const validation = validateSignatureStrokes(allStrokes);

  useEffect(() => {
    onValidityChange?.(validation.ok);
  }, [validation.ok, onValidityChange]);

  useImperativeHandle(ref, () => ({
    capturePngUri: async () => {
      if (!validation.ok) return null;
      try {
        const uri = await shotRef.current?.capture?.();
        return typeof uri === "string" ? uri : null;
      } catch {
        return null;
      }
    },
    isValid: () => validation.ok,
    validationMessage: () => (validation.ok ? undefined : validation.message),
    clear: () => {
      setStrokes([]);
      setCurrentStroke([]);
    },
  }));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentStroke([{ x: locationX, y: locationY }]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentStroke((prev) => [...prev, { x: locationX, y: locationY }]);
      },
      onPanResponderRelease: () => {
        setCurrentStroke((prev) => {
          if (prev.length > 0) {
            setStrokes((s) => [...s, prev]);
          }
          return [];
        });
      },
      onPanResponderTerminate: () => {
        setCurrentStroke((prev) => {
          if (prev.length > 0) {
            setStrokes((s) => [...s, prev]);
          }
          return [];
        });
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Signature</Text>
        <Pressable
          onPress={() => {
            setStrokes([]);
            setCurrentStroke([]);
          }}
          disabled={disabled || (strokes.length === 0 && currentStroke.length === 0)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear signature"
        >
          <Text
            style={[
              styles.clearLink,
              (disabled || (strokes.length === 0 && currentStroke.length === 0)) &&
                styles.clearLinkDisabled,
            ]}
          >
            Clear
          </Text>
        </Pressable>
      </View>

      <ViewShot
        ref={shotRef}
        options={{ format: "png", quality: 1, result: "tmpfile" }}
        style={styles.shotFrame}
      >
        <View
          style={[styles.pad, disabled && styles.padDisabled]}
          onLayout={onLayout}
          {...panResponder.panHandlers}
        >
          {size.width > 0 && size.height > 0 ? (
            <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
              {strokes.map((stroke, i) => (
                <Path
                  key={`s-${i}`}
                  d={strokeToPath(stroke)}
                  stroke="#1c1917"
                  strokeWidth={2.2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {currentStroke.length > 0 ? (
                <Path
                  d={strokeToPath(currentStroke)}
                  stroke="#1c1917"
                  strokeWidth={2.2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          ) : null}
          {strokes.length === 0 && currentStroke.length === 0 ? (
            <Text style={styles.hint} pointerEvents="none">
              Sign with your finger
            </Text>
          ) : null}
        </View>
      </ViewShot>

      {!validation.ok && allStrokes.length > 0 ? (
        <Text style={styles.validationHint}>{validation.message}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: { fontSize: 14, fontWeight: "700", color: "#292524" },
  clearLink: { fontSize: 13, fontWeight: "600", color: "#c41e3a" },
  clearLinkDisabled: { color: "#a8a29e" },
  shotFrame: { borderRadius: 10, overflow: "hidden" },
  pad: {
    height: 160,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  padDisabled: { opacity: 0.6 },
  hint: { fontSize: 13, color: "#a8a29e", fontStyle: "italic" },
  validationHint: { marginTop: 6, fontSize: 12, color: "#b45309" },
});
