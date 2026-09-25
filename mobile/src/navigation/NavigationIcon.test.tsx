import { render, type RenderResult } from "@testing-library/react-native";
import { View } from "react-native";

import { NavigationIcon, RootTabIcon } from "./NavigationIcon";
import type { RootTab } from "./registry";

type HostNode = { readonly type?: unknown; readonly props?: Record<string, unknown>; readonly children?: readonly unknown[] };

function svgProps(view: RenderResult): Record<string, unknown> {
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const host = node as HostNode;
    if (host.type === "RNSVGSvgView" && host.props) found.push(host.props);
    host.children?.forEach(walk);
  };
  walk(view.getByTestId("icon-host", { includeHiddenElements: true }));
  expect(found).toHaveLength(1);
  return found[0]!;
}

const moreTab: RootTab = { id: "more", label: "More", destination: null };

describe("NavigationIcon", () => {
  it("renders at 24pt by default on a 24-unit viewBox", async () => {
    const view = await render(<View testID="icon-host"><NavigationIcon name="home" color="#000" /></View>);
    const props = svgProps(view);
    expect(props.width).toBe(24);
    expect(props.height).toBe(24);
    expect(props.vbWidth).toBe(24);
    expect(props.vbHeight).toBe(24);
  });

  it("renders at the requested size while keeping the 24-unit viewBox", async () => {
    const view = await render(<View testID="icon-host"><NavigationIcon name="home" color="#000" size={20} /></View>);
    const props = svgProps(view);
    expect(props.width).toBe(20);
    expect(props.height).toBe(20);
    expect(props.vbWidth).toBe(24);
    expect(props.vbHeight).toBe(24);
  });

  it("passes the size through RootTabIcon and keeps 24 as its default", async () => {
    const sized = await render(<View testID="icon-host"><RootTabIcon tab={moreTab} color="#000" selected size={20} /></View>);
    expect(svgProps(sized).width).toBe(20);
    expect(svgProps(sized).height).toBe(20);
    const defaulted = await render(<View testID="icon-host"><RootTabIcon tab={moreTab} color="#000" selected={false} /></View>);
    expect(svgProps(defaulted).width).toBe(24);
    expect(svgProps(defaulted).height).toBe(24);
  });

  it.each(["person", "sign-out"] as const)("renders the %s glyph with its stroke from color, hidden from screen readers", async (name) => {
    const view = await render(<View testID="icon-host"><NavigationIcon name={name} color="#123456" size={20} /></View>);
    const props = svgProps(view);
    expect(props.width).toBe(20);
    expect(props.vbWidth).toBe(24);
    expect(props.stroke).toBe("#123456");
    expect(props.accessible).toBe(false);
    expect(props.accessibilityElementsHidden).toBe(true);
    expect(props.importantForAccessibility).toBe("no-hide-descendants");
    expect(view.queryAllByRole("image")).toHaveLength(0);
  });

  it("renders the redesigned notifications bell path, hidden from screen readers", async () => {
    const view = await render(<View testID="icon-host"><NavigationIcon name="notifications" color="#123456" size={20} /></View>);
    const props = svgProps(view);
    expect(props.accessible).toBe(false);
    expect(props.accessibilityElementsHidden).toBe(true);
    expect(props.importantForAccessibility).toBe("no-hide-descendants");
    expect(view.queryAllByRole("image")).toHaveLength(0);
    const paths: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const host = node as HostNode;
      if (host.type === "RNSVGPath" && typeof host.props?.d === "string") paths.push(host.props.d);
      host.children?.forEach(walk);
    };
    walk(view.getByTestId("icon-host", { includeHiddenElements: true }));
    expect(paths).toEqual(["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"]);
    expect(paths[0]).not.toContain("M11 3h2");
  });

  it.each([
    ["chat", "M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-1-2V6a2 2 0 0 1 2-2Z"],
    ["chevron", "M9 6l6 6-6 6"],
  ] as const)("renders the %s glyph path with its stroke from color, hidden from screen readers", async (name, d) => {
    const view = await render(<View testID="icon-host"><NavigationIcon name={name} color="#123456" size={20} /></View>);
    const props = svgProps(view);
    expect(props.width).toBe(20);
    expect(props.vbWidth).toBe(24);
    expect(props.stroke).toBe("#123456");
    expect(props.accessible).toBe(false);
    expect(props.accessibilityElementsHidden).toBe(true);
    expect(props.importantForAccessibility).toBe("no-hide-descendants");
    expect(view.queryAllByRole("image")).toHaveLength(0);
    const paths: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const host = node as HostNode;
      if (host.type === "RNSVGPath" && typeof host.props?.d === "string") paths.push(host.props.d);
      host.children?.forEach(walk);
    };
    walk(view.getByTestId("icon-host", { includeHiddenElements: true }));
    expect(paths).toEqual([d]);
  });
});
