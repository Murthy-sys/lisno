import { CleanupRegistry } from "../../core/config/cleanupRegistry";
import {
  NativeTransferManager,
  TransferCancelledError,
  TransferSizeError,
  createAuthenticatedResourceProvider,
  type AuthenticatedResourceContext,
  type NativeTransferAdapter
} from "./transfer";

const context: AuthenticatedResourceContext = {
  apiBaseUrl: "https://api.example.test/api/v1",
  environmentId: "remote:https://api.example.test/api/v1",
  environmentGeneration: 2,
  userId: "user-1",
  sessionGeneration: 3,
  token: "private-token"
};

function createAdapter() {
  const deleted: string[] = [];
  const shared: string[] = [];
  const uploads: Array<Parameters<NativeTransferAdapter["createUpload"]>[0]> = [];
  const downloads: Array<Parameters<NativeTransferAdapter["createDownload"]>[0]> = [];
  const cancelled = { upload: 0, download: 0 };
  const released = { upload: 0, download: 0 };
  let uploadRun: (
    input: Parameters<NativeTransferAdapter["createUpload"]>[0]
  ) => Promise<{ status: number; body: string }> = async (input) => {
    input.onProgress(5, 10);
    return { status: 200, body: JSON.stringify({ data: { id: "upload-1" } }) };
  };
  let downloadRun: (
    input: Parameters<NativeTransferAdapter["createDownload"]>[0]
  ) => Promise<{ uri: string; sizeBytes: number }> = async (input) => {
    input.onProgress(20, 40);
    return { uri: input.destinationUri, sizeBytes: 40 };
  };
  const adapter: NativeTransferAdapter = {
    async stat() {
      return { exists: true, sizeBytes: 10 };
    },
    createUpload(input) {
      uploads.push(input);
      return {
        run: () => uploadRun(input),
        cancel: () => {
          cancelled.upload += 1;
        },
        release: () => {
          released.upload += 1;
        }
      };
    },
    createDownload(input) {
      downloads.push(input);
      return {
        run: () => downloadRun(input),
        cancel: () => {
          cancelled.download += 1;
        },
        release: () => {
          released.download += 1;
        }
      };
    },
    makePrivateDestination(fileName) {
      return `file:///private/${fileName}`;
    },
    async delete(uri) {
      deleted.push(uri);
    },
    async share(uri) {
      shared.push(uri);
    }
  };
  return {
    adapter,
    deleted,
    shared,
    uploads,
    downloads,
    cancelled,
    released,
    setUploadRun(value: typeof uploadRun) {
      uploadRun = value;
    },
    setDownloadRun(value: typeof downloadRun) {
      downloadRun = value;
    }
  };
}

function createManager(native = createAdapter()) {
  let current = true;
  const cleanups = new CleanupRegistry();
  const manager = new NativeTransferManager(
    {
      getAuthenticatedResourceContext: () => context,
      isCurrent: (candidate) => current && candidate === context
    },
    cleanups,
    native.adapter
  );
  return { manager, cleanups, native, makeStale: () => (current = false) };
}

describe("native authenticated transfers", () => {
  it("fences resource credentials by environment and session generations", () => {
    let environmentGeneration = 2;
    const provider = createAuthenticatedResourceProvider({
      getEnvironmentSnapshot: () => ({
        environment: { id: context.environmentId, apiBaseUrl: context.apiBaseUrl },
        generation: environmentGeneration
      }),
      getRequestToken: () => ({
        token: context.token,
        userId: context.userId,
        sessionGeneration: context.sessionGeneration,
        environmentId: context.environmentId,
        accepted: true
      })
    });
    const accepted = provider.getAuthenticatedResourceContext();
    expect(accepted).toEqual(context);
    expect(accepted && provider.isCurrent(accepted)).toBe(true);
    environmentGeneration = 3;
    expect(accepted && provider.isCurrent(accepted)).toBe(false);
  });

  it("uploads to the configured API with a single owned bearer header", async () => {
    const harness = createManager();
    const onProgress = jest.fn();
    const transfer = harness.manager.upload<{ id: string }>({
      path: "/projects/p-1/chat/attachments",
      fileUri: "content://picker/photo",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fieldName: "attachment",
      maxBytes: 100,
      onProgress
    });

    await expect(transfer.result).resolves.toEqual({ id: "upload-1" });
    expect(harness.native.uploads[0]).toMatchObject({
      url: "https://api.example.test/api/v1/projects/p-1/chat/attachments",
      headers: { Authorization: "Bearer private-token" },
      fieldName: "attachment"
    });
    expect(onProgress).toHaveBeenCalledWith({
      loadedBytes: 5,
      totalBytes: 10,
      fraction: 0.5
    });
    expect(harness.native.released.upload).toBe(1);
  });

  it("cancels an upload when native progress exceeds the byte policy", async () => {
    const harness = createManager();
    harness.native.setUploadRun(async (input) => {
      input.onProgress(101, 101);
      return { status: 200, body: JSON.stringify({ data: { id: "too-large" } }) };
    });
    const transfer = harness.manager.upload({
      path: "/projects/p-1/chat/attachments",
      fileUri: "file:///cache/large.jpg",
      fileName: "large.jpg",
      mimeType: "image/jpeg",
      maxBytes: 100
    });

    await expect(transfer.result).rejects.toBeInstanceOf(TransferSizeError);
    expect(harness.native.cancelled.upload).toBe(1);
  });

  it("keeps downloaded files private until sharing or explicit release", async () => {
    const harness = createManager();
    const artifact = await harness.manager.download({
      path: "/projects/p-1/document",
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      maxBytes: 1_000
    }).result;

    expect(harness.native.downloads[0]?.headers).toEqual({
      Authorization: "Bearer private-token"
    });
    await artifact.share();
    expect(harness.native.shared).toEqual(["file:///private/proof.pdf"]);
    expect(harness.native.deleted).toEqual(["file:///private/proof.pdf"]);
    await expect(artifact.share()).rejects.toThrow("no longer available");
  });

  it("cancels active transfers and removes private artifacts during cleanup", async () => {
    const harness = createManager();
    let rejectDownload!: (reason: unknown) => void;
    harness.native.setDownloadRun(
      () => new Promise((_resolve, reject) => (rejectDownload = reject))
    );
    const transfer = harness.manager.download({
      path: "/projects/p-1/document",
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      maxBytes: 1_000
    });
    await Promise.resolve();
    const cleanup = harness.cleanups.run({
      reason: "logout",
      generation: 2,
      fromEnvironment: {
        profile: "remote",
        id: context.environmentId,
        apiBaseUrl: context.apiBaseUrl,
        origin: "https://api.example.test",
        host: "api.example.test",
        isLocal: false
      }
    });
    rejectDownload(new Error("cancelled by native task"));

    await cleanup;
    await expect(transfer.result).rejects.toThrow("cancelled by native task");
    expect(harness.native.cancelled.download).toBe(1);
    expect(harness.native.released.download).toBe(1);
    expect(harness.native.deleted).toContain("file:///private/proof.pdf");
  });

  it("maps explicit caller cancellation to a stable cancellation error", async () => {
    const harness = createManager();
    harness.native.setUploadRun(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("native abort")), 0))
    );
    const transfer = harness.manager.upload({
      path: "/projects/p-1/chat/attachments",
      fileUri: "file:///cache/voice.m4a",
      fileName: "voice.m4a",
      mimeType: "audio/mp4",
      maxBytes: 100
    });
    transfer.cancel();
    await expect(transfer.result).rejects.toBeInstanceOf(TransferCancelledError);
  });
});
