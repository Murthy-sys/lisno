import { useId, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useReducedTransparency } from "../ui/ChromeSurface";
import { chrome } from "../ui/tokens";

/** Decorative frosted-glass highlight behind the selected navigation item; never intercepts touches. */
export function GlassSelection({ testID = "navigation-glass-selection", radius = 18 }: {
  readonly testID?: string;
  readonly radius?: number;
}) {
  const reduced = useReducedTransparency();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const gradientId = `glass${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent: { layout } }) => {
        setSize((current) => current?.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height });
      }}
      style={[
        StyleSheet.absoluteFill,
        styles.glass,
        // Android elevation over a translucent fill draws a visible shadow through the glass; only use it when opaque.
        reduced && Platform.OS === "android" ? styles.elevated : null,
        { borderRadius: radius, backgroundColor: reduced ? chrome.glassOpaque : chrome.glassFill }
      ]}
    >
      {!reduced ? (
        <Svg testID={`${testID}-sheen`} width={size?.width ?? "100%"} height={size?.height ?? "100%"} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {/* Opacity is set separately: rgba() stop colours can render opaque on native. */}
              <Stop offset="0" stopColor={chrome.glassSheen} stopOpacity={chrome.glassSheenTopOpacity} />
              <Stop offset="0.6" stopColor={chrome.glassSheen} stopOpacity={chrome.glassSheenBottomOpacity} />
            </LinearGradient>
          </Defs>
          <Rect width={size?.width ?? "100%"} height={size?.height ?? "100%"} fill={`url(#${gradientId})`} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: chrome.glassBorder,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  elevated: { elevation: 2 }
});
