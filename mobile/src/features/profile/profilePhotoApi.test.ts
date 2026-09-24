import { CleanupRegistry } from "../../core/config/cleanupRegistry";
import type { EnvironmentSnapshot } from "../../core/config/environmentManager";
import { ApiError, ApiNetworkError, JsonApiClient } from "../../core/http/apiClient";
import {
  AssetPolicyError,
  NativeTransferManager,
  OversizedAssetPolicyError,
  TransferHttpError,
  TransferSizeError,
  type AuthenticatedResourceContext,
  type NativeTransferAdapter,
  type SelectedAsset
} from "../../platform/files";
import {
  InvalidProfilePhotoResponseError,
  parseProfilePhotoResponse,
  profilePhotoErrorMessage,
  removeProfilePhoto,
  uploadProfilePhoto
} from "./profilePhotoApi";

const user = {
  id: "user-1",
  name: "Asha Rao",
  email: "asha@example.test",
  role: "designer",
  profilePhotoVersion: 2
};

const context: AuthenticatedResourceContext = {
  apiBaseUrl: "https://api.example.test/api/v1",
  environmentId: "remote:https://api.example.test/api/v1",
  environmentGeneration: 2,
  userId: "user-1",
  sessionGeneration: 3,
  token: "private-token"
};

const asset: SelectedAsset = {
  uri: "file:///cache/avatar.jpg",
  name: "avatar.jpg",
  mimeType: "image/jpeg",
  size: 2048,
  width: 512,
  height: 512
};

function createTransfers(response: { status: number; body: string }) {
  const uploads: Array<Parameters<NativeTransferAdapter["createUpload"]>[0]> = [];
  const adapter: NativeTransferAdapter = {
    stat: async () => ({ exists: true, sizeBytes: asset.size }),
    createUpload(input) {
      uploads.push(input);
      return {
        run: async () => {
          input.onProgress(1024, 2048);
          return response;
        },
        cancel: () => undefined,
        release: () => undefined
      };
    },
    createDownload: () => {
      throw new Error("unexpected download");
    },
    makePrivateDestination: (name) => `file:///private/${name}`,
    delete: async () => undefined,
    share: async () => undefined
  };
  const manager = new NativeTransferManager(
    { getAuthenticatedResourceContext: () => context, isCurrent: () => true },
    new CleanupRegistry(),
    adapter
  );
  return { manager, uploads };
}

function createApi(fetchImplementation: jest.Mock) {
  const snapshot = {
    environment: {
      profile: "remote",
      id: context.environmentId,
      apiBaseUrl: context.apiBaseUrl,
      origin: "https://api.example.test",
      host: "api.example.test",
      isLocal: false
    },
    generation: 2,
    status: "ready"
  } as unknown as EnvironmentSnapshot;
  return new JsonApiClient({
    getEnvironmentSnapshot: () => snapshot,
    tokenSource: {
      getRequestToken: () => ({
        token: context.token,
        userId: context.userId,
        sessionGeneration: context.sessionGeneration,
        environmentId: context.environmentId,
        accepted: true
      })
    },
    fetch: fetchImplementation,
    safeRetryCount: 0
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("profile photo API", () => {
  it("uploads one multipart PUT with the photo field and returns the strictly parsed user", async () => {
    const { manager, uploads } = createTransfers({
      status: 200,
      body: JSON.stringify({ data: { user } })
    });
    const onProgress = jest.fn();

    const transfer = uploadProfilePhoto(manager, asset, { onProgress });
    await expect(transfer.result).resolves.toEqual(user);

    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      url: "https://api.example.test/api/v1/auth/me/profile-photo",
      method: "PUT",
      fieldName: "photo",
      fileUri: asset.uri,
      fileName: "avatar.jpg",
      mimeType: "image/jpeg",
      parameters: {},
      headers: { Authorization: "Bearer private-token" }
    });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ fraction: 0.5 }));
  });

  it("rejects an upload response without a strictly valid user", async () => {
    for (const data of [{}, { user: { ...user, storageKey: "private/key" } }, { user: { ...user, profilePhotoVersion: 0 } }, null]) {
      const { manager } = createTransfers({ status: 200, body: JSON.stringify({ data }) });
      await expect(uploadProfilePhoto(manager, asset).result).rejects.toBeInstanceOf(
        InvalidProfilePhotoResponseError
      );
    }
  });

  it("surfaces backend error codes from the upload", async () => {
    const { manager } = createTransfers({
      status: 413,
      body: JSON.stringify({ error: { code: "PROFILE_PHOTO_TOO_LARGE", message: "Too large." } })
    });
    const error = await uploadProfilePhoto(manager, asset).result.catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(TransferHttpError);
    expect(error).toMatchObject({ status: 413, code: "PROFILE_PHOTO_TOO_LARGE" });
  });

  it("removes with an authenticated DELETE and parses the returned user", async () => {
    const withoutPhoto = { id: user.id, name: user.name, email: user.email, role: user.role };
    const fetchImplementation = jest.fn(async () => json({ data: { user: withoutPhoto } }));

    await expect(removeProfilePhoto(createApi(fetchImplementation))).resolves.toEqual(withoutPhoto);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/v1/auth/me/profile-photo");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer private-token");
  });

  it("rejects an invalid DELETE payload", async () => {
    const fetchImplementation = jest.fn(async () => json({ data: user }));
    await expect(removeProfilePhoto(createApi(fetchImplementation))).rejects.toBeInstanceOf(
      InvalidProfilePhotoResponseError
    );
  });

  it("parses only { user } payloads", () => {
    expect(parseProfilePhotoResponse({ user })).toEqual(user);
    expect(() => parseProfilePhotoResponse(user)).toThrow(InvalidProfilePhotoResponseError);
    expect(() => parseProfilePhotoResponse([])).toThrow(InvalidProfilePhotoResponseError);
  });

  it("maps error codes to safe friendly messages", () => {
    const fallback = "Fallback.";
    expect(profilePhotoErrorMessage(new ApiError(400, "PROFILE_PHOTO_INVALID", "raw"), fallback)).toMatch(/JPEG, PNG, or WebP/u);
    expect(profilePhotoErrorMessage(new TransferHttpError(400, "PROFILE_PHOTO_INVALID", "raw"), fallback)).toMatch(/JPEG, PNG, or WebP/u);
    expect(profilePhotoErrorMessage(new TransferHttpError(413, "PROFILE_PHOTO_TOO_LARGE", "raw"), fallback)).toMatch(/larger than 5 MB/u);
    expect(profilePhotoErrorMessage(new TransferHttpError(413, "TRANSFER_FAILED", "raw"), fallback)).toMatch(/larger than 5 MB/u);
    expect(profilePhotoErrorMessage(new TransferSizeError(5), fallback)).toMatch(/larger than 5 MB/u);
    expect(profilePhotoErrorMessage(new OversizedAssetPolicyError("a.jpg", 5), fallback)).toMatch(/larger than 5 MB/u);
    expect(profilePhotoErrorMessage(new AssetPolicyError("x"), fallback)).toMatch(/JPEG, PNG, or WebP/u);
    expect(profilePhotoErrorMessage(new ApiError(409, "PROFILE_PHOTO_CONFLICT", "raw"), fallback)).toMatch(/Try again/u);
    expect(profilePhotoErrorMessage(new ApiError(403, "FORBIDDEN", "raw"), fallback)).toMatch(/permission/u);
    expect(profilePhotoErrorMessage(new ApiError(401, "UNAUTHORIZED", "raw"), fallback)).toMatch(/Sign in again/u);
    expect(profilePhotoErrorMessage(new ApiNetworkError(new TypeError("offline")), fallback)).toMatch(/connection/u);
    expect(profilePhotoErrorMessage(new ApiError(500, "INTERNAL", "https://private.example/token"), fallback)).toBe(fallback);
    expect(profilePhotoErrorMessage(new Error("file:///private"), fallback)).toBe(fallback);
  });
});
