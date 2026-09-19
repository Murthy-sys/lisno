import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, createRef, type ReactElement, type Ref } from "react";
import {
  cleanup,
  fireEvent,
  render as testingRender,
  waitFor
} from "@testing-library/react-native";
import { Linking } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import {
  capturePhoto,
  clearPendingImageSelection,
  OversizedAssetPolicyError,
  pickDocument,
  pickImage,
  releaseSelectedAsset,
  recoverPendingImageSelection
} from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import {
  canSubmitChatMessage,
  ChatComposer,
  type ChatComposerHandle,
  type ChatComposerProps
} from "./ChatComposer";
import type { PresentedMessage } from "./chatModel";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../platform/audio", () => ({
  AudioRecordingInterruptedError: class AudioRecordingInterruptedError extends Error {}
}));
jest.mock("../../platform/files", () => ({
  TransferHttpError: class TransferHttpError extends Error {},
  OversizedAssetPolicyError: class OversizedAssetPolicyError extends Error {
    readonly code = "ASSET_POLICY_ERROR";
    readonly fileName: string;
    readonly maxBytes: number;

    constructor(
      mockFileName: string,
      mockMaxBytes: number
    ) {
      super("The selected file is larger than allowed.");
      this.name = "OversizedAssetPolicyError";
      this.fileName = mockFileName;
      this.maxBytes = mockMaxBytes;
    }
  },
  capturePhoto: jest.fn(),
  clearPendingImageSelection: jest.fn(async () => undefined),
  pickDocument: jest.fn(),
  pickImage: jest.fn(),
  releaseSelectedAsset: jest.fn(async () => undefined),
  recoverPendingImageSelection: jest.fn()
}));

const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const pickDocumentMock = jest.mocked(pickDocument);
const pickImageMock = jest.mocked(pickImage);
const capturePhotoMock = jest.mocked(capturePhoto);
const releaseSelectedAssetMock = jest.mocked(releaseSelectedAsset);
const recoverPendingImageSelectionMock = jest.mocked(recoverPendingImageSelection);
const clearPendingImageSelectionMock = jest.mocked(clearPendingImageSelection);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (cause?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const attachmentPolicy = {
  enabled: true,
  capabilities: { canUpload: true, canRecord: true },
  limits: {
    maxAttachments: 4,
    maxFileBytes: 10_000_000,
    maxMessageBytes: 20_000_000,
    maxRecordingSeconds: 60
  },
  formats: [
    { kind: "image", label: "Images", extensions: [".jpg"], mimeTypes: ["image/jpeg"] },
    { kind: "document", label: "Documents", extensions: [".pdf"], mimeTypes: ["application/pdf"] }
  ],
  recordingMimeTypes: ["audio/mp4"]
};

const session = {
  user: { id: "user-me", name: "Me", email: "me@example.test", role: "admin" },
  authorization: { role: "admin", policyVersion: "test", permissions: ["chat.send"] }
} as AuthenticatedSession;

function message(id: string, author = "Aditi"): PresentedMessage {
  return {
    id,
    projectId: "project-a",
    body: `Message ${id}`,
    author,
    authorId: `user-${id}`,
    authorRole: "designer",
    authorIdentity: { id: `user-${id}`, name: author, role: "designer" },
    createdAt: "2026-09-18T10:00:00.000Z",
    sequence: 1,
    clientMessageId: `client-${id}`,
    priority: "normal",
    version: 1,
    issueStatus: null,
    replyTo: null,
    attachments: [],
    capabilities: { canRaise: true, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false }
  };
}

function stagedAttachment(
  id: string,
  filename: string,
  mimeType: string,
  byteSize: number,
  kind = "document"
) {
  return {
    clientUploadId: `upload-${id}`,
    attachment: { id, filename, mimeType, byteSize, kind, preview: null },
    expiresAt: "2099-01-01T00:00:00.000Z"
  };
}

const apiGet = jest.fn(async () => attachmentPolicy);
const apiPost = jest.fn();
const apiDelete = jest.fn(async () => undefined);
const startRecording = jest.fn(async () => undefined);
const stopRecording = jest.fn(async () => undefined);
const cancelRecording = jest.fn(async () => undefined);
const releaseRecording = jest.fn(async () => undefined);
let recordingListener: ((event: {
  readonly type: "completed";
  readonly reason: "user" | "duration_limit";
  readonly recording: {
    readonly uri: string;
    readonly fileName: string;
    readonly mimeType: "audio/mp4";
    readonly sizeBytes: number;
    readonly durationMillis: number;
  };
} | {
  readonly type: "interrupted";
  readonly reason: "background" | "cancelled" | "cleanup" | "replaced";
} | {
  readonly type: "failed";
  readonly error: Error;
}) => void) | null = null;
const subscribeRecordingEvents = jest.fn((listener: NonNullable<typeof recordingListener>) => {
  recordingListener = listener;
  return () => {
    if (recordingListener === listener) recordingListener = null;
  };
});
const uploadAttachment = jest.fn();
const queryClients: QueryClient[] = [];

function configuredRuntime() {
  return {
    configured: true,
    booted: true,
    runtime: {
      api: { authenticated: { get: apiGet, post: apiPost, delete: apiDelete } },
      transfers: { upload: uploadAttachment },
      audio: {
        startRecording,
        stopRecording,
        cancelRecording,
        releaseRecording,
        subscribeRecordingEvents
      }
    },
    environment: {
      environment: { id: "remote:https://api.example.test", profile: "remote" },
      generation: 1,
      status: "ready"
    },
    session: { status: "authenticated", session, failure: null, generation: 7 }
  } as unknown as ReturnType<typeof useConfiguredRuntime>;
}

function composerHarness(overrides: Partial<ChatComposerProps> = {}, ref?: Ref<ChatComposerHandle>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity, retry: false }
    }
  });
  queryClients.push(queryClient);
  const props: ChatComposerProps = {
    projectId: "project-a",
    session,
    reply: null,
    onCancelReply: jest.fn(),
    onSent: jest.fn(),
    ...overrides
  };
  const element = (nextProps = props) => createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(ChatComposer, { ...nextProps, ...(ref ? { ref } : {}) })
  );
  return { element, props };
}

type ComposerView = Awaited<ReturnType<typeof testingRender>>;

async function waitForComposerReady(view: ComposerView, expectedRecoveryCalls = 1) {
  await waitFor(() => expect(recoverPendingImageSelectionMock).toHaveBeenCalledTimes(expectedRecoveryCalls));
  await waitFor(() => expect(
    view.getByRole("button", { name: "Open attachment options" }).props.accessibilityState.disabled
  ).toBe(false));
}

async function render(element: ReactElement): Promise<ComposerView> {
  const view = await testingRender(element);
  await waitForComposerReady(view);
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  apiGet.mockReset().mockResolvedValue(attachmentPolicy);
  apiPost.mockReset();
  apiDelete.mockReset().mockResolvedValue(undefined);
  startRecording.mockReset().mockResolvedValue(undefined);
  stopRecording.mockReset().mockResolvedValue(undefined);
  cancelRecording.mockReset().mockResolvedValue(undefined);
  releaseRecording.mockReset().mockResolvedValue(undefined);
  uploadAttachment.mockReset();
  pickDocumentMock.mockReset();
  pickImageMock.mockReset();
  capturePhotoMock.mockReset();
  recoverPendingImageSelectionMock.mockReset();
  releaseSelectedAssetMock.mockReset();
  clearPendingImageSelectionMock.mockReset();
  recordingListener = null;
  useConfiguredRuntimeMock.mockReturnValue(configuredRuntime());
  recoverPendingImageSelectionMock.mockResolvedValue({ status: "none" });
  releaseSelectedAssetMock.mockResolvedValue(undefined);
  clearPendingImageSelectionMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  cleanup();
  const clients = queryClients.splice(0);
  await Promise.all(clients.map((queryClient) => queryClient.cancelQueries()));
  for (const queryClient of clients) queryClient.clear();
  jest.restoreAllMocks();
});

describe("chat composer submission", () => {
  it("enables text and attachment-only messages", () => {
    expect(canSubmitChatMessage({ body: "Update", stagedCount: 0, pending: false, uploading: false, recording: false })).toBe(true);
    expect(canSubmitChatMessage({ body: "  ", stagedCount: 1, pending: false, uploading: false, recording: false })).toBe(true);
  });

  it("blocks empty, duplicate, uploading, and recording submissions", () => {
    expect(canSubmitChatMessage({ body: "  ", stagedCount: 0, pending: false, uploading: false, recording: false })).toBe(false);
    expect(canSubmitChatMessage({ body: "Update", stagedCount: 0, pending: true, uploading: false, recording: false })).toBe(false);
    expect(canSubmitChatMessage({ body: "Update", stagedCount: 0, pending: false, uploading: true, recording: false })).toBe(false);
    expect(canSubmitChatMessage({ body: "Update", stagedCount: 0, pending: false, uploading: false, recording: true })).toBe(false);
  });

  it("snapshots the payload, locks draft controls in flight, and clears after success", async () => {
    const request = deferred<unknown>();
    apiPost.mockReturnValueOnce(request.promise);
    const onCancelReply = jest.fn();
    const onSent = jest.fn();
    const onSendingChange = jest.fn();
    const harness = composerHarness({ reply: message("reply-a"), onCancelReply, onSent, onSendingChange });
    const view = await render(harness.element());

    await waitFor(() => expect(view.getByRole("button", { name: "Open attachment options" })).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "  Original update  ");
    await waitFor(() => expect(view.getByLabelText("Message the project team").props.value).toBe("  Original update  "));
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const payload = apiPost.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ body: "Original update", replyToId: "reply-a", priority: "normal" });
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload.mentions)).toBe(true);
    await waitFor(() => expect(view.getByLabelText("Message the project team").props.editable).toBe(false));
    expect(view.getByRole("button", { name: "Open attachment options" }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByRole("button", { name: "Message importance" }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByRole("button", { name: "Cancel reply" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Later edit");
    expect(view.getByLabelText("Message the project team").props.value).toBe("  Original update  ");
    expect(onSendingChange).toHaveBeenCalledWith(true);

    await act(async () => request.resolve({}));
    await waitFor(() => expect(view.getByLabelText("Message the project team").props.value).toBe(""));
    expect(onCancelReply).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSendingChange).toHaveBeenLastCalledWith(false);
  });

  it("consumes immediate Back after Send before pending state rerenders", async () => {
    const request = deferred<unknown>();
    apiPost.mockReturnValueOnce(request.promise);
    const composerRef = createRef<ChatComposerHandle>();
    const harness = composerHarness({}, composerRef);
    const view = await render(harness.element());
    await waitFor(() => expect(recoverPendingImageSelectionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(
      view.getByRole("button", { name: "Open attachment options" }).props.accessibilityState.disabled
    ).toBe(false));
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Send now");

    const sendPress = fireEvent.press(view.getByRole("button", { name: "Send message" }));
    expect(composerRef.current?.hasTransientState()).toBe(true);
    expect(composerRef.current?.dismissTransientState()).toBe(true);
    await sendPress;
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));

    await act(async () => request.resolve({}));
  });

  it("retries the exact frozen payload with the same client identity", async () => {
    const first = deferred<unknown>();
    const retry = deferred<unknown>();
    apiPost.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
    const harness = composerHarness();
    const view = await render(harness.element());
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Retry me");
    await waitFor(() => expect(view.getByLabelText("Message the project team").props.value).toBe("Retry me"));
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const firstPayload = apiPost.mock.calls[0]?.[1];

    await act(async () => first.reject(new Error("offline")));
    const retryButton = await view.findByRole("button", { name: "Retry sending message" });
    await fireEvent.press(retryButton);
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));

    expect(apiPost.mock.calls[1]?.[1]).toBe(firstPayload);
    await act(async () => retry.resolve({}));
  });

  it("clears retained draft state and reports revoked send access", async () => {
    apiPost.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Sensitive policy detail"));
    const onDenied = jest.fn();
    const harness = composerHarness({ onDenied });
    const view = await render(harness.element());
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Private draft");
    await waitFor(() => expect(view.getByLabelText("Message the project team").props.value).toBe("Private draft"));
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(view.getByLabelText("Message the project team").props.value).toBe("");
    expect(view.getByText("Messages are unavailable.")).toBeTruthy();
    expect(view.queryByText("Sensitive policy detail")).toBeNull();
  });

  it("renews the client identity when the reply target changes or is cancelled", async () => {
    apiPost.mockRejectedValue(new Error("offline"));
    const harness = composerHarness({ reply: message("reply-a", "Aditi") });
    const view = await render(harness.element());
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Reply body");
    await waitFor(() => expect(view.getByLabelText("Message the project team").props.value).toBe("Reply body"));
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    await view.findByRole("button", { name: "Retry sending message" });
    const firstPayload = apiPost.mock.calls[0]?.[1] as { clientMessageId: string; replyToId: string | null };

    await view.rerender(harness.element({ ...harness.props, reply: message("reply-b", "Ben") }));
    await waitFor(() => expect(view.getByRole("button", { name: "Send message" })).toBeTruthy());
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
    await view.findByRole("button", { name: "Retry sending message" });
    const secondPayload = apiPost.mock.calls[1]?.[1] as { clientMessageId: string; replyToId: string | null };
    expect(secondPayload.replyToId).toBe("reply-b");
    expect(secondPayload.clientMessageId).not.toBe(firstPayload.clientMessageId);

    await view.rerender(harness.element({ ...harness.props, reply: null }));
    await waitFor(() => expect(view.getByRole("button", { name: "Send message" })).toBeTruthy());
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(3));
    const thirdPayload = apiPost.mock.calls[2]?.[1] as { clientMessageId: string; replyToId: string | null };
    expect(thirdPayload.replyToId).toBeNull();
    expect(thirdPayload.clientMessageId).not.toBe(secondPayload.clientMessageId);
  });

  it("keeps Stop visible after text changes during recording and exposes cancellation", async () => {
    const composerRef = createRef<ChatComposerHandle>();
    const harness = composerHarness({}, composerRef);
    const view = await render(harness.element());
    const record = await view.findByRole("button", { name: "Record voice note" });

    await fireEvent.press(record);
    await waitFor(() => expect(view.getByRole("button", { name: "Stop voice note" })).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Caption while recording");

    expect(view.getByRole("button", { name: "Stop voice note" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Cancel voice note" })).toBeTruthy();
    expect(composerRef.current?.hasTransientState()).toBe(true);
    await act(async () => expect(composerRef.current?.dismissTransientState()).toBe(true));
    await waitFor(() => expect(cancelRecording).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.queryByRole("button", { name: "Stop voice note" })).toBeNull());
  });

  it("reports the importance modal as an overlay so read receipts pause behind it", async () => {
    const onOverlayChange = jest.fn();
    const harness = composerHarness({ onOverlayChange });
    const view = await render(harness.element());

    await fireEvent.press(view.getByRole("button", { name: "Message importance" }));
    await waitFor(() => expect(onOverlayChange).toHaveBeenLastCalledWith(true));
    await fireEvent.press(view.getByRole("radio", { name: "important" }));
    await waitFor(() => expect(onOverlayChange).toHaveBeenLastCalledWith(false));
  });

  it("opens the attachment sheet, reports the overlay, and closes it first on Back", async () => {
    const composerRef = createRef<ChatComposerHandle>();
    const onOverlayChange = jest.fn();
    const harness = composerHarness({ onOverlayChange }, composerRef);
    const view = await render(harness.element());
    const attachment = await view.findByRole("button", { name: "Open attachment options" });

    await fireEvent.press(attachment);
    expect(view.getByRole("button", { name: "Choose a photo" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Take a photo" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Choose a file" })).toBeTruthy();
    await waitFor(() => expect(onOverlayChange).toHaveBeenLastCalledWith(true));

    await act(async () => expect(composerRef.current?.dismissTransientState()).toBe(true));
    await waitFor(() => expect(view.queryByRole("button", { name: "Choose a photo" })).toBeNull());
    expect(onOverlayChange).toHaveBeenLastCalledWith(false);
  });

  it("routes Photo, Camera, and File through source-specific policy without surfacing cancellation", async () => {
    pickImageMock.mockResolvedValueOnce({ status: "cancelled" });
    capturePhotoMock.mockResolvedValueOnce({ status: "permission-denied-temporary" });
    pickDocumentMock.mockResolvedValueOnce({ status: "cancelled" });
    const harness = composerHarness();
    const view = await render(harness.element());
    const open = await view.findByRole("button", { name: "Open attachment options" });

    await fireEvent.press(open);
    await fireEvent.press(view.getByRole("button", { name: "Choose a photo" }));
    await waitFor(() => expect(pickImageMock).toHaveBeenCalledTimes(1));
    expect(pickImageMock.mock.calls[0]?.[0]).toEqual({
      acceptedMimeTypes: ["image/jpeg"],
      maxBytes: 10_000_000
    });
    expect(pickImageMock.mock.calls[0]?.[1]).toEqual({
      environmentId: "remote:https://api.example.test",
      userId: "user-me",
      projectId: "project-a",
      sessionGeneration: 7
    });
    expect(view.queryByText("The attachment could not be selected.")).toBeNull();

    await waitFor(() => expect(open.props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(open);
    await fireEvent.press(view.getByRole("button", { name: "Take a photo" }));
    await waitFor(() => expect(view.getByText("Camera access is needed to take a photo.")).toBeTruthy());

    await waitFor(() => expect(open.props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(open);
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(pickDocumentMock).toHaveBeenCalledTimes(1));
    expect(pickDocumentMock.mock.calls[0]?.[0]?.acceptedMimeTypes).toEqual([
      "image/jpeg",
      "application/pdf"
    ]);
  });

  it("shows the safe selected filename and server limit for oversized Photo, Camera, and File results", async () => {
    const maxBytes = attachmentPolicy.limits.maxFileBytes;
    pickImageMock.mockRejectedValueOnce(
      new OversizedAssetPolicyError("Living Room_.jpg", maxBytes)
    );
    capturePhotoMock.mockRejectedValueOnce(
      new OversizedAssetPolicyError("Site Photo_.jpg", maxBytes)
    );
    pickDocumentMock.mockRejectedValueOnce(
      new OversizedAssetPolicyError("Client Plan_.pdf", maxBytes)
    );
    const harness = composerHarness();
    const view = await render(harness.element());
    const open = await view.findByRole("button", { name: "Open attachment options" });
    const cases = [
      ["Choose a photo", "Living Room_.jpg exceeds the 9.5 MB per-file limit."],
      ["Take a photo", "Site Photo_.jpg exceeds the 9.5 MB per-file limit."],
      ["Choose a file", "Client Plan_.pdf exceeds the 9.5 MB per-file limit."]
    ] as const;

    for (const [action, expected] of cases) {
      await waitFor(() => expect(open.props.accessibilityState.disabled).toBe(false));
      await fireEvent.press(open);
      await fireEvent.press(view.getByRole("button", { name: action }));
      await waitFor(() => expect(view.getByText(expected)).toBeTruthy());
    }

    expect(view.queryByText("The attachment could not be selected.")).toBeNull();
    expect(view.queryByText(/file:\/\/|content:\/\//)).toBeNull();
  });

  it("pauses the overlay only for the native picker and lets Back cancel an upload", async () => {
    const picker = deferred<{
      status: "selected";
      asset: { uri: string; name: string; mimeType: string; size: number };
    }>();
    const upload = deferred<ReturnType<typeof stagedAttachment>>();
    const cancel = jest.fn(() => upload.reject(new Error("cancelled")));
    const asset = {
      uri: "file:///private/uploading.pdf",
      name: "uploading.pdf",
      mimeType: "application/pdf",
      size: 2_048
    };
    pickDocumentMock.mockReturnValueOnce(picker.promise);
    uploadAttachment.mockReturnValueOnce({ result: upload.promise, cancel });
    const composerRef = createRef<ChatComposerHandle>();
    const onOverlayChange = jest.fn();
    const harness = composerHarness({ onOverlayChange }, composerRef);
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(pickDocumentMock).toHaveBeenCalledTimes(1));
    expect(onOverlayChange).toHaveBeenLastCalledWith(true);

    await act(async () => picker.resolve({ status: "selected", asset }));
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOverlayChange).toHaveBeenLastCalledWith(false));
    expect(releaseSelectedAssetMock).not.toHaveBeenCalled();

    await act(async () => expect(composerRef.current?.dismissTransientState()).toBe(true));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(releaseSelectedAssetMock).toHaveBeenCalledWith(asset));
    expect(view.queryByText("uploading.pdf")).toBeNull();
  });

  it("unlocks after a synchronous transfer failure, retains retry input, and hides native paths", async () => {
    const asset = {
      uri: "file:///private/cache/secret-plan.pdf",
      name: "secret-plan.pdf",
      mimeType: "application/pdf",
      size: 2_048
    };
    pickDocumentMock.mockResolvedValueOnce({ status: "selected", asset });
    uploadAttachment.mockImplementationOnce(() => {
      throw new Error("Provider failed for file:///private/cache/secret-plan.pdf via content://documents/42");
    });
    const composerRef = createRef<ChatComposerHandle>();
    const harness = composerHarness({}, composerRef);
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await view.findByText("The attachment upload could not be confirmed. Retry keeps the same upload identity.");
    const retry = view.getByRole("button", { name: "Retry attachment upload" });
    expect(retry.props.accessibilityState.disabled).toBe(false);
    expect(view.queryByText(/Provider failed|content:\/\/documents|file:\/\/\/private/)).toBeNull();
    expect(releaseSelectedAssetMock).not.toHaveBeenCalled();

    await act(async () => expect(composerRef.current?.dismissTransientState()).toBe(true));
    await waitFor(() => expect(releaseSelectedAssetMock).toHaveBeenCalledWith(asset));
  });

  it("starts only one transfer for rapid retry taps and keeps the upload identity", async () => {
    const first = deferred<ReturnType<typeof stagedAttachment>>();
    const retry = deferred<ReturnType<typeof stagedAttachment>>();
    const asset = {
      uri: "file:///private/cache/retry.pdf",
      name: "retry.pdf",
      mimeType: "application/pdf",
      size: 2_048
    };
    pickDocumentMock.mockResolvedValueOnce({ status: "selected", asset });
    uploadAttachment
      .mockReturnValueOnce({ result: first.promise, cancel: jest.fn() })
      .mockReturnValueOnce({ result: retry.promise, cancel: jest.fn() });
    const harness = composerHarness();
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
    await act(async () => first.reject(new Error("offline")));
    const retryButton = await view.findByRole("button", { name: "Retry attachment upload" });

    await fireEvent.press(retryButton);
    await fireEvent.press(retryButton);
    expect(uploadAttachment).toHaveBeenCalledTimes(2);
    expect(uploadAttachment.mock.calls[1]?.[0]?.path).toBe(uploadAttachment.mock.calls[0]?.[0]?.path);

    await act(async () => retry.resolve(stagedAttachment("retry", "retry.pdf", "application/pdf", 2_048)));
    await view.findByText("document · 2 KB · Ready to send");
    expect(releaseSelectedAssetMock).toHaveBeenCalledTimes(1);
    expect(releaseSelectedAssetMock).toHaveBeenCalledWith(asset);
  });

  it("releases a stale picker cache result without uploading it", async () => {
    const picker = deferred<{
      status: "selected";
      asset: { uri: string; name: string; mimeType: string; size: number };
    }>();
    const asset = {
      uri: "file:///private/cache/stale.pdf",
      name: "stale.pdf",
      mimeType: "application/pdf",
      size: 1_024
    };
    pickDocumentMock.mockReturnValueOnce(picker.promise);
    const harness = composerHarness();
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(pickDocumentMock).toHaveBeenCalledTimes(1));
    await view.rerender(harness.element({ ...harness.props, projectId: "project-b" }));
    await act(async () => picker.resolve({ status: "selected", asset }));

    await waitFor(() => expect(releaseSelectedAssetMock).toHaveBeenCalledWith(asset));
    await waitForComposerReady(view, 2);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("releases picker cache input when upload access is revoked", async () => {
    const upload = deferred<ReturnType<typeof stagedAttachment>>();
    const cancel = jest.fn();
    const asset = {
      uri: "file:///private/cache/revoked.pdf",
      name: "revoked.pdf",
      mimeType: "application/pdf",
      size: 1_024
    };
    pickDocumentMock.mockResolvedValueOnce({ status: "selected", asset });
    uploadAttachment.mockReturnValueOnce({
      result: upload.promise,
      cancel
    });
    const onDenied = jest.fn();
    const harness = composerHarness({ onDenied });
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
    await act(async () => upload.reject(new ApiError(403, "FORBIDDEN", "Private policy detail")));

    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(releaseSelectedAssetMock).toHaveBeenCalledWith(asset));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.invocationCallOrder[0] as number).toBeLessThan(
      releaseSelectedAssetMock.mock.invocationCallOrder[0] as number
    );
    expect(view.getByText("Messages are unavailable.")).toBeTruthy();
    expect(view.queryByText("Private policy detail")).toBeNull();
  });

  it("releases picker cache input and cancels transfer on unmount", async () => {
    const upload = deferred<ReturnType<typeof stagedAttachment>>();
    const cancel = jest.fn();
    const asset = {
      uri: "file:///private/cache/unmounted.pdf",
      name: "unmounted.pdf",
      mimeType: "application/pdf",
      size: 1_024
    };
    pickDocumentMock.mockResolvedValueOnce({ status: "selected", asset });
    uploadAttachment.mockReturnValueOnce({ result: upload.promise, cancel });
    const harness = composerHarness();
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
    await view.unmount();

    expect(cancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(releaseSelectedAssetMock).toHaveBeenCalledWith(asset));
    expect(cancel.mock.invocationCallOrder[0] as number).toBeLessThan(
      releaseSelectedAssetMock.mock.invocationCallOrder[0] as number
    );
  });

  it("cancels an old-project upload before releasing its picker cache input", async () => {
    const upload = deferred<ReturnType<typeof stagedAttachment>>();
    const cancel = jest.fn();
    const asset = {
      uri: "file:///private/cache/old-project.pdf",
      name: "old-project.pdf",
      mimeType: "application/pdf",
      size: 1_024
    };
    pickDocumentMock.mockResolvedValueOnce({ status: "selected", asset });
    uploadAttachment.mockReturnValueOnce({ result: upload.promise, cancel });
    const harness = composerHarness();
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
    await view.rerender(harness.element({ ...harness.props, projectId: "project-b" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(releaseSelectedAssetMock).toHaveBeenCalledWith(asset));
    expect(cancel.mock.invocationCallOrder[0] as number).toBeLessThan(
      releaseSelectedAssetMock.mock.invocationCallOrder[0] as number
    );
    await act(async () => upload.resolve(stagedAttachment("stale", "old-project.pdf", "application/pdf", 1_024)));
    await waitForComposerReady(view, 2);
  });

  it("offers Android settings after permanent camera denial", async () => {
    capturePhotoMock.mockResolvedValueOnce({ status: "permission-denied-permanent" });
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const harness = composerHarness();
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Take a photo" }));
    const settings = await view.findByRole("button", { name: "Open camera settings" });
    expect(view.getByText("Camera access is off. Enable it in Android Settings to take a photo.")).toBeTruthy();
    await fireEvent.press(settings);
    expect(openSettings).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Continue with text");
    await waitFor(() => expect(view.queryByRole("button", { name: "Open camera settings" })).toBeNull());
    openSettings.mockRestore();
  });

  it("blocks a second attachment when staged bytes would exceed the combined limit", async () => {
    apiGet.mockResolvedValueOnce({
      ...attachmentPolicy,
      limits: { ...attachmentPolicy.limits, maxFileBytes: 2_000, maxMessageBytes: 2_500 }
    });
    pickDocumentMock
      .mockResolvedValueOnce({
        status: "selected",
        asset: { uri: "file:///private/first.pdf", name: "first.pdf", mimeType: "application/pdf", size: 2_000 }
      })
      .mockResolvedValueOnce({
        status: "selected",
        asset: { uri: "file:///private/second.pdf", name: "second.pdf", mimeType: "application/pdf", size: 1_000 }
      });
    uploadAttachment.mockReturnValueOnce({
      result: Promise.resolve(stagedAttachment("first", "first.pdf", "application/pdf", 2_000)),
      cancel: jest.fn()
    });
    const harness = composerHarness();
    const view = await render(harness.element());
    const open = await view.findByRole("button", { name: "Open attachment options" });

    await fireEvent.press(open);
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await view.findByText("document · 2 KB · Ready to send");
    await fireEvent.press(open);
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));

    await waitFor(() => expect(view.getByText("Attachments must stay within 3 KB per message.")).toBeTruthy());
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
  });

  it("recovers only the active scoped image and locks media controls while recovery is pending", async () => {
    const recovered = deferred<{
      status: "selected";
      source: "camera";
      asset: { uri: string; name: string; mimeType: string; size: number; width: number; height: number };
    }>();
    const uploaded = deferred<ReturnType<typeof stagedAttachment>>();
    recoverPendingImageSelectionMock.mockReturnValueOnce(recovered.promise);
    uploadAttachment.mockReturnValueOnce({ result: uploaded.promise, cancel: jest.fn() });
    const harness = composerHarness();
    const view = await testingRender(harness.element());

    await waitFor(() => expect(recoverPendingImageSelectionMock).toHaveBeenCalledTimes(1));
    const attachment = view.getByRole("button", { name: "Open attachment options" });
    expect(attachment.props.accessibilityState.disabled).toBe(true);
    expect(view.queryByRole("button", { name: "Record voice note" })).toBeNull();

    await act(async () => recovered.resolve({
      status: "selected",
      source: "camera",
      asset: {
        uri: "file:///private/recovered.jpg",
        name: "recovered.jpg",
        mimeType: "image/jpeg",
        size: 1_500,
        width: 800,
        height: 600
      }
    }));
    await act(async () => uploaded.resolve(stagedAttachment("recovered", "recovered.jpg", "image/jpeg", 1_500, "image")));
    await view.findByText("image · 2 KB · Ready to send");
    expect(releaseSelectedAssetMock).toHaveBeenCalledWith(expect.objectContaining({
      uri: "file:///private/recovered.jpg"
    }));
    expect(recoverPendingImageSelectionMock.mock.calls[0]?.[1]).toMatchObject({
      projectId: "project-a",
      userId: "user-me",
      sessionGeneration: 7
    });
  });

  it("focuses native input without mutating the draft and preserves composed Unicode", async () => {
    const harness = composerHarness();
    const view = await render(harness.element());
    const input = view.getByLabelText("Message the project team");
    const nextFrame = jest.spyOn(global, "requestAnimationFrame");
    await fireEvent.changeText(input, "Before");
    await fireEvent(input, "selectionChange", { nativeEvent: { selection: { start: 3, end: 3 } } });
    await fireEvent.press(view.getByRole("button", { name: "Open device emoji keyboard" }));

    expect(input.props.value).toBe("Before");
    await waitFor(() => expect(nextFrame).toHaveBeenCalledTimes(1));
    const composed = "Builder 👩🏽‍💻 with family 👨‍👩‍👧‍👦";
    await fireEvent.changeText(input, composed);
    expect(input.props.value).toBe(composed);
    nextFrame.mockRestore();
  });

  it("uses at least 48dp targets for every primary composer control", async () => {
    const harness = composerHarness();
    const view = await render(harness.element());
    expect(await view.findByRole("button", { name: "Open attachment options" })).toHaveStyle({ width: 48, height: 48 });
    expect(view.getByRole("button", { name: "Open device emoji keyboard" })).toHaveStyle({ width: 48, minHeight: 48 });
    expect(view.getByRole("button", { name: "Message importance" })).toHaveStyle({ width: 48, minHeight: 48 });
    expect(view.getByRole("button", { name: "Record voice note" })).toHaveStyle({ width: 48, height: 48 });
  });

  it("locks voice startup, shows elapsed time, and invokes Stop once", async () => {
    const start = deferred<undefined>();
    startRecording.mockReturnValueOnce(start.promise);
    jest.useFakeTimers();
    try {
      const harness = composerHarness();
      const view = await render(harness.element());
      const record = await view.findByRole("button", { name: "Record voice note" });
      await fireEvent.press(record);
      expect(view.getByText("Requesting microphone…")).toBeTruthy();
      await fireEvent.press(view.getByRole("button", { name: "Requesting microphone" }));
      expect(startRecording).toHaveBeenCalledTimes(1);

      await act(async () => start.resolve(undefined));
      act(() => jest.advanceTimersByTime(1_000));
      expect(view.getByText("Recording · 0:01")).toBeTruthy();
      await fireEvent.press(view.getByRole("button", { name: "Stop voice note" }));
      expect(stopRecording).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("stages a completed voice note as ready and never auto-sends", async () => {
    const upload = deferred<ReturnType<typeof stagedAttachment>>();
    uploadAttachment.mockReturnValueOnce({ result: upload.promise, cancel: jest.fn() });
    apiPost.mockResolvedValueOnce({});
    const harness = composerHarness();
    const view = await render(harness.element());
    await fireEvent.press(await view.findByRole("button", { name: "Record voice note" }));
    await waitFor(() => expect(view.getByRole("button", { name: "Stop voice note" })).toBeTruthy());

    await act(async () => recordingListener?.({
      type: "completed",
      reason: "user",
      recording: {
        uri: "file:///private/voice.m4a",
        fileName: "voice.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 4_096,
        durationMillis: 2_500
      }
    }));
    expect(apiPost).not.toHaveBeenCalled();
    await act(async () => upload.resolve(stagedAttachment("voice", "voice.m4a", "audio/mp4", 4_096, "audio")));
    await view.findByText("Voice note · audio/mp4 · 4 KB · Ready to send");
    expect(apiPost).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Voice caption");
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0]?.[1]).toMatchObject({
      body: "Voice caption",
      attachmentIds: ["voice"]
    });
  });

  it("contains a synchronous voice transfer failure and releases recording on removal", async () => {
    uploadAttachment.mockImplementationOnce(() => {
      throw new Error("Recorder cache failed at file:///private/voice.m4a");
    });
    const harness = composerHarness();
    const view = await render(harness.element());
    await fireEvent.press(await view.findByRole("button", { name: "Record voice note" }));
    await waitFor(() => expect(view.getByRole("button", { name: "Stop voice note" })).toBeTruthy());

    await act(async () => recordingListener?.({
      type: "completed",
      reason: "user",
      recording: {
        uri: "file:///private/voice.m4a",
        fileName: "voice.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 4_096,
        durationMillis: 2_500
      }
    }));
    await view.findByText("The attachment upload could not be confirmed. Retry keeps the same upload identity.");
    expect(view.queryByText(/Recorder cache failed|file:\/\/\/private/)).toBeNull();
    expect(view.getByRole("button", { name: "Retry attachment upload" }).props.accessibilityState.disabled).toBe(false);
    expect(releaseSelectedAssetMock).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole("button", { name: "Remove voice.m4a" }));
    await waitFor(() => expect(releaseRecording).toHaveBeenCalledWith("file:///private/voice.m4a"));
    expect(releaseRecording).toHaveBeenCalledTimes(1);
  });

  it("releases a completed private recording delivered after the owner scope changed", async () => {
    const harness = composerHarness();
    const view = await render(harness.element());
    await fireEvent.press(await view.findByRole("button", { name: "Record voice note" }));
    await waitFor(() => expect(view.getByRole("button", { name: "Stop voice note" })).toBeTruthy());

    await view.rerender(harness.element({ ...harness.props, projectId: "project-b" }));
    await waitForComposerReady(view, 2);
    await act(async () => recordingListener?.({
      type: "completed",
      reason: "user",
      recording: {
        uri: "file:///private/stale.m4a",
        fileName: "stale.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 2_048,
        durationMillis: 1_000
      }
    }));
    await waitFor(() => expect(releaseRecording).toHaveBeenCalledWith("file:///private/stale.m4a"));
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("releases the parent sending lock when an in-flight composer unmounts", async () => {
    const request = deferred<unknown>();
    apiPost.mockReturnValueOnce(request.promise);
    const onSendingChange = jest.fn();
    const harness = composerHarness({ onSendingChange });
    const view = await render(harness.element());
    await waitFor(() => expect(recoverPendingImageSelectionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(
      view.getByRole("button", { name: "Open attachment options" }).props.accessibilityState.disabled
    ).toBe(false));
    await fireEvent.changeText(view.getByLabelText("Message the project team"), "Pending update");
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(onSendingChange).toHaveBeenCalledWith(true));

    await view.unmount();
    expect(onSendingChange).toHaveBeenLastCalledWith(false);
  });

  it("blocks Send and Back while a staged attachment deletion is pending", async () => {
    const deletion = deferred<undefined>();
    const asset = {
      uri: "file:///private/cache/remove.pdf",
      name: "remove.pdf",
      mimeType: "application/pdf",
      size: 2_048
    };
    pickDocumentMock.mockResolvedValueOnce({ status: "selected", asset });
    uploadAttachment.mockReturnValueOnce({
      result: Promise.resolve(stagedAttachment("remove", "remove.pdf", "application/pdf", 2_048)),
      cancel: jest.fn()
    });
    apiDelete.mockReturnValueOnce(deletion.promise);
    const composerRef = createRef<ChatComposerHandle>();
    const harness = composerHarness({}, composerRef);
    const view = await render(harness.element());

    await fireEvent.press(await view.findByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await view.findByText("document · 2 KB · Ready to send");
    expect(view.getByRole("button", { name: "Send message" }).props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(view.getByRole("button", { name: "Remove remove.pdf" }));
    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/projects/project-a/chat/attachments/remove"));
    await waitFor(() => expect(view.getByRole("button", { name: "Send message" }).props.accessibilityState.disabled).toBe(true));
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    expect(apiPost).not.toHaveBeenCalled();
    expect(composerRef.current?.dismissTransientState()).toBe(true);
    expect(apiDelete).toHaveBeenCalledTimes(1);

    await act(async () => deletion.resolve(undefined));
    await waitFor(() => expect(view.queryByText("remove.pdf")).toBeNull());
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("does not discard a staged attachment when a committed send is still in flight during unmount", async () => {
    const upload = deferred<{
      clientUploadId: string;
      attachment: { id: string; filename: string; mimeType: string; byteSize: number; kind: string; preview: null };
      expiresAt: string;
    }>();
    const request = deferred<unknown>();
    const cancel = jest.fn();
    pickDocumentMock.mockResolvedValueOnce({
      status: "selected",
      asset: { uri: "file:///private/plan.pdf", name: "plan.pdf", mimeType: "application/pdf", size: 2048 }
    });
    uploadAttachment.mockReturnValueOnce({ result: upload.promise, cancel });
    apiPost.mockReturnValueOnce(request.promise);
    const harness = composerHarness();
    const view = await render(harness.element());

    await waitFor(() => expect(view.getByRole("button", { name: "Open attachment options" })).toBeTruthy());
    await fireEvent.press(view.getByRole("button", { name: "Open attachment options" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    await act(async () => upload.resolve({
      clientUploadId: "upload-a",
      attachment: { id: "attachment-a", filename: "plan.pdf", mimeType: "application/pdf", byteSize: 2048, kind: "document", preview: null },
      expiresAt: "2099-01-01T00:00:00.000Z"
    }));
    await waitFor(() => expect(view.getByText("document · 2 KB · Ready to send")).toBeTruthy());
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));

    await view.unmount();
    expect(apiDelete).not.toHaveBeenCalledWith("/projects/project-a/chat/attachments/attachment-a");
  });
});
