import SvgChart, { SVGRenderer } from "@wuba/react-native-echarts/svgChart";
import { BarChart, CustomChart, LineChart, PieChart } from "echarts/charts";
import {
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import * as echarts from "echarts/core";
import type { EChartsType } from "echarts/core";

echarts.use([
  SVGRenderer,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  LabelLayout,
  UniversalTransition,
  BarChart,
  LineChart,
  PieChart,
  CustomChart
]);

export { SvgChart };

export interface EChartsSurfaceInstance {
  setOption(
    option: Parameters<EChartsType["setOption"]>[0],
    options?: Parameters<EChartsType["setOption"]>[1]
  ): void;
  resize(options?: Parameters<EChartsType["resize"]>[0]): void;
  on(eventName: string, handler: (event: unknown) => void): void;
  off(eventName: string, handler?: (event: unknown) => void): void;
  getZr(): EChartsType["getZr"] extends () => infer ZRender ? ZRender : never;
  dispose(): void;
  isDisposed(): boolean;
}

export interface EChartsAdapter {
  init(root: unknown, width: number, height: number): EChartsSurfaceInstance;
}

export const nativeSvgEChartsAdapter: EChartsAdapter = {
  init(root, width, height) {
    return echarts.init(root as never, undefined, {
      renderer: "svg",
      width,
      height,
      devicePixelRatio: 1
    }) as EChartsSurfaceInstance;
  }
};
