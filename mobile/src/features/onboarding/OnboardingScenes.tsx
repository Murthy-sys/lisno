import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop
} from "react-native-svg";

import { LisnoIcon } from "../../ui/brand";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import type { OnboardingSlide } from "./slides";

type SceneProps = Readonly<{
  active: boolean;
  parallax: Animated.AnimatedInterpolation<number>;
  reducedMotion: boolean;
  slide: OnboardingSlide;
}>;

type SceneMotion = Readonly<{
  entrance: Animated.Value;
  interaction: Animated.Value;
  interactionBusy: boolean;
  triggerInteraction: () => void;
}>;

const SCENE_DURATION_MS = 760;

function useSceneMotion(
  variant: OnboardingSlide["id"],
  active: boolean,
  reducedMotion: boolean
): SceneMotion {
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const interaction = useRef(new Animated.Value(variant === "deliver" ? 1 : 0)).current;
  const interactionAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const interactionBusyRef = useRef(false);
  const mountedRef = useRef(true);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const planExpanded = useRef(false);

  useEffect(() => {
    entrance.stopAnimation();
    if (!active || reducedMotion) {
      entrance.setValue(1);
      return;
    }

    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 680,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });
    animation.start();
    return () => animation.stop();
  }, [active, entrance, reducedMotion]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      entrance.stopAnimation();
      interactionAnimation.current?.stop();
      interactionBusyRef.current = false;
    },
    [entrance]
  );

  const finishInteraction = useCallback(() => {
    interactionBusyRef.current = false;
    if (mountedRef.current) setInteractionBusy(false);
  }, []);

  useEffect(() => {
    if (active) return;
    interactionAnimation.current?.stop();
    interactionBusyRef.current = false;
    setInteractionBusy(false);
  }, [active]);

  const triggerInteraction = useCallback(() => {
    if (!active || interactionBusyRef.current) return;

    if (variant === "plan") {
      planExpanded.current = !planExpanded.current;
      const target = planExpanded.current ? 1 : 0;
      interactionAnimation.current?.stop();
      if (reducedMotion) {
        interaction.setValue(target);
        return;
      }
      interactionBusyRef.current = true;
      setInteractionBusy(true);
      interactionAnimation.current = Animated.timing(interaction, {
        toValue: target,
        duration: 620,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true
      });
      interactionAnimation.current.start(finishInteraction);
      return;
    }

    interactionAnimation.current?.stop();
    interactionBusyRef.current = true;
    setInteractionBusy(true);
    interaction.setValue(0);
    if (reducedMotion) {
      interaction.setValue(variant === "collaborate" ? 0.5 : 1);
      finishInteraction();
      return;
    }

    interactionAnimation.current = Animated.timing(interaction, {
      toValue: 1,
      duration: SCENE_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true
    });
    interactionAnimation.current.start(({ finished }) => {
      if (finished && variant === "collaborate") interaction.setValue(0);
      finishInteraction();
    });
  }, [active, finishInteraction, interaction, reducedMotion, variant]);

  return { entrance, interaction, interactionBusy, triggerInteraction };
}

function SceneAction({
  busy,
  label,
  onPress
}: Readonly<{ busy: boolean; label: string; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityHint="Activates the scene preview"
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sceneAction,
        pressed && !busy ? styles.sceneActionPressed : null,
        busy ? styles.sceneActionBusy : null
      ]}
    >
      <View style={styles.actionGlyph}>
        <View style={styles.actionGlyphCore} />
      </View>
      <Text style={styles.sceneActionLabel}>{label}</Text>
      <Text accessible={false} style={styles.sceneActionArrow}>↗</Text>
    </Pressable>
  );
}

function PlanScene({ entrance, interaction, parallax }: Omit<SceneProps, "active" | "reducedMotion" | "slide"> & SceneMotion) {
  const floorOne = interaction.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });
  const floorTwo = interaction.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const floorThree = interaction.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const rise = entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  return (
    <View importantForAccessibility="no-hide-descendants" style={styles.artboard}>
      <Animated.View
        testID="plan-background-plane"
        style={[styles.depthPlane, { opacity: entrance, transform: [{ translateX: Animated.multiply(parallax, 0.28) }] }]}
      >
        <Svg height="100%" viewBox="0 0 360 236" width="100%">
          <Defs>
            <LinearGradient id="plan-haze" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity="0.32" />
              <Stop offset="1" stopColor={colors.shell} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Ellipse cx="104" cy="44" fill="url(#plan-haze)" rx="126" ry="92" />
          <G opacity="0.26" stroke={colors.accent} strokeWidth="1">
            <Path d="M24 174L178 88L338 172L184 230Z" fill="none" />
            <Path d="M56 188L210 102M92 206L246 120M128 218L282 136M164 228L318 150" />
            <Path d="M52 158L210 236M88 138L246 216M126 116L282 196M164 96L320 176" />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View
        testID="plan-subject-plane"
        style={[
          styles.depthPlane,
          {
            opacity: entrance,
            transform: [
              { translateX: Animated.multiply(parallax, 0.62) },
              { translateY: rise }
            ]
          }
        ]}
      >
        <Animated.View style={[styles.planPlate, styles.planPlateLow, { transform: [{ translateY: floorOne }] }]}>
          <Svg height="88" viewBox="0 0 260 88" width="260">
            <Polygon fill={colors.shellRaised} points="130,4 254,42 130,84 6,44" stroke={colors.accent} strokeWidth="2" />
            <Path d="M45 44L130 18L218 44L130 70Z" fill={colors.shell} stroke={colors.accent} strokeOpacity="0.55" />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.planPlate, styles.planPlateMid, { transform: [{ translateY: floorTwo }] }]}>
          <Svg height="80" viewBox="0 0 234 80" width="234">
            <Polygon fill={colors.shellSelected} points="117,4 228,38 117,76 6,40" stroke={colors.accent} strokeWidth="2" />
            <Path d="M42 39L117 16L196 39L117 64Z" fill={colors.inkMuted} opacity="0.74" />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.planPlate, styles.planPlateHigh, { transform: [{ translateY: floorThree }] }]}>
          <Svg height="74" viewBox="0 0 208 74" width="208">
            <Polygon fill={colors.inkMuted} points="104,4 202,35 104,70 6,37" stroke={colors.shellInk} strokeWidth="2" />
            <Path d="M56 36L104 20L155 36L104 53Z" fill={colors.accent} />
          </Svg>
        </Animated.View>
      </Animated.View>
      <Animated.View
        testID="plan-foreground-plane"
        style={[
          styles.depthPlane,
          {
            opacity: entrance,
            transform: [
              { translateX: Animated.multiply(parallax, 0.92) },
              { translateY: interaction.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }
            ]
          }
        ]}
      >
        <Svg height="100%" viewBox="0 0 360 236" width="100%">
          <Path
            d="M76 186L116 163L154 174L194 140L238 150L285 116"
            fill="none"
            stroke={colors.accent}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
          <Circle cx="76" cy="186" fill={colors.accent} r="6" />
          <Circle cx="194" cy="140" fill={colors.primaryInk} r="6" />
          <Circle cx="285" cy="116" fill={colors.surface} r="7" stroke={colors.accent} strokeWidth="4" />
        </Svg>
      </Animated.View>
    </View>
  );
}

function CollaborateScene({ entrance, interaction, parallax }: Omit<SceneProps, "active" | "reducedMotion" | "slide"> & SceneMotion) {
  const pulseX = interaction.interpolate({ inputRange: [0, 1], outputRange: [-92, 104] });
  const pulseY = interaction.interpolate({ inputRange: [0, 0.5, 1], outputRange: [42, -38, 12] });
  const pulseOpacity = interaction.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] });
  const revealScale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });

  return (
    <View importantForAccessibility="no-hide-descendants" style={styles.artboard}>
      <Animated.View
        testID="collaborate-background-plane"
        style={[styles.depthPlane, { opacity: entrance, transform: [{ translateX: Animated.multiply(parallax, 0.3) }] }]}
      >
        <Svg height="100%" viewBox="0 0 360 236" width="100%">
          <Defs>
            <LinearGradient id="orbit-glow" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity="0.42" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0.04" />
            </LinearGradient>
          </Defs>
          <Ellipse cx="180" cy="116" fill="url(#orbit-glow)" rx="142" ry="93" />
          <Ellipse cx="180" cy="116" fill="none" rx="130" ry="72" stroke={colors.accent} strokeDasharray="5 9" strokeOpacity="0.46" />
          <Path d="M50 116C96 30 258 28 310 108" fill="none" stroke={colors.accent} strokeOpacity="0.64" strokeWidth="2" />
          <Path d="M58 135C120 210 268 202 309 125" fill="none" stroke={colors.shellInk} strokeOpacity="0.72" strokeWidth="2" />
        </Svg>
      </Animated.View>
      <Animated.View
        testID="collaborate-subject-plane"
        style={[
          styles.depthPlane,
          styles.collaborationNodes,
          {
            opacity: entrance,
            transform: [
              { translateX: Animated.multiply(parallax, 0.6) },
              { scale: revealScale }
            ]
          }
        ]}
      >
        <View style={[styles.roleNode, styles.siteNode]}><Text style={styles.roleLabel}>SITE</Text></View>
        <View style={[styles.roleNode, styles.officeNode]}><Text style={styles.roleLabel}>OFFICE</Text></View>
        <View style={[styles.roleNode, styles.clientNode]}><Text style={styles.roleLabel}>CLIENT</Text></View>
        <View style={[styles.roleNode, styles.decisionNode]}><Text style={styles.roleLabel}>DECISION</Text></View>
        <View style={styles.projectCoreOuter}>
          <View style={styles.projectCore}>
            <View style={styles.projectCoreIcon}><LisnoIcon size={48} /></View>
          </View>
        </View>
      </Animated.View>
      <Animated.View
        testID="collaborate-foreground-plane"
        style={[
          styles.pulse,
          {
            opacity: pulseOpacity,
            transform: [
              { translateX: Animated.add(Animated.multiply(parallax, 0.9), pulseX) },
              { translateY: pulseY },
              { scale: entrance }
            ]
          }
        ]}
      >
        <View style={styles.pulseHalo} />
        <View style={styles.pulseCore} />
      </Animated.View>
    </View>
  );
}

function DeliverScene({ entrance, interaction, parallax }: Omit<SceneProps, "active" | "reducedMotion" | "slide"> & SceneMotion) {
  const towerRise = entrance.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });
  const spread = interaction.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const tighten = interaction.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  const layers = [
    { label: "PROGRESS", color: colors.inkMuted, top: 36 },
    { label: "COST", color: colors.shellSelected, top: 75 },
    { label: "APPROVAL", color: colors.shellRaised, top: 114 },
    { label: "PROCUREMENT", color: colors.shell, top: 153 }
  ] as const;

  return (
    <View importantForAccessibility="no-hide-descendants" style={styles.artboard}>
      <Animated.View
        testID="deliver-background-plane"
        style={[styles.depthPlane, { opacity: entrance, transform: [{ translateX: Animated.multiply(parallax, 0.26) }] }]}
      >
        <Svg height="100%" viewBox="0 0 360 236" width="100%">
          <Defs>
            <LinearGradient id="delivery-glow" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity="0.24" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0.16" />
            </LinearGradient>
          </Defs>
          <Circle cx="180" cy="112" fill="url(#delivery-glow)" r="102" />
          <Circle cx="180" cy="112" fill="none" r="83" stroke={colors.accent} strokeOpacity="0.44" />
          <Path d="M107 154A84 84 0 1 0 126 50" fill="none" stroke={colors.accent} strokeLinecap="round" strokeWidth="5" />
          <Circle cx="108" cy="154" fill={colors.accent} r="7" />
        </Svg>
      </Animated.View>
      <Animated.View
        testID="deliver-subject-plane"
        style={[
          styles.depthPlane,
          {
            opacity: entrance,
            transform: [
              { translateX: Animated.multiply(parallax, 0.58) },
              { translateY: towerRise },
              { scale: tighten }
            ]
          }
        ]}
      >
        {layers.map((layer, index) => (
          <Animated.View
            key={layer.label}
            style={[
              styles.deliveryLayer,
              {
                backgroundColor: layer.color,
                top: layer.top,
                transform: [
                  {
                    translateY: Animated.multiply(spread, index % 2 === 0 ? -1 : 1)
                  }
                ]
              }
            ]}
          >
            <Text style={styles.deliveryLabel}>{layer.label}</Text>
            <View style={styles.deliveryLine} />
          </Animated.View>
        ))}
      </Animated.View>
      <Animated.View
        testID="deliver-foreground-plane"
        style={[
          styles.deliveryIcon,
          {
            opacity: entrance,
            transform: [
              { translateX: Animated.multiply(parallax, 0.9) },
              { scale: interaction.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.86, 1.08, 1] }) }
            ]
          }
        ]}
      >
        <LisnoIcon size={48} />
      </Animated.View>
    </View>
  );
}

export function OnboardingScene(props: SceneProps) {
  const motion = useSceneMotion(props.slide.id, props.active, props.reducedMotion);
  const commonProps = { ...motion, parallax: props.parallax };

  return (
    <View style={styles.sceneWrap} testID={`scene-${props.slide.id}`}>
      {props.slide.id === "plan" ? <PlanScene {...commonProps} /> : null}
      {props.slide.id === "collaborate" ? <CollaborateScene {...commonProps} /> : null}
      {props.slide.id === "deliver" ? <DeliverScene {...commonProps} /> : null}
      <SceneAction
        busy={motion.interactionBusy}
        label={props.slide.sceneActionLabel}
        onPress={motion.triggerInteraction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sceneWrap: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: spacing.sm
  },
  artboard: {
    height: 236,
    overflow: "hidden",
    borderRadius: radii.surface,
    backgroundColor: colors.shell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  depthPlane: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  planPlate: { position: "absolute", left: "50%", marginLeft: -130 },
  planPlateLow: { top: 116 },
  planPlateMid: { top: 82, marginLeft: -117 },
  planPlateHigh: { top: 48, marginLeft: -104 },
  collaborationNodes: { alignItems: "center", justifyContent: "center" },
  roleNode: {
    position: "absolute",
    minWidth: 74,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.shellSelected,
    borderWidth: 1,
    borderColor: colors.accent
  },
  siteNode: { left: 25, top: 94 },
  officeNode: { left: 76, top: 29 },
  clientNode: { right: 31, top: 52 },
  decisionNode: { right: 54, bottom: 24 },
  roleLabel: { color: colors.shellInk, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1 },
  projectCoreOuter: {
    width: 102,
    height: 102,
    borderRadius: 51,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.shellSelected,
    borderWidth: 1,
    borderColor: colors.accent
  },
  projectCore: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    transform: [{ rotate: "45deg" }]
  },
  projectCoreIcon: { transform: [{ rotate: "-45deg" }] },
  pulse: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    alignItems: "center",
    justifyContent: "center"
  },
  pulseHalo: { position: "absolute", width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, opacity: 0.32 },
  pulseCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryInk },
  deliveryLayer: {
    position: "absolute",
    left: "50%",
    width: 210,
    height: 52,
    marginLeft: -105,
    borderRadius: radii.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  deliveryLabel: { color: colors.shellInk, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 0.9 },
  deliveryLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  deliveryIcon: {
    position: "absolute",
    left: "50%",
    top: 90,
    width: 70,
    height: 70,
    marginLeft: -35,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  sceneAction: {
    minHeight: 48,
    maxWidth: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.authSurface
  },
  sceneActionPressed: { backgroundColor: colors.primarySoft },
  sceneActionBusy: { opacity: 0.72 },
  actionGlyph: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  actionGlyphCore: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  sceneActionLabel: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1, textAlign: "center" },
  sceneActionArrow: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 14, flexShrink: 0 }
});
