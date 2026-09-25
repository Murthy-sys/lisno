import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { EChartsSurface } from "./EChartsSurface";
import type { EChartsAdapter } from "./echartsRuntime";

jest.mock("./echartsRuntime", () => {
  const ReactActual = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    SvgChart: ReactActual.forwardRef(function MockSvgChart(
      _props: unknown,
      ref: import("react").ForwardedRef<unknown>
    ) {
      ReactActual.useImperativeHandle(ref, () => ({ elm: {} }));
      return ReactActual.createElement(View, { testID: "mock-svg-chart" });
    }),
    nativeSvgEChartsAdapter: { init: jest.fn() }
  };
});

describe("EChartsSurface failure state", () => {
  it("reports initialization failure and leaves native values as the fallback", async () => {
    const onRenderError = jest.fn();
    const adapter: EChartsAdapter = {
      init: jest.fn(() => {
        throw new Error("SVG initialization failed");
      })
    };
    const view = await render(
      <EChartsSurface
        accessibilitySummary="Dashboard values"
        adapter={adapter}
        height={220}
        onRenderError={onRenderError}
        option={{ series: [] }}
        reducedMotion={false}
        testID="surface-error"
      />
    );
    await fireEvent(view.getByTestId("surface-error"), "layout", {
      nativeEvent: { layout: { width: 300, height: 220, x: 0, y: 0 } }
    });

    expect(
      await view.findByText(
        "The analytical graphic is unavailable. Use the values below."
      )
    ).toBeTruthy();
    expect(onRenderError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "SVG initialization failed" })
    );
    expect(view.queryByTestId("mock-svg-chart")).toBeNull();
  });
});

