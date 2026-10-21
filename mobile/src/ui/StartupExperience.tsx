import { Asset } from "expo-asset";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StartupPresentationProvider, useStartupPresentation, type StartupAssetsStatus } from "../core/startup";
import type { ReducedMotionPreference } from "../features/onboarding/useReducedMotion";
import { useRuntime } from "../runtime/RuntimeProvider";
import { StartupBrand } from "./StartupBrand";
import { startupAssetModules } from "./startupAssets";
import { startupTheme } from "./startupTheme.js";

/** Prepare local artwork while the existing font and runtime work proceeds. */
export function useStartupAssets(): StartupAssetsStatus {
  const [status, setStatus] = useState<StartupAssetsStatus>("pending");
  useEffect(() => {
    let active = true;
    void Asset.loadAsync(startupAssetModules).then(
      () => { if (active) setStatus("ready"); },
      () => { if (active) setStatus("failed"); }
    );
    return () => { active = false; };
  }, []);
  return status;
}

export function StartupExperience({ children, assetsStatus, reducedMotion }: {
  readonly children: ReactNode;
  readonly assetsStatus: StartupAssetsStatus;
  readonly reducedMotion: ReducedMotionPreference;
}) {
  const runtime = useRuntime();
  const [playbackReady, setPlaybackReady] = useState(false);
  const bypass = !runtime.configured || Boolean(runtime.initializationError) || runtime.session.status === "transient_error";
  return (
    <StartupPresentationProvider assetsStatus={assetsStatus} reducedMotion={reducedMotion} bypass={bypass} playbackReady={playbackReady}>
      <StartupSurface bypass={bypass} assetsStatus={assetsStatus} reducedMotion={reducedMotion} onNativeHandoff={setPlaybackReady}>
        {children}
      </StartupSurface>
    </StartupPresentationProvider>
  );
}

function StartupSurface({ children, bypass, assetsStatus, reducedMotion, onNativeHandoff }: {
  readonly children: ReactNode;
  readonly bypass: boolean;
  readonly assetsStatus: StartupAssetsStatus;
  readonly reducedMotion: ReducedMotionPreference;
  readonly onNativeHandoff: (ready: boolean) => void;
}) {
  const { phase, complete, readyForNavigation } = useStartupPresentation();
  const [laidOut, setLaidOut] = useState(false);
  const nativeHideRequest = useRef<Promise<void> | null>(null);
  const nativeHideFinished = useRef(false);
  const nativeFallbackAttempted = useRef(false);
  const held = !bypass && !readyForNavigation;

  useEffect(() => {
    const prepared = assetsStatus === "ready" && reducedMotion === false;
    if (!laidOut || (phase === "preparing" && !bypass && !prepared)) return;
    // The matching olive preparation surface is laid out before native dismissal.
    // Do not mount the animation until this request returns; its clock must not
    // advance behind the native launch screen. This is ordering, not frame proof.
    nativeHideRequest.current ??= SplashScreen.hideAsync();
    const fallback = () => {
      if (nativeHideFinished.current || nativeFallbackAttempted.current) return;
      nativeFallbackAttempted.current = true;
      try {
        SplashScreen.hide();
        nativeHideFinished.current = true;
      } catch {
        // A native API failure cannot trap the React gate or trigger repeated calls.
      }
    };
    if (phase === "settled") fallback();
    let active = true;
    void nativeHideRequest.current.then(
      () => {
        if (!active) return;
        nativeHideFinished.current = true;
        onNativeHandoff(true);
      },
      () => {
        if (!active) return;
        fallback();
        complete();
      }
    );
    return () => { active = false; };
  }, [assetsStatus, bypass, complete, laidOut, onNativeHandoff, phase, reducedMotion]);

  return (
    <View
      style={styles.root}
      onLayout={({ nativeEvent }) => {
        if (nativeEvent.layout.width > 0 && nativeEvent.layout.height > 0) setLaidOut(true);
      }}
      testID="startup-experience"
    >
      <View
        style={styles.content}
        testID="startup-route-content"
        pointerEvents={held ? "none" : "auto"}
        aria-hidden={held}
        accessibilityElementsHidden={held}
        importantForAccessibility={held ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {held ? (
        <SafeAreaView
          style={styles.overlay}
          testID="startup-launch-overlay"
          accessible={phase === "preparing"}
          accessibilityRole={phase === "preparing" ? "progressbar" : undefined}
          accessibilityLabel={phase === "preparing" ? "Preparing your workspace" : undefined}
        >
          {phase === "playing" ? <StartupBrand play reducedMotion={reducedMotion !== false} onComplete={complete} /> : null}
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: startupTheme.background },
  content: { flex: 1 },
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: startupTheme.background }
});
