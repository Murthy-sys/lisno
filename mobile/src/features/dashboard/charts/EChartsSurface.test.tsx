import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { EChartsSurface } from "./EChartsSurface";
import type {
  EChartsAdapter,
  EChartsSurfaceInstance
} from "./echartsRuntime";

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
    nativeSvgEChartsAdapter: {
      init: jest.fn(() => {
        throw new Error("Default adapter must be replaced in this test.");
      })
    }
  };
});

function fakeChart() {
  const animation = { start: jest.fn(), stop: jest.fn() };
  const instance = {
    setOption: jest.fn(),
    resize: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    getZr: jest.fn(() => ({ animation })),
    dispose: jest.fn(),
    isDisposed: jest.fn(() => false)
  } as unknown as EChartsSurfaceInstance;
  return { instance, animation };
}

const initialOption = {
  animation: true,
  series: [{ id: "stable-series", name: "Stable", type: "line", data: [1, 2] }]
};

describe("EChartsSurface lifecycle", () => {
  it("retains one instance across updates, pauses in background, and cleans up", async () => {
    const { instance, animation } = fakeChart();
    const adapter: EChartsAdapter = { init: jest.fn(() => instance) };
    const onSelectDatum = jest.fn();
    let appStateListener: ((state: AppStateStatus) => void) | null = null;
    const removeAppStateListener = jest.fn();
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, listener) => {
        appStateListener = listener;
        return { remove: removeAppStateListener };
      });

    const view = await render(
      <EChartsSurface
        accessibilitySummary="Dashboard values"
        adapter={adapter}
        height={240}
        onSelectDatum={onSelectDatum}
        option={initialOption}
        reducedMotion={false}
        testID="surface"
      />
    );
    await fireEvent(view.getByTestId("surface"), "layout", {
      nativeEvent: { layout: { width: 320, height: 240, x: 0, y: 0 } }
    });

    await waitFor(() => expect(adapter.init).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(instance.setOption).toHaveBeenCalledTimes(1));
    expect(instance.setOption).toHaveBeenLastCalledWith(
      expect.objectContaining({
        animation: true,
        animationDuration: 500,
        animationDurationUpdate: 380
      }),
      expect.not.objectContaining({ replaceMerge: expect.anything() })
    );
    expect(instance.on).toHaveBeenCalledWith("click", expect.any(Function));
    const clickHandler = (instance.on as jest.Mock).mock.calls[0]?.[1] as
      | ((event: unknown) => void)
      | undefined;
    await act(async () =>
      clickHandler?.({
        seriesId: "stable-series",
        data: { id: "render-id", name: "projects_created" }
      })
    );
    expect(onSelectDatum).toHaveBeenCalledWith({
      id: "projects_created",
      seriesId: "stable-series"
    });

    await view.rerender(
      <EChartsSurface
        accessibilitySummary="Dashboard values"
        adapter={adapter}
        height={240}
        onSelectDatum={onSelectDatum}
        option={{ ...initialOption, series: [{ ...initialOption.series[0], data: [3, 5] }] }}
        reducedMotion
        testID="surface"
      />
    );
    await waitFor(() => expect(instance.setOption).toHaveBeenCalledTimes(2));
    expect(adapter.init).toHaveBeenCalledTimes(1);
    expect(instance.setOption).toHaveBeenLastCalledWith(
      expect.objectContaining({
        animation: false,
        animationDuration: 0,
        animationDurationUpdate: 0
      }),
      expect.any(Object)
    );

    await act(async () => appStateListener?.("background"));
    expect(animation.stop).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.("active"));
    expect(animation.start).toHaveBeenCalledTimes(1);
    expect(instance.resize).toHaveBeenCalled();

    await view.unmount();
    expect(instance.off).toHaveBeenCalledWith("click");
    expect(instance.dispose).toHaveBeenCalledTimes(1);
    expect(removeAppStateListener).toHaveBeenCalled();
    appStateSpy.mockRestore();
  });

});
