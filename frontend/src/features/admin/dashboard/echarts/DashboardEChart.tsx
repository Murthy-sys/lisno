import { useEffect, useId, useRef, useState } from "react";

import { prepareDashboardEChartOption, resolveDashboardChartTheme } from "./dashboardEChartOptions";
import type {
  DashboardEChartDatumTarget,
  DashboardEChartRuntimeInstance
} from "./dashboardEChartsRuntimeTypes";
import { loadDashboardEChartsRuntime } from "./loadDashboardEChartsRuntime";
import type {
  DashboardChartInteraction,
  DashboardChartKeyboardItem,
  DashboardEChartProps,
  DashboardChartRenderError
} from "./types";

type RenderState = "loading" | "ready" | "error";

const ERROR_MESSAGES: Record<DashboardChartRenderError["phase"], string> = {
  load: "The chart renderer could not be loaded.",
  initialize: "The chart could not be started.",
  option: "The chart data could not be rendered.",
  resize: "The chart could not adjust to the available space.",
  interaction: "The chart interaction could not be completed."
};

const visuallyHidden: React.CSSProperties = {
  border: 0,
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px"
};

const validKeyboardItems = (interaction: DashboardChartInteraction | undefined) =>
  (interaction?.items ?? []).filter(
    (item): item is DashboardChartKeyboardItem =>
      typeof item.id === "string" &&
      item.id.length > 0 &&
      typeof item.seriesId === "string" &&
      item.seriesId.length > 0 &&
      Number.isSafeInteger(item.dataIndex) &&
      item.dataIndex >= 0 &&
      typeof item.announcement === "string" &&
      item.announcement.length > 0
  );

const itemForTarget = (
  interaction: DashboardChartInteraction | undefined,
  target: DashboardEChartDatumTarget
) =>
  validKeyboardItems(interaction).find(
    (item) => item.seriesId === target.seriesId && item.dataIndex === target.dataIndex
  );

const measuredSize = (element: HTMLElement) => {
  const bounds = element.getBoundingClientRect();
  return {
    height: Math.max(bounds.height, element.clientHeight),
    width: Math.max(bounds.width, element.clientWidth)
  };
};

export function DashboardEChart(props: DashboardEChartProps) {
  const {
    chartId,
    height,
    description,
    className,
    loadingLabel = "Loading chart…",
    errorLabel = "Chart unavailable."
  } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DashboardEChartRuntimeInstance | null>(null);
  const applyLatestRef = useRef<(() => void) | null>(null);
  const latestPropsRef = useRef(props);
  const activeIndexRef = useRef(0);
  const [renderState, setRenderState] = useState<RenderState>("loading");
  const [retryNonce, setRetryNonce] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const descriptionId = useId();
  const liveId = useId();

  latestPropsRef.current = props;

  const notifyError = (phase: DashboardChartRenderError["phase"]) => {
    try {
      latestPropsRef.current.onRenderError?.({ phase, message: ERROR_MESSAGES[phase] });
    } catch {
      // A reporting callback cannot be allowed to replace the safe chart fallback.
    }
  };

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;

    let alive = true;
    let failed = false;
    let runtimeReady: Awaited<ReturnType<typeof loadDashboardEChartsRuntime>> | null = null;
    let instance: DashboardEChartRuntimeInstance | null = null;
    let removeDatumClick: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let themeObserver: MutationObserver | undefined;
    let animationFrame: number | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let scheduled = false;
    const view = element.ownerDocument.defaultView ?? window;
    const reducedMotionQuery = typeof view.matchMedia === "function"
      ? view.matchMedia("(prefers-reduced-motion: reduce)")
      : undefined;

    const motionEnabled = () =>
      latestPropsRef.current.motion !== "disabled" && !reducedMotionQuery?.matches;

    const cleanInstance = () => {
      removeDatumClick?.();
      removeDatumClick = undefined;
      if (instance) {
        const ownedInstance = instance;
        instance = null;
        if (instanceRef.current === ownedInstance) instanceRef.current = null;
        try {
          ownedInstance.dispose();
        } catch {
          // A failed renderer must not interrupt route cleanup.
        }
      }
    };

    const fail = (phase: DashboardChartRenderError["phase"]) => {
      if (!alive || failed) return;
      failed = true;
      cleanInstance();
      setRenderState("error");
      notifyError(phase);
    };

    const applyLatest = () => {
      if (!instance || failed || !alive) return;
      try {
        const current = latestPropsRef.current;
        const theme = resolveDashboardChartTheme(element);
        const option = current.createOption(theme);
        instance.update(
          prepareDashboardEChartOption({
            element,
            option,
            theme,
            description: current.description,
            motionEnabled: motionEnabled()
          })
        );
        setRenderState("ready");
      } catch {
        fail("option");
      }
    };

    applyLatestRef.current = applyLatest;

    const initializeIfReady = () => {
      if (!alive || failed || instance || !runtimeReady) return;
      const size = measuredSize(element);
      if (size.width <= 0 || size.height <= 0) return;

      try {
        instance = runtimeReady.init(element);
        instanceRef.current = instance;
        removeDatumClick = instance.onDatumClick((target) => {
          if (!alive) return;
          const current = latestPropsRef.current;
          const item = itemForTarget(current.interaction, target);
          if (!item) return;

          const items = validKeyboardItems(current.interaction);
          activeIndexRef.current = Math.max(0, items.indexOf(item));
          setAnnouncement(item.announcement);
          if (current.interaction?.onActivate) {
            try {
              current.interaction.onActivate(item.id);
            } catch {
              notifyError("interaction");
            }
          }
        });
      } catch {
        fail("initialize");
        return;
      }

      applyLatest();
    };

    const measureAndResize = () => {
      scheduled = false;
      animationFrame = undefined;
      fallbackTimer = undefined;
      if (!alive || failed) return;
      const size = measuredSize(element);
      if (size.width <= 0 || size.height <= 0) return;

      if (!instance) {
        initializeIfReady();
        return;
      }

      try {
        instance.resize();
      } catch {
        fail("resize");
      }
    };

    const scheduleMeasure = () => {
      if (!alive || scheduled) return;
      scheduled = true;
      if (typeof view.requestAnimationFrame === "function") {
        animationFrame = view.requestAnimationFrame(measureAndResize);
      } else {
        fallbackTimer = setTimeout(measureAndResize, 0);
      }
    };

    const scheduleThemeUpdate = () => {
      if (!alive || failed || !instance) return;
      applyLatest();
    };

    setRenderState("loading");

    const ResizeObserverConstructor = view.ResizeObserver ?? globalThis.ResizeObserver;
    if (typeof ResizeObserverConstructor === "function") {
      resizeObserver = new ResizeObserverConstructor(scheduleMeasure);
      resizeObserver.observe(element);
    } else {
      view.addEventListener("resize", scheduleMeasure);
    }

    if (typeof view.MutationObserver === "function") {
      themeObserver = new view.MutationObserver(scheduleThemeUpdate);
      let ancestor: HTMLElement | null = element;
      while (ancestor) {
        themeObserver.observe(ancestor, {
          attributes: true,
          attributeFilter: ["class", "style", "data-theme"]
        });
        ancestor = ancestor.parentElement;
      }
    }

    const handleMotionChange = () => applyLatest();
    reducedMotionQuery?.addEventListener?.("change", handleMotionChange);

    void loadDashboardEChartsRuntime().then(
      (runtime) => {
        if (!alive) return;
        runtimeReady = runtime;
        scheduleMeasure();
      },
      () => fail("load")
    );

    scheduleMeasure();

    return () => {
      alive = false;
      applyLatestRef.current = null;
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      view.removeEventListener("resize", scheduleMeasure);
      reducedMotionQuery?.removeEventListener?.("change", handleMotionChange);
      if (animationFrame !== undefined) view.cancelAnimationFrame(animationFrame);
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
      cleanInstance();
    };
  }, [chartId, retryNonce]);

  useEffect(() => {
    applyLatestRef.current?.();
  }, [description, props.createOption, props.motion]);

  useEffect(() => {
    const itemCount = validKeyboardItems(props.interaction).length;
    if (activeIndexRef.current >= itemCount) activeIndexRef.current = Math.max(0, itemCount - 1);
  }, [props.interaction]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const interaction = latestPropsRef.current.interaction;
    const items = validKeyboardItems(interaction);
    if (!interaction || items.length === 0) return;

    const lastIndex = items.length - 1;
    let nextIndex: number | undefined;
    const backwardKey = interaction.orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const forwardKey = interaction.orientation === "vertical" ? "ArrowDown" : "ArrowRight";

    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;
    else if (event.key === backwardKey || (interaction.orientation === "radial" && event.key === "ArrowUp")) {
      nextIndex = Math.max(0, activeIndexRef.current - 1);
    } else if (event.key === forwardKey || (interaction.orientation === "radial" && event.key === "ArrowDown")) {
      nextIndex = Math.min(lastIndex, activeIndexRef.current + 1);
    } else if ((event.key === "Enter" || event.key === " ") && interaction.onActivate) {
      event.preventDefault();
      const item = items[Math.min(activeIndexRef.current, lastIndex)];
      if (!item) return;
      try {
        interaction.onActivate(item.id);
      } catch {
        notifyError("interaction");
      }
      return;
    } else {
      return;
    }

    event.preventDefault();
    activeIndexRef.current = nextIndex;
    const item = items[nextIndex];
    setAnnouncement(item.announcement);
    try {
      instanceRef.current?.focusDatum({ seriesId: item.seriesId, dataIndex: item.dataIndex });
    } catch {
      notifyError("interaction");
    }
  };

  const classes = ["dashboard-echart", className].filter(Boolean).join(" ");
  const hasKeyboardInteraction = validKeyboardItems(props.interaction).length > 0;

  return (
    <div className={classes} data-chart-id={chartId} data-render-state={renderState}>
      <div
        ref={hostRef}
        role="img"
        aria-label={description}
        aria-describedby={`${descriptionId}${hasKeyboardInteraction ? ` ${liveId}` : ""}`}
        aria-busy={renderState === "loading"}
        tabIndex={hasKeyboardInteraction ? 0 : undefined}
        onKeyDown={handleKeyDown}
        style={{ height: `${height}px`, minWidth: 0, touchAction: "pan-y", width: "100%" }}
      />
      <span id={descriptionId} style={visuallyHidden}>{description}</span>
      {hasKeyboardInteraction ? (
        <span id={liveId} aria-live="polite" style={visuallyHidden}>
          {announcement || "Use the arrow keys, Home, or End to inspect chart values."}
        </span>
      ) : null}
      {renderState === "loading" ? <p role="status">{loadingLabel}</p> : null}
      {renderState === "error" ? (
        <div role="alert">
          <span>{errorLabel}</span>{" "}
          <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>
            Retry chart
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default DashboardEChart;
