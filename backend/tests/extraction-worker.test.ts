import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import request from "supertest";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimateModel } from "../src/models/Estimate.js";
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
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const NON_CANONICAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYIJ=";
const PNG = Buffer.from(PNG_BASE64, "base64");
const PAGE_PNG = await sharp({
  create: { width: 1000, height: 800, channels: 3, background: "white" }
}).png().toBuffer();
const CROP_PNG = await sharp({
  create: { width: 200, height: 100, channels: 3, background: "white" }
}).png().toBuffer();

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

async function setup(
  ocrLeaseSeconds = 300,
  estimateQueuedAt?: string,
  projectClaimLosses = 0
) {
  vi.restoreAllMocks();
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
  const estimateJob: Record<string, any> | null = estimateQueuedAt ? {
    _id: "estimate-job-oldest",
    uploadId: "estimate-upload-oldest",
    status: "queued",
    attemptCount: 0,
    queuedAt: new Date(estimateQueuedAt),
    leaseExpiresAt: null,
    claimId: null
  } : null;
  const estimateQuery = (value: unknown) => ({
    sort: vi.fn(),
    lean: vi.fn(async () => value)
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "findOne")
    .mockImplementation(() => {
      const result = estimateQuery(estimateJob?.status === "queued" ? estimateJob : null);
      result.sort.mockReturnValue(result);
      return result as never;
    });
  if (estimateJob) {
    vi.spyOn(EstimateDesignExtractionJobModel, "findOneAndUpdate")
      .mockImplementation((_filter, update) => {
        Object.assign(estimateJob, update.$set);
        estimateJob.attemptCount += update.$inc.attemptCount;
        const result = estimateQuery(estimateJob);
        result.sort.mockReturnValue(result);
        return result as never;
      });
    vi.spyOn(EstimateDesignUploadModel, "findById").mockReturnValue({
      lean: vi.fn(async () => ({
        _id: "estimate-upload-oldest",
        estimateId: "estimate-oldest",
        storedFileReference: "estimate-source.pdf",
        originalFilename: "estimate-oldest.pdf",
        mimeType: "application/pdf",
        sizeBytes: 42
      }))
    } as never);
    vi.spyOn(EstimateDesignUploadModel, "updateOne").mockResolvedValue({
      matchedCount: 1
    } as never);
    vi.spyOn(EstimateModel, "findById").mockReturnValue({
      lean: vi.fn(async () => ({
        _id: "estimate-oldest",
        rooms: [{ id: "room-living", label: "Living Room", aliases: [] }],
        scopes: ["FC"]
      }))
    } as never);
  }
  let claimAttempts = 0;
  const appRepository = projectClaimLosses > 0
    ? new Proxy(repository, {
        get(target, property, receiver) {
          if (property !== "claimExtractionJobById") {
            return Reflect.get(target, property, receiver);
          }
          return async (...args: Parameters<AppRepository["claimExtractionJobById"]>) => {
            claimAttempts += 1;
            if (claimAttempts <= projectClaimLosses) return null;
            return target.claimExtractionJobById(...args);
          };
        }
      })
    : repository;
  const app = createApp({
    repository: appRepository,
    auth: { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 },
    clock: () => new Date(TEST_NOW),
    storage,
    ocrLeaseSeconds,
    ocrWorkerToken: WORKER_TOKEN,
    enableEstimateDesignJobs: Boolean(estimateQueuedAt),
    maxUploadBytes: 10_000
  });
  return {
    app,
    repository,
    storage,
    estimateJob,
    claimAttempts: () => claimAttempts
  };
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
        imageBase64: PAGE_PNG.toString("base64"),
        sections: [
          {
            label: "  Ground   Floor Elevation  ",
            confidence: 0.42,
            crop,
            imageBase64: CROP_PNG.toString("base64")
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

  it("atomically leases one job and keeps the claim token out of the source URL", async () => {
    const { app } = await setup();

    const [first, second] = await Promise.all([claim(app), claim(app)]);
    const claimed = [first, second].find((response) => response.status === 200);
    const empty = [first, second].find((response) => response.status === 204);

    expect(claimed?.body.data).toMatchObject({
      kind: "project_design",
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
    expect(claimed?.body.data.leaseDurationMs).toBe(300_000);
    expect(claimed?.body.data.sourceUrl).toContain(
      "/api/v1/internal/extraction-jobs/job-1/source"
    );
    expect(claimed?.body.data.sourceUrl).not.toContain("claimToken");
    expect(empty).toBeDefined();

    const source = await request(app)
      .get(claimed!.body.data.sourceUrl)
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", claimed!.body.data.claimToken)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(source.body).toEqual(SOURCE);

    await request(app)
      .get("/api/v1/internal/extraction-jobs/job-1/source")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", "stale-token")
      .expect(409);
  });

  it("leases only the oldest claimable record across project and estimate queues", async () => {
    const { app, repository, estimateJob } = await setup(
      300,
      "2026-07-27T09:59:00.000Z"
    );

    const first = await claim(app);

    expect(EstimateDesignExtractionJobModel.findOne).toHaveBeenCalled();
    expect(estimateJob?.status).toBe("processing");
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      kind: "estimate_design",
      id: "estimate-job-oldest"
    });
    expect(await repository.findExtractionJobById("job-1")).toMatchObject({
      status: "queued",
      attemptCount: 0
    });

    const second = await claim(app);
    expect(second.body.data).toMatchObject({
      kind: "project_design",
      id: "job-1",
      attemptCount: 1
    });
  });

  it("rescans the backlog after repeated compare-and-set claim losses", async () => {
    const { app, claimAttempts } = await setup(300, undefined, 3);

    const response = await claim(app);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      kind: "project_design",
      id: "job-1",
      attemptCount: 1
    });
    expect(claimAttempts()).toBe(4);
  });

  it("renews only the current extraction lease", async () => {
    const { app, repository } = await setup();
    const leased = await claim(app);

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/heartbeat")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.leaseDurationMs).toBe(300_000);
        expect(body.data.leaseExpiresAt).toBe("2026-07-27T10:05:00.000Z");
      });
    expect(await repository.findExtractionJobById("job-1")).toMatchObject({
      status: "processing",
      leaseExpiresAt: "2026-07-27T10:05:00.000Z"
    });

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/heartbeat")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", "stale")
      .expect(409);
  });

  it("publishes a non-default short lease duration on claim and renewal", async () => {
    const { app } = await setup(2);
    const leased = await claim(app);
    expect(leased.body.data.leaseDurationMs).toBe(2_000);

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/heartbeat")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .expect(200)
      .expect(({ body }) => expect(body.data.leaseDurationMs).toBe(2_000));
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
    body.pages[0]!.imageBase64 = Buffer.alloc(10_001).toString("base64");

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/complete")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send(body)
      .expect(400);
  });

  it("rejects non-canonical base64 encodings", async () => {
    const { app } = await setup();
    const leased = await claim(app);
    const body = completeBody();
    body.pages[0]!.imageBase64 = NON_CANONICAL_PNG_BASE64;

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/complete")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send(body)
      .expect(400);
  });

  it("rejects canonical base64 whose decoded bytes are not PNG images", async () => {
    const { app } = await setup();
    const leased = await claim(app);
    const body = completeBody();
    body.pages[0]!.sections[0]!.imageBase64 =
      Buffer.from("not a png").toString("base64");

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/complete")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send(body)
      .expect(400);
  });

  it("rejects truncated PNGs and declared dimensions that do not match decoded images", async () => {
    for (const mutate of [
      (body: ReturnType<typeof completeBody>) => {
        body.pages[0]!.imageBase64 = PNG.subarray(0, 24).toString("base64");
      },
      (body: ReturnType<typeof completeBody>) => {
        body.pages[0]!.width = 2;
      },
      (body: ReturnType<typeof completeBody>) => {
        body.pages[0]!.sections[0]!.crop.width = 2;
      }
    ]) {
      const { app } = await setup();
      const leased = await claim(app);
      const body = completeBody();
      mutate(body);
      await request(app)
        .post("/api/v1/internal/extraction-jobs/job-1/complete")
        .set("Authorization", `Bearer ${WORKER_TOKEN}`)
        .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
        .send(body)
        .expect(400);
    }
  });

  it("filters OCR proposals below the configured confidence floor", async () => {
    const { app, repository } = await setup();
    const leased = await claim(app);
    const body = completeBody();
    body.pages[0]!.sections.push({
      label: "Noise",
      confidence: 0.19,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      imageBase64: PNG_BASE64
    });

    await request(app)
      .post("/api/v1/internal/extraction-jobs/job-1/complete")
      .set("Authorization", `Bearer ${WORKER_TOKEN}`)
      .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
      .send(body)
      .expect(200);

    expect(await repository.listDesignSections("version-aurora-plan-1"))
      .toHaveLength(1);
  });
});
