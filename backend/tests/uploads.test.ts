import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { Role } from "../src/contracts/domain.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const JWT_SECRET = "upload-test-secret-with-at-least-32-characters";
const auth = {
  jwtSecret: JWT_SECRET,
  jwtExpiresInSeconds: 900
};
const TEST_NOW = "2026-07-16T12:00:00.000Z";
const clock = () => new Date(TEST_NOW);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

const users = {
  head: ["user-head", "design_head"],
  managerAarav: ["user-manager-aarav", "design_manager"],
  managerMeera: ["user-manager-meera", "design_manager"],
  ananya: ["user-designer-ananya", "designer"],
  kabir: ["user-designer-kabir", "designer"],
  auroraClient: ["user-client-aurora", "client"],
  celesteClient: ["user-client-celeste", "client"]
} as const satisfies Record<string, readonly [string, Role]>;

function bearer([id, role]: readonly [string, Role]) {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

class TestStorage {
  private sequence = 0;
  readonly objects = new Map<string, Buffer>();
  readonly deleted: string[] = [];
  failSave = false;

  async save(input: { data: Buffer; extension: string }) {
    if (this.failSave) throw new Error("simulated storage outage");
    this.sequence += 1;
    const reference = `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async delete(reference: string) {
    this.deleted.push(reference);
    this.objects.delete(reference);
  }

  async open(reference: string) {
    const data = this.objects.get(reference);
    if (!data) throw new Error("stored object missing");
    return Readable.from(data);
  }
}

function setup(options: {
  repository?: AppRepository;
  storage?: TestStorage;
  maxUploadBytes?: number;
} = {}) {
  const repository =
    options.repository ??
    createMemoryRepository(structuredClone(demoSeedData));
  const storage = options.storage ?? new TestStorage();
  const dependencies = {
    repository,
    auth,
    clock,
    storage,
    maxUploadBytes: options.maxUploadBytes
  } as Parameters<typeof createApp>[0] & {
    storage: TestStorage;
    maxUploadBytes?: number;
  };
  return {
    repository,
    storage,
    app: createApp(dependencies)
  };
}

function upload(
  app: ReturnType<typeof createApp>,
  actor: readonly [string, Role],
  taskId: string,
  data: Buffer,
  filename: string,
  mimeType: string
) {
  return request(app)
    .post(`/api/v1/tasks/${taskId}/design-versions`)
    .set("Authorization", bearer(actor))
    .attach("file", data, { filename, contentType: mimeType });
}

function approval(
  app: ReturnType<typeof createApp>,
  actor: readonly [string, Role],
  versionId: string,
  body: Record<string, unknown>
) {
  return request(app)
    .patch(`/api/v1/design-versions/${versionId}/approval`)
    .set("Authorization", bearer(actor))
    .send(body);
}

function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void
) {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", callback);
}

function failDesignVersionMetadataWrites(base: AppRepository): AppRepository {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(
            new Proxy(transaction, {
              get(transactionTarget, transactionProperty, transactionReceiver) {
                if (transactionProperty === "createNextDesignVersion") {
                  return async () => {
                    throw new Error("simulated metadata failure");
                  };
                }
                return Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionReceiver
                );
              }
            })
          )
        );
    }
  });
}

function failAuditWrites(base: AppRepository): AppRepository {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(
            new Proxy(transaction, {
              get(transactionTarget, transactionProperty, transactionReceiver) {
                if (transactionProperty === "appendAuditEvent") {
                  return async () => {
                    throw new Error("simulated audit failure");
                  };
                }
                return Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionReceiver
                );
              }
            })
          )
        );
    }
  });
}

describe("design-version uploads", () => {
  it("accepts JPEG/WebP bytes, rejects claimed MIME mismatches, and strips bidi filename controls", async () => {
    const { app } = setup();
    const jpeg = await upload(app, users.ananya, "task-furniture-layout", JPEG, "render\u202Egpj.jpg", "image/jpeg");
    const webp = await upload(app, users.ananya, "task-furniture-layout", WEBP, "render.webp", "image/webp");
    const mismatch = await upload(app, users.ananya, "task-furniture-layout", JPEG, "not-a-png.png", "image/png");

    expect(jpeg.status).toBe(201);
    expect(jpeg.body.data).toMatchObject({ mimeType: "image/jpeg", originalFilename: "rendergpj.jpg" });
    expect(webp.status).toBe(201);
    expect(webp.body.data.mimeType).toBe("image/webp");
    expect(mismatch.status).toBe(415);
    expect(mismatch.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("accepts PDF and image magic bytes and allocates monotonic task versions", async () => {
    const { app, repository, storage } = setup();

    const pdf = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "floor plan.pdf",
      "application/pdf"
    );
    const png = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PNG,
      "floor-plan.png",
      "image/png"
    );

    expect(pdf.status).toBe(201);
    expect(pdf.body.data).toMatchObject({
      taskId: "task-furniture-layout",
      projectId: "project-aurora-villa",
      versionNumber: 2,
      originalFilename: "floor plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
      approvalStatus: "draft",
      clientVisible: false
    });
    expect(png.status).toBe(201);
    expect(png.body.data).toMatchObject({
      versionNumber: 3,
      mimeType: "image/png"
    });
    expect(pdf.body.data).not.toHaveProperty("storedFileReference");
    expect([...storage.objects.keys()]).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9]{12}\.pdf$/
      ),
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9]{12}\.png$/
      )
    ]);
    expect(await repository.listDesignVersions("project-aurora-villa")).toHaveLength(3);
  });

  it("allocates distinct monotonic versions under concurrent uploads", async () => {
    const { app } = setup();

    const responses = await Promise.all([
      upload(
        app,
        users.ananya,
        "task-future-concept",
        PDF,
        "concept-a.pdf",
        "application/pdf"
      ),
      upload(
        app,
        users.ananya,
        "task-future-concept",
        PNG,
        "concept-b.png",
        "image/png"
      )
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(
      responses
        .map((response) => response.body.data.versionNumber as number)
        .sort()
    ).toEqual([1, 2]);
  });

  it("rejects MIME spoofing, unsupported files, missing files, and oversized uploads", async () => {
    const { app } = setup({ maxUploadBytes: PDF.byteLength - 1 });

    const spoofed = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      Buffer.from("not really a PDF"),
      "spoofed.pdf",
      "application/pdf"
    );
    expect(spoofed.status).toBe(415);
    expect(spoofed.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");

    const unsupported = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      Buffer.from("PK\u0003\u0004"),
      "drawing.zip",
      "application/zip"
    );
    expect(unsupported.status).toBe(415);
    expect(unsupported.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");

    const missing = await request(app)
      .post("/api/v1/tasks/task-furniture-layout/design-versions")
      .set("Authorization", bearer(users.ananya));
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { file: expect.any(String) }
    });

    const tooLarge = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "too-large.pdf",
      "application/pdf"
    );
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("allows only a task-owning designer assigned to its project to upload", async () => {
    const { app } = setup();

    const projectColleague = await upload(
      app,
      users.kabir,
      "task-furniture-layout",
      PDF,
      "colleague.pdf",
      "application/pdf"
    );
    const wrongTaskOwner = await upload(
      app,
      users.ananya,
      "task-circulation",
      PDF,
      "wrong-owner.pdf",
      "application/pdf"
    );
    const manager = await upload(
      app,
      users.managerAarav,
      "task-furniture-layout",
      PDF,
      "manager.pdf",
      "application/pdf"
    );

    expect(projectColleague.status).toBe(403);
    expect(wrongTaskOwner.status).toBe(403);
    expect(manager.status).toBe(403);
  });

  it("creates no metadata after storage failure and deletes the object after metadata failure", async () => {
    const storageFailure = new TestStorage();
    storageFailure.failSave = true;
    const first = setup({ storage: storageFailure });

    const failedStorage = await upload(
      first.app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "storage-failure.pdf",
      "application/pdf"
    );
    expect(failedStorage.status).toBe(503);
    expect(failedStorage.body.error.code).toBe("FILE_STORAGE_ERROR");
    expect(
      await first.repository.listDesignVersions("project-aurora-villa")
    ).toHaveLength(1);

    const baseRepository = createMemoryRepository(structuredClone(demoSeedData));
    const metadataStorage = new TestStorage();
    const second = setup({
      repository: failDesignVersionMetadataWrites(baseRepository),
      storage: metadataStorage
    });
    const failedMetadata = await upload(
      second.app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "metadata-failure.pdf",
      "application/pdf"
    );

    expect(failedMetadata.status).toBe(500);
    expect(metadataStorage.deleted).toHaveLength(1);
    expect(metadataStorage.objects.size).toBe(0);
    expect(
      await baseRepository.listDesignVersions("project-aurora-villa")
    ).toHaveLength(1);
  });
});

describe("design-version approval and client visibility", () => {
  it("allows the responsible manager or head to approve and audits the atomic transition", async () => {
    const { app, repository } = setup();
    const uploaded = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "approval.pdf",
      "application/pdf"
    );

    const wrongManager = await approval(
      app,
      users.managerMeera,
      uploaded.body.data.id,
      { approvalStatus: "approved", clientVisible: true }
    );
    expect(wrongManager.status).toBe(403);

    const approved = await approval(
      app,
      users.managerAarav,
      uploaded.body.data.id,
      { approvalStatus: "approved", clientVisible: true }
    );
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({
      approvalStatus: "approved",
      clientVisible: true,
      reviewerId: "user-manager-aarav",
      approvedAt: TEST_NOW
    });

    const audits = await repository.listAuditEvents({
      entityType: "design_version",
      entityId: uploaded.body.data.id
    });
    expect(audits.at(-1)).toMatchObject({
      actorId: "user-manager-aarav",
      action: "design_version_approval_changed",
      oldValues: {
        approvalStatus: "draft",
        clientVisible: false
      },
      newValues: {
        approvalStatus: "approved",
        clientVisible: true
      }
    });

    const headUpload = await upload(
      app,
      users.ananya,
      "task-future-concept",
      PNG,
      "head-approval.png",
      "image/png"
    );
    const headApproved = await approval(
      app,
      users.head,
      headUpload.body.data.id,
      { approvalStatus: "approved", clientVisible: false }
    );
    expect(headApproved.status).toBe(200);
  });

  it("rejects designer approval and prevents client visibility unless approved", async () => {
    const { app } = setup();
    const uploaded = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "internal.pdf",
      "application/pdf"
    );

    const designer = await approval(
      app,
      users.ananya,
      uploaded.body.data.id,
      { approvalStatus: "approved", clientVisible: true }
    );
    expect(designer.status).toBe(403);

    const invalidVisibility = await approval(
      app,
      users.managerAarav,
      uploaded.body.data.id,
      { approvalStatus: "in_review", clientVisible: true }
    );
    expect(invalidVisibility.status).toBe(400);
    expect(invalidVisibility.body.error).toMatchObject({
      code: "INVALID_DESIGN_VERSION_STATE",
      fields: { clientVisible: expect.any(String) }
    });
  });

  it("rolls back approval and visibility when audit persistence fails", async () => {
    const baseRepository = createMemoryRepository(structuredClone(demoSeedData));
    const storage = new TestStorage();
    const initial = setup({ repository: baseRepository, storage });
    const uploaded = await upload(
      initial.app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "audit-rollback.pdf",
      "application/pdf"
    );
    const failing = setup({
      repository: failAuditWrites(baseRepository),
      storage
    });

    const response = await approval(
      failing.app,
      users.managerAarav,
      uploaded.body.data.id,
      { approvalStatus: "approved", clientVisible: true }
    );

    expect(response.status).toBe(500);
    expect(
      await baseRepository.findDesignVersionById(uploaded.body.data.id)
    ).toMatchObject({
      approvalStatus: "draft",
      clientVisible: false,
      reviewerId: null,
      approvedAt: null
    });
  });

  it("paginates internal listings but exposes clients only to approved visible redacted records", async () => {
    const { app } = setup();
    const draft = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "draft.pdf",
      "application/pdf"
    );
    const visible = await upload(
      app,
      users.ananya,
      "task-future-concept",
      PNG,
      "visible.png",
      "image/png"
    );
    await approval(app, users.managerAarav, visible.body.data.id, {
      approvalStatus: "approved",
      clientVisible: true
    });

    const internal = await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions?limit=1&offset=1")
      .set("Authorization", bearer(users.managerAarav));
    expect(internal.status).toBe(200);
    expect(internal.body.data.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 3,
      hasMore: true
    });
    expect(internal.body.data.items).toHaveLength(1);
    expect(JSON.stringify(internal.body)).not.toContain("storedFileReference");

    const client = await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions?limit=1&offset=1")
      .set("Authorization", bearer(users.auroraClient));
    expect(client.status).toBe(200);
    expect(client.body.data.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 2,
      hasMore: false
    });
    expect(client.body.data.items).toEqual([
      expect.objectContaining({
        id: visible.body.data.id,
        approvalStatus: "approved",
        clientVisible: true
      })
    ]);
    expect(JSON.stringify(client.body)).not.toContain(draft.body.data.id);
    expect(client.body.data.items[0]).not.toHaveProperty("storedFileReference");
    expect(client.body.data.items[0]).not.toHaveProperty("uploaderId");
    expect(client.body.data.items[0]).not.toHaveProperty("reviewerId");

    const otherClient = await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions")
      .set("Authorization", bearer(users.celesteClient));
    expect(otherClient.status).toBe(404);
  });

  it("returns one newest approved update per client project without exposing drafts or staff metadata", async () => {
    const { app } = setup();
    const draft = await upload(app, users.ananya, "task-furniture-layout", PDF, "draft-only.pdf", "application/pdf");
    const visible = await upload(app, users.ananya, "task-future-concept", PNG, "latest-visible.png", "image/png");
    const internal = await upload(app, users.ananya, "task-future-concept", PDF, "approved-internal.pdf", "application/pdf");
    await approval(app, users.managerAarav, visible.body.data.id, { approvalStatus: "approved", clientVisible: true });
    await approval(app, users.managerAarav, internal.body.data.id, { approvalStatus: "approved", clientVisible: false });

    const response = await request(app)
      .get("/api/v1/client/latest-approved-versions")
      .set("Authorization", bearer(users.auroraClient));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([expect.objectContaining({ id: visible.body.data.id, projectId: "project-aurora-villa", originalFilename: "latest-visible.png" })]);
    expect(JSON.stringify(response.body)).not.toContain(draft.body.data.id);
    expect(JSON.stringify(response.body)).not.toContain(internal.body.data.id);
    expect(response.body.data[0]).not.toHaveProperty("uploaderId");
    expect(response.body.data[0]).not.toHaveProperty("reviewerId");

    const otherClient = await request(app)
      .get("/api/v1/client/latest-approved-versions")
      .set("Authorization", bearer(users.celesteClient));
    expect(otherClient.status).toBe(200);
    expect(otherClient.body.data).toEqual([]);
  });

  it("denies client download for drafts and internal approvals, then streams a visible file safely", async () => {
    const { app } = setup();
    const uploaded = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "floor plan final.pdf",
      "application/pdf"
    );

    const draft = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/download`)
      .set("Authorization", bearer(users.auroraClient));
    expect(draft.status).toBe(404);

    await approval(app, users.managerAarav, uploaded.body.data.id, {
      approvalStatus: "approved",
      clientVisible: false
    });
    const internal = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/download`)
      .set("Authorization", bearer(users.auroraClient));
    expect(internal.status).toBe(404);

    await approval(app, users.managerAarav, uploaded.body.data.id, {
      approvalStatus: "approved",
      clientVisible: true
    });
    const visible = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/download`)
      .set("Authorization", bearer(users.auroraClient))
      .buffer(true)
      .parse(binaryParser);

    expect(visible.status).toBe(200);
    expect(visible.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(visible.headers["content-disposition"]).toContain("attachment;");
    expect(visible.headers["content-disposition"]).toContain("filename*=");
    expect(visible.headers["content-disposition"]).not.toMatch(/[\r\n]/);
    expect(visible.body).toEqual(PDF);

    const otherClient = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/download`)
      .set("Authorization", bearer(users.celesteClient));
    expect(otherClient.status).toBe(404);
  });
});
