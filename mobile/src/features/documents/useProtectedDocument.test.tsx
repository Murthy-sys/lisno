import { act, renderHook, waitFor } from "@testing-library/react-native";

import {
  StaleTransferError,
  TransferAuthenticationError,
  TransferHttpError,
  TransferSizeError,
  type DownloadedArtifact
} from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { clientPlanPageImagePath } from "../estimates/clientReviewApi";
import {
  PROTECTED_DOCUMENT_MAX_BYTES,
  protectedDocumentError,
  useProtectedDocument,
  type ProtectedDocumentSource
} from "./useProtectedDocument";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const mockDownload = jest.fn();
const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const transfers = { download: mockDownload };
let sessionGeneration = 3;
let environmentGeneration = 2;

const PAGE_A: ProtectedDocumentSource = {
  path: clientPlanPageImagePath("page/7 a"),
  fileName: "floor-plan-1.png",
  mimeType: "image/png",
  kind: "plan-page"
};
const PAGE_B: ProtectedDocumentSource = {
  path: clientPlanPageImagePath("page-b"),
  fileName: "floor-plan-2.png",
  mimeType: "image/png",
  kind: "plan-page"
};
const PDF: ProtectedDocumentSource = {
  path: "/client/estimates/estimate-a/pdf",
  fileName: "estimate-a.pdf",
  mimeType: "application/pdf",
  kind: "estimate-pdf"
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

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

function configureRuntime() {
  useConfiguredRuntimeMock.mockImplementation(() => ({
    runtime: { transfers },
    environment: { environment: { id: "env-a" }, generation: environmentGeneration },
    session: { status: "authenticated", generation: sessionGeneration, session: { user: { id: "client-a" } } }
  } as never));
}

describe("useProtectedDocument", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionGeneration = 3;
    environmentGeneration = 2;
    configureRuntime();
  });

  it("downloads the encoded protected page path with a bounded source-specific size and exposes only the local URI", async () => {
    const page = artifact("file:///private/page-a.png");
    mockDownload.mockReturnValue({ result: Promise.resolve(page), cancel: jest.fn() });
    const view = await renderHook(() => useProtectedDocument(PAGE_A, true));

    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(view.result.current.localUri).toBe(page.uri);
    expect(mockDownload).toHaveBeenCalledWith({
      path: "/client/estimate-plan-pages/page%2F7%20a/current-image",
      fileName: "floor-plan-1.png",
      mimeType: "image/png",
      maxBytes: PROTECTED_DOCUMENT_MAX_BYTES["plan-page"]
    });
    expect(PROTECTED_DOCUMENT_MAX_BYTES["design-file"]).toBe(50 * 1024 * 1024);
    await view.unmount();
    await waitFor(() => expect(page.release).toHaveBeenCalledTimes(1));
  });

  it("does not restart a ready download when the runtime supplies a fresh transfers wrapper on every render", async () => {
    useConfiguredRuntimeMock.mockImplementation(() => ({
      runtime: { transfers: { download: (...args: unknown[]) => mockDownload(...args) } },
      environment: { environment: { id: "env-a" }, generation: environmentGeneration },
      session: { status: "authenticated", generation: sessionGeneration, session: { user: { id: "client-a" } } }
    } as never));
    const page = artifact("file:///private/stable.png");
    const cancel = jest.fn();
    mockDownload.mockReturnValue({ result: Promise.resolve(page), cancel });
    const view = await renderHook(() => useProtectedDocument(PAGE_A, true));

    await waitFor(() => expect(view.result.current.localUri).toBe(page.uri));
    await view.rerender({});
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(page.release).not.toHaveBeenCalled();
    await view.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(page.release).toHaveBeenCalledTimes(1));
  });

  it("does not expose a released URI while reopening the same source", async () => {
    const first = artifact("file:///private/first-open.pdf");
    const second = artifact("file:///private/second-open.pdf");
    const pending = deferred<DownloadedArtifact>();
    mockDownload
      .mockReturnValueOnce({ result: Promise.resolve(first), cancel: jest.fn() })
      .mockReturnValueOnce({ result: pending.promise, cancel: jest.fn() });
    const view = await renderHook(
      ({ active }: { readonly active: boolean }) => useProtectedDocument(PDF, active),
      { initialProps: { active: true } }
    );
    await waitFor(() => expect(view.result.current.localUri).toBe(first.uri));
    await view.rerender({ active: false });
    await waitFor(() => expect(first.release).toHaveBeenCalledTimes(1));

    await view.rerender({ active: true });
    expect(view.result.current.status).toBe("loading");
    expect(view.result.current.localUri).toBeNull();
    expect(mockDownload).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(second));
    expect(view.result.current.localUri).toBe(second.uri);
    await view.unmount();
    await waitFor(() => expect(second.release).toHaveBeenCalledTimes(1));
  });

  it("cancels superseded pages, releases a late result, and releases the current page on close", async () => {
    const first = deferred<DownloadedArtifact>();
    const second = deferred<DownloadedArtifact>();
    const firstCancel = jest.fn();
    const secondCancel = jest.fn();
    const firstArtifact = artifact("file:///private/old.png");
    const secondArtifact = artifact("file:///private/current.png");
    mockDownload
      .mockReturnValueOnce({ result: first.promise, cancel: firstCancel })
      .mockReturnValueOnce({ result: second.promise, cancel: secondCancel });
    const view = await renderHook(
      ({ source, active }: { readonly source: ProtectedDocumentSource; readonly active: boolean }) => useProtectedDocument(source, active),
      { initialProps: { source: PAGE_A, active: true } }
    );

    await view.rerender({ source: PAGE_B, active: true });
    expect(firstCancel).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve(firstArtifact));
    expect(firstArtifact.release).toHaveBeenCalledTimes(1);
    expect(view.result.current.localUri).toBeNull();

    await act(async () => second.resolve(secondArtifact));
    expect(view.result.current.localUri).toBe(secondArtifact.uri);
    await view.rerender({ source: PAGE_B, active: false });
    expect(secondCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(secondArtifact.release).toHaveBeenCalledTimes(1));
    expect(view.result.current.localUri).toBeNull();
  });

  it("releases the private image and starts a new download when the session changes", async () => {
    const first = artifact("file:///private/before.png");
    const second = artifact("file:///private/after.png");
    mockDownload
      .mockReturnValueOnce({ result: Promise.resolve(first), cancel: jest.fn() })
      .mockReturnValueOnce({ result: Promise.resolve(second), cancel: jest.fn() });
    const view = await renderHook(() => useProtectedDocument(PAGE_A, true));
    await waitFor(() => expect(view.result.current.localUri).toBe(first.uri));

    sessionGeneration += 1;
    await view.rerender({});
    await waitFor(() => expect(first.release).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.result.current.localUri).toBe(second.uri));
    expect(mockDownload).toHaveBeenCalledTimes(2);
    await view.unmount();
    await waitFor(() => expect(second.release).toHaveBeenCalledTimes(1));
  });

  it("does not issue a download while inactive, then retries a failed network load", async () => {
    const page = artifact("file:///private/retry.png");
    const failed = deferred<DownloadedArtifact>();
    mockDownload
      .mockReturnValueOnce({ result: failed.promise, cancel: jest.fn() })
      .mockReturnValueOnce({ result: Promise.resolve(page), cancel: jest.fn() });
    const view = await renderHook(
      ({ active }: { readonly active: boolean }) => useProtectedDocument(PAGE_A, active),
      { initialProps: { active: false } }
    );
    expect(mockDownload).not.toHaveBeenCalled();
    await view.rerender({ active: true });
    await act(async () => failed.reject(new Error("private URL failed")));
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    expect(view.result.current.error).toEqual({
      kind: "network",
      message: "This document could not be loaded. Check your connection and try again."
    });
    expect(JSON.stringify(view.result.current)).not.toContain("private URL failed");
    await act(async () => { view.result.current.retry(); });
    await waitFor(() => expect(view.result.current.localUri).toBe(page.uri));
    expect(mockDownload).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it("shows an unavailable state for an incomplete source without starting a transfer", async () => {
    const view = await renderHook(() => useProtectedDocument({ ...PAGE_A, path: "" }, true));
    expect(view.result.current.status).toBe("error");
    expect(view.result.current.error?.kind).toBe("unavailable");
    expect(mockDownload).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("shares an explicit fallback once and cleans it even when Download is tapped repeatedly", async () => {
    const pdf = artifact("file:///private/estimate.pdf");
    const reader = deferred<void>();
    pdf.share.mockReturnValue(reader.promise);
    mockDownload.mockReturnValue({ result: Promise.resolve(pdf), cancel: jest.fn() });
    const view = await renderHook(() => useProtectedDocument(PDF, true));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = view.result.current.openExternally();
      second = view.result.current.openExternally();
    });
    expect(view.result.current.sharing).toBe(true);
    expect(await second).toBe(false);
    expect(pdf.share).toHaveBeenCalledTimes(1);
    expect(pdf.share).toHaveBeenCalledWith({ cleanupAfterShare: true });
    await act(async () => reader.resolve());
    expect(await first).toBe(true);
    expect(pdf.release).toHaveBeenCalledTimes(1);
    expect(view.result.current.sharing).toBe(false);
    await view.unmount();
  });

  it("releases the file when explicit sharing fails and provides a safe retry state", async () => {
    const pdf = artifact("file:///private/estimate.pdf");
    pdf.share.mockRejectedValue(new Error("file:///private/estimate.pdf: reader failed"));
    mockDownload.mockReturnValue({ result: Promise.resolve(pdf), cancel: jest.fn() });
    const view = await renderHook(() => useProtectedDocument(PDF, true));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    await act(async () => expect(await view.result.current.openExternally()).toBe(false));
    expect(view.result.current.error).toEqual({ kind: "share", message: "This document could not be downloaded. Try again." });
    expect(pdf.release).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("does not report a finished share handoff as current after the viewer closes", async () => {
    const pdf = artifact("file:///private/estimate-closed.pdf");
    const reader = deferred<void>();
    pdf.share.mockReturnValue(reader.promise);
    mockDownload.mockReturnValue({ result: Promise.resolve(pdf), cancel: jest.fn() });
    const view = await renderHook(
      ({ active }: { readonly active: boolean }) => useProtectedDocument(PDF, active),
      { initialProps: { active: true } }
    );
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    let opening!: Promise<boolean>;
    await act(async () => { opening = view.result.current.openExternally(); });
    await view.rerender({ active: false });
    expect(pdf.release).toHaveBeenCalled();
    await act(async () => reader.resolve());
    expect(await opening).toBe(false);
    await view.unmount();
  });
});

describe("protectedDocumentError", () => {
  it("distinguishes authentication, denial, absence, size, and network without surfacing raw server text", () => {
    const raw = "private token and file:///private/client-plan.png";
    expect(protectedDocumentError(new TransferAuthenticationError()).kind).toBe("authentication");
    expect(protectedDocumentError(new StaleTransferError()).kind).toBe("authentication");
    expect(protectedDocumentError(new TransferHttpError(401, "PRIVATE", raw)).kind).toBe("authentication");
    expect(protectedDocumentError(new TransferHttpError(403, "PRIVATE", raw)).kind).toBe("denied");
    expect(protectedDocumentError(new TransferHttpError(404, "PRIVATE", raw)).kind).toBe("unavailable");
    expect(protectedDocumentError(new TransferHttpError(413, "PRIVATE", raw)).kind).toBe("too-large");
    expect(protectedDocumentError(new TransferSizeError(50)).kind).toBe("too-large");
    expect(protectedDocumentError(new Error(raw)).kind).toBe("network");
    for (const error of [401, 403, 404, 413].map((status) => protectedDocumentError(new TransferHttpError(status, "PRIVATE", raw)))) {
      expect(error.message).not.toContain(raw);
    }
  });
});
