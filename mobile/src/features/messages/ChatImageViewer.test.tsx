import { fireEvent, render } from "@testing-library/react-native";
import { Modal } from "react-native";

import { ChatImageViewer, type ChatImageViewerProps } from "./ChatImageViewer";

jest.mock("expo-status-bar", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { StatusBar: ({ style }: { style: string }) => React.createElement(View, { testID: "viewer-status-bar", accessibilityLabel: style }) };
});

function viewerProps(overrides: Partial<ChatImageViewerProps> = {}): ChatImageViewerProps {
  return {
    visible: true,
    localUri: "file:///private/lisno/image-a.png",
    loading: false,
    error: null,
    filename: "living-room.png",
    onClose: jest.fn(),
    onRetry: jest.fn(),
    ...overrides
  };
}

describe("ChatImageViewer", () => {
  it("releases its light system-icon override when the dark viewer closes", async () => {
    const view = await render(<ChatImageViewer {...viewerProps({ visible: true })} />);
    expect(view.getByTestId("viewer-status-bar", { includeHiddenElements: true }).props.accessibilityLabel).toBe("light");
    await view.rerender(<ChatImageViewer {...viewerProps({ visible: false })} />);
    expect(view.queryByTestId("viewer-status-bar", { includeHiddenElements: true })).toBeNull();
  });

  it("renders a local artifact in a dark full-screen contain viewer", async () => {
    const view = await render(<ChatImageViewer {...viewerProps()} />);
    const modal = view.container.queryAll((instance) => instance.type === "Modal")[0];
    const image = view.getByTestId("chat-image-viewer-image");

    expect(modal?.props.presentationStyle).toBe("fullScreen");
    expect(modal?.props.statusBarTranslucent).toBe(true);
    expect(modal?.props.navigationBarTranslucent).toBe(true);
    expect(image.props.resizeMode).toBe("contain");
    expect(image.props.source).toEqual({ uri: "file:///private/lisno/image-a.png" });
    expect(view.getByLabelText("Image living-room.png")).toBeTruthy();
    expect(view.queryByText("file:///private/lisno/image-a.png")).toBeNull();
  });

  it("keeps an accessible 48 dp close action wired to touch and Android Back", async () => {
    const onClose = jest.fn();
    const view = await render(<ChatImageViewer {...viewerProps({ onClose })} />);
    const close = view.getByRole("button", { name: "Close image viewer" });

    expect(close).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(close);
    view.container.queryAll((instance) => instance.type === "Modal")[0]?.props.onRequestClose();

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows a concise loading state while retaining an available preview", async () => {
    const view = await render(<ChatImageViewer {...viewerProps({ loading: true })} />);

    expect(view.getByRole("progressbar", { name: "Loading image" })).toBeTruthy();
    expect(view.getByTestId("chat-image-viewer-image")).toBeTruthy();
    expect(view.getByRole("button", { name: "Close image viewer" })).toBeTruthy();
    expect(view.queryByRole("button", { name: /Retry loading/u })).toBeNull();
  });

  it("offers retry without rendering raw errors or private artifact locations", async () => {
    const onRetry = jest.fn();
    const privateDetail = "Failed to load file:///private/lisno/tokenized-image.png?token=secret";
    const view = await render(
      <ChatImageViewer
        {...viewerProps({
          localUri: null,
          error: privateDetail,
          onRetry
        })}
      />
    );

    expect(view.getByText("Unable to display image")).toBeTruthy();
    expect(view.getByText("Try loading it again.")).toBeTruthy();
    expect(view.queryByText(privateDetail)).toBeNull();
    expect(view.queryByText(/tokenized-image|token=secret/u)).toBeNull();

    await fireEvent.press(view.getByRole("button", { name: "Retry loading living-room.png" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("presents an unavailable state without inventing a retry action", async () => {
    const view = await render(
      <ChatImageViewer
        {...viewerProps({
          localUri: null,
          error: null,
          filename: "   ",
          onRetry: undefined
        })}
      />
    );

    expect(view.getByText("Image")).toBeTruthy();
    expect(view.getByText("Unable to display image")).toBeTruthy();
    expect(view.queryByText("Retry")).toBeNull();
  });
});
