import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Modal, View } from "react-native";

import { TransferHttpError, type DownloadedArtifact } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProtectedDocumentViewer } from "./ProtectedDocumentViewer";
import type { ProtectedDocumentSource } from "./useProtectedDocument";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./PdfDocumentSurface", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View: NativeView } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    PdfDocumentSurface: ({ uri, onReady, onError }: { readonly uri: string; readonly onReady: (pageCount: number) => void; readonly onError: () => void }) =>
      React.createElement(NativeView, { testID: "protected-document-pdf", uri, onReady, onError } as React.ComponentProps<typeof NativeView>)
  };
});
jest.mock("expo-status-bar", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View: NativeView } = jest.requireActual("react-native") as typeof import("react-native");
  return { StatusBar: ({ style }: { style: string }) => React.createElement(NativeView, { testID: "viewer-status-bar", accessibilityLabel: style }) };
});

const mockDownload = jest.fn();
const transfers = { download: mockDownload };
const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const imageSource: ProtectedDocumentSource = {
  path: "/client/estimate-plan-pages/page-a/current-image",
  fileName: "first-floor.png",
  mimeType: "image/png",
  kind: "plan-page"
};
const pdfSource: ProtectedDocumentSource = {
  path: "/client/estimates/estimate-a/pdf",
  fileName: "estimate-a.pdf",
  mimeType: "application/pdf",
  kind: "estimate-pdf"
};
const designImageSource: ProtectedDocumentSource = {
  path: "/design-versions/design-a/download",
  fileName: "design.heic",
  mimeType: "image/heic",
  kind: "design-file"
};

function artifact(uri: string): DownloadedArtifact & { readonly share: jest.Mock; readonly release: jest.Mock } {
  return {
    uri,
    fileName: "synthetic-file",
    mimeType: "image/png",
    sizeBytes: 20,
    share: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined)
  };
}

let sessionGeneration = 2;
function setup() {
  useConfiguredRuntimeMock.mockImplementation(() => ({
    runtime: { transfers },
    environment: { environment: { id: "env-a" }, generation: 1 },
    session: { status: "authenticated", generation: sessionGeneration, session: { user: { id: "client-a" } } }
  } as never));
}

describe("ProtectedDocumentViewer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionGeneration = 2;
    setup();
  });

  it("shows a full-screen local image with accessible close and Android Back actions", async () => {
    const image = artifact("file:///private/page-a.png");
    mockDownload.mockReturnValue({ result: Promise.resolve(image), cancel: jest.fn() });
    const onClose = jest.fn();
    const view = await render(<ProtectedDocumentViewer visible source={imageSource} onClose={onClose} />);
    const loaded = await view.findByTestId("protected-document-image");

    expect(loaded.props.source).toEqual({ uri: image.uri });
    expect(loaded.props.resizeMode).toBe("contain");
    expect(view.getByLabelText("Image first-floor.png")).toBeTruthy();
    const modal = view.container.queryAll((instance) => instance.type === "Modal")[0];
    expect(modal?.props.presentationStyle).toBe("fullScreen");
    expect(modal?.props.statusBarTranslucent).toBe(true);
    expect(modal?.props.navigationBarTranslucent).toBe(true);
    const close = view.getByRole("button", { name: "Close document viewer" });
    expect(close).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(close);
    modal?.props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(2);
    view.unmount();
    await waitFor(() => expect(image.release).toHaveBeenCalledTimes(1));
  });

  it("lets an annotation editor use the same private local image without rendering a second image", async () => {
    const image = artifact("file:///private/page-editor.png");
    mockDownload.mockReturnValue({ result: Promise.resolve(image), cancel: jest.fn() });
    const renderImage = jest.fn((_uri: string) => <View testID="annotation-editor" />);
    const view = await render(<ProtectedDocumentViewer visible source={imageSource} onClose={jest.fn()} renderImage={renderImage} />);

    expect(await view.findByTestId("annotation-editor")).toBeTruthy();
    expect(renderImage).toHaveBeenCalledWith(image.uri);
    expect(view.queryByTestId("protected-document-image")).toBeNull();
    view.unmount();
  });

  it("renders a local PDF in the modal until Close without invoking the share sheet", async () => {
    const pdf = artifact("file:///private/estimate.pdf");
    mockDownload.mockReturnValue({ result: Promise.resolve(pdf), cancel: jest.fn() });
    const onClose = jest.fn();
    const view = await render(<ProtectedDocumentViewer visible source={pdfSource} onClose={onClose} />);

    const surface = await view.findByTestId("protected-document-pdf");
    expect(surface.props.uri).toBe(pdf.uri);
    expect(view.getByLabelText("Loading PDF")).toBeTruthy();
    expect(pdf.share).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => surface.props.onReady(3));
    expect(view.queryByLabelText("Loading PDF")).toBeNull();
    expect(pdf.release).not.toHaveBeenCalled();
    expect(view.queryByTestId("protected-document-image")).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Close document viewer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.rerender(<ProtectedDocumentViewer visible={false} source={null} onClose={onClose} />);
    await waitFor(() => expect(pdf.release).toHaveBeenCalledTimes(1));
    view.unmount();
  });

  it("ignores a superseded PDF renderer callback and releases its file", async () => {
    const first = artifact("file:///private/first.pdf");
    const second = artifact("file:///private/second.pdf");
    mockDownload.mockImplementation(({ path }: { readonly path: string }) => ({
      result: Promise.resolve(path.includes("estimate-b") ? second : first),
      cancel: jest.fn()
    }));
    const onClose = jest.fn();
    const view = await render(<ProtectedDocumentViewer visible source={pdfSource} onClose={onClose} />);
    const oldSurface = await view.findByTestId("protected-document-pdf");

    await view.rerender(<ProtectedDocumentViewer visible source={{ ...pdfSource, path: "/client/estimates/estimate-b/pdf", fileName: "estimate-b.pdf" }} onClose={onClose} />);
    await waitFor(() => expect(view.getByTestId("protected-document-pdf").props.uri).toBe(second.uri));
    await waitFor(() => expect(first.release).toHaveBeenCalledTimes(1));
    await act(async () => oldSurface.props.onError());
    expect(view.queryByText("Preview unavailable")).toBeNull();
    expect(view.getByLabelText("Loading PDF")).toBeTruthy();
    await act(async () => view.getByTestId("protected-document-pdf").props.onReady(2));
    expect(view.queryByLabelText("Loading PDF")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(first.share).not.toHaveBeenCalled();
    expect(second.share).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() => expect(second.release).toHaveBeenCalledTimes(1));
  });

  it("ignores a stale renderer callback even if a new session uses the same local URI", async () => {
    const first = artifact("file:///private/reused.pdf");
    const second = artifact("file:///private/reused.pdf");
    mockDownload
      .mockReturnValueOnce({ result: Promise.resolve(first), cancel: jest.fn() })
      .mockReturnValueOnce({ result: Promise.resolve(second), cancel: jest.fn() });
    const view = await render(<ProtectedDocumentViewer visible source={pdfSource} onClose={jest.fn()} />);
    const oldSurface = await view.findByTestId("protected-document-pdf");
    sessionGeneration += 1;
    await view.rerender(<ProtectedDocumentViewer visible source={pdfSource} onClose={jest.fn()} />);
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(first.release).toHaveBeenCalledTimes(1));
    await act(async () => oldSurface.props.onError());
    expect(view.queryByText("Preview unavailable")).toBeNull();
    await act(async () => view.getByTestId("protected-document-pdf").props.onReady(4));
    expect(view.queryByLabelText("Loading PDF")).toBeNull();
    view.unmount();
    await waitFor(() => expect(second.release).toHaveBeenCalledTimes(1));
  });

  it("shows a local PDF render error and retries with a fresh protected artifact", async () => {
    const first = artifact("file:///private/malformed.pdf");
    const second = artifact("file:///private/retry.pdf");
    mockDownload
      .mockReturnValueOnce({ result: Promise.resolve(first), cancel: jest.fn() })
      .mockReturnValueOnce({ result: Promise.resolve(second), cancel: jest.fn() });
    const view = await render(<ProtectedDocumentViewer visible source={pdfSource} onClose={jest.fn()} />);
    const surface = await view.findByTestId("protected-document-pdf");
    await act(async () => surface.props.onError());
    expect(view.getByText("Preview unavailable")).toBeTruthy();
    expect(view.getByText("This PDF could not be displayed on this device.")).toBeTruthy();
    expect(view.queryByTestId("protected-document-pdf")).toBeNull();
    expect(first.share).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Retry previewing estimate-a.pdf" }));
    await waitFor(() => expect(view.getByTestId("protected-document-pdf").props.uri).toBe(second.uri));
    await waitFor(() => expect(first.release).toHaveBeenCalledTimes(1));
    view.unmount();
    await waitFor(() => expect(second.release).toHaveBeenCalledTimes(1));
  });

  it("offers explicit Download for a design image the device cannot decode", async () => {
    const image = artifact("file:///private/design.heic");
    mockDownload.mockReturnValue({ result: Promise.resolve(image), cancel: jest.fn() });
    const onClose = jest.fn();
    const view = await render(<ProtectedDocumentViewer visible source={designImageSource} onClose={onClose} />);
    const nativeImage = await view.findByTestId("protected-document-image");
    await act(async () => nativeImage.props.onError());
    expect(view.getByText("This image could not be displayed on this device.")).toBeTruthy();
    expect(image.share).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Download design.heic" }));
    await waitFor(() => expect(image.share).toHaveBeenCalledWith({ cleanupAfterShare: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(image.release).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("keeps the modal open with a safe retry state when explicit Download fails", async () => {
    const image = artifact("file:///private/design.heic");
    image.share.mockRejectedValue(new Error("file:///private/design.heic: share failed"));
    mockDownload.mockReturnValue({ result: Promise.resolve(image), cancel: jest.fn() });
    const onClose = jest.fn();
    const view = await render(<ProtectedDocumentViewer visible source={designImageSource} onClose={onClose} />);
    const nativeImage = await view.findByTestId("protected-document-image");
    await act(async () => nativeImage.props.onError());
    await fireEvent.press(view.getByRole("button", { name: "Download design.heic" }));
    expect(await view.findByText("This document could not be downloaded. Try again.")).toBeTruthy();
    expect(view.queryByText(/file:\/\/\/private/u)).toBeNull();
    expect(view.getByRole("button", { name: "Retry opening design.heic" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(image.release).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("shows a non-spinning unsupported design-file state without automatic sharing", async () => {
    const file = artifact("file:///private/legacy.doc");
    mockDownload.mockReturnValue({ result: Promise.resolve(file), cancel: jest.fn() });
    const view = await render(<ProtectedDocumentViewer visible source={{ ...designImageSource, fileName: "legacy.doc", mimeType: "application/msword" }} onClose={jest.fn()} />);
    expect(await view.findByText("This file type cannot be previewed in the app.")).toBeTruthy();
    expect(view.queryByRole("progressbar")).toBeNull();
    expect(view.queryByTestId("protected-document-pdf")).toBeNull();
    expect(file.share).not.toHaveBeenCalled();
    expect(view.getByRole("button", { name: "Download legacy.doc" })).toBeTruthy();
    view.unmount();
    await waitFor(() => expect(file.release).toHaveBeenCalledTimes(1));
  });

  it("shows a non-disclosing denied state with retry when a protected image is refused", async () => {
    mockDownload.mockReturnValue({
      result: Promise.reject(new TransferHttpError(403, "FORBIDDEN", "private token and file:///private/plan.png")),
      cancel: jest.fn()
    });
    const view = await render(<ProtectedDocumentViewer visible source={imageSource} onClose={jest.fn()} />);

    expect(await view.findByText("You do not have access to this document.")).toBeTruthy();
    expect(view.queryByText(/private token|file:\/\/\/private/u)).toBeNull();
    expect(view.getByRole("button", { name: "Retry opening first-floor.png" })).toBeTruthy();
    view.unmount();
  });
});
