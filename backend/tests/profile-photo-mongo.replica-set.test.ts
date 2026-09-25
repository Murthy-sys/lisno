import jwt from "jsonwebtoken";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { Role } from "../src/domain/roles.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { toPublicUser } from "../src/services/auth.service.js";
import { createProfilePhotoService } from "../src/services/profile-photo.service.js";
import { createLocalStorage } from "../src/storage/local-storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const JWT_SECRET = "profile-photo-mongo-secret-at-least-32-characters";
const NOW = "2026-09-24T12:00:00.000Z";
const clock = () => new Date(NOW);

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const directories: string[] = [];

beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([UserModel.syncIndexes(), AuditEventModel.syncIndexes()]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

afterAll(async () => {
  await replica.stop();
});

async function insertUser(id: string, role: Role) {
  await UserModel.create({
    _id: id,
    name: id,
    email: `${id}@mongo-photo.lisno.example`,
    emailNormalized: `${id}@mongo-photo.lisno.example`,
    passwordHash: "not-used-by-jwt-tests",
    role,
    active: true,
    version: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW)
  });
}

async function storageRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "lisno-profile-photo-mongo-"));
  directories.push(root);
  return root;
}

const png = () =>
  sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 5, g: 90, b: 200 } } }).png().toBuffer();

describe("profile photo on a Mongo replica set", () => {
  it("lets exactly one concurrent replacement win and leaves no orphan object", async () => {
    await insertUser("mongo-photo-alice", "designer");
    const root = await storageRoot();
    const base = createLocalStorage(root);
    const repository = createMongoRepository();
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const service = createProfilePhotoService({
      repository,
      audit: createAuditService(repository),
      clock,
      storage: {
        ...base,
        async saveGenerated(input) {
          // Both writers have read the same revision before either stores or commits.
          arrivals += 1;
          if (arrivals === 2) release();
          await barrier;
          return base.saveGenerated(input);
        }
      }
    });
    const user = toPublicUser((await repository.findUserById("mongo-photo-alice"))!);

    const results = await Promise.allSettled([service.replace(user, await png()), service.replace(user, await png())]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409, code: "PROFILE_PHOTO_CONFLICT" });

    const files = await readdir(root);
    expect(files).toHaveLength(1);
    const stored = await UserModel.findById("mongo-photo-alice").lean().exec() as Record<string, any>;
    expect(stored.profilePhoto).toMatchObject({ storageKey: files[0], version: 1 });
    expect(stored.profilePhotoRevision).toBe(1);
    expect(stored.version).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "identity.profile_photo.updated", entityId: "mongo-photo-alice" })).toBe(1);
  });

  it("serves, replaces and removes through the HTTP API without exposing the storage key", async () => {
    await insertUser("mongo-photo-bob", "client");
    const root = await storageRoot();
    const app = createApp({
      repository: createMongoRepository(),
      storage: createLocalStorage(root),
      clock,
      auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 }
    });
    const authorization = `Bearer ${jwt.sign({ id: "mongo-photo-bob", role: "client" }, JWT_SECRET, { expiresIn: 900 })}`;

    const first = await request(app).put("/api/v1/auth/me/profile-photo").set("Authorization", authorization)
      .attach("photo", await png(), { filename: "a.png", contentType: "image/png" });
    expect(first.status).toBe(200);
    expect(first.body.data.user.profilePhotoVersion).toBe(1);
    const second = await request(app).put("/api/v1/auth/me/profile-photo").set("Authorization", authorization)
      .attach("photo", await png(), { filename: "b.png", contentType: "image/png" });
    expect(second.body.data.user.profilePhotoVersion).toBe(2);
    const files = await readdir(root);
    expect(files).toHaveLength(1);

    const me = await request(app).get("/api/v1/auth/me").set("Authorization", authorization);
    expect(me.body.data.profilePhotoVersion).toBe(2);
    expect(JSON.stringify([first.body, second.body, me.body])).not.toContain(files[0]!);

    const photo = await request(app).get("/api/v1/users/mongo-photo-bob/profile-photo?v=2").set("Authorization", authorization)
      .buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(photo.status).toBe(200);
    expect(await sharp(photo.body as Buffer).metadata()).toMatchObject({ format: "jpeg", width: 512, height: 512 });

    const removed = await request(app).delete("/api/v1/auth/me/profile-photo").set("Authorization", authorization);
    expect(removed.status).toBe(200);
    expect(removed.body.data.user).not.toHaveProperty("profilePhotoVersion");
    expect(await readdir(root)).toEqual([]);
    const stored = await UserModel.findById("mongo-photo-bob").lean().exec() as Record<string, any>;
    expect(stored.profilePhoto).toBeUndefined();
    expect(stored.profilePhotoRevision).toBe(3);
    expect(await AuditEventModel.countDocuments({ entityId: "mongo-photo-bob", action: { $in: ["identity.profile_photo.updated", "identity.profile_photo.removed"] } })).toBe(3);
  });
});
