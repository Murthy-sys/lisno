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
});
