import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from "echarts/charts";
import type {
  AriaComponentOption,
  DatasetComponentOption,
  GridComponentOption,
  TooltipComponentOption
} from "echarts/components";
import type { ComposeOption } from "echarts/core";

export type DashboardEChartOption = ComposeOption<
  | AriaComponentOption
  | BarSeriesOption
  | DatasetComponentOption
  | GridComponentOption
  | LineSeriesOption
  | PieSeriesOption
  | TooltipComponentOption
>;

export interface DashboardChartTheme {
  series: readonly string[];
  ordinal: readonly string[];
  status: Readonly<{
    good: string;
    warning: string;
    serious: string;
    critical: string;
    neutral: string;
  }>;
  text: string;
  mutedText: string;
  grid: string;
  track: string;
  surface: string;
}

export interface DashboardChartKeyboardItem {
  id: string;
  seriesId: string;
  dataIndex: number;
  announcement: string;
}

export interface DashboardChartInteraction {
  orientation: "horizontal" | "vertical" | "radial";
  items: readonly DashboardChartKeyboardItem[];
  onActivate?: (datumId: string) => void;
}

export interface DashboardChartRenderError {
  phase: "load" | "initialize" | "option" | "resize" | "interaction";
  message: string;
}

export interface DashboardEChartProps {
  chartId: string;
  height: number;
  description: string;
  createOption: (theme: Readonly<DashboardChartTheme>) => DashboardEChartOption;
  motion?: "respect-user-preference" | "disabled";
  interaction?: DashboardChartInteraction;
  onRenderError?: (error: DashboardChartRenderError) => void;
  className?: string;
  loadingLabel?: string;
  errorLabel?: string;
}
