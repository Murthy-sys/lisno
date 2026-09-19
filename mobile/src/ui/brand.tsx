import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Svg, { Circle } from "react-native-svg";

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
  const ringTrack = tone === "light" ? "rgba(255,255,255,0.16)" : "rgba(30,24,59,0.12)";

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
                stroke={colors.gold}
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

export function StartupBrand({
  message = "Preparing your workspace",
  reducedMotion
}: {
  readonly message?: string;
  readonly reducedMotion?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion(reducedMotion);
  const reveal = useRef(new Animated.Value(prefersReducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (prefersReducedMotion) {
      reveal.setValue(1);
      return;
    }
    const animation = Animated.timing(reveal, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });
    animation.start();
    return () => animation.stop();
  }, [prefersReducedMotion, reveal]);

  return (
    <View style={styles.startup}>
      <Animated.View
        style={{
          opacity: reveal,
          transform: [
            {
              translateY: reveal.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0]
              })
            }
          ]
        }}
      >
        <LisnoWordmark tone="light" width={184} />
      </Animated.View>
      <BrandLoader label={message} reducedMotion={prefersReducedMotion} tone="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  startup: {
    alignItems: "center",
    gap: spacing.huge
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
    color: "rgba(255,255,255,0.78)"
  },
  darkText: {
    color: colors.inkMuted
  }
});
