import { useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useReducedMotion as useStartupReducedMotion } from "../features/onboarding/useReducedMotion";
import { StartupMotif, type StartupMotifKind } from "./StartupArtwork";
import { colors, fonts, spacing } from "./tokens";

const wordmarkLight = require("../../assets/brand/wordmark-light.png");
const wordmarkDark = require("../../assets/brand/wordmark-dark.png");
const brandIcon = require("../../assets/brand/splash-icon.png");

function useReducedMotion(override?: boolean): boolean {
  const [systemValue, setSystemValue] = useState(false);

  useEffect(() => {
    if (override !== undefined) return;

    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setSystemValue(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setSystemValue
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [override]);

  return override ?? systemValue;
}

export function LisnoWordmark({
  tone = "dark",
  width = 176,
  style
}: {
  readonly tone?: "dark" | "light";
  readonly width?: number;
  readonly style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      accessible={false}
      resizeMode="contain"
      source={tone === "light" ? wordmarkLight : wordmarkDark}
      style={[{ width, height: Math.round((width * 30) / 110) }, style]}
    />
  );
}

export function LisnoIcon({ size = 56 }: { readonly size?: number }) {
  return (
    <Image
      accessible={false}
      resizeMode="contain"
      source={brandIcon}
      style={{ width: size, height: size }}
    />
  );
}

export function BrandLoader({
  label = "Loading",
  reducedMotion,
  tone = "light",
  style
}: {
  readonly label?: string;
  readonly reducedMotion?: boolean;
  readonly tone?: "dark" | "light";
  readonly style?: StyleProp<ViewStyle>;
}) {
  const prefersReducedMotion = useReducedMotion(reducedMotion);
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (prefersReducedMotion) {
      rotation.stopAnimation();
      pulse.stopAnimation();
      rotation.setValue(0);
      pulse.setValue(1);
      return;
    }

    const spinAnimation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.045,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    );

    spinAnimation.start();
    pulseAnimation.start();
    return () => {
      spinAnimation.stop();
      pulseAnimation.stop();
    };
  }, [prefersReducedMotion, pulse, rotation]);

  const spin = useMemo(
    () =>
      rotation.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"]
      }),
    [rotation]
  );
  const iconBackground = tone === "light" ? colors.surface : colors.midnight;
  const ringTrack = tone === "light" ? "rgba(238,240,230,0.16)" : colors.border;

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={[styles.loader, style]}
    >
      <View style={[styles.iconWell, { backgroundColor: iconBackground }]}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <LisnoIcon size={44} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { transform: [{ rotate: spin }] }]}
        >
          <Svg width={72} height={72} viewBox="0 0 72 72">
            <Circle cx="36" cy="36" r="33" fill="none" stroke={ringTrack} strokeWidth="1" />
            {!prefersReducedMotion ? (
              <Circle
                cx="36"
                cy="36"
                r="33"
                fill="none"
                stroke={tone === "light" ? colors.accent : colors.primary}
                strokeDasharray="42 166"
                strokeLinecap="round"
                strokeWidth="2"
              />
            ) : null}
          </Svg>
        </Animated.View>
      </View>
      <Text style={[styles.loaderLabel, tone === "light" ? styles.lightText : styles.darkText]}>
        {label}
      </Text>
    </View>
  );
}

const startupMotifs: ReadonlyArray<{ kind: StartupMotifKind; x: number; y: number }> = [
  { kind: "interior", x: 0.22, y: 0.22 },
  { kind: "plan", x: 0.78, y: 0.22 },
  { kind: "structure", x: 0.22, y: 0.78 },
  { kind: "tools", x: 0.78, y: 0.78 }
];

export function StartupBrand({
  message = "Preparing your workspace",
  reducedMotion
}: {
  readonly message?: string;
  readonly reducedMotion?: boolean;
}) {
  const motionPreference = useStartupReducedMotion(reducedMotion);
  const window = useWindowDimensions();
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const [messageHeight, setMessageHeight] = useState(0);
  const entrances = useRef(startupMotifs.map(() => new Animated.Value(1))).current;
  const hasAnimated = useRef(false);
  const artworkSize = Math.max(0, Math.min(
    360,
    (layout?.width ?? window.width) - spacing.xl * 2,
    (layout?.height ?? window.height) - spacing.xl * 2 - spacing.lg -
      (messageHeight || 22 * window.fontScale)
  ));
  const motifSize = artworkSize * 0.36;

  useEffect(() => {
    // Unknown preferences stay still; a later preference change never replays the entrance.
    if (motionPreference !== false || hasAnimated.current) {
      entrances.forEach((value) => value.setValue(1));
      return;
    }
    hasAnimated.current = true;
    entrances.forEach((value) => value.setValue(0));
    const animation = Animated.parallel(entrances.map((value, index) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 770,
        delay: index * 110,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false
      })
    ));
    animation.start();
    return () => animation.stop();
  }, [entrances, motionPreference]);

  return (
    <View
      style={styles.startup}
      testID="startup-brand"
      onLayout={({ nativeEvent: { layout: next } }) => {
        setLayout((current) => current?.width === next.width && current.height === next.height
          ? current
          : { width: next.width, height: next.height });
      }}
    >
      <StatusBar style="light" />
      <View
        testID="startup-artwork"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.startupArtwork, { width: artworkSize, height: artworkSize }]}
      >
        {startupMotifs.map(({ kind, x, y }, index) => {
          const entrance = entrances[index]!;
          return (
            <Animated.View
              key={kind}
              testID={`startup-motif-${kind}`}
              style={{
                position: "absolute",
                left: artworkSize * x - motifSize / 2,
                top: artworkSize * y - motifSize / 2,
                opacity: entrance,
                transform: [
                  { translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [(0.5 - x) * artworkSize * 0.6, 0] }) },
                  { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [(0.5 - y) * artworkSize * 0.6, 0] }) },
                  { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }
                ]
              }}
            >
              <StartupMotif kind={kind} size={motifSize} />
            </Animated.View>
          );
        })}
        <View style={styles.startupWordmark}>
          <LisnoWordmark tone="light" width={artworkSize * 0.55} />
        </View>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={message}
        accessibilityLiveRegion="polite"
        style={styles.startupMessage}
        onLayout={({ nativeEvent }) => setMessageHeight(nativeEvent.layout.height)}
      >
        <Text style={[styles.loaderLabel, styles.lightText, styles.startupMessageText]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.shell,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg
  },
  startupArtwork: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  startupWordmark: {
    backgroundColor: colors.shell,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs
  },
  startupMessage: {
    width: "100%"
  },
  startupMessageText: {
    textAlign: "center",
    lineHeight: 22
  },
  loader: {
    alignItems: "center",
    gap: spacing.md
  },
  iconWell: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  ring: {
    position: "absolute",
    inset: 0
  },
  loaderLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 0.2
  },
  lightText: {
    color: colors.shellMuted
  },
  darkText: {
    color: colors.inkMuted
  }
});
