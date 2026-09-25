import { useEffect, useId, useState, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { chrome } from "./tokens";

export function useReducedTransparency(): boolean {
  // Start opaque so a saved accessibility preference never flashes transparency.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (value) => {
      changed = true;
      if (mounted) setReduced(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (mounted && !changed) setReduced(value);
    }).catch(() => {
      // Retain the opaque fallback when the platform cannot read the preference.
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}

/** Static edge lighting under a translucent tint; never intercepts navigation. */
export function ChromeSurface({ edge, children, style, testID }: {
  readonly edge: "top" | "bottom" | "rail";
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  const reduced = useReducedTransparency();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const gradientId = `chrome${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View testID={testID} style={[styles.surface, style]} onLayout={({ nativeEvent: { layout } }) => {
      setSize((current) => current?.width === layout.width && current.height === layout.height
        ? current : { width: layout.width, height: layout.height });
    }}>
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {!reduced ? (
          <Svg {...(testID ? { testID: `${testID}-lighting` } : {})} width={size?.width ?? "100%"} height={size?.height ?? "100%"} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={gradientId} x1="0%" y1={edge === "bottom" ? "100%" : "0%"} x2="100%" y2={edge === "bottom" ? "0%" : "100%"}>
                <Stop offset="0" stopColor={chrome.sheenStart} />
                <Stop offset="0.48" stopColor={chrome.sheenCenter} />
                <Stop offset="1" stopColor={chrome.sheenEnd} />
              </LinearGradient>
            </Defs>
            <Rect width={size?.width ?? "100%"} height={size?.height ?? "100%"} fill={`url(#${gradientId})`} />
          </Svg>
        ) : null}
        <View testID={testID ? `${testID}-tint` : undefined} style={[StyleSheet.absoluteFill, { backgroundColor: reduced ? chrome.opaque : chrome.surface }]} />
      </View>
      {children}
      <View pointerEvents="none" accessible={false} style={[styles.edge, edge === "top" ? styles.bottomEdge : edge === "bottom" ? styles.topEdge : styles.rightEdge]} />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { position: "relative", backgroundColor: chrome.base },
  edge: { position: "absolute", backgroundColor: chrome.line },
  bottomEdge: { bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: chrome.highlight },
  topEdge: { top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: chrome.highlight },
  rightEdge: { top: 0, bottom: 0, right: 0, width: StyleSheet.hairlineWidth }
});
