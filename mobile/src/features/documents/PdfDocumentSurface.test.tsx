import { act, render } from "@testing-library/react-native";

import { PDF_LOAD_TIMEOUT_MS, PdfDocumentSurface } from "./PdfDocumentSurface";

jest.mock("@kishannareshpal/expo-pdf", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { PdfView: (props: Record<string, unknown>) => React.createElement(View, { ...props, testID: "native-pdf" }) };
});

describe("PdfDocumentSurface", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("turns a missing native completion callback into a safe failure", async () => {
    const onReady = jest.fn();
    const onError = jest.fn();
    const view = await render(<PdfDocumentSurface uri="file:///private/synthetic.pdf" onReady={onReady} onError={onError} />);

    await act(async () => jest.advanceTimersByTime(PDF_LOAD_TIMEOUT_MS));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
    act(() => view.getByTestId("native-pdf").props.onLoadComplete({ pageCount: 2 }));
    expect(onReady).not.toHaveBeenCalled();
    await view.unmount();
  });
});
