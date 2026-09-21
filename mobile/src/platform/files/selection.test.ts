import * as ImagePicker from "expo-image-picker";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined)
  }
}));

import {
  AssetPolicyError,
  AssetSizeResolutionError,
  createAssetSelectionService,
  OversizedAssetPolicyError,
  PendingImageSelectionError,
  PENDING_IMAGE_SELECTION_KEY,
  type AssetMetadataReader,
  type DocumentPickerPort,
  type ImagePickerPort,
  type ImageSelectionScope,
  type SelectedAssetReleaser,
  type SelectionStorage,
  validateSelectedAsset
} from "./selection";

const policy = {
  acceptedMimeTypes: ["image/*", "application/pdf"],
  maxBytes: 5 * 1024 * 1024
};

const imagePolicy = {
  acceptedMimeTypes: ["image/jpeg", "image/png"],
  maxBytes: 5 * 1024 * 1024
};

const scope: ImageSelectionScope = {
  environmentId: "environment-a",
  userId: "user-a",
  projectId: "project-a",
  sessionGeneration: 7
};

function selectedImage(
  overrides: Omit<Partial<ImagePicker.ImagePickerAsset>, "fileSize"> & {
    readonly fileSize?: number | undefined;
  } = {}
): ImagePicker.ImagePickerResult {
  const asset = {
    uri: "content://media/image-1.jpg",
    width: 1600,
    height: 900,
    type: "image",
    fileName: "image-1.jpg",
    fileSize: 4096,
    mimeType: "image/jpeg",
    ...overrides
  } as ImagePicker.ImagePickerAsset;
  if ("fileSize" in overrides && overrides.fileSize === undefined) {
    delete asset.fileSize;
  }
  return {
    canceled: false,
    assets: [asset]
  };
}

function cancelledImage(): ImagePicker.ImagePickerResult {
  return { canceled: true, assets: null };
}

function cameraPermission(
  granted: boolean,
  canAskAgain: boolean
): ImagePicker.CameraPermissionResponse {
  return {
    granted,
    canAskAgain,
    status: granted
      ? ImagePicker.PermissionStatus.GRANTED
      : ImagePicker.PermissionStatus.DENIED,
    expires: "never"
  };
}

function marker(
  overrides: Partial<
    Pick<ImageSelectionScope, "environmentId" | "userId" | "projectId"> & {
      readonly source: "photo" | "camera";
      readonly expiresAt: number;
    }
  > = {}
): string {
  return JSON.stringify({
    environmentId: scope.environmentId,
    userId: scope.userId,
    projectId: scope.projectId,
    source: "photo",
    expiresAt: 310_000,
    ...overrides
  });
}

function createHarness(input: {
  readonly now?: number;
  readonly initialMarker?: string | null;
} = {}) {
  let stored = input.initialMarker ?? null;
  const storage: SelectionStorage = {
    getItem: jest.fn(async () => stored),
    setItem: jest.fn(async (_key, value) => {
      stored = value;
    }),
    removeItem: jest.fn(async () => {
      stored = null;
    })
  };
  const documentPicker: DocumentPickerPort = {
    getDocumentAsync: jest.fn(async () => ({
      canceled: true as const,
      assets: null
    }))
  };
  const imagePicker: ImagePickerPort = {
    requestCameraPermissionsAsync: jest.fn(async () => cameraPermission(true, true)),
    launchImageLibraryAsync: jest.fn(async () => cancelledImage()),
    launchCameraAsync: jest.fn(async () => cancelledImage()),
    getPendingResultAsync: jest.fn(async () => null)
  };
  const metadataReader: AssetMetadataReader = {
    getSize: jest.fn(async () => 4096)
  };
  const released: string[] = [];
  const assetReleaser: SelectedAssetReleaser = {
    release: jest.fn(async (uri) => {
      released.push(uri);
    })
  };
  const service = createAssetSelectionService({
    documentPicker,
    imagePicker,
    storage,
    metadataReader,
    assetReleaser,
    now: () => input.now ?? 10_000,
    pendingSelectionTtlMs: 300_000
  });
  return {
    service,
    storage,
    documentPicker,
    imagePicker,
    metadataReader,
    assetReleaser,
    released,
    stored: () => stored
  };
}

describe("native asset policy", () => {
  it("accepts readable positive files and rejects unsafe locations, names, sizes, MIME types, and dimensions", () => {
    expect(
      validateSelectedAsset(
        {
          uri: "content://documents/image-1",
          name: "proof.jpg",
          mimeType: "image/jpeg",
          size: 2048,
          width: 800,
          height: 600
        },
        policy
      )
    ).toMatchObject({ name: "proof.jpg", size: 2048 });

    const invalid = [
      {
        uri: "https://attacker.example/file",
        name: "proof.jpg",
        mimeType: "image/jpeg",
        size: 2
      },
      {
        uri: "file:///proof.jpg",
        name: "../proof.jpg",
        mimeType: "image/jpeg",
        size: 2
      },
      {
        uri: "file:///proof.exe",
        name: "proof.exe",
        mimeType: "application/x-msdownload",
        size: 2
      },
      {
        uri: "file:///proof.pdf",
        name: "proof.pdf",
        mimeType: "application/pdf",
        size: 0
      },
      {
        uri: "file:///proof.pdf",
        name: "proof.pdf",
        mimeType: "application/pdf",
        size: policy.maxBytes + 1
      },
      {
        uri: "file:///proof.jpg",
        name: "proof.jpg",
        mimeType: "image/jpeg",
        size: 2,
        width: 0,
        height: 20
      }
    ];

    for (const asset of invalid) {
      expect(() => validateSelectedAsset(asset, policy)).toThrow(AssetPolicyError);
    }
  });
});

describe("document selection", () => {
  it("retains the single cached document picker and resolves a missing exact size", async () => {
    const harness = createHarness();
    jest.mocked(harness.documentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "content://documents/drawing.PDF",
          name: "drawing.PDF",
          lastModified: 1
        }
      ]
    });
    jest.mocked(harness.metadataReader.getSize).mockResolvedValueOnce(12_345);

    await expect(harness.service.pickDocument(policy)).resolves.toEqual({
      status: "selected",
      asset: {
        uri: "content://documents/drawing.PDF",
        name: "drawing.PDF",
        mimeType: "application/pdf",
        size: 12_345
      }
    });
    expect(harness.documentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
      base64: false
    });
    expect(harness.metadataReader.getSize).toHaveBeenCalledWith(
      "content://documents/drawing.PDF"
    );
  });

  it("resolves a missing exact size from an app-cache file URI", async () => {
    const harness = createHarness();
    jest.mocked(harness.documentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "file:///data/user/0/com.lisno.mobile.dev/cache/drawing.pdf",
          name: "drawing.pdf",
          mimeType: "application/pdf",
          lastModified: 1
        }
      ]
    });
    jest.mocked(harness.metadataReader.getSize).mockResolvedValueOnce(98_765);

    await expect(harness.service.pickDocument(policy)).resolves.toMatchObject({
      status: "selected",
      asset: { size: 98_765 }
    });
    expect(harness.metadataReader.getSize).toHaveBeenCalledWith(
      "file:///data/user/0/com.lisno.mobile.dev/cache/drawing.pdf"
    );
  });

  it("returns safe oversized metadata and releases the rejected cached document", async () => {
    const harness = createHarness();
    const uri = "file:///data/user/0/com.lisno.mobile.dev/cache/private-client-plan.pdf";
    jest.mocked(harness.documentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri,
        name: "../provider/Client Plan?.pdf",
        mimeType: "application/pdf",
        size: policy.maxBytes + 1,
        lastModified: 1
      }]
    });

    const error = await harness.service.pickDocument(policy).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(OversizedAssetPolicyError);
    expect(error).toMatchObject({
      fileName: "Client Plan_.pdf",
      maxBytes: policy.maxBytes,
      message: "The selected file is larger than allowed."
    });
    expect(error).not.toHaveProperty("uri");
    expect(JSON.stringify(error)).not.toContain("file://");
    expect(harness.released).toEqual([uri]);
  });

  it.each([
    ["scan.tif", "image/tiff"],
    ["scan.tiff", "image/tiff"],
    ["walkthrough.mov", "video/quicktime"],
    ["walkthrough.webm", "video/webm"],
    ["voice.ogg", "audio/ogg"],
    ["voice.opus", "audio/ogg"],
    ["voice.webm", "audio/webm"],
    ["voice.mp4", "audio/mp4"],
    [
      "brief.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ],
    [
      "budget.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ],
    [
      "deck.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ]
  ] as const)(
    "uses the active backend policy to infer %s as %s when MIME is omitted",
    async (name, mimeType) => {
      const harness = createHarness();
      jest.mocked(harness.documentPicker.getDocumentAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: `content://documents/${name}`,
            name,
            size: 2048,
            lastModified: 1
          }
        ]
      });

      await expect(
        harness.service.pickDocument(
          { acceptedMimeTypes: [mimeType], maxBytes: 4096 }
        )
      ).resolves.toMatchObject({
        status: "selected",
        asset: { name, mimeType, size: 2048 }
      });
      expect(harness.metadataReader.getSize).not.toHaveBeenCalled();
    }
  );

  it("does not infer an extension MIME outside the active backend allowlist", async () => {
    const harness = createHarness();
    jest.mocked(harness.documentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "content://documents/voice.opus",
          name: "voice.opus",
          size: 2048,
          lastModified: 1
        }
      ]
    });

    await expect(
      harness.service.pickDocument({
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: 4096
      })
    ).rejects.toThrow("type");
  });

  it("releases rejected or explicitly discarded app-cache files without deleting content URIs", async () => {
    const rejectedCache = createHarness();
    jest.mocked(rejectedCache.documentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: "file:///data/user/0/com.lisno.mobile.dev/cache/blocked.exe",
        name: "blocked.exe",
        mimeType: "application/x-msdownload",
        size: 2048,
        lastModified: 1
      }]
    });
    await expect(rejectedCache.service.pickDocument(policy)).rejects.toThrow("type");
    expect(rejectedCache.released).toEqual([
      "file:///data/user/0/com.lisno.mobile.dev/cache/blocked.exe"
    ]);

    const rejectedProvider = createHarness();
    jest.mocked(rejectedProvider.documentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: "content://documents/blocked.exe",
        name: "blocked.exe",
        mimeType: "application/x-msdownload",
        size: 2048,
        lastModified: 1
      }]
    });
    await expect(rejectedProvider.service.pickDocument(policy)).rejects.toThrow("type");
    expect(rejectedProvider.released).toEqual([]);

    const selectedCache = createHarness();
    jest.mocked(selectedCache.documentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: "file:///data/user/0/com.lisno.mobile.dev/cache/drawing.pdf",
        name: "drawing.pdf",
        mimeType: "application/pdf",
        size: 2048,
        lastModified: 1
      }]
    });
    const selected = await selectedCache.service.pickDocument(policy);
    expect(selectedCache.released).toEqual([]);
    if (selected.status !== "selected") throw new Error("Expected a selected asset.");
    await selectedCache.service.releaseSelectedAsset(selected.asset);
    expect(selectedCache.released).toEqual([
      "file:///data/user/0/com.lisno.mobile.dev/cache/drawing.pdf"
    ]);
  });

  it("returns cancellation silently and rejects an unreadable unknown-size file", async () => {
    const cancelled = createHarness();
    await expect(cancelled.service.pickDocument(policy)).resolves.toEqual({
      status: "cancelled"
    });

    const unreadable = createHarness();
    jest.mocked(unreadable.documentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "content://documents/drawing.pdf",
          name: "drawing.pdf",
          mimeType: "application/pdf",
          lastModified: 1
        }
      ]
    });
    jest.mocked(unreadable.metadataReader.getSize).mockResolvedValueOnce(null);
    await expect(unreadable.service.pickDocument(policy)).rejects.toBeInstanceOf(
      AssetSizeResolutionError
    );
  });
});

describe("photo selection", () => {
  it("uses one original-quality image, normalizes its name and MIME, and clears its marker", async () => {
    const harness = createHarness({ now: 42 });
    jest.mocked(harness.imagePicker.launchImageLibraryAsync).mockResolvedValueOnce(
      selectedImage({
        uri: "content://media/original.jpg",
        fileName: "../album/portrait\u202e.jpg",
        mimeType: "IMAGE/JPEG; charset=binary",
        fileSize: undefined
      })
    );
    jest.mocked(harness.metadataReader.getSize).mockResolvedValueOnce(8192);

    await expect(harness.service.pickImage(imagePolicy, scope)).resolves.toEqual({
      status: "selected",
      asset: {
        uri: "content://media/original.jpg",
        name: "portrait_.jpg",
        mimeType: "image/jpeg",
        size: 8192,
        width: 1600,
        height: 900
      }
    });
    expect(harness.imagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ["images"],
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      quality: 1,
      exif: false,
      base64: false
    });
    expect(harness.stored()).toBeNull();
  });

  it("creates a safe MIME-derived fallback name and returns cancellation without statting", async () => {
    const selected = createHarness({ now: 42 });
    jest.mocked(selected.imagePicker.launchImageLibraryAsync).mockResolvedValueOnce(
      selectedImage({ fileName: null, mimeType: "image/png" })
    );
    await expect(selected.service.pickImage(imagePolicy, scope)).resolves.toMatchObject({
      status: "selected",
      asset: { name: "image-42.png" }
    });

    const cancelled = createHarness();
    await expect(cancelled.service.pickImage(imagePolicy, scope)).resolves.toEqual({
      status: "cancelled"
    });
    expect(cancelled.metadataReader.getSize).not.toHaveBeenCalled();
    expect(cancelled.stored()).toBeNull();
  });

  it("persists only the scoped origin while the system picker owns the activity", async () => {
    const harness = createHarness({ now: 10_000 });
    let finish!: (result: ImagePicker.ImagePickerResult) => void;
    jest.mocked(harness.imagePicker.launchImageLibraryAsync).mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = resolve;
      })
    );

    const selection = harness.service.pickImage(imagePolicy, scope);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(JSON.parse(harness.stored() ?? "null")).toEqual({
      environmentId: scope.environmentId,
      userId: scope.userId,
      projectId: scope.projectId,
      source: "photo",
      expiresAt: 310_000
    });
    finish(cancelledImage());
    await expect(selection).resolves.toEqual({ status: "cancelled" });
    expect(harness.stored()).toBeNull();
  });

  it("rejects policy-incompatible MIME and oversized content before returning it", async () => {
    const wrongType = createHarness();
    jest.mocked(wrongType.imagePicker.launchImageLibraryAsync).mockResolvedValueOnce(
      selectedImage({
        uri: "file:///data/user/0/com.lisno.mobile.dev/cache/photo.gif",
        mimeType: "image/gif",
        fileName: "photo.gif"
      })
    );
    await expect(wrongType.service.pickImage(imagePolicy, scope)).rejects.toThrow(
      "type"
    );
    expect(wrongType.released).toEqual([
      "file:///data/user/0/com.lisno.mobile.dev/cache/photo.gif"
    ]);

    const oversized = createHarness();
    const oversizedUri = "file:///data/user/0/com.lisno.mobile.dev/cache/private-gallery.jpg";
    jest.mocked(oversized.imagePicker.launchImageLibraryAsync).mockResolvedValueOnce(
      selectedImage({
        uri: oversizedUri,
        fileName: "../provider/Living Room?.jpg",
        fileSize: imagePolicy.maxBytes + 1
      })
    );
    const error = await oversized.service.pickImage(imagePolicy, scope).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(OversizedAssetPolicyError);
    expect(error).toMatchObject({
      fileName: "Living Room_.jpg",
      maxBytes: imagePolicy.maxBytes
    });
    expect(error).not.toHaveProperty("uri");
    expect(JSON.stringify(error)).not.toContain("file://");
    expect(oversized.released).toEqual([oversizedUri]);
  });

  it("releases a selected photo cache file if pending-marker cleanup fails", async () => {
    const harness = createHarness();
    const uri = "file:///data/user/0/com.lisno.mobile.dev/cache/gallery.jpg";
    jest.mocked(harness.imagePicker.launchImageLibraryAsync).mockResolvedValueOnce(
      selectedImage({ uri })
    );
    jest.mocked(harness.storage.removeItem).mockRejectedValueOnce(
      new Error("storage unavailable")
    );

    await expect(harness.service.pickImage(imagePolicy, scope)).rejects.toBeInstanceOf(
      PendingImageSelectionError
    );
    expect(harness.released).toEqual([uri]);
  });
});

describe("camera capture", () => {
  it("requests permission just in time and captures one rear-camera still image", async () => {
    const harness = createHarness();
    jest.mocked(harness.imagePicker.launchCameraAsync).mockResolvedValueOnce(
      selectedImage({ fileName: null })
    );

    await expect(harness.service.capturePhoto(imagePolicy, scope)).resolves.toMatchObject({
      status: "selected",
      asset: { name: "photo-10000.jpg", size: 4096 }
    });
    expect(harness.imagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(harness.imagePicker.launchCameraAsync).toHaveBeenCalledWith({
      mediaTypes: ["images"],
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      cameraType: ImagePicker.CameraType.back,
      quality: 1,
      exif: false,
      base64: false
    });
    expect(harness.stored()).toBeNull();
  });

  it("returns cancellation and distinct temporary and permanent permission outcomes", async () => {
    const cancelled = createHarness();
    await expect(cancelled.service.capturePhoto(imagePolicy, scope)).resolves.toEqual({
      status: "cancelled"
    });

    const temporary = createHarness();
    jest.mocked(temporary.imagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce(
      cameraPermission(false, true)
    );
    await expect(temporary.service.capturePhoto(imagePolicy, scope)).resolves.toEqual({
      status: "permission-denied-temporary"
    });
    expect(temporary.imagePicker.launchCameraAsync).not.toHaveBeenCalled();

    const permanent = createHarness();
    jest.mocked(permanent.imagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce(
      cameraPermission(false, false)
    );
    await expect(permanent.service.capturePhoto(imagePolicy, scope)).resolves.toEqual({
      status: "permission-denied-permanent"
    });
    expect(permanent.imagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it("returns safe oversized metadata and releases the rejected camera cache file", async () => {
    const harness = createHarness();
    const uri = "file:///data/user/0/com.lisno.mobile.dev/cache/private-camera.jpg";
    jest.mocked(harness.imagePicker.launchCameraAsync).mockResolvedValueOnce(
      selectedImage({
        uri,
        fileName: "../camera/Site Photo?.jpg",
        fileSize: imagePolicy.maxBytes + 1
      })
    );

    const error = await harness.service.capturePhoto(imagePolicy, scope).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(OversizedAssetPolicyError);
    expect(error).toMatchObject({
      fileName: "Site Photo_.jpg",
      maxBytes: imagePolicy.maxBytes
    });
    expect(error).not.toHaveProperty("uri");
    expect(JSON.stringify(error)).not.toContain("file://");
    expect(harness.released).toEqual([uri]);
  });

  it.each(["permission", "provider", "empty"] as const)(
    "returns unavailable for a %s failure",
    async (failure) => {
      const harness = createHarness();
      if (failure === "permission") {
        jest.mocked(harness.imagePicker.requestCameraPermissionsAsync).mockRejectedValueOnce(
          new Error("native unavailable")
        );
      } else if (failure === "provider") {
        jest.mocked(harness.imagePicker.launchCameraAsync).mockRejectedValueOnce(
          new Error("no camera")
        );
      } else {
        jest.mocked(harness.imagePicker.launchCameraAsync).mockResolvedValueOnce({
          canceled: false,
          assets: []
        });
      }
      await expect(harness.service.capturePhoto(imagePolicy, scope)).resolves.toEqual({
        status: "unavailable"
      });
      expect(harness.stored()).toBeNull();
    }
  );

  it("releases a captured cache file if pending-marker cleanup fails", async () => {
    const harness = createHarness();
    const uri = "file:///data/user/0/com.lisno.mobile.dev/cache/camera.jpg";
    jest.mocked(harness.imagePicker.launchCameraAsync).mockResolvedValueOnce(
      selectedImage({ uri })
    );
    jest.mocked(harness.storage.removeItem)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(harness.service.capturePhoto(imagePolicy, scope)).rejects.toBeInstanceOf(
      PendingImageSelectionError
    );
    expect(harness.released).toEqual([uri]);
  });
});

describe("pending Android image recovery", () => {
  it("recovers an exact scoped result once and consumes the marker before delivery", async () => {
    const harness = createHarness({ initialMarker: marker() });
    jest.mocked(harness.imagePicker.getPendingResultAsync).mockResolvedValueOnce(
      selectedImage()
    );

    await expect(
      harness.service.recoverPendingImageSelection(imagePolicy, scope)
    ).resolves.toMatchObject({
      status: "selected",
      source: "photo",
      asset: { name: "image-1.jpg", size: 4096 }
    });
    expect(harness.stored()).toBeNull();
    await expect(
      harness.service.recoverPendingImageSelection(imagePolicy, scope)
    ).resolves.toEqual({ status: "none" });
    expect(harness.imagePicker.getPendingResultAsync).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["environment", { environmentId: "environment-b" }],
    ["user", { userId: "user-b" }],
    ["project", { projectId: "project-b" }]
  ] as const)("rejects a cross-%s marker without reading Expo's global result", async (_label, mismatch) => {
    const harness = createHarness({ initialMarker: marker(mismatch) });
    await expect(
      harness.service.recoverPendingImageSelection(imagePolicy, scope)
    ).resolves.toEqual({ status: "none" });
    expect(harness.imagePicker.getPendingResultAsync).not.toHaveBeenCalled();
    expect(harness.stored()).toBeNull();
  });

  it("rejects expired and malformed markers before reading the global result", async () => {
    const expired = createHarness({
      now: 310_000,
      initialMarker: marker({ expiresAt: 310_000 })
    });
    await expect(
      expired.service.recoverPendingImageSelection(imagePolicy, scope)
    ).resolves.toEqual({ status: "none" });
    expect(expired.imagePicker.getPendingResultAsync).not.toHaveBeenCalled();

    const malformed = createHarness({
      initialMarker: JSON.stringify({ ...JSON.parse(marker()), uri: "file:///private.jpg" })
    });
    await expect(
      malformed.service.recoverPendingImageSelection(imagePolicy, scope)
    ).resolves.toEqual({ status: "none" });
    expect(malformed.imagePicker.getPendingResultAsync).not.toHaveBeenCalled();
    expect(malformed.stored()).toBeNull();
  });

  it("purges only expired or malformed markers and retains a live activity-recovery marker", async () => {
    const active = createHarness({ now: 10_000, initialMarker: marker() });
    await active.service.purgeExpiredPendingImageSelection();
    expect(active.stored()).toBe(marker());

    const expired = createHarness({ now: 310_000, initialMarker: marker() });
    await expired.service.purgeExpiredPendingImageSelection();
    expect(expired.stored()).toBeNull();

    const malformed = createHarness({ initialMarker: "{not-json" });
    await malformed.service.purgeExpiredPendingImageSelection();
    expect(malformed.stored()).toBeNull();
  });

  it("recovers across a restored session generation without persisting that generation", async () => {
    const harness = createHarness({ initialMarker: marker() });
    jest.mocked(harness.imagePicker.getPendingResultAsync).mockResolvedValueOnce(
      selectedImage()
    );
    await expect(
      harness.service.recoverPendingImageSelection(imagePolicy, {
        ...scope,
        sessionGeneration: scope.sessionGeneration + 1
      })
    ).resolves.toMatchObject({ status: "selected", source: "photo" });
  });

  it("serializes concurrent recovery so only one caller can receive the image", async () => {
    const harness = createHarness({ initialMarker: marker() });
    jest.mocked(harness.imagePicker.getPendingResultAsync).mockResolvedValueOnce(
      selectedImage()
    );

    const results = await Promise.all([
      harness.service.recoverPendingImageSelection(imagePolicy, scope),
      harness.service.recoverPendingImageSelection(imagePolicy, scope)
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["none", "selected"]);
    expect(harness.imagePicker.getPendingResultAsync).toHaveBeenCalledTimes(1);
  });

  it("discards cancelled, errored, and malformed pending results after consumption", async () => {
    const pendingResults: Array<
      ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult
    > = [
      cancelledImage(),
      { code: "E_PICKER", message: "picker failed" },
      { canceled: false, assets: [] }
    ];
    for (const pending of pendingResults) {
      const harness = createHarness({ initialMarker: marker() });
      jest.mocked(harness.imagePicker.getPendingResultAsync).mockResolvedValueOnce(pending);
      if ("canceled" in pending && !pending.canceled && pending.assets.length === 0) {
        await expect(
          harness.service.recoverPendingImageSelection(imagePolicy, scope)
        ).rejects.toBeInstanceOf(AssetPolicyError);
      } else {
        await expect(
          harness.service.recoverPendingImageSelection(imagePolicy, scope)
        ).resolves.toEqual({ status: "none" });
      }
      expect(harness.stored()).toBeNull();
    }
  });
});
