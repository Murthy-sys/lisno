import { describe, expect, it, vi } from "vitest";

import {
  createCapitalFlowSceneOption,
  createRatioPathSceneOption,
  createSpatialNodeSceneOption,
  createTemporalRibbonSceneOption,
  topLevelSeriesAreSpatial
} from "./spatialScenes";
import type { DashboardChartTheme } from "./types";

const theme: DashboardChartTheme = {
  series: ["#6047dc", "#20c8bd", "#f3b629", "#e56570"],
  ordinal: ["#b3a8f1", "#9c8dec", "#8574e6", "#6f5ce0"],
  status: { good: "#26aa7b", warning: "#d89b2b", serious: "#dc6c35", critical: "#df5267", neutral: "#8b86a1" },
  text: "#17122f",
  mutedText: "#706a82",
  grid: "#ded9eb",
  track: "#ece8f4",
  surface: "#ffffff",
  spatial: { field: "#17122f", plane: "#312951", line: "#736aa0", text: "#f7f4ff", muted: "#bbb4d1", gold: "#f4c84b", cyan: "#29d5c6" }
};

const renderApi = {
  getWidth: () => 640,
  getHeight: () => 320,
  font: () => "10px sans-serif"
};

const firstSeries = (option: unknown) => (option as { series: Array<Record<string, unknown>> }).series[0];

describe("dashboard spatial scenes", () => {
  it("emits custom series for every spatial family", () => {
    const options = [
      createSpatialNodeSceneOption({
        sceneId: "nodes",
        layout: "constellation",
        nodes: [{ key: "projects", label: "Projects", value: 4, displayValue: "4" }],
        theme
      }),
      createTemporalRibbonSceneOption({
        sceneId: "time",
        labels: ["Day 1", "Day 2"],
        keys: ["2026-09-01", "2026-09-02"],
        series: [{ key: "created", label: "Created", values: [1, 2], displayValues: ["1", "2"] }],
        theme
      }),
      createCapitalFlowSceneOption({
        sceneId: "capital",
        flows: [
          { key: "source", label: "Source", value: 100, displayValue: "₹1.00", fromKey: null },
          { key: "outflow", label: "Outflow", value: 40, displayValue: "₹0.40", fromKey: "source" }
        ],
        theme
      }),
      createRatioPathSceneOption({ sceneId: "ratio", label: "Progress", share: 0.5, displayValue: "50%", status: "good", theme })
    ];
    expect(options.every(topLevelSeriesAreSpatial)).toBe(true);
    expect(options.flatMap((option) => (option as { series: Array<{ type: string }> }).series).every((series) => series.type === "custom")).toBe(true);
  });

  it("renders zero financial outcomes as endpoint anchors without a quantitative ribbon", () => {
    const option = createCapitalFlowSceneOption({
      sceneId: "capital",
      flows: [
        { key: "budget", label: "Budget", value: 100, displayValue: "₹1.00", fromKey: null },
        { key: "remaining", label: "Remaining", value: 0, displayValue: "₹0.00", fromKey: "budget" }
      ],
      theme
    });
    const renderItem = firstSeries(option).renderItem as (params: unknown, api: unknown) => { children: Array<{ name?: string }> };
    const result = renderItem({ dataIndex: 1 }, renderApi);
    expect(result.children.some((child) => child.name?.endsWith("--ribbon"))).toBe(false);
    expect(result.children.some((child) => child.name?.endsWith("--node"))).toBe(true);
  });

  it("splits unavailable temporal buckets and keeps a distinct gap anchor", () => {
    const option = createTemporalRibbonSceneOption({
      sceneId: "time",
      labels: ["Day 1", "Day 2", "Day 3"],
      keys: ["one", "two", "three"],
      series: [{ key: "created", label: "Created", values: [1, null, 3], displayValues: ["1", "Not available", "3"] }],
      theme
    });
    const renderItem = firstSeries(option).renderItem as (params: unknown, api: unknown) => { children: Array<{ name?: string }> };
    const gap = renderItem({ dataIndex: 1 }, renderApi);
    expect(gap.children.some((child) => child.name?.endsWith("--gap-anchor"))).toBe(true);
    expect(gap.children.some((child) => child.name?.endsWith("--facet-top"))).toBe(false);
  });

  it("places verified temporal zero on the floor while keeping it available", () => {
    const option = createTemporalRibbonSceneOption({
      sceneId: "time",
      labels: ["Day 1"],
      keys: ["one"],
      series: [{ key: "created", label: "Created", values: [0], displayValues: ["0"] }],
      theme
    });
    const renderItem = firstSeries(option).renderItem as (params: unknown, api: unknown) => {
      children: Array<{ name?: string; shape?: Record<string, number> }>;
    };
    const result = renderItem({ dataIndex: 0 }, renderApi);
    const guide = result.children.find((child) => child.name?.endsWith("--height-guide"));
    const vertex = result.children.find((child) => child.name?.endsWith("--vertex"));
    expect(vertex?.shape?.cy).toBe(guide?.shape?.y1);
    expect(vertex?.shape?.cy).toBe(guide?.shape?.y2);
    expect(result.children.some((child) => child.name?.endsWith("--gap-anchor"))).toBe(false);
  });

  it("distinguishes verified zero and unavailable anchors and attaches satellites to their declared core", () => {
    const option = createSpatialNodeSceneOption({
      sceneId: "capacity",
      layout: "constellation",
      connect: true,
      nodes: [
        { key: "core", label: "Core", value: 4, displayValue: "4", fromKey: null },
        { key: "zero", label: "Verified zero", value: 0, displayValue: "0", fromKey: "core" },
        { key: "missing", label: "Unavailable", value: null, displayValue: "Not available", available: false, fromKey: "core" }
      ],
      theme
    });
    const renderItem = firstSeries(option).renderItem as (params: unknown, api: unknown) => {
      children: Array<{ name?: string; shape?: Record<string, number> }>;
    };
    const zero = renderItem({ dataIndex: 1 }, renderApi);
    const missing = renderItem({ dataIndex: 2 }, renderApi);
    const zeroGuide = zero.children.find((child) => child.name?.endsWith("--sequence-guide"));
    const missingGuide = missing.children.find((child) => child.name?.endsWith("--sequence-guide"));
    expect(zero.children.some((child) => child.name?.endsWith("--unavailable-slash"))).toBe(false);
    expect(missing.children.some((child) => child.name?.endsWith("--unavailable-slash"))).toBe(true);
    expect({ x1: zeroGuide?.shape?.x1, y1: zeroGuide?.shape?.y1 })
      .toEqual({ x1: missingGuide?.shape?.x1, y1: missingGuide?.shape?.y1 });
  });

  it("keeps equal current and previous counts equal in screen-space area across depth lanes", () => {
    const option = createSpatialNodeSceneOption({
      sceneId: "comparison",
      layout: "constellation",
      nodes: [
        { key: "projects-current", metricKey: "projects.created", label: "Projects · Current", value: 9, displayValue: "9", lane: "current" },
        { key: "projects-previous", metricKey: "projects.created", label: "Projects · Previous", value: 9, displayValue: "9", lane: "previous" }
      ],
      theme
    });
    const renderItem = firstSeries(option).renderItem as (params: unknown, api: unknown) => {
      children: Array<{ name?: string; shape?: Record<string, number> }>;
    };
    const current = renderItem({ dataIndex: 0 }, renderApi);
    const previous = renderItem({ dataIndex: 1 }, renderApi);
    const currentOrb = current.children.find((child) => child.name?.endsWith("--orb"));
    const previousOrb = previous.children.find((child) => child.name?.endsWith("--orb"));
    expect(currentOrb?.shape?.r).toBe(previousOrb?.shape?.r);
  });

  it("keeps current constellation and temporal geometry fixed when comparison hides", () => {
    const currentNode = { key: "projects-current", metricKey: "projects.created", label: "Projects · Current", value: 2, displayValue: "2", lane: "current" as const };
    const previousNode = { key: "projects-previous", metricKey: "projects.created", label: "Projects · Previous", value: 20, displayValue: "20", lane: "previous" as const };
    const pairedNodes = createSpatialNodeSceneOption({
      sceneId: "comparison",
      layout: "constellation",
      nodes: [currentNode, previousNode],
      theme,
      domainMaximum: 20
    });
    const currentOnlyNodes = createSpatialNodeSceneOption({
      sceneId: "comparison",
      layout: "constellation",
      nodes: [currentNode],
      theme,
      domainMaximum: 20
    });
    const pairedNodeRender = firstSeries(pairedNodes).renderItem as (params: unknown, api: unknown) => {
      children: Array<{ name?: string; shape?: Record<string, number> }>;
    };
    const currentNodeRender = firstSeries(currentOnlyNodes).renderItem as typeof pairedNodeRender;
    const pairedOrb = pairedNodeRender({ dataIndex: 0 }, renderApi).children.find((child) => child.name?.endsWith("--orb"));
    const currentOrb = currentNodeRender({ dataIndex: 0 }, renderApi).children.find((child) => child.name?.endsWith("--orb"));
    expect({ cx: currentOrb?.shape?.cx, cy: currentOrb?.shape?.cy, r: currentOrb?.shape?.r })
      .toEqual({ cx: pairedOrb?.shape?.cx, cy: pairedOrb?.shape?.cy, r: pairedOrb?.shape?.r });

    const currentSeries = { key: "current-period", label: "Current", values: [2], displayValues: ["2"], depth: -0.5 };
    const pairedRibbon = createTemporalRibbonSceneOption({
      sceneId: "time",
      labels: ["Day 1"],
      keys: ["2026-09-01"],
      series: [currentSeries, { key: "previous-period", label: "Previous", values: [20], displayValues: ["20"], depth: 0.5 }],
      theme,
      domainMaximum: 20
    }) as { series: Array<Record<string, unknown>> };
    const currentOnlyRibbon = createTemporalRibbonSceneOption({
      sceneId: "time",
      labels: ["Day 1"],
      keys: ["2026-09-01"],
      series: [currentSeries],
      theme,
      domainMaximum: 20
    }) as { series: Array<Record<string, unknown>> };
    const pairedRibbonRender = pairedRibbon.series[0].renderItem as typeof pairedNodeRender;
    const currentRibbonRender = currentOnlyRibbon.series[0].renderItem as typeof pairedNodeRender;
    const pairedVertex = pairedRibbonRender({ dataIndex: 0 }, renderApi).children.find((child) => child.name?.endsWith("--vertex"));
    const currentVertex = currentRibbonRender({ dataIndex: 0 }, renderApi).children.find((child) => child.name?.endsWith("--vertex"));
    expect({ cx: currentVertex?.shape?.cx, cy: currentVertex?.shape?.cy })
      .toEqual({ cx: pairedVertex?.shape?.cx, cy: pairedVertex?.shape?.cy });
  });

  it("keeps render functions deterministic for an identical viewport", () => {
    const option = createSpatialNodeSceneOption({
      sceneId: "risk",
      layout: "risk",
      nodes: [{ key: "red", label: "Red risk", value: 2, displayValue: "2", status: "critical" }],
      theme
    });
    const renderItem = firstSeries(option).renderItem as (params: unknown, api: unknown) => unknown;
    expect(renderItem({ dataIndex: 0 }, renderApi)).toEqual(renderItem({ dataIndex: 0 }, renderApi));
    expect(vi.isMockFunction(renderItem)).toBe(false);
  });
});
