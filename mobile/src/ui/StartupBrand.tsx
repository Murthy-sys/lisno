import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { StartupMotif } from "./StartupArtwork";
import { StartupLetter, StartupSymbol, startupLetterMetrics, type StartupLetterName } from "./StartupLogo";
import { StartupMotionContext } from "./StartupMotion";
import { startupDuration, startupKeyframes, startupLayout, startupMotifPosition, startupMotifs } from "./startupAnimation";
import { startupTheme } from "./startupTheme.js";
import { fonts } from "./tokens";

const letters: readonly StartupLetterName[] = ["L", "I", "S", "N", "O"];
const letterGaps = [2.52, 3.35, 3.20, 3.51, 0];

export function StartupBrand({
  message = "Preparing your workspace",
  reducedMotion,
  play = false,
  onComplete
}: {
  readonly message?: string;
  readonly reducedMotion?: boolean;
  readonly play?: boolean;
  readonly onComplete?: () => void;
}) {
  const preparedPreference = useContext(StartupMotionContext);
  const motionPreference = reducedMotion ?? preparedPreference;
  const window = useWindowDimensions();
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const [messageHeight, setMessageHeight] = useState(0);
  // Only the root launch presentation opts into playback. Other loaders stay still.
  const settled = useRef(!play || motionPreference !== false);
  const startedAt = useRef<number | null>(null);
  const completion = useRef(onComplete);
  completion.current = onComplete;
  const clock = useRef(new Animated.Value(settled.current ? startupDuration : 0)).current;
  const geometry = startupLayout(
    layout?.width ?? window.width,
    layout?.height ?? window.height,
    messageHeight || 26 * window.fontScale
  );
  const { width, height, motifSize, brandSize } = geometry;
  const symbolSize = brandSize * 0.23;
  const letterHeight = brandSize * 0.15;

  useEffect(() => {
    if (!play || motionPreference !== false || settled.current) {
      settled.current = true;
      clock.stopAnimation();
      clock.setValue(startupDuration);
      return;
    }
    // Effect replay resumes the same timeline instead of consuming the introduction.
    const now = Date.now();
    startedAt.current ??= now;
    const elapsed = Math.min(startupDuration, now - startedAt.current);
    clock.setValue(elapsed);
    let active = true;
    const animation = Animated.timing(clock, {
      toValue: startupDuration,
      duration: startupDuration - elapsed,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false
    });
    animation.start(({ finished }) => {
      if (!active || !finished || settled.current) return;
      settled.current = true;
      completion.current?.();
    });
    return () => {
      active = false;
      animation.stop();
    };
  }, [clock, motionPreference, play]);

  const motion = useMemo(() => {
    const inputRange = startupKeyframes.map(({ time }) => time);
    type Frame = typeof startupKeyframes[number]["frame"];
    const interpolate = (select: (frame: Frame) => number) => clock.interpolate({
      inputRange,
      outputRange: startupKeyframes.map(({ frame }) => select(frame)),
      extrapolate: "clamp"
    });
    const textScale = letterHeight / startupLetterMetrics.L.height;
    const nameWidth = letters.reduce((sum, letter, index) =>
      sum + (startupLetterMetrics[letter].width + letterGaps[index]!) * textScale, 0);
    const symbolGap = brandSize * 0.035;
    const combinedWidth = nameWidth + symbolGap + symbolSize;
    const left = (width - combinedWidth) / 2;
    const symbolCenter = left + nameWidth + symbolGap + symbolSize / 2;
    let offset = 0;
    const letterStyles = letters.map((letter, index) => {
      const letterWidth = startupLetterMetrics[letter].width * textScale;
      const destination = left + offset;
      const origin = symbolCenter - letterWidth / 2;
      offset += letterWidth + letterGaps[index]! * textScale;
      return {
        width: letterWidth,
        opacity: interpolate((frame) => frame.letters[index]!.opacity),
        translateX: interpolate((frame) => origin + (destination - origin) * frame.letters[index]!.travel)
      };
    });
    return {
      // Clip at the mark's left edge, avoiding an opaque rectangle over the backdrop.
      letterClipWidth: symbolCenter - symbolSize / 2,
      motifs: startupMotifs.map((_, index) => ({
        opacity: interpolate((frame) => frame.motifs[index]!.opacity),
        x: interpolate((frame) => startupMotifPosition(frame.motifs[index]!, width, height, motifSize).x),
        y: interpolate((frame) => startupMotifPosition(frame.motifs[index]!, width, height, motifSize).y),
        scale: interpolate((frame) => frame.motifs[index]!.scale),
        rotation: clock.interpolate({
          inputRange,
          outputRange: startupKeyframes.map(({ frame }) => `${frame.motifs[index]!.rotation}deg`),
          extrapolate: "clamp"
        })
      })),
      symbol: {
        opacity: interpolate((frame) => frame.symbol.opacity),
        scale: interpolate((frame) => frame.symbol.scale),
        x: interpolate((frame) => (symbolCenter - width / 2) * frame.symbol.shift)
      },
      letters: letterStyles
    };
  }, [brandSize, clock, height, letterHeight, motifSize, symbolSize, width]);

  return (
    <View
      testID="startup-brand"
      style={styles.startup}
      onLayout={({ nativeEvent: { layout: next } }) => setLayout((current) =>
        current?.width === next.width && current.height === next.height
          ? current : { width: next.width, height: next.height })}
    >
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="startup-olive" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#536239" />
              <Stop offset="0.5" stopColor={startupTheme.background} />
              <Stop offset="1" stopColor={startupTheme.deepOlive} />
            </LinearGradient>
          </Defs>
          <Rect width="390" height="844" fill="url(#startup-olive)" />
          <Path d="M310 0H390V114C352 91 330 54 310 0Z" fill={startupTheme.accent} opacity={0.22} />
          <Path d="M233 844H390V791C325 790 269 809 233 844Z" fill={startupTheme.accent} opacity={0.30} />
        </Svg>
      </View>
      <View
        testID="startup-artwork"
        accessible={false}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ width, height, flexShrink: 0 }}
      >
        {play && motionPreference === false ? startupMotifs.map(({ kind }, index) => {
          const motif = motion.motifs[index]!;
          return (
            <Animated.View key={kind} testID={`startup-motif-${kind}`} style={{
              position: "absolute",
              left: (width - motifSize) / 2,
              top: (height - motifSize) / 2,
              width: motifSize,
              height: motifSize,
              opacity: motif.opacity,
              transform: [{ translateX: motif.x }, { translateY: motif.y }, { rotate: motif.rotation }, { scale: motif.scale }]
            }}>
              <StartupMotif kind={kind} size={motifSize} />
            </Animated.View>
          );
        }) : null}
        <View testID="startup-letter-window" style={{ position: "absolute", left: 0, top: 0, width: motion.letterClipWidth, height, overflow: "hidden" }}>
          {letters.map((letter, index) => {
            const letterMotion = motion.letters[index]!;
            return (
              <Animated.View key={letter} testID={`startup-letter-${letter}`} style={{
                position: "absolute",
                left: 0,
                top: (height - letterHeight) / 2,
                width: letterMotion.width,
                height: letterHeight,
                opacity: letterMotion.opacity,
                transform: [{ translateX: letterMotion.translateX }]
              }}>
                <StartupLetter letter={letter} height={letterHeight} />
              </Animated.View>
            );
          })}
        </View>
        <Animated.View testID="startup-symbol" style={{
          position: "absolute",
          left: (width - symbolSize) / 2,
          top: (height - symbolSize) / 2,
          width: symbolSize,
          height: symbolSize,
          opacity: motion.symbol.opacity,
          transform: [{ translateX: motion.symbol.x }, { scale: motion.symbol.scale }]
        }}>
          <StartupSymbol size={symbolSize} />
        </Animated.View>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={message}
        accessibilityLiveRegion="polite"
        style={styles.messageContainer}
        onLayout={({ nativeEvent }) => setMessageHeight(nativeEvent.layout.height)}
      >
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    width: "100%",
    backgroundColor: startupTheme.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 20
  },
  messageContainer: {
    width: "100%",
    paddingHorizontal: 12
  },
  message: {
    color: startupTheme.ink,
    fontFamily: fonts.regular,
    fontSize: 16,
    letterSpacing: 0.8,
    lineHeight: 26,
    textAlign: "center"
  }
});
