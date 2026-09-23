import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
  BackHandler,
  FlatList,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LisnoWordmark } from "../../ui/brand";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { OnboardingScene } from "./OnboardingScenes";
import { ONBOARDING_SLIDES, type OnboardingSlide } from "./slides";
import { useReducedMotion } from "./useReducedMotion";

export type OnboardingScreenProps = Readonly<{
  onComplete: () => void | Promise<void>;
  reducedMotion?: boolean;
}>;

type SlidePageProps = Readonly<{
  active: boolean;
  completing: boolean;
  expanded: boolean;
  index: number;
  onComplete: () => void;
  onNext: () => void;
  parallax: Animated.AnimatedInterpolation<number>;
  reducedMotion: boolean;
  slide: OnboardingSlide;
  width: number;
}>;

function ProgressIndicator({ index }: Readonly<{ index: number }>) {
  return (
    <View
      accessible
      accessibilityLabel={`Slide ${index + 1} of 3`}
      accessibilityRole="text"
      style={styles.progress}
      testID="onboarding-progress"
    >
      {ONBOARDING_SLIDES.map((slide, dotIndex) => (
        <View
          accessible={false}
          key={slide.id}
          style={[styles.progressTrack, dotIndex === index ? styles.progressTrackActive : null]}
        />
      ))}
    </View>
  );
}

function PrimaryAction({
  busy,
  label,
  onPress
}: Readonly<{
  busy: boolean;
  label: OnboardingSlide["primaryActionLabel"];
  onPress: () => void;
}>) {
  return (
    <Pressable
      accessibilityHint={label === "Next" ? "Shows the next introduction slide" : "Opens secure sign in"}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryAction,
        pressed && !busy ? styles.primaryActionPressed : null,
        busy ? styles.primaryActionBusy : null
      ]}
    >
      {busy ? <ActivityIndicator color={colors.primaryInk} size="small" /> : null}
      <Text style={styles.primaryActionLabel}>{label}</Text>
    </Pressable>
  );
}

function SlidePage({
  active,
  completing,
  expanded,
  index,
  onComplete,
  onNext,
  parallax,
  reducedMotion,
  slide,
  width
}: SlidePageProps) {
  const finalSlide = index === ONBOARDING_SLIDES.length - 1;

  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[styles.slide, { width }]}
      testID={`onboarding-slide-${index + 1}`}
    >
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.slideScrollContent,
          expanded ? styles.slideScrollContentExpanded : null
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.slideLayout, expanded ? styles.slideLayoutExpanded : null]}>
          <View style={[styles.sceneColumn, expanded ? styles.sceneColumnExpanded : null]}>
            <OnboardingScene
              active={active}
              parallax={parallax}
              reducedMotion={reducedMotion}
              slide={slide}
            />
          </View>
          <View style={[styles.copyColumn, expanded ? styles.copyColumnExpanded : null]}>
            <View style={styles.copyBlock}>
              <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
              <Text accessibilityRole="header" style={[styles.title, expanded ? styles.titleExpanded : null]}>
                {slide.title}
              </Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
            <View style={styles.actions}>
              <ProgressIndicator index={index} />
              <PrimaryAction
                busy={finalSlide && completing}
                label={slide.primaryActionLabel}
                onPress={finalSlide ? onComplete : onNext}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function OnboardingScreen({ onComplete, reducedMotion: reducedMotionOverride }: OnboardingScreenProps) {
  const { width } = useWindowDimensions();
  const expanded = width >= 600;
  const reducedMotionPreference = useReducedMotion(reducedMotionOverride);
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const previousWidth = useRef(width);
  const completionInFlight = useRef(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [completing, setCompleting] = useState(false);
  const hasMountedAnnouncement = useRef(false);

  useEffect(() => {
    if (!hasMountedAnnouncement.current) {
      hasMountedAnnouncement.current = true;
      return;
    }
    const slide = ONBOARDING_SLIDES[activeIndex];
    if (slide) {
      AccessibilityInfo.announceForAccessibility(
        `Slide ${activeIndex + 1} of 3: ${slide.title}`
      );
    }
  }, [activeIndex]);

  const reducedMotion = reducedMotionPreference ?? true;

  const goToIndex = useCallback(
    (nextIndex: number, animated = !reducedMotion) => {
      const boundedIndex = Math.max(0, Math.min(ONBOARDING_SLIDES.length - 1, nextIndex));
      setActiveIndex(boundedIndex);
      listRef.current?.scrollToOffset({ offset: boundedIndex * width, animated });
    },
    [reducedMotion, width]
  );

  useEffect(() => {
    if (previousWidth.current === width) return;
    previousWidth.current = width;
    listRef.current?.scrollToOffset({ offset: activeIndex * width, animated: false });
  }, [activeIndex, width]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activeIndex === 0) return false;
      goToIndex(activeIndex - 1);
      return true;
    });
    return () => subscription.remove();
  }, [activeIndex, goToIndex]);

  const complete = useCallback(async () => {
    if (completionInFlight.current) return;
    completionInFlight.current = true;
    setCompleting(true);
    try {
      await onComplete();
    } finally {
      completionInFlight.current = false;
      setCompleting(false);
    }
  }, [onComplete]);

  const syncIndexAfterScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      setActiveIndex(Math.max(0, Math.min(ONBOARDING_SLIDES.length - 1, nextIndex)));
    },
    [width]
  );

  const renderSlide = useCallback(
    ({ item, index }: ListRenderItemInfo<OnboardingSlide>) => {
      const parallax = reducedMotion
        ? scrollX.interpolate({ inputRange: [0, Math.max(width, 1)], outputRange: [0, 0] })
        : scrollX.interpolate({
            inputRange: [(index - 1) * width, index * width, (index + 1) * width],
            outputRange: [26, 0, -26],
            extrapolate: "clamp"
          });
      return (
        <SlidePage
          active={index === activeIndex}
          completing={completing}
          expanded={expanded}
          index={index}
          onComplete={() => void complete()}
          onNext={() => goToIndex(index + 1)}
          parallax={parallax}
          reducedMotion={reducedMotion}
          slide={item}
          width={width}
        />
      );
    },
    [activeIndex, complete, completing, expanded, goToIndex, reducedMotion, scrollX, width]
  );

  if (reducedMotionPreference === null) {
    return (
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.preferenceLoading}>
          <LisnoWordmark tone="dark" width={142} />
          <ActivityIndicator
            accessible
            accessibilityLabel="Preparing introduction"
            accessibilityRole="progressbar"
            color={colors.primary}
            size="small"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={[styles.header, expanded ? styles.headerExpanded : null]}>
        <LisnoWordmark tone="dark" width={expanded ? 142 : 124} />
        <Text style={styles.headerNote}>PROJECT OPERATIONS</Text>
      </View>
      <Animated.FlatList
        bounces={false}
        data={ONBOARDING_SLIDES}
        decelerationRate="fast"
        disableIntervalMomentum
        getItemLayout={(_data, index) => ({ index, length: width, offset: index * width })}
        horizontal
        initialNumToRender={3}
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={3}
        onMomentumScrollEnd={syncIndexAfterScroll}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        pagingEnabled
        ref={listRef}
        removeClippedSubviews={false}
        renderItem={renderSlide}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        testID="onboarding-carousel"
        windowSize={3}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.authCanvas },
  header: {
    minHeight: 62,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.md
  },
  headerExpanded: { width: "100%", maxWidth: 1040, alignSelf: "center", paddingHorizontal: spacing.xxl },
  headerNote: { color: colors.inkMuted, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1.7 },
  preferenceLoading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xxl },
  slide: { flex: 1 },
  slideScrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  slideScrollContentExpanded: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg },
  slideLayout: { width: "100%", maxWidth: 1040, alignSelf: "center", gap: spacing.xl },
  slideLayoutExpanded: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.huge },
  sceneColumn: { width: "100%" },
  sceneColumnExpanded: { flex: 1, maxWidth: 520 },
  copyColumn: { width: "100%", gap: spacing.xl },
  copyColumnExpanded: { flex: 0.86, maxWidth: 430, justifyContent: "center", gap: spacing.xxl },
  copyBlock: { gap: spacing.sm },
  eyebrow: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 2.1 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 30, lineHeight: 37, letterSpacing: -0.5 },
  titleExpanded: { fontSize: 38, lineHeight: 46, letterSpacing: -0.8 },
  body: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, maxWidth: 470 },
  actions: { gap: spacing.lg },
  progress: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start" },
  progressTrack: { width: 22, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  progressTrackActive: { width: 46, backgroundColor: colors.primary },
  primaryAction: {
    minHeight: 56,
    width: "100%",
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary
  },
  primaryActionPressed: { backgroundColor: colors.primaryPressed, borderColor: colors.primaryPressed },
  primaryActionBusy: { opacity: 0.72 },
  primaryActionLabel: { color: colors.primaryInk, fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1, textAlign: "center" }
});
