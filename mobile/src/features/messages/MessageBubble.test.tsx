import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { PanResponder, StyleSheet } from "react-native";

import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { TransferHttpError } from "../../platform/files";
import type { PresentedMessage, PresentedMessageTimelineItem } from "./chatModel";
import { MessageBubble } from "./MessageBubble";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const useRuntimeMock = jest.mocked(useConfiguredRuntime);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((ready) => { resolve = ready; });
  return { promise, resolve };
}

function message(overrides: Partial<PresentedMessage> = {}): PresentedMessage {
  return {
    id: "message-a",
    projectId: "project-a",
    body: "The drawing is ready for review.",
    author: "Aditi Rao",
    authorId: "user-aditi",
    authorRole: "designer",
    authorIdentity: { id: "user-aditi", name: "Aditi Rao", role: "designer" },
    createdAt: "2026-09-18T10:00:00.000Z",
    sequence: 3,
    clientMessageId: "client-a",
    priority: "normal",
    version: 1,
    issueStatus: null,
    replyTo: null,
    attachments: [],
    capabilities: { canRaise: true, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false },
    ...overrides
  };
}

function item(value: PresentedMessage, own: boolean): PresentedMessageTimelineItem {
  return {
    message: value,
    own,
    startsGroup: true,
    showAuthor: !own,
    showDateSeparator: true,
    showUnreadSeparator: false,
    dayKey: "2026-09-18"
  };
}

function gesture(overrides: Record<string, number> = {}) {
  return {
    stateID: 1,
    moveX: 0,
    moveY: 0,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    numberActiveTouches: 1,
    _accountsForMovesUpTo: 0,
    ...overrides
  };
}

function animatedValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "__getValue" in value) {
    return (value as { readonly __getValue: () => number }).__getValue();
  }
  throw new Error("Expected an animated numeric value.");
}

function opacityOf(instance: { readonly props: { readonly style?: unknown } }): number {
  const style = StyleSheet.flatten(instance.props.style as never) as { readonly opacity?: unknown };
  return animatedValue(style.opacity);
}

function translationOf(instance: { readonly props: { readonly style?: unknown } }): number {
  const style = StyleSheet.flatten(instance.props.style as never) as {
    readonly transform?: readonly [{ readonly translateX?: unknown }];
  };
  return animatedValue(style.transform?.[0].translateX);
}

describe("MessageBubble", () => {
  let panResponderCreate: jest.SpyInstance;

  beforeAll(() => {
    panResponderCreate = jest.spyOn(PanResponder, "create").mockImplementation((handlers) => ({
      panHandlers: {
        onStartShouldSetResponder: handlers.onStartShouldSetPanResponder,
        onMoveShouldSetResponder: handlers.onMoveShouldSetPanResponder,
        onStartShouldSetResponderCapture: handlers.onStartShouldSetPanResponderCapture,
        onMoveShouldSetResponderCapture: handlers.onMoveShouldSetPanResponderCapture,
        onResponderGrant: handlers.onPanResponderGrant,
        onResponderMove: handlers.onPanResponderMove,
        onResponderRelease: handlers.onPanResponderRelease,
        onResponderTerminate: handlers.onPanResponderTerminate,
        onResponderReject: handlers.onPanResponderReject,
        onResponderTerminationRequest: handlers.onPanResponderTerminationRequest,
        onShouldBlockNativeResponder: handlers.onShouldBlockNativeResponder
      },
      getInteractionHandle: () => null
    } as unknown as ReturnType<typeof PanResponder.create>));
  });

  afterAll(() => panResponderCreate.mockRestore());

  beforeEach(() => {
    useRuntimeMock.mockReturnValue({
      runtime: {
        transfers: { download: jest.fn() },
        audio: {
          play: jest.fn(),
          pause: jest.fn(),
          stopPlayback: jest.fn(),
          subscribePlaybackEvents: jest.fn(() => jest.fn())
        }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
  });

  it("shows grouped incoming identity and exposes tap and long-press actions", async () => {
    const onOpenActions = jest.fn();
    const view = await render(<MessageBubble item={item(message(), false)} compact onDenied={jest.fn()} onOpenActions={onOpenActions} />);

    expect(view.getByText("Aditi Rao")).toBeTruthy();
    expect(view.queryByText(/Sent/)).toBeNull();
    expect(view.queryByText("⌄")).toBeNull();
    const bubble = view.getByTestId("message-bubble-message-a");
    await fireEvent.press(bubble);
    await fireEvent(bubble, "longPress");
    expect(onOpenActions).toHaveBeenCalledTimes(2);
  });

  it("commits swipe reply once in either horizontal direction and reveals the matching indicator", async () => {
    const onReply = jest.fn();
    const view = await render(
      <MessageBubble
        item={item(message(), false)}
        compact
        onDenied={jest.fn()}
        onOpenActions={jest.fn()}
        onReply={onReply}
        reducedMotion
      />
    );
    const surface = view.getByTestId("message-swipe-message-a");
    const translation = view.getByTestId("message-translation-message-a");
    const left = view.getByTestId("reply-indicator-left-message-a", { includeHiddenElements: true });
    const right = view.getByTestId("reply-indicator-right-message-a", { includeHiddenElements: true });

    expect(surface.props.onMoveShouldSetResponder({}, gesture({ dx: 60, dy: 4 }))).toBe(true);
    await act(async () => {
      surface.props.onResponderGrant({}, gesture({ dx: 60, dy: 4 }));
      surface.props.onResponderMove({}, gesture({ dx: 60, dy: 4 }));
    });
    expect(translationOf(translation)).toBe(60);
    expect(opacityOf(left)).toBe(1);
    expect(opacityOf(right)).toBe(0);
    await act(async () => surface.props.onResponderRelease({}, gesture({ dx: 60, dy: 4 })));
    await act(async () => surface.props.onResponderRelease({}, gesture({ dx: 60, dy: 4 })));
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(translationOf(translation)).toBe(0);

    await act(async () => {
      surface.props.onResponderGrant({}, gesture({ dx: -60, dy: 3 }));
      surface.props.onResponderMove({}, gesture({ dx: -60, dy: 3 }));
    });
    expect(translationOf(translation)).toBe(-60);
    expect(opacityOf(left)).toBe(0);
    expect(opacityOf(right)).toBe(1);
    await act(async () => surface.props.onResponderRelease({}, gesture({ dx: -60, dy: 3 })));
    expect(onReply).toHaveBeenCalledTimes(2);
  });

  it("leaves short and vertical movement to scrolling and resets terminated gestures", async () => {
    const onReply = jest.fn();
    const view = await render(
      <MessageBubble item={item(message(), false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} onReply={onReply} reducedMotion />
    );
    const surface = view.getByTestId("message-swipe-message-a");
    const translation = view.getByTestId("message-translation-message-a");

    expect(surface.props.onMoveShouldSetResponder({}, gesture({ dx: 11, dy: 0 }))).toBe(false);
    expect(surface.props.onMoveShouldSetResponder({}, gesture({ dx: 20, dy: 22 }))).toBe(false);
    expect(surface.props.onMoveShouldSetResponder({}, gesture({ dx: 20, dy: 4 }))).toBe(true);
    expect(surface.props.onStartShouldSetResponderCapture()).toBe(false);
    expect(surface.props.onMoveShouldSetResponderCapture({}, gesture({ dx: 11, dy: 0 }))).toBe(false);
    expect(surface.props.onMoveShouldSetResponderCapture({}, gesture({ dx: 20, dy: 22 }))).toBe(false);
    expect(surface.props.onMoveShouldSetResponderCapture({}, gesture({ dx: 20, dy: 4 }))).toBe(true);

    await act(async () => {
      surface.props.onResponderGrant({}, gesture({ dx: 20, dy: 4 }));
      surface.props.onResponderMove({}, gesture({ dx: 20, dy: 4 }));
      surface.props.onResponderRelease({}, gesture({ dx: 20, dy: 4 }));
    });
    expect(onReply).not.toHaveBeenCalled();
    expect(translationOf(translation)).toBe(0);

    await act(async () => {
      surface.props.onResponderGrant({}, gesture({ dx: -64, dy: 2 }));
      surface.props.onResponderMove({}, gesture({ dx: -64, dy: 2 }));
    });
    expect(translationOf(translation)).toBe(-64);
    await act(async () => surface.props.onResponderTerminate({}, gesture({ dx: -64, dy: 2 })));
    expect(onReply).not.toHaveBeenCalled();
    expect(translationOf(translation)).toBe(0);
    await act(async () => {
      surface.props.onResponderGrant({}, gesture({ dx: 48, dy: 2 }));
      surface.props.onResponderMove({}, gesture({ dx: 48, dy: 2 }));
      surface.props.onResponderReject({}, gesture({ dx: 48, dy: 2 }));
    });
    expect(onReply).not.toHaveBeenCalled();
    expect(translationOf(translation)).toBe(0);
    expect(surface.props.onResponderTerminationRequest()).toBe(true);
  });

  it("omits swipe responders for read-only bubbles and exposes named accessibility actions", async () => {
    const onOpenActions = jest.fn();
    const readOnly = await render(
      <MessageBubble item={item(message(), false)} compact onDenied={jest.fn()} onOpenActions={onOpenActions} />
    );
    const readOnlySurface = readOnly.getByTestId("message-swipe-message-a");
    const readOnlySummary = readOnly.getByRole("summary", { name: /Message from Aditi Rao/u });

    expect(readOnlySurface.props.onMoveShouldSetResponder).toBeUndefined();
    expect(readOnly.queryByTestId("reply-indicator-left-message-a", { includeHiddenElements: true })).toBeNull();
    expect(readOnlySummary.props.accessibilityActions).toEqual([
      { name: "messageActions", label: "Message actions" }
    ]);
    await fireEvent(readOnlySummary, "accessibilityAction", { nativeEvent: { actionName: "messageActions" } });
    expect(onOpenActions).toHaveBeenCalledTimes(1);
    await readOnly.unmount();

    const onReply = jest.fn();
    const enabled = await render(
      <MessageBubble item={item(message(), false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} onReply={onReply} />
    );
    const summary = enabled.getByRole("summary", { name: /Message from Aditi Rao/u });
    expect(summary.props.accessibilityActions).toEqual([
      { name: "reply", label: "Reply" },
      { name: "messageActions", label: "Message actions" }
    ]);
    await fireEvent(summary, "accessibilityAction", { nativeEvent: { actionName: "reply" } });
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("resets an in-progress gesture when a recycled row receives another message", async () => {
    const onReply = jest.fn();
    const props = { compact: true, onDenied: jest.fn(), onOpenActions: jest.fn(), onReply, reducedMotion: true } as const;
    const view = await render(<MessageBubble {...props} item={item(message(), false)} />);
    const surface = view.getByTestId("message-swipe-message-a");

    await act(async () => {
      surface.props.onResponderGrant({}, gesture({ dx: 42, dy: 2 }));
      surface.props.onResponderMove({}, gesture({ dx: 42, dy: 2 }));
    });
    expect(translationOf(view.getByTestId("message-translation-message-a"))).toBe(42);

    await view.rerender(<MessageBubble {...props} item={item(message({ id: "message-b" }), false)} />);
    expect(translationOf(view.getByTestId("message-translation-message-b"))).toBe(0);
    expect(onReply).not.toHaveBeenCalled();
  });

  it("content-fits ordinary text and applies WhatsApp-like grouped spacing", async () => {
    const short = message({ body: "Hi" });
    const newGroupView = await render(<MessageBubble item={item(short, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);
    const newGroupBubbleStyle = StyleSheet.flatten(newGroupView.getByTestId("message-bubble-message-a").props.style);
    const newGroupLayoutStyle = StyleSheet.flatten(newGroupView.getByTestId("message-swipe-message-a").props.style);

    expect(newGroupBubbleStyle).toMatchObject({
      flexShrink: 1,
      paddingHorizontal: 8,
      paddingTop: 5,
      paddingBottom: 4
    });
    expect(newGroupLayoutStyle).toMatchObject({ flexShrink: 1, maxWidth: "89%" });
    expect(newGroupBubbleStyle.minWidth).toBeUndefined();
    expect(newGroupBubbleStyle.width).toBeUndefined();
    expect(newGroupView.getByTestId("message-row-message-a")).toHaveStyle({ marginTop: 8, paddingHorizontal: 8 });
    expect(newGroupView.getByRole("summary", { name: /Message from Aditi Rao/u })).toHaveStyle({ position: "absolute", right: 8, bottom: 4 });
    await newGroupView.unmount();

    const grouped = { ...item(message({ body: "A longer follow-up that wraps within the responsive maximum width." }), true), startsGroup: false, showAuthor: false };
    const groupedView = await render(<MessageBubble item={grouped} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);
    expect(groupedView.getByTestId("message-row-message-a")).toHaveStyle({ marginTop: 2 });
    expect(groupedView.getByTestId("message-swipe-message-a")).toHaveStyle({ maxWidth: "89%" });
  });

  it("shows persisted outgoing state, reply context, and issue status inside the bubble", async () => {
    const value = message({
      priority: "critical",
      issueStatus: "resolved",
      replyTo: {
        id: "parent",
        author: "Nikhil",
        authorId: "user-nikhil",
        authorRole: "site_manager",
        body: "Please confirm this revision",
        attachmentSummary: null
      }
    });
    const view = await render(<MessageBubble item={item(value, true)} compact={false} onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    expect(view.getByText("Nikhil")).toBeTruthy();
    expect(view.getByText("Please confirm this revision")).toBeTruthy();
    expect(view.getByText("Critical · resolved")).toBeTruthy();
    expect(view.getByText(/✓/)).toBeTruthy();
  });

  it("opens attachments through the authenticated transfer manager", async () => {
    const share = jest.fn(async () => undefined);
    const release = jest.fn(async () => undefined);
    const download = jest.fn(() => ({ result: Promise.resolve({ share, release }) }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{ id: "attachment-a", filename: "plan.pdf", mimeType: "application/pdf", byteSize: 2048, kind: "document", preview: null }]
    });
    const onOpenActions = jest.fn();
    const onReply = jest.fn();
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={onOpenActions} onReply={onReply} />);

    await fireEvent.press(view.getByRole("button", { name: "Open attachment plan.pdf" }));
    await waitFor(() => expect(download).toHaveBeenCalledWith({
      path: "/projects/project-a/chat/attachments/attachment-a/content",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      maxBytes: 3072
    }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(onOpenActions).not.toHaveBeenCalled();
    expect(onReply).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByRole("button", { name: "Open attachment plan.pdf" })).toBeEnabled());
  });

  it("revokes thread access when an attachment download is denied", async () => {
    const download = jest.fn(() => ({
      cancel: jest.fn(),
      result: Promise.reject(new TransferHttpError(403, "FORBIDDEN", "Internal details"))
    }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const onDenied = jest.fn();
    const value = message({
      body: "",
      attachments: [{ id: "attachment-a", filename: "plan.pdf", mimeType: "application/pdf", byteSize: 2048, kind: "document", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={onDenied} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "Open attachment plan.pdf" }));
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(view.queryByText("Internal details")).toBeNull();
  });

  it("opens an authenticated image viewer from the preview without an Open button", async () => {
    const previewRelease = jest.fn(async () => undefined);
    const originalRelease = jest.fn(async () => undefined);
    const previewCancel = jest.fn();
    const originalCancel = jest.fn();
    const download = jest.fn((request: { path: string }) => request.path.endsWith("/preview") ? ({
      cancel: previewCancel,
      result: Promise.resolve({ uri: "file:///private/preview.webp", release: previewRelease })
    }) : ({
      cancel: originalCancel,
      result: Promise.resolve({ uri: "file:///private/living-room.png", release: originalRelease })
    }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const onOpenActions = jest.fn();
    const onReply = jest.fn();
    const value = message({
      body: "",
      attachments: [{
        id: "image-a",
        filename: "living-room.png",
        mimeType: "image/png",
        byteSize: 4096,
        kind: "image",
        preview: { mimeType: "image/webp", byteSize: 1024, width: 400, height: 300 }
      }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={onOpenActions} onReply={onReply} />);

    await waitFor(() => expect(download).toHaveBeenCalledWith({
      path: "/projects/project-a/chat/attachments/image-a/preview",
      fileName: "preview-living-room.png",
      mimeType: "image/webp",
      maxBytes: 2048
    }));
    const image = view.getByRole("button", { name: "View image living-room.png" });
    expect(image).toHaveStyle({ width: "100%", height: 184 });
    expect(view.getByRole("summary", { name: /living-room\.png/u })).toHaveStyle({ position: "absolute", right: 8, bottom: 4 });
    expect(view.queryByRole("button", { name: "Open attachment living-room.png" })).toBeNull();
    expect(view.queryByText("Open")).toBeNull();
    await fireEvent.press(image);
    expect(onOpenActions).not.toHaveBeenCalled();
    expect(onReply).not.toHaveBeenCalled();
    await waitFor(() => expect(download).toHaveBeenCalledWith({
      path: "/projects/project-a/chat/attachments/image-a/content",
      fileName: "living-room.png",
      mimeType: "image/png",
      maxBytes: 5120
    }));
    await waitFor(() => expect(view.getByTestId("chat-image-viewer-image").props.source).toEqual({ uri: "file:///private/living-room.png" }));
    await fireEvent.press(view.getByRole("button", { name: "Close image viewer" }));
    expect(originalCancel).not.toHaveBeenCalled();
    expect(originalRelease).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(previewCancel).toHaveBeenCalledTimes(1);
    expect(previewRelease).toHaveBeenCalledTimes(1);
  });

  it("does not reload an image preview when only the denial callback identity changes", async () => {
    const release = jest.fn(async () => undefined);
    const download = jest.fn(() => ({
      cancel: jest.fn(),
      result: Promise.resolve({ uri: "file:///private/preview.webp", release })
    }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{
        id: "image-a",
        filename: "living-room.png",
        mimeType: "image/png",
        byteSize: 4096,
        kind: "image",
        preview: { mimeType: "image/webp", byteSize: 1024, width: 400, height: 300 }
      }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));

    await view.rerender(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);
    expect(download).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("keeps image-viewer failures retryable and sends access denial through the protected path", async () => {
    const release = jest.fn(async () => undefined);
    const download = jest.fn()
      .mockImplementationOnce(() => ({ cancel: jest.fn(), result: Promise.reject(new Error("file:///private/secret.png?token=private")) }))
      .mockImplementationOnce(() => ({ cancel: jest.fn(), result: Promise.resolve({ uri: "file:///private/retry.png", release }) }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const onDenied = jest.fn();
    const value = message({
      body: "",
      attachments: [{ id: "image-a", filename: "room.png", mimeType: "image/png", byteSize: 4096, kind: "image", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={onDenied} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "View image room.png" }));
    expect(await view.findByText("Unable to display image")).toBeTruthy();
    expect(view.queryByText(/secret|token=private/u)).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Retry loading room.png" }));
    await waitFor(() => expect(view.getByTestId("chat-image-viewer-image").props.source).toEqual({ uri: "file:///private/retry.png" }));
    expect(onDenied).not.toHaveBeenCalled();
    await view.unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("closes the image viewer and revokes thread access when the original is denied", async () => {
    const download = jest.fn(() => ({
      cancel: jest.fn(),
      result: Promise.reject(new TransferHttpError(403, "FORBIDDEN", "Private image detail"))
    }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const onDenied = jest.fn();
    const value = message({
      body: "",
      attachments: [{ id: "image-a", filename: "room.png", mimeType: "image/png", byteSize: 4096, kind: "image", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={onDenied} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "View image room.png" }));
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(view.queryByText("Private image detail")).toBeNull();
    expect(view.queryByRole("button", { name: "Close image viewer" })).toBeNull();
  });

  it("cancels and releases an original image that resolves after unmount", async () => {
    const result = deferred<{ uri: string; release: jest.Mock }>();
    const cancel = jest.fn();
    const release = jest.fn(async () => undefined);
    const download = jest.fn(() => ({ cancel, result: result.promise }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{ id: "image-a", filename: "room.png", mimeType: "image/png", byteSize: 4096, kind: "image", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "View image room.png" }));
    await view.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    await act(async () => result.resolve({ uri: "file:///private/late-room.png", release }));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("cancels an in-flight original when the image viewer closes and releases a late result", async () => {
    const result = deferred<{ uri: string; release: jest.Mock }>();
    const cancel = jest.fn();
    const release = jest.fn(async () => undefined);
    const download = jest.fn(() => ({ cancel, result: result.promise }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{ id: "image-a", filename: "room.png", mimeType: "image/png", byteSize: 4096, kind: "image", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "View image room.png" }));
    expect(view.getByRole("progressbar", { name: "Loading image" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Close image viewer" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    await act(async () => result.resolve({ uri: "file:///private/late-room.png", release }));
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });

  it("renders audio-only messages as a compact single media row at phone and expanded widths", async () => {
    const value = message({
      body: "Please review this voice update.",
      priority: "critical",
      replyTo: {
        id: "parent",
        author: "Nikhil",
        authorId: "user-nikhil",
        authorRole: "site_manager",
        body: "Send the site update",
        attachmentSummary: null
      },
      attachments: [{ id: "audio-a", filename: "voice.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null }]
    });
    const compactView = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    const compactAudioStyle = StyleSheet.flatten(compactView.getByTestId("message-swipe-message-a").props.style);
    expect(compactAudioStyle).toMatchObject({ width: "89%", maxWidth: "89%" });
    expect(compactAudioStyle.minWidth).toBeUndefined();
    expect(compactView.getByTestId("audio-media-row-audio-a")).toHaveStyle({ minHeight: 52, flexDirection: "row" });
    expect(compactView.getByRole("button", { name: "Play voice.m4a" })).toHaveStyle({ width: 48, height: 48 });
    expect(compactView.getByTestId("audio-avatar-audio-a")).toHaveStyle({ width: 36, height: 36 });
    expect(compactView.getByTestId("audio-track-audio-a", { includeHiddenElements: true })).toHaveStyle({ minWidth: 56, flex: 1 });
    expect(compactView.queryByRole("button", { name: "Download voice.m4a" })).toBeNull();
    expect(compactView.queryByText("↓")).toBeNull();
    expect(compactView.getByText("Aditi Rao")).toBeTruthy();
    expect(compactView.getByText("Send the site update")).toBeTruthy();
    expect(compactView.getByText("Please review this voice update.")).toBeTruthy();
    expect(compactView.getByText("Critical")).toBeTruthy();
    expect(compactView.getByRole("summary", { name: /Message from Aditi Rao/u })).toBeTruthy();
    await compactView.unmount();

    const expandedView = await render(<MessageBubble item={item(value, true)} compact={false} onDenied={jest.fn()} onOpenActions={jest.fn()} />);
    const expandedAudioStyle = StyleSheet.flatten(expandedView.getByTestId("message-swipe-message-a").props.style);
    expect(expandedAudioStyle).toMatchObject({ width: "68%", maxWidth: "68%" });
    expect(expandedAudioStyle.minWidth).toBeUndefined();
  });

  it("keeps a plain voice note compact by trailing its timestamp inside the media row", async () => {
    const value = message({
      body: "",
      attachments: [{ id: "audio-a", filename: "voice.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null }]
    });
    const onOpenActions = jest.fn();
    const onReply = jest.fn();
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={onOpenActions} onReply={onReply} />);

    expect(view.getByTestId("message-swipe-message-a")).toHaveStyle({ width: 248, maxWidth: "89%" });
    expect(view.getByTestId("audio-media-row-audio-a")).toHaveStyle({ minHeight: 52 });
    expect(view.getByRole("summary", { name: /voice\.m4a/u })).toHaveStyle({ position: "absolute", right: 50, bottom: 3 });
    expect(view.getByRole("button", { name: "Play voice.m4a" })).toHaveStyle({ width: 48, height: 48 });
  });

  it("loads and controls voice notes only after an explicit play action", async () => {
    let playbackListener: ((event: { type: "playing" | "paused" | "stopped"; ownerId: string }) => void) | null = null;
    const ownerId = "chat:project-a:audio-a";
    const play = jest.fn(async () => playbackListener?.({ type: "playing", ownerId }));
    const pause = jest.fn(() => {
      playbackListener?.({ type: "paused", ownerId });
      return true;
    });
    const subscribePlaybackEvents = jest.fn((listener) => {
      playbackListener = listener;
      return jest.fn();
    });
    const release = jest.fn(async () => undefined);
    const download = jest.fn(() => ({
      cancel: jest.fn(),
      result: Promise.resolve({ uri: "file:///private/voice.m4a", release, share: jest.fn() })
    }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play, pause, stopPlayback: jest.fn(), subscribePlaybackEvents } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{ id: "audio-a", filename: "voice.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null }]
    });
    const onOpenActions = jest.fn();
    const onReply = jest.fn();
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={onOpenActions} onReply={onReply} />);

    expect(download).not.toHaveBeenCalled();
    expect(view.queryByRole("button", { name: "Download voice.m4a" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Play voice.m4a" }));
    await waitFor(() => expect(play).toHaveBeenCalledWith("file:///private/voice.m4a", ownerId));
    await fireEvent.press(view.getByRole("button", { name: "Pause voice.m4a" }));
    expect(pause).toHaveBeenCalledWith(ownerId);
    expect(onOpenActions).not.toHaveBeenCalled();
    expect(onReply).not.toHaveBeenCalled();
    await view.unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("shows one busy control during lazy download and starts playback only after it completes", async () => {
    const result = deferred<{ uri: string; release: jest.Mock; share: jest.Mock }>();
    const play = jest.fn(async () => undefined);
    const download = jest.fn(() => ({ cancel: jest.fn(), result: result.promise }));
    useRuntimeMock.mockReturnValue({
      runtime: {
        transfers: { download },
        audio: { play, pause: jest.fn(), stopPlayback: jest.fn(), subscribePlaybackEvents: jest.fn(() => jest.fn()) }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{ id: "audio-a", filename: "voice.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "Play voice.m4a" }));
    const loading = await view.findByRole("button", { name: "Loading voice.m4a" });
    expect(loading).toBeDisabled();
    expect(loading.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(play).not.toHaveBeenCalled();

    const artifact = { uri: "file:///private/voice.m4a", release: jest.fn(async () => undefined), share: jest.fn() };
    await act(async () => result.resolve(artifact));
    await waitFor(() => expect(play).toHaveBeenCalledWith(artifact.uri, "chat:project-a:audio-a"));
  });

  it("keeps a failed voice-note download retryable without adding another action row", async () => {
    const play = jest.fn(async () => undefined);
    const release = jest.fn(async () => undefined);
    const download = jest.fn()
      .mockImplementationOnce(() => ({ cancel: jest.fn(), result: Promise.reject(new Error("Voice note unavailable.")) }))
      .mockImplementationOnce(() => ({ cancel: jest.fn(), result: Promise.resolve({ uri: "file:///private/retry.m4a", release, share: jest.fn() }) }));
    useRuntimeMock.mockReturnValue({
      runtime: {
        transfers: { download },
        audio: { play, pause: jest.fn(), stopPlayback: jest.fn(), subscribePlaybackEvents: jest.fn(() => jest.fn()) }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{ id: "audio-a", filename: "voice.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "Play voice.m4a" }));
    expect(await view.findByText("Voice note unavailable.")).toBeTruthy();
    expect(view.getByRole("button", { name: "Play voice.m4a" })).toBeEnabled();
    expect(view.queryByRole("button", { name: "Download voice.m4a" })).toBeNull();

    await fireEvent.press(view.getByRole("button", { name: "Play voice.m4a" }));
    await waitFor(() => expect(play).toHaveBeenCalledWith("file:///private/retry.m4a", "chat:project-a:audio-a"));
    expect(view.queryByText("Voice note unavailable.")).toBeNull();
  });

  it("uses the non-disclosing access-loss path when a voice-note download is denied", async () => {
    const download = jest.fn(() => ({
      cancel: jest.fn(),
      result: Promise.reject(new TransferHttpError(403, "FORBIDDEN", "Private server detail"))
    }));
    useRuntimeMock.mockReturnValue({
      runtime: {
        transfers: { download },
        audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn(), subscribePlaybackEvents: jest.fn(() => jest.fn()) }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const onDenied = jest.fn();
    const value = message({
      body: "",
      attachments: [{ id: "audio-a", filename: "voice.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={onDenied} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "Play voice.m4a" }));
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(view.queryByText("Private server detail")).toBeNull();
  });

  it("cancels an in-flight voice-note download when its message unmounts", async () => {
    const result = deferred<{ uri: string; release: jest.Mock; share: jest.Mock }>();
    const cancel = jest.fn();
    const release = jest.fn(async () => undefined);
    const play = jest.fn(async () => undefined);
    const download = jest.fn(() => ({ cancel, result: result.promise }));
    useRuntimeMock.mockReturnValue({
      runtime: {
        transfers: { download },
        audio: { play, pause: jest.fn(), stopPlayback: jest.fn(), subscribePlaybackEvents: jest.fn(() => jest.fn()) }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{ id: "audio-a", filename: "voice.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "Play voice.m4a" }));
    await view.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    await act(async () => result.resolve({ uri: "file:///private/voice.m4a", release, share: jest.fn() }));
    expect(play).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("cancels a delayed original download and never opens media after the message unmounts", async () => {
    const result = deferred<{ uri: string; share: jest.Mock; release: jest.Mock }>();
    const cancel = jest.fn();
    const share = jest.fn(async () => undefined);
    const release = jest.fn(async () => undefined);
    const download = jest.fn(() => ({ cancel, result: result.promise }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play: jest.fn(), pause: jest.fn(), stopPlayback: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [{ id: "document-a", filename: "plan.pdf", mimeType: "application/pdf", byteSize: 2048, kind: "document", preview: null }]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "Open attachment plan.pdf" }));
    await view.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    await act(async () => result.resolve({ uri: "file:///private/plan.pdf", share, release }));
    expect(share).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("clears the previous voice-note control when another bubble owns playback", async () => {
    const listeners = new Set<(event: { type: "playing" | "paused" | "stopped"; ownerId: string }) => void>();
    let currentOwner: string | null = null;
    const emit = (event: { type: "playing" | "paused" | "stopped"; ownerId: string }) => listeners.forEach((listener) => listener(event));
    const play = jest.fn(async (_uri: string, ownerId: string) => {
      if (currentOwner && currentOwner !== ownerId) emit({ type: "stopped", ownerId: currentOwner });
      currentOwner = ownerId;
      emit({ type: "playing", ownerId });
    });
    const pause = jest.fn((ownerId: string) => {
      if (currentOwner !== ownerId) return false;
      emit({ type: "paused", ownerId });
      return true;
    });
    const stopPlayback = jest.fn((ownerId: string) => {
      if (currentOwner !== ownerId) return false;
      currentOwner = null;
      emit({ type: "stopped", ownerId });
      return true;
    });
    const download = jest.fn((request: { fileName: string }) => ({
      cancel: jest.fn(),
      result: Promise.resolve({ uri: `file:///private/${request.fileName}`, release: jest.fn(async () => undefined), share: jest.fn() })
    }));
    useRuntimeMock.mockReturnValue({ runtime: { transfers: { download }, audio: { play, pause, stopPlayback, subscribePlaybackEvents: (listener: (event: { type: "playing" | "paused" | "stopped"; ownerId: string }) => void) => { listeners.add(listener); return () => listeners.delete(listener); } } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const value = message({
      body: "",
      attachments: [
        { id: "audio-a", filename: "voice-a.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null },
        { id: "audio-b", filename: "voice-b.m4a", mimeType: "audio/mp4", byteSize: 4096, kind: "audio", preview: null }
      ]
    });
    const view = await render(<MessageBubble item={item(value, false)} compact onDenied={jest.fn()} onOpenActions={jest.fn()} />);

    await fireEvent.press(view.getByRole("button", { name: "Play voice-a.m4a" }));
    await waitFor(() => expect(view.getByRole("button", { name: "Pause voice-a.m4a" })).toBeTruthy());
    await fireEvent.press(view.getByRole("button", { name: "Play voice-b.m4a" }));
    await waitFor(() => expect(view.getByRole("button", { name: "Play voice-a.m4a" })).toBeTruthy());
    expect(view.getByRole("button", { name: "Pause voice-b.m4a" })).toBeTruthy();
  });
});
