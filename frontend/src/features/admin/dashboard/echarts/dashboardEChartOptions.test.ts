import { describe, expect, it } from "vitest";

import {
  normalizeAccessibleText,
  prepareDashboardEChartOption,
  resolveDashboardChartTheme
} from "./dashboardEChartOptions";

describe("dashboard ECharts options", () => {
  it("passes only concrete CSS token values to option factories", () => {
    const element = document.createElement("div");
    element.style.setProperty("--chart-series-1", "rgb(1, 2, 3)");
    element.style.setProperty("--chart-grid", "rgb(4, 5, 6)");
    document.body.append(element);

    const theme = resolveDashboardChartTheme(element);
    expect(theme.series[0]).toBe("rgb(1, 2, 3)");
    expect(theme.grid).toBe("rgb(4, 5, 6)");
    expect(Object.values(theme).flat(Infinity).join(" ")).not.toContain("var(");
    element.remove();
  });

  it("confines rich-text tooltips and strips controls from the ECharts description", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const theme = resolveDashboardChartTheme(element);
    const option = prepareDashboardEChartOption({
      element,
      theme,
      description: "Project\u0000 activity\n by period",
      motionEnabled: false,
      option: {
        tooltip: { trigger: "item", renderMode: "html" },
        series: [{ id: "projects", type: "bar", data: [2] }]
      }
    }) as Record<string, unknown>;

    expect(option.tooltip).toMatchObject({ confine: true, renderMode: "richText" });
    expect(option.aria).toMatchObject({ enabled: true, description: "Project activity by period" });
    expect(option.animation).toBe(false);
    expect(normalizeAccessibleText(" A\t B ")).toBe("A B");
    element.remove();
  });

  it("applies bounded entrance and update motion centrally", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const theme = resolveDashboardChartTheme(element);
    const option = prepareDashboardEChartOption({
      element,
      theme,
      description: "Animated project activity",
      motionEnabled: true,
      option: {
        animationDuration: 10,
        animationDurationUpdate: 20,
        series: [{
          id: "projects",
          type: "line",
          animationDuration: 30,
          animationDurationUpdate: 40,
          universalTransition: true,
          data: [{ name: "2026-09-20", value: 2 }]
        }]
      }
    }) as Record<string, unknown>;

    expect(option).toMatchObject({
      animation: true,
      animationDuration: 760,
      animationDurationUpdate: 700,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicInOut",
      stateAnimation: { duration: 100, easing: "cubicOut" }
    });
    expect((option.animationDelay as (dataIndex: number) => number)(3)).toBe(72);
    expect((option.animationDelay as (dataIndex: number) => number)(100)).toBe(144);
    expect((option.animationDelayUpdate as (dataIndex: number) => number)(3)).toBe(48);
    expect((option.animationDelayUpdate as (dataIndex: number) => number)(100)).toBe(96);
    expect(option.series).toEqual([
      expect.objectContaining({
        id: "projects",
        universalTransition: true,
        animationDuration: 760,
        animationDurationUpdate: 700,
        animationEasing: "cubicOut",
        animationEasingUpdate: "cubicInOut"
      })
    ]);
    element.remove();
  });

  it("forces an immediate final state for reduced motion, including universal transitions", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const theme = resolveDashboardChartTheme(element);
    const option = prepareDashboardEChartOption({
      element,
      theme,
      description: "Reduced-motion project activity",
      motionEnabled: false,
      option: {
        animation: true,
        animationDelay: 250,
        animationDuration: 900,
        series: [{
          id: "projects",
          type: "bar",
          animation: true,
          animationDelay: 250,
          animationDuration: 900,
          universalTransition: true,
          data: [{ name: "active", value: 8 }]
        }]
      }
    }) as Record<string, unknown>;

    expect(option).toMatchObject({
      animation: false,
      animationDelay: 0,
      animationDelayUpdate: 0,
      animationDuration: 0,
      animationDurationUpdate: 0,
      stateAnimation: { duration: 0 }
    });
    expect(option.series).toEqual([
      expect.objectContaining({
        id: "projects",
        animation: false,
        animationDelay: 0,
        animationDelayUpdate: 0,
        animationDuration: 0,
        animationDurationUpdate: 0,
        universalTransition: false
      })
    ]);
    element.remove();
  });
});
