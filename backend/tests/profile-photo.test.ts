import jwt from "jsonwebtoken";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { detectProfilePhotoType, profilePhotoEtag } from "../src/domain/profile-photo-policy.js";
import type { Role } from "../src/domain/roles.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { toPublicUser } from "../src/services/auth.service.js";
import { createProfilePhotoService } from "../src/services/profile-photo.service.js";
import { createLocalStorage } from "../src/storage/local-storage.js";
import type { FileStorage } from "../src/storage/storage.js";

const JWT_SECRET = "profile-photo-test-secret-with-enough-entropy";
const USERS = {
  alice: { id: "photo-alice", role: "designer" },
  bob: { id: "photo-bob", role: "designer" },
  admin: { id: "photo-admin", role: "admin" },
  superAdmin: { id: "photo-super-admin", role: "super_admin" }
} as const satisfies Record<string, { id: string; role: Role }>;

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(options: { storage?: (base: FileStorage) => FileStorage } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lisno-profile-photo-"));
  directories.push(root);
  const seed = structuredClone(demoSeedData);
  const template = seed.users[0]!;
  seed.users = Object.values(USERS).map(({ id, role }) => ({
    ...template,
    id,
    name: `${id} user`,
    email: `${id}@photo.lisno.example`,
    emailNormalized: `${id}@photo.lisno.example`,
    role,
    active: true,
    accountKind: "standard" as const
  }));
  const repository = createMemoryRepository(seed);
  const baseStorage = createLocalStorage(root);
  const storage = options.storage ? options.storage(baseStorage) : baseStorage;
  const app = createApp({
    repository,
    storage,
    auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 }
  });
  const token = (user: keyof typeof USERS) =>
    `Bearer ${jwt.sign({ id: USERS[user].id, role: USERS[user].role }, JWT_SECRET, { expiresIn: 900 })}`;
  const storedFiles = async () => (await readdir(root)).filter((name) => !name.startsWith("."));
  return { app, repository, storage, root, token, storedFiles };
}

async function jpegWithGps(width = 800, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Copyright: "Private photographer", Make: "Test camera" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 58/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "77/1 35/1 0/1" }
    })
    .toBuffer();
}

const png = (width = 300, height = 200) =>
  sharp({ create: { width, height, channels: 4, background: { r: 10, g: 200, b: 90, alpha: 0.5 } } }).png().toBuffer();
const webp = () =>
  sharp({ create: { width: 640, height: 640, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toBuffer();

function upload(app: Awaited<ReturnType<typeof setup>>["app"], authorization: string, data: Buffer, filename = "photo.jpg", contentType = "image/jpeg") {
  return request(app)
    .put("/api/v1/auth/me/profile-photo")
    .set("Authorization", authorization)
    .attach("photo", data, { filename, contentType });
}

function binary(response: request.Request) {
  return response.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  });
}

describe("profile photo policy", () => {
  it("detects JPEG, PNG and WebP by signature only", async () => {
    expect(detectProfilePhotoType(await jpegWithGps(10, 10))).toBe("image/jpeg");
    expect(detectProfilePhotoType(await png(10, 10))).toBe("image/png");
    expect(detectProfilePhotoType(await webp())).toBe("image/webp");
    expect(detectProfilePhotoType(Buffer.from("GIF89a....."))).toBeNull();
    expect(detectProfilePhotoType(Buffer.from("plain text pretending to be a jpeg"))).toBeNull();
  });
});

describe("profile photo API", () => {
  it("stores a 512x512 JPEG without EXIF/GPS and exposes only the version", async () => {
    const { app, repository, token, storedFiles } = await setup();
    const source = await jpegWithGps();
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const response = await upload(app, token("alice"), source);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        user: {
          id: USERS.alice.id,
          name: `${USERS.alice.id} user`,
          email: `${USERS.alice.id}@photo.lisno.example`,
          role: "designer",
          profilePhotoVersion: 1
        }
      }
    });
    const files = await storedFiles();
    expect(files).toHaveLength(1);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(files[0]!);
    expect(serialized).not.toContain("storageKey");

    const me = await request(app).get("/api/v1/auth/me").set("Authorization", token("alice"));
    expect(me.body.data).toMatchObject({ id: USERS.alice.id, profilePhotoVersion: 1 });
    expect(JSON.stringify(me.body)).not.toContain(files[0]!);

    const photo = await binary(
      request(app).get(`/api/v1/users/${USERS.alice.id}/profile-photo?v=1`).set("Authorization", token("alice"))
    );
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/jpeg");
    expect(photo.headers["cache-control"]).toBe("private, max-age=86400");
    expect(photo.headers.etag).toBe(profilePhotoEtag(USERS.alice.id, 1));
    expect(photo.headers.etag).not.toContain(files[0]!);
    const metadata = await sharp(photo.body as Buffer).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: 512, height: 512 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();

    const events = await repository.listAuditEvents({ entityType: "user", entityId: USERS.alice.id });
    const updated = events.filter((event) => event.action === "identity.profile_photo.updated");
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ actorId: USERS.alice.id, newValues: { profilePhotoVersion: 1 } });
    expect(JSON.stringify(events)).not.toContain(files[0]!);
  });

  it("accepts PNG and WebP sources and honours If-None-Match", async () => {
    const { app, token, storedFiles } = await setup();
    const first = await upload(app, token("alice"), await png(), "photo.png", "image/png");
    expect(first.status).toBe(200);
    const second = await upload(app, token("alice"), await webp(), "photo.webp", "image/webp");
    expect(second.status).toBe(200);
    expect(second.body.data.user.profilePhotoVersion).toBe(2);
    expect(await storedFiles()).toHaveLength(1);

    const cached = await request(app)
      .get("/api/v1/users/self/profile-photo")
      .set("Authorization", token("alice"))
      .set("If-None-Match", profilePhotoEtag(USERS.alice.id, 2));
    expect(cached.status).toBe(304);
    const stale = await binary(
      request(app)
        .get(`/api/v1/users/${USERS.alice.id}/profile-photo`)
        .set("Authorization", token("alice"))
        .set("If-None-Match", profilePhotoEtag(USERS.alice.id, 1))
    );
    expect(stale.status).toBe(200);
    expect((await sharp(stale.body as Buffer).metadata()).width).toBe(512);
  });

  it.each([
    ["a bad signature", Buffer.from("GIF89a" + "x".repeat(200)), "photo.gif", "image/gif"],
    ["a renamed text file", Buffer.from("hello, this is only text"), "photo.jpg", "image/jpeg"],
    ["a truncated JPEG", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]), "photo.jpg", "image/jpeg"]
  ])("rejects %s with nothing stored", async (_label, data, filename, contentType) => {
    const { app, repository, token, storedFiles } = await setup();
    const response = await upload(app, token("alice"), data, filename, contentType);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("PROFILE_PHOTO_INVALID");
    expect(await storedFiles()).toEqual([]);
    expect((await repository.findUserProfilePhotoState(USERS.alice.id))?.photo).toBeNull();
  });

  it("rejects images over 4096 pixels on either side", async () => {
    const { app, token, storedFiles } = await setup();
    const wide = await sharp({ create: { width: 4097, height: 8, channels: 3, background: "#000" } }).png().toBuffer();
    const response = await upload(app, token("alice"), wide, "wide.png", "image/png");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("PROFILE_PHOTO_INVALID");
    expect(await storedFiles()).toEqual([]);
  });

  it("rejects files over 5 MB with 413", async () => {
    const { app, token, storedFiles } = await setup();
    const large = Buffer.concat([await jpegWithGps(10, 10), Buffer.alloc(5 * 1024 * 1024, 1)]);
    const response = await upload(app, token("alice"), large);
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PROFILE_PHOTO_TOO_LARGE");
    expect(await storedFiles()).toEqual([]);
  });

  it("rejects a missing file, a wrong field, and multiple files", async () => {
    const { app, token, storedFiles } = await setup();
    const image = await png();
    const missing = await request(app).put("/api/v1/auth/me/profile-photo").set("Authorization", token("alice"));
    const wrongField = await request(app)
      .put("/api/v1/auth/me/profile-photo")
      .set("Authorization", token("alice"))
      .attach("file", image, { filename: "a.png", contentType: "image/png" });
    const multiple = await request(app)
      .put("/api/v1/auth/me/profile-photo")
      .set("Authorization", token("alice"))
      .attach("photo", image, { filename: "a.png", contentType: "image/png" })
      .attach("photo", image, { filename: "b.png", contentType: "image/png" });
    for (const response of [missing, wrongField, multiple]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("PROFILE_PHOTO_INVALID");
    }
    expect(await storedFiles()).toEqual([]);
  });

  it("removes idempotently, deletes the object, and audits once", async () => {
    const { app, repository, token, storedFiles } = await setup();
    const empty = await request(app).delete("/api/v1/auth/me/profile-photo").set("Authorization", token("alice"));
    expect(empty.status).toBe(200);
    expect(empty.body.data.user).not.toHaveProperty("profilePhotoVersion");

    await upload(app, token("alice"), await png());
    expect(await storedFiles()).toHaveLength(1);
    const removed = await request(app).delete("/api/v1/auth/me/profile-photo").set("Authorization", token("alice"));
    expect(removed.status).toBe(200);
    expect(removed.body.data.user).not.toHaveProperty("profilePhotoVersion");
    expect(await storedFiles()).toEqual([]);
    const again = await request(app).delete("/api/v1/auth/me/profile-photo").set("Authorization", token("alice"));
    expect(again.status).toBe(200);

    const events = await repository.listAuditEvents({ entityId: USERS.alice.id });
    expect(events.filter((event) => event.action === "identity.profile_photo.removed")).toHaveLength(1);
    const photo = await request(app).get(`/api/v1/users/${USERS.alice.id}/profile-photo`).set("Authorization", token("alice"));
    expect(photo.status).toBe(404);

    const replacement = await upload(app, token("alice"), await png());
    expect(replacement.body.data.user.profilePhotoVersion).toBe(3);
  });

  it("keeps the replacement when the previous object cannot be deleted", async () => {
    const warnings: string[] = [];
    const root = await mkdtemp(path.join(os.tmpdir(), "lisno-profile-photo-"));
    directories.push(root);
    const base = createLocalStorage(root);
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const user = (await repository.listUsers())[0]!;
    let failDeletes = false;
    const service = createProfilePhotoService({
      repository,
      audit: createAuditService(repository),
      storage: { ...base, delete: async (reference) => { if (failDeletes) throw new Error(`cannot delete ${reference}`); return base.delete(reference); } },
      clock: () => new Date("2026-09-24T10:00:00.000Z"),
      reportOrphan: (stage) => warnings.push(stage)
    });
    await service.replace(toPublicUser(user), await png());
    failDeletes = true;
    const result = await service.replace(toPublicUser(user), await png());
    expect(result.profilePhotoVersion).toBe(2);
    expect(warnings).toEqual(["previous_object"]);
    expect(await readdir(root)).toHaveLength(2);
  });

  it("deletes the new object when the database update fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lisno-profile-photo-"));
    directories.push(root);
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const user = (await repository.listUsers())[0]!;
    const failing = new Proxy(repository, {
      get(target, property, receiver) {
        if (property === "runInTransaction") {
          return async () => { throw new Error("database unavailable"); };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as AppRepository;
    const service = createProfilePhotoService({
      repository: failing,
      audit: createAuditService(repository),
      storage: createLocalStorage(root),
      clock: () => new Date("2026-09-24T10:00:00.000Z")
    });
    await expect(service.replace(toPublicUser(user), await png())).rejects.toThrow("database unavailable");
    expect(await readdir(root)).toEqual([]);
    expect((await repository.findUserProfilePhotoState(user.id))?.photo).toBeNull();
    expect((await repository.listAuditEvents({ entityId: user.id })).filter((event) => event.action.startsWith("identity.profile_photo"))).toEqual([]);
  });

  it("returns 409 and removes the new object when the compare-and-set loses", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lisno-profile-photo-"));
    directories.push(root);
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const user = (await repository.listUsers())[0]!;
    const base = createLocalStorage(root);
    let raced = false;
    const service = createProfilePhotoService({
      repository,
      audit: createAuditService(repository),
      storage: {
        ...base,
        async saveGenerated(input) {
          if (!raced) {
            raced = true;
            await repository.setUserProfilePhoto(user.id, 0, { storageKey: "00000000-0000-4000-8000-000000000000.jpg", updatedAt: "2026-09-24T09:00:00.000Z" });
          }
          return base.saveGenerated(input);
        }
      },
      clock: () => new Date("2026-09-24T10:00:00.000Z")
    });
    await expect(service.replace(toPublicUser(user), await png())).rejects.toMatchObject({ status: 409, code: "PROFILE_PHOTO_CONFLICT" });
    expect(await readdir(root)).toEqual([]);
  });

  it("scopes writes to the caller and hides other users' photos without users.read", async () => {
    const { app, token } = await setup();
    await upload(app, token("bob"), await png());

    // Alice's PUT/DELETE only ever affect Alice.
    await request(app).delete("/api/v1/auth/me/profile-photo").set("Authorization", token("alice"));
    const aliceUpload = await upload(app, token("alice"), await png());
    expect(aliceUpload.body.data.user.id).toBe(USERS.alice.id);
    const bobMe = await request(app).get("/api/v1/auth/me").set("Authorization", token("bob"));
    expect(bobMe.body.data.profilePhotoVersion).toBe(1);

    const hidden = await request(app).get(`/api/v1/users/${USERS.bob.id}/profile-photo`).set("Authorization", token("alice"));
    const hiddenFromAdmin = await request(app).get(`/api/v1/users/${USERS.bob.id}/profile-photo`).set("Authorization", token("admin"));
    const unknown = await request(app).get("/api/v1/users/no-such-user/profile-photo").set("Authorization", token("superAdmin"));
    const noPhoto = await request(app).get(`/api/v1/users/${USERS.admin.id}/profile-photo`).set("Authorization", token("superAdmin"));
    for (const response of [hidden, hiddenFromAdmin, unknown, noPhoto]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "The requested resource was not found." } });
      expect(response.headers.etag).not.toBe(profilePhotoEtag(USERS.bob.id, 1));
      expect(response.headers["cache-control"]).toBeUndefined();
    }

    const visible = await binary(
      request(app).get(`/api/v1/users/${USERS.bob.id}/profile-photo`).set("Authorization", token("superAdmin"))
    );
    expect(visible.status).toBe(200);
    expect(visible.headers["content-type"]).toBe("image/jpeg");
  });

  it("requires authentication for every profile photo operation", async () => {
    const { app } = await setup();
    const responses = await Promise.all([
      request(app).put("/api/v1/auth/me/profile-photo"),
      request(app).delete("/api/v1/auth/me/profile-photo"),
      request(app).get(`/api/v1/users/${USERS.alice.id}/profile-photo`)
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    }
  });

  it("lets Super Admin manage only its own photo", async () => {
    const { app, token } = await setup();
    const uploaded = await upload(app, token("superAdmin"), await png());
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.data.user).toMatchObject({ id: USERS.superAdmin.id, role: "super_admin", profilePhotoVersion: 1 });
    const alice = await request(app).get("/api/v1/auth/me").set("Authorization", token("alice"));
    expect(alice.body.data).not.toHaveProperty("profilePhotoVersion");
    const removed = await request(app).delete("/api/v1/auth/me/profile-photo").set("Authorization", token("superAdmin"));
    expect(removed.status).toBe(200);
    expect(removed.body.data.user).not.toHaveProperty("profilePhotoVersion");
  });

  it("rejects an invalid cache-busting version", async () => {
    const { app, token } = await setup();
    const response = await request(app).get(`/api/v1/users/${USERS.alice.id}/profile-photo?v=abc`).set("Authorization", token("alice"));
    expect(response.status).toBe(400);
  });
});
