import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RNGestureHandlerGestureFactory } from "@wuba/react-native-echarts/svgChart";
import {
  AppState,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle
} from "react-native";

import {
  SvgChart,
  nativeSvgEChartsAdapter,
  type EChartsAdapter,
  type EChartsSurfaceInstance
} from "./echartsRuntime";
import { applyDashboardMotion } from "./motion";
import { dashboardChartPalette } from "./theme";
import type {
  DashboardChartOption,
  DashboardChartSelection
} from "./types";

export interface EChartsSurfaceProps {
  readonly option: DashboardChartOption;
  readonly height: number;
  readonly reducedMotion: boolean;
  readonly accessibilitySummary: string;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly testID?: string | undefined;
  readonly retryKey?: string | number | undefined;
  readonly handleGesture?: boolean | undefined;
  readonly onSelectDatum?:
    | ((selection: DashboardChartSelection) => void)
    | undefined;
  readonly onRenderError?: ((error: Error) => void) | undefined;
  readonly onReady?: (() => void) | undefined;
  readonly adapter?: EChartsAdapter | undefined;
}

interface MeasuredSize {
  readonly width: number;
  readonly height: number;
}

// The package's default PanResponder captures every move and can block the
// dashboard's vertical ScrollView. A tap-only RNGH gesture keeps direct mark
// selection while yielding vertical drags to the parent scroll gesture.
const tapOnlyGesture: RNGestureHandlerGestureFactory = ([, , tap]) => tap;

function asError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("The analytical graphic could not be rendered.");
}

function chartSelection(event: unknown): DashboardChartSelection | null {
  if (!event || typeof event !== "object") return null;
  const candidate = event as {
    readonly data?: unknown;
    readonly seriesId?: unknown;
    readonly name?: unknown;
  };
  const data =
    candidate.data && typeof candidate.data === "object"
      ? (candidate.data as { readonly id?: unknown; readonly name?: unknown })
      : null;
  const id =
    typeof data?.name === "string"
      ? data.name
      : typeof data?.id === "string"
        ? data.id
        : typeof candidate.name === "string"
          ? candidate.name
          : null;
  if (!id) return null;
  return {
    id,
    seriesId:
      typeof candidate.seriesId === "string" ? candidate.seriesId : null
  };
}

export function EChartsSurface({
  option,
  height,
  reducedMotion,
  accessibilitySummary,
  style,
  testID,
  retryKey = 0,
  handleGesture = true,
  onSelectDatum,
  onRenderError,
  onReady,
  adapter = nativeSvgEChartsAdapter
}: EChartsSurfaceProps) {
  const hostRef = useRef<unknown>(null);
  const instanceRef = useRef<EChartsSurfaceInstance | null>(null);
  const optionRef = useRef(option);
  const selectionCallbackRef = useRef(onSelectDatum);
  const errorCallbackRef = useRef(onRenderError);
  const readyCallbackRef = useRef(onReady);
  const mountedRef = useRef(true);
  const previousRetryKeyRef = useRef(retryKey);
  const [size, setSize] = useState<MeasuredSize>({ width: 0, height });
  const [instanceVersion, setInstanceVersion] = useState(0);
  const [renderError, setRenderError] = useState<Error | null>(null);

  optionRef.current = option;
  selectionCallbackRef.current = onSelectDatum;
  errorCallbackRef.current = onRenderError;
  readyCallbackRef.current = onReady;

  const disposeInstance = useCallback(() => {
    const instance = instanceRef.current;
    instanceRef.current = null;
    if (!instance) return;
    try {
      instance.off("click");
    } catch {
      // A partially initialized instance can reject listener cleanup.
    }
    try {
      if (!instance.isDisposed()) instance.dispose();
    } catch {
      // Disposal is best effort after a renderer failure.
    }
  }, []);

  const fail = useCallback(
    (reason: unknown) => {
      const error = asError(reason);
      disposeInstance();
      if (mountedRef.current) setRenderError(error);
      errorCallbackRef.current?.(error);
    },
    [disposeInstance]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disposeInstance();
    };
  }, [disposeInstance]);

  useEffect(() => {
    if (previousRetryKeyRef.current === retryKey) return;
    previousRetryKeyRef.current = retryKey;
    disposeInstance();
    setRenderError(null);
    setInstanceVersion((version) => version + 1);
  }, [disposeInstance, retryKey]);

  useEffect(() => {
    if (
      renderError ||
      instanceRef.current ||
      !hostRef.current ||
      size.width <= 0 ||
      size.height <= 0
    ) {
      return;
    }

    try {
      const instance = adapter.init(hostRef.current, size.width, size.height);
      const clickHandler = (event: unknown) => {
        const selection = chartSelection(event);
        if (selection) selectionCallbackRef.current?.(selection);
      };
      instance.on("click", clickHandler);
      instanceRef.current = instance;
      setInstanceVersion((version) => version + 1);
      readyCallbackRef.current?.();
    } catch (error) {
      fail(error);
    }
  }, [adapter, fail, instanceVersion, renderError, size.height, size.width]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || renderError) return;
    try {
      instance.setOption(applyDashboardMotion(option, reducedMotion), {
        notMerge: false,
        lazyUpdate: false,
        silent: false
      });
    } catch (error) {
      fail(error);
    }
  }, [fail, instanceVersion, option, reducedMotion, renderError]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || renderError || size.width <= 0 || size.height <= 0) return;
    try {
      instance.resize({ width: size.width, height: size.height, silent: true });
    } catch (error) {
      fail(error);
    }
  }, [fail, instanceVersion, renderError, size.height, size.width]);

  useEffect(() => {
    const onAppStateChange = (state: AppStateStatus) => {
      const instance = instanceRef.current;
      if (!instance || instance.isDisposed()) return;
      try {
        if (state !== "active") {
          instance.getZr().animation.stop();
          return;
        }
        instance.getZr().animation.start();
        instance.resize({ width: size.width, height: size.height, silent: true });
        instance.setOption(
          applyDashboardMotion(optionRef.current, true),
          { notMerge: false, lazyUpdate: false, silent: true }
        );
      } catch (error) {
        fail(error);
      }
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [fail, size.height, size.width]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = Math.max(0, Math.round(event.nativeEvent.layout.width));
      const measuredHeight = Math.max(
        0,
        Math.round(event.nativeEvent.layout.height || height)
      );
      setSize((current) =>
        current.width === width && current.height === measuredHeight
          ? current
          : { width, height: measuredHeight }
      );
    },
    [height]
  );

  return (
    <View
      accessibilityLabel={accessibilitySummary}
      accessibilityRole="image"
      accessible
      onLayout={onLayout}
      style={[styles.surface, { height }, style]}
      testID={testID}
    >
      {renderError ? (
        <View
          accessibilityLiveRegion="polite"
          style={styles.fallback}
          testID={testID ? `${testID}-fallback` : undefined}
        >
          <Text style={styles.fallbackEyebrow}>VALUES STILL AVAILABLE</Text>
          <Text style={styles.fallbackText}>
            The analytical graphic is unavailable. Use the values below.
          </Text>
        </View>
      ) : (
        <SvgChart
          ref={hostRef}
          gesture={tapOnlyGesture}
          handleGesture={handleGesture}
          style={{ width: size.width, height: size.height }}
          useRNGH
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    minWidth: 1,
    overflow: "hidden"
  },
  fallback: {
    alignItems: "flex-start",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20
  },
  fallbackEyebrow: {
    color: dashboardChartPalette.selected,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 8
  },
  fallbackText: {
    color: dashboardChartPalette.muted,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280
  }
});
