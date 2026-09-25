import { StyleSheet, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

import { colors, spacing } from "../../ui/tokens";

/** A single almond-shaped leaf pointing up from its base at (0, 0). */
const LEAF = "M0 0C-9 -12 -9 -30 0 -44C9 -30 9 -12 0 0Z";
const VEIN = "M0 -2V-40";

const LEAVES: readonly { readonly x: number; readonly y: number; readonly rotate: number; readonly scale: number; readonly fill: string }[] = [
  { x: 118, y: 40, rotate: -58, scale: 0.9, fill: colors.accent },
  { x: 104, y: 58, rotate: 38, scale: 0.8, fill: colors.primarySoft },
  { x: 92, y: 78, rotate: -70, scale: 1, fill: colors.accent },
  { x: 76, y: 94, rotate: 30, scale: 0.85, fill: colors.accent },
  { x: 62, y: 116, rotate: -64, scale: 0.75, fill: colors.primarySoft },
  { x: 146, y: 70, rotate: -24, scale: 1.1, fill: colors.primarySoft },
  { x: 150, y: 104, rotate: 22, scale: 0.9, fill: colors.accent }
];

/** Decorative sage leaves for the Notifications header; drawn from theme tokens and invisible to assistive tech. */
export function BotanicalAccent() {
  return (
    <View
      testID="botanical-accent"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
    >
      <Svg width={170} height={150} viewBox="0 0 170 150">
        <Path d="M170 8C140 30 110 60 56 124" fill="none" stroke={colors.accent} strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" />
        <Path d="M170 50C160 70 154 90 150 112" fill="none" stroke={colors.accent} strokeOpacity={0.4} strokeWidth={1.2} strokeLinecap="round" />
        {LEAVES.map((leaf, index) => (
          <G key={index} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rotate}) scale(${leaf.scale})`}>
            <Path d={LEAF} fill={leaf.fill} fillOpacity={0.5} />
            <Path d={VEIN} fill="none" stroke={colors.accent} strokeOpacity={0.5} strokeWidth={1} strokeLinecap="round" />
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: "absolute", top: -spacing.lg, right: -spacing.lg, opacity: 0.8 }
});
