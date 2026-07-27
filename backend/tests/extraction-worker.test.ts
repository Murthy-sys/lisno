import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const JWT_SECRET = "worker-test-jwt-secret-with-at-least-32-characters";
const WORKER_TOKEN = "worker-test-token-with-at-least-32-characters";
const TEST_NOW = "2026-07-27T10:00:00.000Z";
const SOURCE = Buffer.concat([
  Buffer.from("%PDF-1.7\nworker source\n"),
  Buffer.alloc(245760 - 23)
]);
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
]);

class TestStorage {
  private sequence = 0;
  readonly objects = new Map<string, Buffer>([
    ["seed/aurora-ground-plan-v1.pdf", SOURCE]
  ]);

  async save(input: { data: Buffer; extension: string }) {
    this.sequence += 1;
    const reference = `worker-${this.sequence}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async delete(reference: string) {
    this.objects.delete(reference);
  }

  async open(reference: string) {
    const data = this.objects.get(reference);
    if (!data) throw new Error("stored object missing");
    return Readable.from(data);
  }
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

async function setup() {
  const repository = createMemoryRepository(structuredClone(demoSeedData));
  const storage = new TestStorage();
  await repository.enqueueExtractionJob({
    id: "job-1",
    designVersionId: "version-aurora-plan-1",
    status: "queued",
    attemptCount: 0,
    queuedAt: TEST_NOW,
    startedAt: null,
    completedAt: null,
    leaseExpiresAt: null,
    failureCode: null,
    failureMessage: null
  });
  const app = createApp({
    repository,
    auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 },
    clock: () => new Date(TEST_NOW),
    storage,
    ocrLeaseSeconds: 300,
    ocrWorkerToken: WORKER_TOKEN,
    maxUploadBytes: 1024
  });
  return { app, repository, storage };
}

async function claim(app: ReturnType<typeof createApp>) {
  return request(app)
    .post("/api/v1/internal/extraction-jobs/claim")
    .set("Authorization", `Bearer ${WORKER_TOKEN}`)
    .send();
}

function completeBody(crop = { x: 20, y: 30, width: 200, height: 100 }) {
  return {
    resultId: "result-1",
    pages: [
      {
        pageNumber: 1,
        width: 1000,
        height: 800,
        imageBase64: PNG.toString("base64"),
        sections: [
          {
            label: "  Ground   Floor Elevation  ",
            confidence: 0.42,
            crop,
            imageBase64: PNG.toString("base64")
          }
        ]
      }
    ]
  };
}

describe("OCR extraction worker contract", () => {
  it("rejects missing, incorrect, and browser bearer tokens", async () => {
    const { app } = await setup();
    const browserToken = jwt.sign(
      { id: "user-head", role: "design_head" },
      JWT_SECRET,
      { expiresIn: 900 }
    );

    await request(app).post("/api/v1/internal/extraction-jobs/claim").expect(401);
    await request(app)
      .post("/api/v1/internal/extraction-jobs/claim")
      .set("Authorization", "Bearer incorrect-worker-token")
      .expect(401);
    await request(app)
      .post("/api/v1/internal/extraction-jobs/claim")
      .set("Authorization", `Bearer ${browserToken}`)
      .expect(401);
  });

  it("atomically leases one job and returns a claim-authenticated source URL", async () => {
    const { app } = await setup();

    const [first, second] = await Promise.all([claim(app), claim(app)]);
    const claimed = [first, second].find((response) => response.status === 200);
    const empty = [first, second].find((response) => response.status === 204);

    expect(claimed?.body.data).toMatchObject({
      id: "job-1",
      designVersionId: "version-aurora-plan-1",
      attemptCount: 1,
      source: {
        filename: "aurora-ground-plan-v1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 245760
      }
    });
    expect(claimed?.body.data.claimToken).toEqual(expect.any(String));
    expect(claimed?.body.data.leaseExpiresAt).toBe(
      "2026-07-27T10:05:00.000Z"
    );
    expect(claimed?.body.data.sourceUrl).toContain(
      "/api/v1/internal/extraction-jobs/job-1/source"
    );
    expect(empty).toBeDefined();

    const source = await request(app)
      .get(claimed!.body.data.sourceUrl)
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(source.body).toEqual(SOURCE);

    await request(app)
      .get(
        "/api/v1/internal/extraction-jobs/job-1/source?claimToken=stale-token"
      )
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .expect(409);
  });

  it("rejects out-of-bounds crops before storing worker images", async () => {
    const { app, storage } = await setup();
    const leased = await claim(app);
    const objectCount = storage.objects.size;

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/complete")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send(completeBody({ x: 900, y: 0, width: 200, height: 200 }))
      .expect(400);

    expect(storage.objects.size).toBe(objectCount);
  });

  it("atomically replaces the draft and completes the current lease", async () => {
    const { app, repository } = await setup();
    const leased = await claim(app);

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/complete")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send(completeBody())
      .expect(200);

    expect(
      await repository.findExtractionJobByVersionId("version-aurora-plan-1")
    ).toMatchObject({
      status: "designer_review",
      workerResultId: "result-1",
      claimId: null
    });
    const [page] = await repository.listSourcePages("version-aurora-plan-1");
    expect(page).toMatchObject({ pageNumber: 1, width: 1000, height: 800 });
    expect(await repository.listDesignSections("version-aurora-plan-1")).toEqual([
      expect.objectContaining({
        sourcePageId: page!.id,
        label: "Ground Floor Elevation",
        ocrConfidence: 0.42
      })
    ]);
  });

  it("requires the current claim token and bounds failure codes", async () => {
    const { app, repository } = await setup();
    const leased = await claim(app);

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/fail")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", "stale-claim")
      .send({ code: "OCR_FAILED", message: "OCR engine failed." })
      .expect(409);
    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/fail")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send({ code: "UNBOUNDED_INTERNAL_ERROR", message: "trace" })
      .expect(400);
    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/fail")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send({ code: "OCR_FAILED", message: "OCR engine failed." })
      .expect(200);

    expect(
      await repository.findExtractionJobByVersionId("version-aurora-plan-1")
    ).toMatchObject({
      status: "processing_failed",
      failureCode: "OCR_FAILED",
      failureMessage: "OCR engine failed."
    });
  });

  it("rejects decoded worker images over the configured byte limit", async () => {
    const { app } = await setup();
    const leased = await claim(app);
    const body = completeBody();
    body.pages[0]!.imageBase64 = Buffer.alloc(1025).toString("base64");

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/complete")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send(body)
      .expect(400);
  });
});
