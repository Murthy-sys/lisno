import type { DashboardChartTheme, DashboardEChartOption } from "./types";

const SERIES_FALLBACKS = [
  "#5a45d6",
  "#eb6834",
  "#1391a8",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#2a6fc4",
  "#e34948"
] as const;

const ORDINAL_FALLBACKS = [
  "#b3a8f1",
  "#9c8dec",
  "#8574e6",
  "#6f5ce0",
  "#5a45d6",
  "#4b39b4"
] as const;

const ENTRANCE_DURATION_MS = 760;
const UPDATE_DURATION_MS = 700;
const STATE_DURATION_MS = 100;
const ENTRANCE_STAGGER_MS = 24;
const UPDATE_STAGGER_MS = 16;
const MAX_ENTRANCE_STAGGER_MS = 144;
const MAX_UPDATE_STAGGER_MS = 96;

const cappedDelay = (step: number, maximum: number) => (dataIndex: number) =>
  Math.min(Math.max(0, dataIndex) * step, maximum);

const applySeriesMotionPolicy = (series: unknown, motionEnabled: boolean): unknown => {
  if (Array.isArray(series)) {
    return series.map((entry) => applySeriesMotionPolicy(entry, motionEnabled));
  }
  if (typeof series !== "object" || series === null) return series;

  const candidate = series as Record<string, unknown>;
  if (!motionEnabled) {
    return {
      ...candidate,
      animation: false,
      animationDelay: 0,
      animationDelayUpdate: 0,
      animationDuration: 0,
      animationDurationUpdate: 0,
      universalTransition: false
    };
  }

  return {
    ...candidate,
    animation: true,
    animationDelay: cappedDelay(ENTRANCE_STAGGER_MS, MAX_ENTRANCE_STAGGER_MS),
    animationDelayUpdate: cappedDelay(UPDATE_STAGGER_MS, MAX_UPDATE_STAGGER_MS),
    animationDuration: ENTRANCE_DURATION_MS,
    animationDurationUpdate: UPDATE_DURATION_MS,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicInOut"
  };
};

const readToken = (styles: CSSStyleDeclaration, token: string, fallback: string) =>
  styles.getPropertyValue(token).trim() || fallback;

const computedStyleFor = (element: HTMLElement) => {
  const view = element.ownerDocument.defaultView;
  return view ? view.getComputedStyle(element) : getComputedStyle(element);
};

export const resolveDashboardChartTheme = (element: HTMLElement): DashboardChartTheme => {
  const styles = computedStyleFor(element);
  return {
    series: SERIES_FALLBACKS.map((fallback, index) =>
      readToken(styles, `--chart-series-${index + 1}`, fallback)
    ),
    ordinal: ORDINAL_FALLBACKS.map((fallback, index) =>
      readToken(styles, `--chart-ordinal-${index + 1}`, fallback)
    ),
    status: {
      good: readToken(styles, "--chart-status-good", "#18795c"),
      warning: readToken(styles, "--chart-status-warning", "#c98a10"),
      serious: readToken(styles, "--chart-status-serious", "#c2620f"),
      critical: readToken(styles, "--chart-status-critical", "#b33a4a"),
      neutral: readToken(styles, "--chart-status-neutral", "#98a0b3")
    },
    text: readToken(styles, "--color-text", "#171b2d"),
    mutedText: readToken(styles, "--color-text-muted", "#626a7d"),
    grid: readToken(styles, "--chart-grid", "#e7eaf2"),
    track: readToken(styles, "--chart-track", "#eceef5"),
    surface: readToken(styles, "--chart-surface", "#ffffff")
  };
};

export const normalizeAccessibleText = (value: string) =>
  value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1_000);

const safeTooltip = (tooltip: unknown): unknown => {
  if (Array.isArray(tooltip)) {
    return tooltip.map((entry) => safeTooltip(entry));
  }
  if (typeof tooltip !== "object" || tooltip === null) return tooltip;
  return { ...tooltip, confine: true, renderMode: "richText" };
};

export const prepareDashboardEChartOption = ({
  element,
  option,
  theme,
  description,
  motionEnabled
}: {
  element: HTMLElement;
  option: DashboardEChartOption;
  theme: Readonly<DashboardChartTheme>;
  description: string;
  motionEnabled: boolean;
}): DashboardEChartOption => {
  const styles = computedStyleFor(element);
  const raw = option as DashboardEChartOption & Record<string, unknown>;
  const rawAria = typeof raw.aria === "object" && raw.aria !== null ? raw.aria : {};
  const tooltip = raw.tooltip === undefined ? undefined : safeTooltip(raw.tooltip);
  const series = raw.series === undefined
    ? undefined
    : applySeriesMotionPolicy(raw.series, motionEnabled);

  return {
    ...raw,
    ...(tooltip === undefined ? {} : { tooltip }),
    ...(series === undefined ? {} : { series }),
    aria: {
      ...rawAria,
      enabled: true,
      description: normalizeAccessibleText(description)
    },
    color: [...theme.series],
    textStyle: {
      color: theme.text,
      fontFamily: readToken(styles, "--font-interface", "Poppins, sans-serif")
    },
    animation: motionEnabled,
    animationDelay: motionEnabled
      ? cappedDelay(ENTRANCE_STAGGER_MS, MAX_ENTRANCE_STAGGER_MS)
      : 0,
    animationDelayUpdate: motionEnabled
      ? cappedDelay(UPDATE_STAGGER_MS, MAX_UPDATE_STAGGER_MS)
      : 0,
    animationDuration: motionEnabled ? ENTRANCE_DURATION_MS : 0,
    animationDurationUpdate: motionEnabled ? UPDATE_DURATION_MS : 0,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicInOut",
    stateAnimation: {
      duration: motionEnabled ? STATE_DURATION_MS : 0,
      easing: "cubicOut"
    }
  } as DashboardEChartOption;
};
