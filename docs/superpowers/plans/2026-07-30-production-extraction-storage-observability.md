# Production Extraction Storage and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make extraction artifacts durable and ambiguity-safe in production, then add safe structured diagnostics and separate liveness/readiness probes for the backend and OCR worker.

**Architecture:** Generated files are staged and promoted under deterministic, result-scoped keys before the Mongo completion transaction; a persisted artifact batch and reconciler decide retention from the stored `workerResultId`, so an indeterminate commit never triggers blind deletion. A storage factory selects local storage for development/test, an S3-compatible adapter for steady-state production, or an S3-primary/local-fallback mirror during the bounded migration window. Reference-preserving writes let existing Mongo references move without a database rewrite and keep rollback copies current until cutover. Backend and worker diagnostics use structured internal logs with safe public errors, while readiness checks MongoDB, object storage, backend connectivity, and one shared warmed OCR engine independently from process liveness.

**Tech Stack:** Node.js 20+, TypeScript 5, Express 5, Mongoose 9 replica-set transactions, Sharp, AWS SDK v3 S3 client, Vitest, Python 3.11 standard-library logging/HTTP server, pytest.

## Global Constraints

- Execute this plan after `docs/superpowers/plans/2026-07-30-idempotent-extraction-completion.md` and `docs/superpowers/plans/2026-07-30-bounded-variable-page-extraction.md`; this plan consumes stable completion receipts, authoritative per-claim limits, and the page-artifact reuse contract.
- Generated artifacts are staged under the SHA-256 `batchId` derived from job kind, job ID, and `resultId`; an ambiguous transaction outcome must be reconciled against the persisted job and `workerResultId` before any deletion.
- Production uses durable shared object storage. `STORAGE_DRIVER=local` is rejected when `NODE_ENV=production`; `mirror` is allowed only as the documented migration/rollback driver and always has S3 as its primary.
- Object keys are backend-generated. Do not include original filenames, claim tokens, user input, or raw `resultId` values in a storage key.
- Structured internal errors include job, upload, result, phase, attempt, duration, HTTP status, safe error code, diagnostic ID, and sanitized stack frames when those values exist. Log only explicitly selected fields; never serialize request objects, headers, bodies, credentials, claim tokens, original filenames, source references, or those values when embedded in an exception message or stack.
- Public API errors use allowlisted messages only. Never return internal paths, raw library errors, credentials, authorization headers, claim tokens, request bodies, or stacks.
- `/health/live` reports process liveness. `/health/ready` separately checks MongoDB and storage for the backend, and recent backend connectivity plus initialized model state for the worker.
- Preserve `/api/v1/health` as the existing compatibility liveness endpoint.
- Do not add global cross-job artifact reference counting; deduplicate identical bytes only inside one result batch.

## File Map

- `backend/src/storage/storage.ts` owns the portable storage and generated-artifact lifecycle contracts.
- `backend/src/storage/local-storage.ts` remains the development/test adapter and implements deterministic staged/published references.
- `backend/src/storage/s3-storage.ts` owns S3-compatible storage commands and stream conversion.
- `backend/src/storage/mirror-storage.ts` dual-writes the same opaque reference to S3 and local storage and reads S3 first with local fallback only for missing objects.
- `backend/src/storage/factory.ts` is the only runtime storage-driver selector.
- `backend/src/commands/migrate-storage-references.ts` copies and verifies existing referenced objects without changing Mongo references.
- `backend/src/models/ExtractionArtifactBatch.ts` stores reconciliation state and immutable artifact metadata.
- `backend/src/services/extraction-artifact.service.ts` prepares, publishes, and classifies ambiguous completion batches.
- `backend/src/services/extraction-artifact-reconciler.service.ts` repairs or removes due artifact batches.
- `backend/src/commands/reconcile-extraction-artifacts.ts` exposes bounded dry-run and write modes.
- `backend/src/observability/logger.ts` serializes allowlisted structured fields.
- `backend/src/middleware/request-context.ts` assigns diagnostic IDs without reading request bodies or credentials.
- `backend/src/routes/health.ts` owns compatibility, liveness, and readiness routes.
- `ocr-worker/src/lisno_ocr/structured_logging.py` writes bounded JSON events.
- `ocr-worker/src/lisno_ocr/health.py` owns thread-safe worker health state and probe serving.

---

### Task 1: Add deterministic staged-artifact operations to the storage contract

**Files:**
- Modify: `backend/src/storage/storage.ts`
- Modify: `backend/src/storage/local-storage.ts`
- Modify: `backend/tests/local-storage.test.ts`
- Modify: `backend/tests/uploads.test.ts`
- Modify: `backend/tests/design-section-review.test.ts`
- Modify: `backend/tests/design-sections.test.ts`
- Modify: `backend/tests/estimate-design-upload.test.ts`
- Modify: `backend/tests/estimate-design-extraction.test.ts`
- Modify: `backend/tests/estimate-design-review.test.ts`
- Modify: `backend/tests/extraction-worker.test.ts`
- Modify: `backend/tests/full-journey.test.ts`
- Modify after the idempotency plan creates it: `backend/tests/extraction-completion.replica-set.test.ts`

**Interfaces:**
- Consumes: the existing `SaveFileInput`, `StoredFile`, and opaque-reference rules.
- Produces:

```ts
export interface StageGeneratedInput extends SaveFileInput {
  batchId: string;
  artifactKey: string;
  sha256: string;
}

export interface StagedArtifact {
  artifactKey: string;
  stageReference: string;
  publishedReference: string;
  sha256: string;
  sizeBytes: number;
}

export interface PutStoredFile extends StoredFile {
  created: boolean;
}

export class StorageObjectNotFoundError extends Error {}

export interface FileStorage {
  put(reference: string, input: SaveFileInput): Promise<PutStoredFile>;
  save(input: SaveFileInput): Promise<StoredFile>;
  saveGenerated(input: SaveFileInput): Promise<StoredFile>;
  stageGenerated(input: StageGeneratedInput): Promise<StagedArtifact>;
  promoteGenerated(artifact: StagedArtifact): Promise<void>;
  deleteStaged(artifact: StagedArtifact): Promise<void>;
  read(reference: string): Promise<Buffer>;
  open(reference: string): Promise<Readable>;
  delete(reference: string): Promise<void>;
  checkReady(signal?: AbortSignal): Promise<void>;
}
```

- `put` is an internal reference-preserving primitive used by `save`, the cutover mirror, and the migration command. It accepts only the same validated opaque UUID or deterministic generated reference shapes as every other storage method, requires the reference extension to equal `input.extension`, exclusively creates a missing object, and treats an existing object as success only after exact byte-count and SHA-256 verification. Its `created` flag lets the mirror roll back only an object created by the current attempt. Business services continue to call `save`/`saveGenerated`; they never choose references.
- Both adapters normalize only a genuine missing object (`ENOENT` locally; `NoSuchKey`/provider 404 in S3) to `StorageObjectNotFoundError` from `read` and `open`. The mirror catches only that class for fallback; it never guesses from an arbitrary error string/status.
- `promoteGenerated` is idempotent and leaves the staged object available until `deleteStaged` is explicitly called. If staging is already absent but the published object exists with the expected digest and size, promotion still succeeds; this closes the crash window after a staged delete and before `stagingCleanedAt`.

- [ ] **Step 1: Write failing local-storage lifecycle tests**

```ts
it("stages and idempotently promotes a generated artifact", async () => {
  const { storage } = await setup();
  const data = Buffer.from("rendered-page");
  const sha256 = createHash("sha256").update(data).digest("hex");

  const artifact = await storage.stageGenerated({
    batchId: "a".repeat(64),
    artifactKey: "page-000001",
    sha256,
    data,
    extension: ".png"
  });

  expect(artifact.stageReference).toMatch(
    /^staging\/[0-9a-f]{64}\/page-000001-[0-9a-f]{64}\.png$/
  );
  expect(artifact.publishedReference).toMatch(
    /^artifacts\/[0-9a-f]{64}\/page-000001-[0-9a-f]{64}\.png$/
  );
  await storage.promoteGenerated(artifact);
  await storage.promoteGenerated(artifact);
  expect(await storage.read(artifact.publishedReference)).toEqual(data);
  await storage.deleteStaged(artifact);
  await storage.promoteGenerated(artifact);
  expect(await storage.read(artifact.publishedReference)).toEqual(data);
});

it("rejects caller-controlled artifact paths", async () => {
  const { storage } = await setup();
  await expect(storage.stageGenerated({
    batchId: "a".repeat(64),
    artifactKey: "../escape",
    sha256: "0".repeat(64),
    data: Buffer.from("x"),
    extension: ".png"
  })).rejects.toThrow("Invalid artifact key.");
});

it("puts an existing opaque reference idempotently but rejects different bytes", async () => {
  const { storage } = await setup();
  const reference = "11111111-1111-4111-8111-111111111111.pdf";
  await expect(
    storage.put(reference, { data: Buffer.from("pdf"), extension: ".pdf" })
  ).resolves.toMatchObject({ reference, created: true });
  await expect(
    storage.put(reference, { data: Buffer.from("pdf"), extension: ".pdf" })
  ).resolves.toMatchObject({ reference, created: false });
  await expect(
    storage.put(reference, { data: Buffer.from("other"), extension: ".pdf" })
  ).rejects.toThrow("Stored object content does not match.");
});
```

- [ ] **Step 2: Run the focused test and verify the contract is missing**

Run: `cd backend && npm test -- --run tests/local-storage.test.ts`

Expected: FAIL because `put`, `stageGenerated`, `promoteGenerated`, `deleteStaged`, and `checkReady` do not exist.

- [ ] **Step 3: Add the lifecycle types and deterministic reference builder**

```ts
const artifactKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const digestPattern = /^[0-9a-f]{64}$/;

export function generatedArtifactReferences(input: StageGeneratedInput) {
  if (!artifactKeyPattern.test(input.artifactKey) || input.artifactKey.length > 80) {
    throw new Error("Invalid artifact key.");
  }
  if (!digestPattern.test(input.sha256)) {
    throw new Error("Invalid artifact digest.");
  }
  if (!digestPattern.test(input.batchId)) {
    throw new Error("Invalid artifact batch.");
  }
  const filename = `${input.artifactKey}-${input.sha256}${input.extension}`;
  return {
    stageReference: `staging/${input.batchId}/${filename}`,
    publishedReference: `artifacts/${input.batchId}/${filename}`
  };
}
```

Implement `put` and `stageGenerated` with exclusive creation and verify an existing file has the same digest and bytes. Make `save` generate a UUID reference and delegate to `put`; if the astronomically unlikely result is `created: false`, retry with a new UUID rather than sharing an existing object. `saveGenerated` remains the same compatibility alias. Promotion copies staging when present; when staging is missing it reads and validates the published object's exact SHA-256 and byte count before returning success. If neither valid object exists, it fails without creating an empty artifact. Allow only UUID source references plus the exact `staging/<64 hex>/<safe file>` and `artifacts/<64 hex>/<safe file>` shapes. Export the validated reference/extension parser for the migration rather than using unchecked `path.extname`.

Change local storage construction to accept `maxReadBytes` (64 MiB default/hard ceiling from the bounded plan). `read` checks file size and then streams/counts bytes so replacement races cannot bypass the bound; it throws `Stored object exceeds the read limit.` without returning a partial buffer. Normalize only `ENOENT` to `StorageObjectNotFoundError`. Create the validated parent directory before an exclusive staged write. Implement `checkReady` with a private random `.health/<uuid>.probe` under the configured root: exclusively create and write four known bytes, close it, read/compare through the bounded path, and delete it in `finally`. This private probe bypasses public reference parsing but still uses containment-safe path construction. Readiness fails on create/write/read/mismatch/delete errors; tests inject each failure, including quota/read-only-like write failure, and assert cleanup is attempted.

- [ ] **Step 4: Bring every custom test storage up to the complete contract**

Update each custom storage class listed in this task rather than weakening the production interface with optional methods. Preserve each fake's existing failure injection and reference naming, and add functional `put` plus staged lifecycle methods backed by its existing in-memory map:

```ts
async stageGenerated(input: StageGeneratedInput): Promise<StagedArtifact> {
  const references = generatedArtifactReferences(input);
  const existing = this.objects.get(references.stageReference);
  if (existing && !existing.equals(input.data)) {
    throw new Error("Staged artifact content does not match.");
  }
  this.objects.set(references.stageReference, Buffer.from(input.data));
  return {
    artifactKey: input.artifactKey,
    ...references,
    sha256: input.sha256,
    sizeBytes: input.data.length
  };
}

async promoteGenerated(artifact: StagedArtifact): Promise<void> {
  const value = this.objects.get(artifact.stageReference);
  if (value) {
    this.objects.set(artifact.publishedReference, Buffer.from(value));
    return;
  }
  const published = this.objects.get(artifact.publishedReference);
  if (
    !published ||
    published.length !== artifact.sizeBytes ||
    createHash("sha256").update(published).digest("hex") !== artifact.sha256
  ) {
    throw new Error("Staged artifact is missing.");
  }
}

async deleteStaged(artifact: StagedArtifact): Promise<void> {
  this.objects.delete(artifact.stageReference);
}

async put(reference: string, input: SaveFileInput): Promise<PutStoredFile> {
  validateReferenceAndExtension(reference, input.extension);
  const existing = this.objects.get(reference);
  if (existing && !existing.equals(input.data)) {
    throw new Error("Stored object content does not match.");
  }
  this.objects.set(reference, Buffer.from(input.data));
  return { reference, created: existing === undefined };
}

async checkReady(): Promise<void> {}
```

Use the fake's actual map field (`objects` or `files`). Add missing `saveGenerated`/`read` methods where a legacy fake currently relies on a type cast. This keeps later completion, readiness, and artifact tests structurally honest.

- [ ] **Step 5: Run storage tests and typecheck**

Run:

```bash
cd backend
npm test -- --run tests/local-storage.test.ts tests/uploads.test.ts tests/design-section-review.test.ts tests/design-sections.test.ts tests/estimate-design-upload.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts tests/extraction-worker.test.ts tests/full-journey.test.ts tests/extraction-completion.replica-set.test.ts
npm run typecheck
```

Expected: PASS, including traversal rejection and repeated promotion.

- [ ] **Step 6: Commit the storage lifecycle**

```bash
git add backend/src/storage/storage.ts backend/src/storage/local-storage.ts backend/tests/local-storage.test.ts backend/tests/uploads.test.ts backend/tests/design-section-review.test.ts backend/tests/design-sections.test.ts backend/tests/estimate-design-upload.test.ts backend/tests/estimate-design-extraction.test.ts backend/tests/estimate-design-review.test.ts backend/tests/extraction-worker.test.ts backend/tests/full-journey.test.ts backend/tests/extraction-completion.replica-set.test.ts
git commit -m "feat: add staged extraction artifact storage"
```

### Task 2: Persist artifact batches and integrate ambiguity-safe publication

**Files:**
- Create: `backend/src/models/ExtractionArtifactBatch.ts`
- Create: `backend/src/services/extraction-artifact.service.ts`
- Create: `backend/tests/extraction-artifact.test.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/tests/repository.test.ts`
- Modify: `backend/tests/mongo-repository.test.ts`
- Modify: `backend/tests/extraction-worker.test.ts`
- Modify: `backend/tests/estimate-design-extraction.test.ts`
- Modify: `backend/tests/extraction-completion.replica-set.test.ts`

**Interfaces:**
- Consumes: stable `resultId` and replay classification from the idempotent-completion plan; `FileStorage.stageGenerated`, `promoteGenerated`, and `deleteStaged` from Task 1.
- Produces:

```ts
export type ArtifactBatchStatus =
  | "prepared"
  | "published"
  | "reconcile_pending"
  | "discarded";

export interface ArtifactInput {
  artifactKey: string;
  data: Buffer;
  extension: ".png";
}

export interface PreparedArtifactBatch {
  batchId: string;
  resultId: string;
  jobId: string;
  jobKind: "project_design" | "estimate_design";
  claimGeneration: number;
  claimLeaseExpiresAt: string;
  artifacts: StagedArtifact[];
}

export type CompletionClassification =
  | { kind: "committed"; receipt: CompletionReceipt }
  | { kind: "conflict" }
  | { kind: "pending" };

export interface ExtractionArtifactService {
  prepare(input: {
    resultId: string;
    jobId: string;
    uploadId: string;
    jobKind: "project_design" | "estimate_design";
    claimGeneration: number;
    claimLeaseExpiresAt: string;
    artifacts: ArtifactInput[];
  }): Promise<PreparedArtifactBatch>;
  deferReconciliation(batchId: string, diagnosticId: string): Promise<void>;
  classifyCompletion(
    jobKind: "project_design" | "estimate_design",
    jobId: string,
    resultId: string
  ): Promise<CompletionClassification>;
  cleanupPublishedStaging(batchId: string): Promise<void>;
}
```

`batchIdFor(jobKind, jobId, resultId)` is SHA-256 over the three UTF-8 values separated by NUL bytes. The raw result ID remains job-scoped; the database key and storage prefix therefore cannot collide when a prior-compatible caller reuses the same result string for another job.

- Keep artifact-batch persistence behind the repository boundary so memory tests and Mongo transactions exercise the same state machine:

```ts
export interface ExtractionArtifactBatchRecord {
  id: string;
  resultId: string;
  jobId: string;
  uploadId: string;
  jobKind: "project_design" | "estimate_design";
  claimGeneration: number;
  claimLeaseExpiresAt: string;
  status: ArtifactBatchStatus;
  artifacts: StagedArtifact[];
  diagnosticId: string | null;
  reconcileAfter: string | null;
  publishedAt: string | null;
  stagingCleanedAt: string | null;
  discardedAt: string | null;
  discardCleanedAt: string | null;
  reconcileFailureCount: number;
  lastReconcileFailureAt: string | null;
}

export interface AppRepository {
  putExtractionArtifactBatchIfAbsent(
    batch: ExtractionArtifactBatchRecord
  ): Promise<{ batch: ExtractionArtifactBatchRecord; inserted: boolean }>;
  findExtractionArtifactBatch(
    batchId: string
  ): Promise<ExtractionArtifactBatchRecord | null>;
  markExtractionArtifactBatchPublished(input: {
    batchId: string;
    publishedAt: string;
  }): Promise<boolean>;
  deferExtractionArtifactBatch(input: {
    batchId: string;
    diagnosticId: string | null;
    reconcileAfter: string;
  }): Promise<boolean>;
  markExtractionArtifactBatchPublishedAndCleaned(input: {
    batchId: string;
    publishedAt: string;
    cleanedAt: string;
  }): Promise<boolean>;
  markExtractionArtifactBatchDiscarded(input: {
    batchId: string;
    discardedAt: string;
  }): Promise<boolean>;
  markExtractionArtifactBatchDiscardCleaned(input: {
    batchId: string;
    cleanedAt: string;
  }): Promise<boolean>;
  recordExtractionArtifactReconcileFailure(input: {
    batchId: string;
    failedAt: string;
    reconcileAfter: string;
    diagnosticId: string;
  }): Promise<boolean>;
  listDueExtractionArtifactBatches(input: {
    now: string;
    limit: number;
  }): Promise<ExtractionArtifactBatchRecord[]>;
}
```

The Mongo methods use the repository's current session; the memory implementation includes batches in its clone/commit/rollback state. Every transition is compare-and-set guarded: publish accepts only `prepared`/`reconcile_pending`; defer/discard accept only `prepared`/`reconcile_pending`; publish cleanup accepts only `published`; discard cleanup accepts only `discarded`; failure backoff accepts any status with unfinished cleanup but never changes that status. No stale reconciler can downgrade or delete a concurrently published batch. `ExtractionArtifactService` and Task 3's reconciler use only these methods, not unscoped model calls. Project completion calls `markExtractionArtifactBatchPublished` on the transaction-scoped repository. Estimate completion calls the same method on `createMongoRepository(session)` inside its existing session transaction.

- The Mongoose document has `_id: batchId`, `resultId`, `jobId`, `uploadId`, `jobKind`, claim generation/lease snapshot, status, artifacts, diagnostic/reconciliation timestamps/counters, and timestamps. Add a unique index on `{ jobKind: 1, jobId: 1, resultId: 1 }`. Each artifact stores only backend-generated keys/references, SHA-256, and byte count.
- Project/estimate completion methods gain an optional `diagnosticId` parameter in this task. Task 5 makes it required at the route boundary and passes the request-scoped value; no service layer generates a second ID once request context exists.

- [ ] **Step 1: Write failing batch preparation and ambiguity tests**

```ts
it("replays an identical result batch without duplicating objects", async () => {
  const first = await service.prepare(batchInput);
  const objectCount = storage.objects.size;
  const second = await service.prepare(batchInput);
  expect(second).toEqual(first);
  expect(storage.stageGenerated).toHaveBeenCalledTimes(
    batchInput.artifacts.length * 2
  );
  expect(storage.objects.size).toBe(objectCount);
});

it("retains artifacts when completion state cannot be determined", async () => {
  jobResultLookup.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(
    service.classifyCompletion("estimate_design", "job-1", "result-1")
  ).resolves.toEqual({ kind: "pending" });
  expect(storage.delete).not.toHaveBeenCalled();
  expect(storage.deleteStaged).not.toHaveBeenCalled();
});
```

Add service-level completion assertions that a simulated `UnknownTransactionCommitResult` with a persisted matching `workerResultId` returns the prior `CompletionReceipt`, while an unavailable lookup records `reconcile_pending` and performs no deletion.

Add successful-completion tests proving the HTTP receipt is returned even if staged cleanup fails after the transaction, the batch remains `published` with `stagingCleanedAt: null`, and a later reconciler pass can finish cleanup. Add a crash-window preparation test proving the batch row exists before the first storage write.

In the crash-window test, fail the first staging call after the batch insert, then retry `prepare` with the same input. The retry must call every idempotent stage/promote operation again and finish with all published objects present; finding an existing `prepared` row never means its storage work is complete.

Add repository tests proving the project transaction marks the artifact batch in the same session and rolls that mark back with the job when the callback throws. Add estimate tests asserting the batch update receives the exact existing `ClientSession`. Add stale-claim and frozen-estimate tests proving deterministic 409 errors do not enter ambiguity classification or change the batch to `reconcile_pending`.

Extend the real replica-set suite for both job kinds. On success, assert `workerResultId` and batch `status: "published"` become visible together. For rollback, leave the prepared batch inserted outside the transaction, then use the helper's real `failCommand` support to fail the `ExtractionArtifactBatch` update after the job completion update; assert the transaction rolls back both the job result and batch status while the original `prepared` row remains discoverable for reconciliation. Do not mock sessions, model methods, repositories, or transaction callbacks.

For both completion kinds, assert artifact keys and references are stable: each page produces `page-${pageNumber.toString().padStart(6, "0")}`; only a legacy inline crop produces `page-<number>-section-<one-based-index>`. A page-backed section creates no crop artifact and its revision uses the page artifact's `publishedReference`.

Replace the bounded plan's temporary `saveGenerated` write-count assertion with `stageGenerated` assertions: a two-page, one-drawing-per-page estimate stages exactly two page artifacts, zero crop artifacts, and both revisions reference their corresponding published page keys.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd backend && npm test -- --run tests/extraction-artifact.test.ts tests/extraction-worker.test.ts tests/estimate-design-extraction.test.ts tests/extraction-completion.replica-set.test.ts`

Expected: FAIL because no artifact batch or ambiguity classifier exists and completion still calls unconditional cleanup.

- [ ] **Step 3: Implement the batch schema and preparation service**

```ts
const artifactSchema = new Schema({
  artifactKey: { type: String, required: true, immutable: true },
  stageReference: { type: String, required: true, immutable: true },
  publishedReference: { type: String, required: true, immutable: true },
  sha256: { type: String, required: true, immutable: true, match: /^[0-9a-f]{64}$/ },
  sizeBytes: { type: Number, required: true, immutable: true, min: 1 }
}, { _id: false, strict: "throw" });

const extractionArtifactBatchSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  resultId: { type: String, required: true, immutable: true },
  jobId: { type: String, required: true, immutable: true },
  uploadId: { type: String, required: true, immutable: true },
  jobKind: {
    type: String,
    required: true,
    immutable: true,
    enum: ["project_design", "estimate_design"]
  },
  claimGeneration: { type: Number, required: true, immutable: true, min: 1 },
  claimLeaseExpiresAt: { type: Date, required: true, immutable: true },
  status: {
    type: String,
    required: true,
    enum: ["prepared", "published", "reconcile_pending", "discarded"]
  },
  artifacts: { type: [artifactSchema], required: true },
  diagnosticId: { type: String, default: null },
  reconcileAfter: { type: Date, default: null },
  publishedAt: { type: Date, default: null },
  stagingCleanedAt: { type: Date, default: null },
  discardedAt: { type: Date, default: null },
  discardCleanedAt: { type: Date, default: null },
  reconcileFailureCount: { type: Number, default: 0, min: 0 },
  lastReconcileFailureAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

extractionArtifactBatchSchema.index(
  { jobKind: 1, jobId: 1, resultId: 1 },
  { unique: true }
);
extractionArtifactBatchSchema.index({ status: 1, reconcileAfter: 1, _id: 1 });
extractionArtifactBatchSchema.index({
  status: 1,
  stagingCleanedAt: 1,
  reconcileAfter: 1,
  _id: 1
});
extractionArtifactBatchSchema.index({
  status: 1,
  discardCleanedAt: 1,
  reconcileAfter: 1,
  _id: 1
});
```

For every input, compute `batchIdFor(jobKind, jobId, resultId)`, SHA-256 values, and deterministic references without touching storage. Reject a repeated `artifactKey` with a different digest; deduplicate only identical `{artifactKey, sha256}` entries. Insert or load and byte-for-byte compare the immutable `prepared` batch **before the first storage write**, including result/job/upload, claim generation/lease, and artifact keys/digests, with `reconcileAfter` due immediately. Whether the row was inserted or already existed, stage and promote every object idempotently before opening the completion transaction. This ordering makes a crash during preparation discoverable instead of creating untracked objects.

Build those inputs from already prevalidated/normalized pages in deterministic page/section order. Persist only `publishedReference` values in source pages and revisions. For `imageSource: "page"`, reuse the page artifact object and reference; never add a second input containing the same page bytes. Preserve all existing mapping, annotation, and revision fields while replacing only the generated-file write lifecycle.

- [ ] **Step 4: Replace blind completion cleanup with persisted-result classification**

```ts
const completionDiagnosticId = diagnosticId ?? randomUUID();
try {
  const receipt = await persistCompletion(prepared);
  await artifacts.cleanupPublishedStaging(prepared.batchId).catch(() => undefined);
  return receipt;
} catch (error) {
  if (!isUnknownTransactionCommitResult(error)) throw error;
  const outcome = await artifacts.classifyCompletion(jobKind, jobId, result.resultId);
  if (outcome.kind === "committed") {
    await artifacts.cleanupPublishedStaging(prepared.batchId).catch(() => undefined);
    return outcome.receipt;
  }
  if (outcome.kind === "conflict") {
    throw new ApiError(
      409,
      "EXTRACTION_RESULT_CONFLICT",
      "This extraction job already has a different completed result."
    );
  }
  await artifacts.deferReconciliation(
    prepared.batchId,
    completionDiagnosticId
  );
  throw new ApiError(
    503,
    "EXTRACTION_COMPLETION_UNCERTAIN",
    "The extraction result is being reconciled. Retry completion with the same result."
  );
}
```

`isUnknownTransactionCommitResult` returns true only when the Mongo/driver error exposes `hasErrorLabel("UnknownTransactionCommitResult")` or contains that exact label in `errorLabels`; it never classifies an `ApiError`, validation error, stale claim, cancellation, result conflict, or ordinary transient transaction abort as ambiguous.

Inside the same Mongo transaction that sets `workerResultId`, call `transaction.markExtractionArtifactBatchPublished({ batchId: prepared.batchId, publishedAt })` for project jobs or the session-scoped Mongo repository equivalent for estimate jobs. Require its compare-and-set result to be true or abort the transaction; a reconciler that has already claimed the batch for discard must prevent job completion. Publish sets `status: "published"`, `publishedAt`, and an immediately due `reconcileAfter`, but leaves `stagingCleanedAt: null`. `cleanupPublishedStaging` idempotently deletes every staged object and sets `stagingCleanedAt` only after all deletes succeed. A cleanup failure must not turn a committed completion into an API failure because the durable published batch remains discoverable by Task 3.

This task supersedes **all** request-local generated-reference cleanup from the idempotency plan for batched worker artifacts: catch paths, transaction-replayed paths, concurrent replay losers, frozen cancellations, and queued replacements must never delete shared deterministic staged/published references. They leave the durable batch for cleanup/reconciliation. Keep ordinary user-upload cleanup unchanged because those writes do not use this lifecycle. Add a concurrent same-result test where one request commits and the other replays; both page/revision references must remain readable after both requests finish.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `cd backend && npm test -- --run tests/extraction-artifact.test.ts tests/repository.test.ts tests/mongo-repository.test.ts tests/extraction-worker.test.ts tests/estimate-design-extraction.test.ts tests/extraction-completion.replica-set.test.ts && npm run typecheck`

Expected: PASS; matching ambiguous results survive, conflicting results return 409, and pending state retains files.

- [ ] **Step 6: Commit artifact publication**

```bash
git add backend/src/models/ExtractionArtifactBatch.ts backend/src/services/extraction-artifact.service.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/services/extraction-worker.service.ts backend/src/services/estimate-design.service.ts backend/src/app.ts backend/tests/extraction-artifact.test.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/extraction-worker.test.ts backend/tests/estimate-design-extraction.test.ts backend/tests/extraction-completion.replica-set.test.ts
git commit -m "feat: make extraction artifact publication ambiguity safe"
```

### Task 3: Add bounded, generation-aware artifact reconciliation

**Files:**
- Create: `backend/src/services/extraction-artifact-reconciler.service.ts`
- Create: `backend/tests/extraction-artifact-reconciliation.test.ts`

**Interfaces:**
- Consumes: `ExtractionArtifactBatch` and storage lifecycle from Tasks 1-2.
- Produces:

```ts
export interface ArtifactReconciliationReport {
  inspected: number;
  published: number;
  deferred: number;
  discarded: number;
  failures: number;
}

export interface ArtifactReconciler {
  run(input: {
    now: Date;
    limit: number;
    dryRun: boolean;
  }): Promise<ArtifactReconciliationReport>;
}
```

- [ ] **Step 1: Write the failing reconciliation matrix**

```ts
it.each([
  ["matching result", "result-1", "published"],
  ["active unresolved job", null, "deferred"],
  ["different terminal result", "result-2", "discarded"]
] as const)("reconciles %s as %s", async (_label, storedResultId, expected) => {
  jobResolver.resolve.mockResolvedValue({
    state: storedResultId === null ? "processing" : "terminal",
    workerResultId: storedResultId
  });
  const report = await reconciler.run({
    now: new Date("2026-07-30T12:00:00.000Z"),
    limit: 100,
    dryRun: false
  });
  expect(report[expected]).toBe(1);
});

it("dry-run reports an orphan without deleting either reference", async () => {
  const report = await reconciler.run({
    now: new Date("2026-07-30T12:00:00.000Z"),
    limit: 100,
    dryRun: true
  });
  expect(report.discarded).toBe(1);
  expect(storage.delete).not.toHaveBeenCalled();
  expect(storage.deleteStaged).not.toHaveBeenCalled();
});
```

Add a published-cleanup test where `status: "published"`, `stagingCleanedAt: null`, and the job stores the same `resultId`; assert the reconciler deletes staging, preserves the published object, sets `stagingCleanedAt`, and is a no-op on the next run.

Add a missing-job orphan row and assert it is classified as discarded. The job resolver returns the job's status, `workerResultId`, monotonic `claimGeneration`, and lease expiry, or `{ state: "missing" }`; never infer missing as active.

Use one resolver union everywhere: `"processing"`, `"queued"`, `"terminal"`, or `"missing"`. A committed match requires `state === "terminal"` plus the exact `workerResultId`; a nonterminal job carrying any result ID is an integrity failure. Add that corruption case to the matrix.

Add interleaving tests:

- a stale defer compare-and-set after transactional publish returns false and leaves `published`;
- an old batch generation is discarded after the job is reclaimed;
- the same generation is deferred only while status is `processing` and its lease plus five-minute grace is in the future;
- a queued, terminal, missing, expired, or generation-mismatched job discards;
- discard status is committed before any object delete, and a failed delete remains selectable until `discardCleanedAt`;
- a failed row receives exponential reconciliation backoff, so a poison row does not occupy the next ordered limited run.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd backend && npm test -- --run tests/extraction-artifact-reconciliation.test.ts`

Expected: FAIL because no reconciler exists.

- [ ] **Step 3: Implement deterministic reconciliation**

Query due `prepared`/`reconcile_pending` batches, `published` batches whose `stagingCleanedAt` is null, or `discarded` batches whose `discardCleanedAt` is null, ordered by `{ reconcileAfter: 1, _id: 1 }` with the caller's limit. Fully cleaned published/discarded batches are never selected:

```ts
if (batch.status === "discarded") {
  if (dryRun) {
    report.discarded += 1;
    continue;
  }
  for (const artifact of batch.artifacts) {
    await storage.deleteStaged(artifact);
    await storage.delete(artifact.publishedReference);
  }
  const cleaned = await repository.markExtractionArtifactBatchDiscardCleaned({
    batchId: batch.id,
    cleanedAt: now.toISOString()
  });
  if (!cleaned) continue;
  report.discarded += 1;
  continue;
}

if (batch.status === "published") {
  if (
    job.state !== "terminal" ||
    job.workerResultId !== batch.resultId
  ) {
    throw new ArtifactIntegrityError(
      "A published artifact batch does not match its terminal job."
    );
  }
  if (dryRun) {
    report.published += 1;
    continue;
  }
  for (const artifact of batch.artifacts) {
    await storage.promoteGenerated(artifact);
    await storage.deleteStaged(artifact);
  }
  const cleaned = await repository.markExtractionArtifactBatchPublishedAndCleaned({
    batchId: batch.id,
    publishedAt: job.completedAt ?? now.toISOString(),
    cleanedAt: now.toISOString()
  });
  if (!cleaned) continue;
  report.published += 1;
  continue;
}

if (
  job.state === "terminal" &&
  job.workerResultId === batch.resultId
) {
  if (dryRun) {
    report.published += 1;
    continue;
  }
  const published = await repository.markExtractionArtifactBatchPublished({
    batchId: batch.id,
    publishedAt: job.completedAt ?? now.toISOString()
  });
  if (!published) continue;
  for (const artifact of batch.artifacts) {
    await storage.promoteGenerated(artifact);
    await storage.deleteStaged(artifact);
  }
  const cleaned = await repository.markExtractionArtifactBatchPublishedAndCleaned({
    batchId: batch.id,
    publishedAt: job.completedAt ?? now.toISOString(),
    cleanedAt: now.toISOString()
  });
  if (!cleaned) continue;
  report.published += 1;
} else if (
  job.state === "processing" &&
  job.claimGeneration === batch.claimGeneration &&
  addMinutes(new Date(job.leaseExpiresAt), 5) > now
) {
  if (dryRun) {
    report.deferred += 1;
    continue;
  }
  const deferred = await repository.deferExtractionArtifactBatch({
    batchId: batch.id,
    diagnosticId: batch.diagnosticId,
    reconcileAfter: addMinutes(now, 15).toISOString()
  });
  if (!deferred) continue;
  report.deferred += 1;
} else {
  if (dryRun) {
    report.discarded += 1;
    continue;
  }
  const claimed = await repository.markExtractionArtifactBatchDiscarded({
    batchId: batch.id,
    discardedAt: now.toISOString()
  });
  if (!claimed) continue;
  for (const artifact of batch.artifacts) {
    await storage.deleteStaged(artifact);
    await storage.delete(artifact.publishedReference);
  }
  const cleaned = await repository.markExtractionArtifactBatchDiscardCleaned({
    batchId: batch.id,
    cleanedAt: now.toISOString()
  });
  if (!cleaned) continue;
  report.discarded += 1;
}
```

Branch on persisted batch status before classifying unresolved work. An already-`published` mismatch is a retained/backed-off integrity failure, never a delete. An already-`discarded` row idempotently replays both deletes and its checked cleanup CAS without trying the prepared-to-discard transition again.

In dry-run mode execute the same classification without storage or database mutations, including failure/backoff persistence; count what would be published, deferred, discarded, or failed. Missing staged/published objects are successful deletes. In write mode, catch per-batch errors, increment `failures`, and call `recordExtractionArtifactReconcileFailure` with `reconcileFailureCount + 1` backoff of one minute doubled to a six-hour cap. Continue so one bad object cannot block later batches. All transition return values are checked before count changes or destructive follow-up; a false compare-and-set means another completion/reconciler won and this pass skips the row.

- [ ] **Step 4: Run tests**

Run: `cd backend && npm test -- --run tests/extraction-artifact-reconciliation.test.ts`

Expected: PASS, including generation, CAS race, cleanup replay, dry-run, and poison-row backoff cases.

- [ ] **Step 5: Commit the reconciler**

```bash
git add backend/src/services/extraction-artifact-reconciler.service.ts backend/tests/extraction-artifact-reconciliation.test.ts
git commit -m "feat: reconcile staged extraction artifacts"
```

### Task 4: Add S3-compatible storage, rollback-safe mirroring, and fail-closed selection

**Files:**
- Create: `backend/src/storage/s3-storage.ts`
- Create: `backend/src/storage/mirror-storage.ts`
- Create: `backend/src/storage/factory.ts`
- Create: `backend/src/services/storage-reference-migration.service.ts`
- Create: `backend/src/commands/migrate-storage-references.ts`
- Create: `backend/src/commands/reconcile-extraction-artifacts.ts`
- Create: `backend/tests/s3-storage.test.ts`
- Create: `backend/tests/mirror-storage.test.ts`
- Create: `backend/tests/storage-factory.test.ts`
- Create: `backend/tests/storage-reference-migration.test.ts`
- Create: `backend/tests/migrate-storage-references-command.test.ts`
- Create: `backend/tests/reconcile-extraction-artifacts-command.test.ts`
- Create: `backend/src/seed/assets/aurora-ground-plan-v1.pdf`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/tests/config.test.ts`
- Modify: `backend/tests/server.test.ts`
- Modify: `backend/src/seed/data.ts`
- Modify: `backend/src/seed/run.ts`
- Modify: `backend/tests/seed.test.ts`
- Modify: `backend/tests/extraction-worker.test.ts`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: `FileStorage` and deterministic references from Task 1.
- Produces:

```ts
export interface StorageEnvironment {
  NODE_ENV: "development" | "test" | "production";
  STORAGE_DRIVER: "local" | "mirror" | "s3";
  UPLOADS_DIR: string;
  STORAGE_S3_BUCKET?: string;
  STORAGE_S3_REGION?: string;
  STORAGE_S3_PREFIX: string;
  STORAGE_S3_ENDPOINT?: string;
  STORAGE_S3_FORCE_PATH_STYLE: boolean;
  STORAGE_MAX_READ_BYTES: number;
}

export function createStorage(
  env: StorageEnvironment,
  dependencies?: { s3Client?: S3Client }
): FileStorage;
```

- S3 credentials come only from the AWS SDK default credential chain. Do not add access-key or secret-key application environment fields.
- `mirror` is S3-primary and local-secondary. New writes use one backend-generated reference and must be newly created in both stores before returning; if either `put` reports `created: false`, clean only objects created by this attempt and retry with a fresh UUID so unrelated records never share a collision. Reads/opens try S3 first and fall back to local **only** for `StorageObjectNotFoundError`, never for timeout, authorization, throttling, or another S3 failure. Deletes and deterministic stage/promote cleanup run against both stores idempotently. `checkReady` requires both stores because a degraded rollback copy must stop new writes during the migration window.

- [ ] **Step 1: Install the S3 client**

Run: `cd backend && npm install @aws-sdk/client-s3`

Expected: `package.json` and `package-lock.json` record the dependency.

- [ ] **Step 2: Write failing S3 and factory tests**

```ts
it("promotes by copying the staged object and leaves staging intact", async () => {
  const client = { send: vi.fn().mockResolvedValue({}) };
  const storage = createS3Storage({
    client,
    bucket: "lisno-test",
    prefix: "lisno",
    maxReadBytes: 64
  });
  await storage.promoteGenerated(stagedArtifact);
  expect(client.send).toHaveBeenCalledWith(expect.any(CopyObjectCommand));
  expect(client.send).not.toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
});

it("rejects local storage in production", () => {
  expect(() => createStorage({
    NODE_ENV: "production",
    STORAGE_DRIVER: "local",
    UPLOADS_DIR: "uploads",
    STORAGE_S3_PREFIX: "lisno",
    STORAGE_S3_FORCE_PATH_STYLE: false,
    STORAGE_MAX_READ_BYTES: 67_108_864
  })).toThrow("Production requires STORAGE_DRIVER=mirror or s3.");
});
```

Add a missing-stage replay test: make `CopyObjectCommand` fail with the SDK's not-found shape, return matching `{ ContentLength, Metadata: { sha256 } }` from `HeadObjectCommand` plus matching streamed bytes for the published key, and assert promotion resolves. Repeat with a missing/mismatched published object and assert rejection. Add a forged-metadata case where head metadata matches but streamed bytes differ; `put`, stage replay, and promotion replay must reject. Also assert an S3 or mirror driver requires bucket and region, optional endpoint/force-path-style reach `S3Client`, keys are prefix-scoped, reads return streamed bytes, and `checkReady` exercises the capability probe rather than `HeadBucket`.

Add mirror tests proving:

- `save` allocates one UUID and invokes `put` on S3 and local with that exact reference;
- if local `put` fails before `save` returns, an S3 object whose `put.created` is true is best-effort deleted and no reference is handed to the caller;
- if S3 reports `created: false`, a local failure never deletes that pre-existing identical S3 object;
- if either side reports a UUID collision (`created: false`), `save` cleans only this attempt's newly created counterpart and retries a fresh UUID;
- `stageGenerated`/`promoteGenerated` write the same deterministic references to both stores and are safely retryable after either side fails;
- `read` and `open` fall back to local only on normalized `StorageObjectNotFoundError`;
- S3 authorization/timeout errors do not silently serve stale local bytes;
- delete/deleteStaged attempt both stores with `Promise.allSettled` semantics even when one side fails, then report a sanitized aggregate failure;
- readiness fails when either store fails.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `cd backend && npm test -- --run tests/s3-storage.test.ts tests/mirror-storage.test.ts tests/storage-factory.test.ts tests/config.test.ts tests/server.test.ts`

Expected: FAIL because the S3 adapter and storage environment do not exist.

- [ ] **Step 4: Implement the S3 adapter**

```ts
export function createS3Storage(input: {
  client: S3ClientLike;
  bucket: string;
  prefix: string;
  maxReadBytes: number;
}): FileStorage {
  const objectKey = (reference: string) =>
    [input.prefix.replace(/^\/+|\/+$/g, ""), validateReference(reference)]
      .filter(Boolean)
      .join("/");

  return {
    async stageGenerated(stageInput) {
      const artifact = stagedArtifactFor(stageInput);
      try {
        await input.client.send(new PutObjectCommand({
          Bucket: input.bucket,
          Key: objectKey(artifact.stageReference),
          Body: stageInput.data,
          ContentLength: stageInput.data.length,
          Metadata: { sha256: stageInput.sha256 },
          IfNoneMatch: "*"
        }));
      } catch (error) {
        if (!isS3PreconditionFailed(error)) throw error;
        const existing = await input.client.send(new HeadObjectCommand({
          Bucket: input.bucket,
          Key: objectKey(artifact.stageReference)
        }));
        if (
          existing.ContentLength !== artifact.sizeBytes ||
          (
            existing.Metadata?.sha256 !== undefined &&
            existing.Metadata.sha256 !== artifact.sha256
          )
        ) {
          throw new Error("Staged artifact content does not match.");
        }
        await assertObjectBytesMatch(
          artifact.stageReference,
          artifact.sizeBytes,
          artifact.sha256
        );
      }
      return artifact;
    },
    async promoteGenerated(artifact) {
      const sourceKey = objectKey(artifact.stageReference);
      const copySource = [input.bucket, ...sourceKey.split("/")]
        .map(encodeURIComponent)
        .join("/");
      try {
        await input.client.send(new CopyObjectCommand({
          Bucket: input.bucket,
          Key: objectKey(artifact.publishedReference),
          CopySource: copySource,
          MetadataDirective: "COPY"
        }));
      } catch (error) {
        if (!isS3NotFound(error)) throw error;
        const published = await input.client.send(new HeadObjectCommand({
          Bucket: input.bucket,
          Key: objectKey(artifact.publishedReference)
        }));
        if (
          published.ContentLength !== artifact.sizeBytes ||
          (
            published.Metadata?.sha256 !== undefined &&
            published.Metadata.sha256 !== artifact.sha256
          )
        ) {
          throw new Error("Published artifact content does not match.");
        }
        await assertObjectBytesMatch(
          artifact.publishedReference,
          artifact.sizeBytes,
          artifact.sha256
        );
      }
    },
    async checkReady(signal) {
      await verifyS3Capabilities(input, signal);
    }
  } satisfies Pick<
    FileStorage,
    "stageGenerated" | "promoteGenerated" | "checkReady"
  >;
}
```

Complete the remaining `FileStorage` methods with this exact command mapping:

- `put`: validate the reference/extension and issue `PutObject` with `IfNoneMatch: "*"`, byte count, and SHA-256 metadata; on precondition failure, use `HeadObject` as an early check and then a bounded `GetObject` to recompute exact byte count and SHA-256 before accepting it. Metadata alone is never proof of byte identity.
- `save` and legacy `saveGenerated`: generate a UUID reference, delegate to `put`, and retry on `created: false` rather than sharing a collided reference.
- `read`: `GetObject`, consume its async-iterable body while counting bytes, and throw `Stored object exceeds the read limit.` before appending a chunk that would exceed `maxReadBytes`.
- `open`: `GetObject` and return `Readable.from(body as AsyncIterable<Uint8Array>)`; reject a body without `Symbol.asyncIterator`.
- `delete`: `DeleteObject`; S3 deletion is idempotent, including a missing key.
- `deleteStaged`: call `delete(artifact.stageReference)`.

Validate all references before issuing a command. `assertObjectBytesMatch` uses the same bounded stream reader as `read`; existing-stage, existing-`put`, and missing-stage/published-replay paths all verify actual bytes rather than trusting metadata. The segment-wise `CopySource` encoder above deliberately preserves `/` separators while encoding each bucket/key segment. Tests set `maxReadBytes: 8` and prove a 9-byte streamed response is rejected without returning a partial buffer.

`verifyS3Capabilities` uses two random safe `health/<uuid>.probe` keys and the supplied abort signal: put four known bytes with `IfNoneMatch: "*"`, get and compare those bytes, copy to the second key, and head the copy. Those capability commands receive `{ abortSignal: signal }`. In `finally`, attempt both deletes with a fresh `AbortSignal.timeout(2_000)` so an already-aborted readiness signal cannot suppress cleanup; if the capability sequence succeeded, any cleanup failure makes readiness fail, while a primary failure retains its cause and records a sanitized aggregate cleanup failure. The `health/` shape is accepted only by this private probe-key builder and is never accepted by public `FileStorage` reference methods. This verifies the exact write/read/copy/delete permissions extraction needs; do not substitute `HeadBucket`, which can both over-require bucket policy and under-test object permissions. Tests fail each command in turn and assert readiness rejects while attempted probe objects are cleaned where possible, including a timeout after successful put that leaves no probe key.

- [ ] **Step 5: Parse storage environment and use the factory at runtime**

Add exact defaults and a configuration test proving values above the immutable 64 MiB read ceiling are rejected:

```ts
NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
STORAGE_DRIVER: z.enum(["local", "mirror", "s3"]).default("local"),
STORAGE_S3_BUCKET: emptyToUndefined,
STORAGE_S3_REGION: emptyToUndefined,
STORAGE_S3_PREFIX: z.string().trim().default("lisno"),
STORAGE_S3_ENDPOINT: emptyToUndefined.pipe(z.string().url().optional()),
STORAGE_S3_FORCE_PATH_STYLE: booleanFromEnvironment.default(false),
STORAGE_MAX_READ_BYTES: z.coerce.number().int().positive()
  .max(64 * 1024 * 1024)
  .default(64 * 1024 * 1024)
```

Construct storage once in `startServer` with `createStorage(env)` **before Mongo connect** and inject it into `createApp`. Add `storageFactory` to `ServerDependencies`; preserve explicit test dependency injection and assert it is called once. `local` is allowed only outside production; `mirror` constructs one S3 adapter plus one local adapter rooted at `UPLOADS_DIR`; `s3` constructs only S3. Reject incomplete S3 configuration before connecting or listening. Export a separate factory helper returning the raw local and S3 adapters for migration; the migration must not read through the mirror because fallback would conceal a missing target object.

- [ ] **Step 6: Implement the mirror and bounded reference migration**

Implement `createMirrorStorage({ primary, rollback })` according to the failure rules above. Add `StorageReferenceMigrationService`, which reads immutable references from exactly these model fields:

- `DesignVersion.storedFileReference`
- `DesignSourcePage.renderedFileReference`
- `DesignSectionRevision.croppedFileReference`
- `EstimateDesignUpload.storedFileReference`
- `EstimateDesignSourcePage.normalizedFileReference`
- `EstimateDesignRevision.croppedFileReference`

First remove the current demo-only invalid `seed/aurora-ground-plan-v1.pdf` reference. Commit a small synthetic, non-private seed PDF, give the demo record a fixed valid v4 UUID reference, and make `seedMongoDatabase` receive/internally construct `FileStorage`, call reference-preserving `put`, and persist the actual byte count. Update seed and extraction-worker tests. Do not widen the production reference grammar to accept `seed/...`; any already-persisted sentinel/path-like seed reference is reported by migration and must be reseeded or deliberately remediated before cutover.

Scan each collection in stable `_id` order with a Mongo cursor and a bounded `--batch-size`; never materialize a full collection or a global reference set. Duplicate references may be rechecked because `put` is idempotent. For each reference, validate the legacy UUID/generated-reference shape and extension, read the local bytes under `STORAGE_MAX_READ_BYTES`, compute SHA-256/size, call the S3 adapter's reference-preserving `put`, then read S3 and compare exact digest/size. A missing local source, invalid reference, different existing S3 bytes, or verification read failure is reported as a failure and prevents cutover.

Create `migrate-storage-references.ts`. Accept only `--dry-run`, `--batch-size=<1..1000>`, optional `--collection=<one of the six model names>`, and repeatable `--source-dir=<absolute mounted legacy volume>`; reject unknown flags, duplicate singleton flags, duplicate/non-absolute source directories, and invalid values before connecting. With no `--source-dir`, use `UPLOADS_DIR`. For each reference, inspect every supplied local source: absence from one is not failure if another contains it, multiple copies must have identical bytes, and absence from all is a blocker. This handles instance-local production volumes without weakening normal fallback semantics.

Dry-run reads and hashes local, then checks S3: a missing S3 object increments `wouldCopy`, while an existing object must match exact bytes; neither case writes. Write mode copies and verifies all rows with cursor batching. Print one bounded JSON summary containing `scanned`, `checked`, `wouldCopy`, `copied`, `alreadyPresent`, `failures`, and per-collection counts—never references, filenames, or source directory paths. Exit nonzero on any failure. Do not claim global uniqueness: duplicate references across cursor batches are safe idempotent checks and may be counted again.

Tests use two temporary local-compatible stores and model fakes to prove all six fields are covered, duplicate references are safe, memory is bounded to one batch, a same-reference byte mismatch fails, dry-run performs no put, and a rerun after interruption completes without changing Mongo records.

- [ ] **Step 7: Add the operator commands after the factory exists**

Create `backend/src/commands/reconcile-extraction-artifacts.ts` with dependency-injected argument parsing. Accept only `--dry-run` and `--limit=<1..1000>`, default the write limit to 100, validate all arguments before connecting, construct storage through `createStorage(env)`, print exactly one JSON report line, disconnect in `finally`, and exit nonzero when `failures > 0`.

Add:

```json
{
  "scripts": {
    "reconcile:extraction-artifacts": "tsx src/commands/reconcile-extraction-artifacts.ts",
    "migrate:storage-references": "tsx src/commands/migrate-storage-references.ts"
  }
}
```

Tests prove invalid limits/batch sizes, unknown flags, duplicate singleton flags, duplicate source-directory values, relative source directories, and invalid collection names fail before `connect`/storage creation; dry-run makes no mutation; a partial-failure report sets a nonzero exit code after printing the report.

- [ ] **Step 8: Run focused tests, command parsers, typecheck, and build**

Run:

```bash
cd backend
npm test -- --run tests/s3-storage.test.ts tests/mirror-storage.test.ts tests/storage-factory.test.ts tests/storage-reference-migration.test.ts tests/migrate-storage-references-command.test.ts tests/reconcile-extraction-artifacts-command.test.ts tests/config.test.ts tests/server.test.ts tests/seed.test.ts tests/extraction-worker.test.ts
! npm run reconcile:extraction-artifacts -- --limit=0
! npm run migrate:storage-references -- --batch-size=0
npm run typecheck
npm run build
```

Expected: tests/typecheck/build PASS; production-local configuration fails before Mongo connect/HTTP listen; invalid command arguments exit nonzero before connecting.

- [ ] **Step 9: Commit production storage and migration**

```bash
git add backend/src/storage/s3-storage.ts backend/src/storage/mirror-storage.ts backend/src/storage/factory.ts backend/src/services/storage-reference-migration.service.ts backend/src/commands/migrate-storage-references.ts backend/src/commands/reconcile-extraction-artifacts.ts backend/src/config/env.ts backend/src/server.ts backend/src/app.ts backend/src/seed/assets/aurora-ground-plan-v1.pdf backend/src/seed/data.ts backend/src/seed/run.ts backend/tests/s3-storage.test.ts backend/tests/mirror-storage.test.ts backend/tests/storage-factory.test.ts backend/tests/storage-reference-migration.test.ts backend/tests/migrate-storage-references-command.test.ts backend/tests/reconcile-extraction-artifacts-command.test.ts backend/tests/config.test.ts backend/tests/server.test.ts backend/tests/seed.test.ts backend/tests/extraction-worker.test.ts backend/package.json backend/package-lock.json backend/.env.example backend/README.md
git commit -m "feat: add rollback-safe production object storage"
```

### Task 5: Add safe diagnostic IDs and structured backend extraction logs

**Files:**
- Create: `backend/src/observability/logger.ts`
- Create: `backend/src/middleware/request-context.ts`
- Create: `backend/src/middleware/public-errors.ts`
- Create: `backend/tests/logger.test.ts`
- Create: `backend/tests/errors.test.ts`
- Create: `backend/tests/support/http-errors.ts`
- Modify: `backend/src/contracts/http.ts`
- Modify: `backend/src/middleware/cors.ts`
- Modify: `backend/src/middleware/errors.ts`
- Modify: `backend/src/middleware/validate.ts`
- Modify: `backend/src/routes/extraction-worker.ts`
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/services/extraction-artifact.service.ts`
- Modify: `backend/src/services/extraction-artifact-reconciler.service.ts`
- Modify: `backend/src/commands/reconcile-extraction-artifacts.ts`
- Modify: `backend/src/commands/migrate-storage-references.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/extraction-worker.test.ts`
- Modify: `backend/tests/extraction-artifact-reconciliation.test.ts`
- Modify: `backend/tests/reconcile-extraction-artifacts-command.test.ts`
- Modify: `backend/tests/migrate-storage-references-command.test.ts`
- Modify: `backend/tests/server.test.ts`
- Modify: `backend/tests/cors.test.ts`
- Modify: exact error-response assertions in `backend/tests/auth.test.ts`, `backend/tests/design-section-review.test.ts`, `backend/tests/design-sections.test.ts`, `backend/tests/estimate-design-extraction.test.ts`, `backend/tests/estimate-design-review.test.ts`, `backend/tests/estimate-design-upload.test.ts`, `backend/tests/estimate-pdf-routes.test.ts`, `backend/tests/full-journey.test.ts`, `backend/tests/hierarchy.test.ts`, `backend/tests/leads.test.ts`, `backend/tests/uploads.test.ts`, and `backend/tests/workflows.test.ts`

**Interfaces:**
- Consumes: extraction lifecycle identifiers and `resultId`.
- Produces:

```ts
export type BackendEvent =
  | "backend_starting"
  | "backend_ready"
  | "backend_start_failed"
  | "backend_stopping"
  | "backend_stopped"
  | "backend_shutdown_failed"
  | "readiness_failed"
  | "extraction_claimed"
  | "extraction_artifact_prepared"
  | "extraction_completion_failed"
  | "extraction_completed"
  | "extraction_completion_replayed"
  | "job_terminal_failed"
  | "artifact_reconcile_summary"
  | "storage_reference_migration_summary";

export type ExtractionPhase =
  | "preflight"
  | "normalize"
  | "artifact_prepare"
  | "artifact_publish"
  | "mongo_transaction"
  | "post_commit_cleanup";

export type SafeLogErrorCode =
  | ApiErrorCode
  | WorkerFailureCode
  | "ARTIFACT_INTEGRITY_ERROR"
  | "READINESS_FAILED"
  | "STORAGE_REFERENCE_MIGRATION_FAILED"
  | "ARTIFACT_RECONCILIATION_FAILED"
  | "SHUTDOWN_FAILED";

export type ProcessSignal = "SIGINT" | "SIGTERM";

export interface LogEvent {
  event: BackendEvent;
  diagnosticId?: string;
  jobId?: string;
  uploadId?: string;
  resultId?: string;
  jobKind?: "project_design" | "estimate_design";
  phase?: ExtractionPhase;
  attempt?: number;
  durationMs?: number;
  httpStatus?: number;
  errorCode?: SafeLogErrorCode;
  inspected?: number;
  published?: number;
  deferred?: number;
  discarded?: number;
  failures?: number;
  scanned?: number;
  checked?: number;
  wouldCopy?: number;
  copied?: number;
  alreadyPresent?: number;
  replayed?: boolean;
  port?: number;
  signal?: ProcessSignal;
}

export interface Logger {
  info(event: LogEvent): void;
  error(event: LogEvent, error: unknown): void;
}
```

- `ApiErrorResponse.error` gains `diagnosticId: string`.
- `/fail` keeps accepting an optional legacy `message`, but the backend ignores it and persists the allowlisted message for its validated failure code.
- `public-errors.ts` is the only response-message registry. An `ApiError` keeps its internal cause/message for logging, but the error handler returns the registry's status/message for its code; an unregistered code becomes the generic 500 response. Dynamic repository/library messages are never public.
- Completion/failure methods receive one `OperationContext { diagnosticId: string; startedAtMs: number }`; nested services never generate a replacement ID.

- [ ] **Step 1: Write failing logger and public-error tests**

```ts
it("logs correlation fields while redacting secrets and paths inside the error", () => {
  const lines: string[] = [];
  const logger = createJsonLogger((line) => lines.push(line));
  const error = new Error(
    "Bearer worker-secret failed at /private/uploads/source.pdf " +
    "for staging/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/page.png"
  );
  logger.error({
    event: "extraction_completion_failed",
    diagnosticId: "11111111-1111-4111-8111-111111111111",
    jobId: "job-1",
    resultId: "result-1",
    phase: "mongo_transaction",
    attempt: 2,
    httpStatus: 500,
    errorCode: "INTERNAL_ERROR"
  }, error);
  expect(JSON.parse(lines[0]!)).toMatchObject({
    event: "extraction_completion_failed",
    diagnosticId: "11111111-1111-4111-8111-111111111111",
    jobId: "job-1",
    resultId: "result-1",
    error: { name: "Error" }
  });
  expect(lines[0]).toContain("logger.test");
  expect(lines[0]).toContain("[REDACTED");
  expect(lines[0]).not.toContain("worker-secret");
  expect(lines[0]).not.toContain("/private/uploads");
  expect(lines[0]).not.toContain("source.pdf");
  expect(lines[0]).not.toContain("staging/aaaaaaaa");
});

it("returns a safe error and diagnostic ID without the internal exception", async () => {
  const response = await request(app).get("/throws-unexpected");
  expect(response.status).toBe(500);
  expect(response.body.error.message).toBe("An unexpected error occurred.");
  expect(response.body.error.diagnosticId).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(response.body)).not.toContain("database exploded");
});
```

Add a worker-failure test sending `message: "/private/path model panic"` and assert the stored/public message equals the code's allowlisted copy and excludes the raw value.

Add a completion-correlation test that forces `UnknownTransactionCommitResult` followed by an unavailable result lookup. Send one estimate completion request and assert the **same** request `diagnosticId` appears in the `X-Diagnostic-Id` response header, 503 response body, `extraction_completion_failed` log, and persisted artifact batch. Assert that log also contains the exact job ID, upload ID, result ID, `phase`, claim attempt, duration, HTTP status, safe error code, and sanitized stack. Repeat the route-plumbing assertion for a project completion so neither dispatch branch drops the ID.

Add server bootstrap/shutdown tests with an `Error` whose message and stack contain a bearer token, Mongo credential URL, absolute source path, and object reference. Assert `backend_start_failed`/`backend_shutdown_failed` are structured, use a process-scoped diagnostic ID, include the signal when known, and contain none of those raw values.

Add command tests that force the artifact-reconciliation command and storage-reference migration command to throw provider/storage errors containing credentials, an absolute source directory, an object reference, and a filename. Assert each command creates one operation-scoped diagnostic ID, writes only structured sanitized failure/summary events, preserves its bounded public JSON report contract where applicable, and never prints any raw exception through a top-level catch.

Add malicious correlation-field tests using a worker-controlled `resultId` and injected phase containing a bearer token, absolute path, filename, bucket/key, and endpoint. Assert every string event field is sanitized before serialization; allowlisting a field name must never let its raw value bypass redaction. Add provider-error tests containing the exact configured bucket, prefix, non-credential endpoint, and generated health-probe key.

Cover environment parse, database connect, storage construction/readiness, app creation, and listen failures. For shutdown, assert successful event ordering; HTTP-close rejection still disconnects Mongo; Mongo rejection is also captured; a hung close reaches the injected deadline and force-closes; two `stop()` calls or signals close/disconnect once; and a throwing log sink cannot prevent the response or shutdown.

Add fixed-ID request tests for worker-auth 401, schema/malformed-JSON 400, oversized-body 413, and unexpected 500. For each, assert the server-side ID factory is called once and the header, body, and log use the same ID. Assert a spoofed inbound `X-Diagnostic-Id` is ignored and CORS exposes `X-Diagnostic-Id`.

Add malicious error tests proving unknown error codes, arbitrary `ApiError.message`, attacker-controlled validation keys/fields, repository conflict text, and raw legacy worker failure messages never reach responses, persisted job/upload records, audits, or logs. Add a source-stream failure-after-headers test: JSON cannot be sent, but the sanitized log must use the already-issued response-header ID.

Use `tests/support/http-errors.ts` to update all exact error-body assertions for the required `diagnosticId` without weakening message/code checks. Run `rg -n 'body\\.error|error:\\s*\\{' backend/tests` during implementation and update every remaining exact response assertion; do not leave tests accepting arbitrary IDs via broad object matching.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd backend && npm test -- --run tests/logger.test.ts tests/errors.test.ts tests/extraction-worker.test.ts tests/reconcile-extraction-artifacts-command.test.ts tests/migrate-storage-references-command.test.ts tests/server.test.ts tests/cors.test.ts`

Expected: FAIL because no logger factory, diagnostic request context, or safe worker-message mapping exists.

- [ ] **Step 3: Implement bounded JSON logging**

```ts
const allowedEventKeys = [
  "event", "diagnosticId", "jobId", "uploadId", "resultId", "phase",
  "attempt", "durationMs", "httpStatus", "errorCode", "inspected",
  "published", "deferred", "discarded", "failures", "scanned", "checked",
  "wouldCopy", "copied", "alreadyPresent", "signal",
  "jobKind", "replayed", "port"
] as const;

export function createJsonLogger(
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`)
): Logger {
  return {
    info(event) {
      const safeEvent = projectValidatedLogEvent(event, allowedEventKeys);
      write(JSON.stringify({ level: "info", at: new Date().toISOString(), ...safeEvent }));
    },
    error(event, error) {
      const normalized = normalizeError(error);
      const safeEvent = projectValidatedLogEvent(event, allowedEventKeys);
      write(JSON.stringify({
        level: "error",
        at: new Date().toISOString(),
        ...safeEvent,
        error: normalized
      }));
    }
  };
}
```

`ApiErrorCode` is the finite `keyof typeof publicErrorRegistry` exported by `public-errors.ts`; `WorkerFailureCode` is the existing finite worker-code union. Implement `projectValidatedLogEvent` as the single runtime projection used by both logger methods. It preserves a canonical server-generated diagnostic UUID; preserves bounded server IDs and legacy/new result IDs only when they match `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; requires `event`, `phase`, `jobKind`, `errorCode`, and `signal` to match the exact declared finite unions; and preserves only finite numbers, booleans, and null. Omit or replace an invalid correlation value with a fixed redaction marker. Do not run the aggressive UUID redactor over validated correlation IDs—the exact IDs are required for tracing. `sanitizeDiagnosticText` remains mandatory for free-form error name/message/stack and includes a full `health/<uuid>.probe` key pattern.

`normalizeError` inspects only `Error.name`, `message`, and `stack`; it never serializes arbitrary properties or `cause`. A non-`Error` thrown value becomes fixed `Unknown thrown value`, never `String(value)`. Bound the input scanned, then redact before output truncation. `sanitizeDiagnosticText` also replaces bearer/basic authorization, `X-Extraction-Claim-Token`, common claim/worker/JWT/password/secret/token key-value forms, credential-bearing URLs, AWS-key-like values, UUID/staging/artifact references, and absolute paths. Replace `process.cwd()` with `<app>` so app-relative code frames remain useful; replace every other POSIX, `file:///`, Windows-drive, and UNC path—including its basename—with `<path>` while preserving only line/column syntax. Sanitize the error name too. Logger sink failures are swallowed so logging cannot suppress an HTTP response or break shutdown. Tests place each forbidden value **inside** a manually assigned `Error.message` and `Error.stack`, assert useful sanitized app-relative frame/function context and bounds remain, assert external basenames/original filenames are absent, and assert arbitrary secret properties/causes are excluded.

Create one mutable `SecretRedactor` before environment validation. Its bootstrap constructor reads only the named raw secret settings (`JWT_SECRET`, worker token, database URI/userinfo, and supported provider credential variables) for exact literal registration and never serializes the environment. The early startup logger closes over that redactor. After successful validation, register the corresponding parsed secret values plus the exact storage bucket, prefix, endpoint, and other configured provider identifiers on the same redactor before database, storage, or HTTP initialization. Pattern redaction—including the health-key pattern—remains a fallback for SDK/default-chain credentials and ephemeral values that are not directly available to the logger. Tests cover both an environment-parse failure containing a raw configured secret and later startup/provider failures containing parsed configuration values.

Expose `createRequestContext({ createId = randomUUID })`. It ignores inbound `X-Diagnostic-Id`, generates once, stores the value on `request.diagnosticId` and `response.locals.diagnosticId`, and immediately adds the exact value to `X-Diagnostic-Id`. Register it as the first middleware before CORS, worker authentication, and both JSON parsers; update CORS to add `Access-Control-Expose-Headers: X-Diagnostic-Id`. The error handler may defensively create/set an ID only if it is invoked outside the normal app. Inject one logger and ID factory into `createApp`; routes/services never instantiate their own. Non-request operations such as startup, shutdown, and the reconciliation command create one operation-scoped diagnostic ID and reuse it through their complete log sequence.

- [ ] **Step 4: Replace the error handler and worker failure text**

```ts
export const safeWorkerFailureMessages: Record<WorkerFailureCode, string> = {
  PDF_RENDER_FAILED: "The PDF could not be rendered.",
  OCR_FAILED: "Text extraction could not be completed.",
  INVALID_SOURCE: "The uploaded source could not be read.",
  RESULT_REJECTED: "The extracted result did not pass validation."
};
```

Build a typed `publicErrorRegistry` containing the current API codes and one static status/message per code, including the mapping plan's `INVALID_ESTIMATE_DESIGN_ASSIGNMENT` and `EXACT_ESTIMATE_ITEM_REQUIRED` 4xx codes. Codes that previously exposed multiple or dynamic messages use a safe generic copy (for example, `INVALID_EXTRACTION_RESULT` becomes `The extraction result is invalid.` and `EXTRACTION_CONFLICT` becomes `The extraction job changed. Retry with the current job state.`); where distinct copy is user-important, split it into distinct finite codes. `createErrorHandler(logger)` logs the original error and sanitized stack internally with `request.diagnosticId`, then returns only the registered code/status/message, allowlisted validation fields where explicitly configured, and that same ID. Unknown codes and non-`ApiError` exceptions return `INTERNAL_ERROR`/`An unexpected error occurred.` with status 500.

Only `VALIDATION_ERROR` may expose fields, and the handler rebuilds them from known schema paths plus static messages. Replace the current unrecognized-key handling that can echo an attacker-controlled key with generic static copy. Never return fields for an unknown code or any 5xx. Explicitly map malformed JSON to allowlisted `400 VALIDATION_ERROR` and body-parser limit errors to `413 PAYLOAD_TOO_LARGE`. Add a registry table test covering every current code and a test proving `new ApiError(409, "EXTRACTION_CONFLICT", repositorySecret)` never exposes `repositorySecret`.

Replace `mapRepositoryError` forwarding of `RepositoryConflictError.message` with the static registered `EXTRACTION_CONFLICT` copy. Validation detail may be logged internally but may not become the response message. `/fail` ignores the legacy body `message` and persists `safeWorkerFailureMessages[code]`.

Make `OperationContext` required on project/estimate completion and failure service inputs in this task. In `routes/extraction-worker.ts`, create it from the exact `request.diagnosticId` plus monotonic start time and pass the same object through both dispatch branches, staging, transaction completion, ambiguity classification, `deferReconciliation`, audit/log calls, and failure persistence. Remove the Task 2 `diagnosticId ?? randomUUID()` fallback once request context exists. A same-result replay uses the new request ID for its replay log but never overwrites the original batch diagnostic; an uncertain result writes the request ID to the batch with a compare-and-set transition.

Add lifecycle events at claim, completion, replay, terminal failure, staging, and reconciliation boundaries; pass explicit fields rather than request objects. Completion phases are exactly `preflight`, `normalize`, `artifact_prepare`, `artifact_publish`, `mongo_transaction`, and `post_commit_cleanup`. Applicable events carry only `diagnosticId`, `jobId`, `uploadId`, `resultId`, `jobKind`, `phase`, `attempt`, `durationMs`, `httpStatus`, `errorCode`, and `replayed`; never filename, source reference, claim token, body, URI, bucket/key, or raw path. Name the backend event emitted only after a persisted terminal failure `job_terminal_failed`; retryable worker-attempt failures use the distinct Task 7 event. The bounded commands emit exactly one `artifact_reconcile_summary` or `storage_reference_migration_summary` event with their allowlisted report counts and one operation-scoped diagnostic ID, including on a partial-failure exit. Their top-level catches log only through the safe logger, set a nonzero exit code, and never print `String(error)` or a raw provider/storage exception.

Construct the safe logger before environment loading and inject it into `startServer`/`createApp`. Emit `backend_starting`, `backend_ready`, `backend_start_failed`, `backend_stopping`, `backend_stopped`, and `backend_shutdown_failed`, with one startup ID and a separate shutdown ID. `backend_ready` may include only numeric port. Replace direct `String(error)` startup/shutdown writes; the entrypoint catch sets `process.exitCode = 1` and never prints the raw exception again. Startup cleanup must not mask the primary failure. Shutdown is idempotent across repeated `stop()` calls/signals, removes installed listeners, always attempts Mongo disconnect even if HTTP close fails, and uses an injected 30-second deadline plus `closeIdleConnections`/`closeAllConnections` when available so a hung close cannot stall forever.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd backend
npm test -- --run tests/logger.test.ts tests/errors.test.ts tests/extraction-worker.test.ts tests/extraction-artifact-reconciliation.test.ts tests/reconcile-extraction-artifacts-command.test.ts tests/migrate-storage-references-command.test.ts tests/server.test.ts tests/cors.test.ts
npm test
npm run typecheck
```

Expected: PASS; logs contain internal diagnostics, responses do not.

- [ ] **Step 6: Commit backend diagnostics**

```bash
git add backend/src/observability/logger.ts backend/src/middleware/request-context.ts backend/src/middleware/public-errors.ts backend/src/contracts/http.ts backend/src/middleware/cors.ts backend/src/middleware/errors.ts backend/src/middleware/validate.ts backend/src/routes/extraction-worker.ts backend/src/services/extraction-worker.service.ts backend/src/services/estimate-design.service.ts backend/src/services/extraction-artifact.service.ts backend/src/services/extraction-artifact-reconciler.service.ts backend/src/commands/reconcile-extraction-artifacts.ts backend/src/commands/migrate-storage-references.ts backend/src/app.ts backend/src/server.ts backend/tests/support/http-errors.ts backend/tests/logger.test.ts backend/tests/errors.test.ts backend/tests/extraction-worker.test.ts backend/tests/extraction-artifact-reconciliation.test.ts backend/tests/reconcile-extraction-artifacts-command.test.ts backend/tests/migrate-storage-references-command.test.ts backend/tests/server.test.ts backend/tests/cors.test.ts backend/tests/auth.test.ts backend/tests/design-section-review.test.ts backend/tests/design-sections.test.ts backend/tests/estimate-design-extraction.test.ts backend/tests/estimate-design-review.test.ts backend/tests/estimate-design-upload.test.ts backend/tests/estimate-pdf-routes.test.ts backend/tests/full-journey.test.ts backend/tests/hierarchy.test.ts backend/tests/leads.test.ts backend/tests/uploads.test.ts backend/tests/workflows.test.ts
git commit -m "feat: add safe extraction diagnostics"
```

### Task 6: Separate backend liveness from database and storage readiness

**Files:**
- Modify: `backend/src/routes/health.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: `backend/src/development/processes.ts`
- Modify: `backend/tests/health.test.ts`
- Modify: `backend/tests/config.test.ts`
- Modify: `backend/tests/server.test.ts`
- Modify: `backend/tests/development-processes.test.ts`

**Interfaces:**
- Consumes: `FileStorage.checkReady()` and `Logger`.
- Produces:

```ts
export interface ReadinessChecks {
  database(signal: AbortSignal): Promise<void>;
  storage(signal: AbortSignal): Promise<void>;
}

export function createHealthRouter(
  checks: ReadinessChecks,
  logger: Logger,
  timeoutMs: number
): Router;
```

- `HEALTH_CHECK_TIMEOUT_MS` is a positive integer with default `2_000`.

- [ ] **Step 1: Write failing health-route tests**

```ts
it("keeps liveness healthy while readiness reports a storage outage", async () => {
  const app = createApp({
    auth,
    readinessChecks: {
      database: vi.fn(async () => undefined),
      storage: vi.fn(async () => { throw new Error("bucket unavailable"); })
    }
  });
  expect((await request(app).get("/api/v1/health/live")).status).toBe(200);
  const ready = await request(app).get("/api/v1/health/ready");
  expect(ready.status).toBe(503);
  expect(ready.body).toEqual({
    data: {
      status: "not_ready",
      checks: { database: "ready", storage: "not_ready" }
    }
  });
  expect(JSON.stringify(ready.body)).not.toContain("bucket unavailable");
});
```

Also assert `/api/v1/health` retains `{ data: { status: "ok" } }`, and readiness returns 200 only when both checks pass.

Add hung database/storage promises and assert readiness returns 503 within the injected 25 ms test timeout. Add server tests where Mongo `hello` reports no replica-set name or `isWritablePrimary: false`; readiness must fail even when `ping` succeeds. Storage tests from Task 4 already prove each required object capability.

- [ ] **Step 2: Run health and bootstrap tests**

Run: `cd backend && npm test -- --run tests/health.test.ts tests/server.test.ts tests/development-processes.test.ts`

Expected: FAIL because only the compatibility route exists.

- [ ] **Step 3: Implement health routing and runtime checks**

```ts
healthRouter.get(["/health", "/health/live"], (_request, response) => {
  response.status(200).json({ data: { status: "ok" } });
});

healthRouter.get("/health/ready", async (_request, response) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const [database, storage] = await Promise.allSettled([
    withAbortTimeout(checks.database(controller.signal), controller.signal),
    withAbortTimeout(checks.storage(controller.signal), controller.signal)
  ]);
  clearTimeout(timer);
  const body = {
    status: database.status === "fulfilled" && storage.status === "fulfilled"
      ? "ready"
      : "not_ready",
    checks: {
      database: database.status === "fulfilled" ? "ready" : "not_ready",
      storage: storage.status === "fulfilled" ? "ready" : "not_ready"
    }
  };
  response.status(body.status === "ready" ? 200 : 503).json({ data: body });
});

function withAbortTimeout<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new Error("Readiness check timed out."));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("Readiness check timed out."));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}
```

`withAbortTimeout` races the operation against the signal and removes its listener in `finally`, so a dependency that ignores abort still cannot hang the response. At server startup, the database check runs bounded `ping` and `hello` commands and requires both a non-empty replica-set `setName` and `isWritablePrimary === true`; this verifies the topology needed for completion transactions. Pass the signal to `storage.checkReady(signal)`. Log rejected reasons internally with the health request's existing `request.diagnosticId`; do not generate a second ID inside the router.

- [ ] **Step 4: Make development orchestration wait for readiness**

Change `waitForBackendHealth` to request `${OCR_API_BASE_URL}/health/ready`; its current 120 × 250 ms bound remains unchanged. Each fetch uses `AbortSignal.any([startupSignal, AbortSignal.timeout(2_000)])`, so one hung socket cannot consume the whole loop. Update tests to assert the worker is not spawned after liveness succeeds but readiness still returns 503, and that a never-resolving fetch is aborted/retried rather than hanging orchestration.

- [ ] **Step 5: Run focused tests and build**

Run: `cd backend && npm test -- --run tests/health.test.ts tests/config.test.ts tests/server.test.ts tests/development-processes.test.ts && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit readiness checks**

```bash
git add backend/src/routes/health.ts backend/src/app.ts backend/src/server.ts backend/src/config/env.ts backend/.env.example backend/src/development/processes.ts backend/tests/health.test.ts backend/tests/config.test.ts backend/tests/server.test.ts backend/tests/development-processes.test.ts
git commit -m "feat: add backend readiness checks"
```

### Task 7: Add structured worker logs, shared-model readiness, and graceful probes

**Files:**
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/tests/extraction-worker.test.ts`
- Create: `ocr-worker/src/lisno_ocr/ocr_engine.py`
- Create: `ocr-worker/src/lisno_ocr/structured_logging.py`
- Create: `ocr-worker/src/lisno_ocr/health.py`
- Create: `ocr-worker/tests/test_structured_logging.py`
- Create: `ocr-worker/tests/test_health.py`
- Create: `ocr-worker/tests/test_ocr_engine.py`
- Modify: `ocr-worker/src/lisno_ocr/contracts.py`
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Modify: `ocr-worker/src/lisno_ocr/worker.py`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `ocr-worker/tests/test_worker.py`
- Modify: `ocr-worker/README.md`

**Interfaces:**
- Consumes: per-claim `ExtractionLimits` and per-job `Extractor` construction from the bounded-extraction plan, plus transport classification from the idempotent-completion plan.
- Produces:

```python
@dataclass(slots=True)
class WorkerHealthState:
    clock: Callable[[], float]
    last_backend_success_at: float | None = None
    model_ready: bool = False
    shutting_down: bool = False

    def live(self) -> bool:
        return not self.shutting_down

    def ready(
        self,
        max_backend_age_seconds: float,
    ) -> bool:
        return (
            self.live()
            and self.model_ready
            and self.last_backend_success_at is not None
            and self.clock() - self.last_backend_success_at
                <= max_backend_age_seconds
        )
```

- `log_event(event: WorkerEvent, *, level: Literal["info", "error"], fields: Mapping[str, str | int | float | bool | None], error: BaseException | None = None, write: Callable[[str], None] = sys.stderr.write) -> None` is implemented in Step 3.
- `PaddleOcrEngine(model_factory: Callable[[], object] | None = None)` initializes one cached Paddle model in `prepare()`, and `predict(**kwargs)` delegates every per-job extractor call to that same object. The default factory preserves the current production `PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)` constructor; do not hard-code a different model name in this operational change.
- `ClaimedJob` gains required `upload_id: str` and `attempt_count: int`. The backend returns top-level `uploadId` for both job kinds: the project design version ID for project jobs and `job.upload.id` for estimate/replacement jobs. It already supplies `attemptCount`; the Python parser must retain and validate it.
- Worker environment defaults: `OCR_HEALTH_HOST=0.0.0.0`, `OCR_HEALTH_PORT=8081`, and `OCR_HEALTH_MAX_BACKEND_AGE_SECONDS=120`.
- Liveness means the probe-serving process is running and not shutting down; it must not fail merely because one allowed extraction occupies the poll loop for up to 900 seconds. Readiness additionally requires a warm model and a recent successful backend response.

- [ ] **Step 1: Write failing log redaction and health-state tests**

```python
def test_log_event_includes_stack_but_drops_unknown_secret_fields() -> None:
    lines: list[str] = []
    error = RuntimeError(
        "Bearer worker-secret failed at /private/uploads/source.pdf"
    )
    log_event(
        "extraction_failed",
        level="error",
        fields={
            "jobId": "job-1",
            "resultId": "result-1",
            "phase": "ocr",
            "attempt": 2,
            "authorization": "Bearer secret",
        },
        error=error,
        write=lines.append,
    )
    payload = json.loads(lines[0])
    assert payload["jobId"] == "job-1"
    assert "RuntimeError" in payload["error"]["stack"]
    assert "authorization" not in payload
    assert "Bearer secret" not in lines[0]
    assert "worker-secret" not in lines[0]
    assert "/private/uploads" not in lines[0]


def test_readiness_requires_backend_and_model() -> None:
    state = WorkerHealthState(clock=lambda: 100.0)
    state.last_backend_success_at = 94.0
    assert state.live()
    assert not state.ready(120.0)
    state.model_ready = True
    assert state.ready(120.0)
    state.shutting_down = True
    assert not state.live()
```

Add HTTP tests for `/live` and `/ready`, a test proving liveness stays 200 while a simulated 900-second extraction is in progress, and worker-client tests proving successful 204 claim, heartbeat, completion, and failure responses refresh backend readiness.

Add backend claim response tests for both job kinds asserting exact top-level `uploadId` and `attemptCount`. Add Python parser tests that reject a missing/empty upload ID and a missing, boolean, fractional, zero, or negative attempt count; neither value may be inferred from a URL or taxonomy.

Add malicious allowlisted-field tests that pass a bearer token, absolute path, filename, bucket/key, and endpoint through `diagnosticId`, `jobId`, `uploadId`, `resultId`, `phase`, and `errorCode`. Assert a canonical UUID and safe IDs survive unchanged, every invalid value is omitted or replaced with a fixed marker, invalid enum values never reach JSON, non-finite/bool-as-int numeric values are rejected, and `replayed` accepts only a real boolean. Add a hostile exception whose `__str__` raises and a non-serializable allowed-field value; neither logging call may escape or stop the worker loop.

Add provider/supervisor tests proving:

- an injected model factory is called once across `prepare()` plus multiple `predict()` calls;
- two claims with different limit snapshots/taxonomies create two extractors that receive the same engine object identity;
- providing a whole-extractor test override performs no Paddle import and calls no engine factory;
- model preparation failure and a fatal poll-loop exception both set readiness false and close, `server_close`, and join the probe thread exactly once;
- normal and signal-triggered exit perform the same cleanup and emit one stopping event.

Replace the existing `test_installed_paddle_model_smoke` body in `tests/test_extractor.py`: remove `pytest.importorskip("paddleocr")`, construct `PaddleOcrEngine`, call `prepare()`, and pass that engine plus the bounded plan's `LIMITS` fixture to `Extractor` for the committed `model-supported-title.png` fixture. Keep `@pytest.mark.model`; a missing Paddle package, missing model asset, failed warmup, or empty extraction must fail instead of skip.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd ocr-worker && .venv/bin/python -m pytest tests/test_structured_logging.py tests/test_health.py tests/test_ocr_engine.py tests/test_worker.py -q`
Run: `cd backend && npm test -- --run tests/extraction-worker.test.ts`

Expected: FAIL because the modules and settings do not exist.

- [ ] **Step 3: Implement allowlisted JSON logging**

```python
_ALLOWED_FIELDS = frozenset({
    "diagnosticId", "jobId", "uploadId", "resultId", "phase", "attempt",
    "durationMs", "httpStatus", "errorCode", "replayed",
})

WorkerEvent = Literal[
    "worker_started", "model_ready", "claim_succeeded",
    "extraction_started", "extraction_result_ready",
    "completion_replayed", "backend_retry", "extraction_failed",
    "worker_fatal", "worker_stopping",
]

WorkerPhase = Literal[
    "startup", "claim", "download", "heartbeat", "decode", "render", "ocr",
    "result_construct", "complete", "fail_callback", "shutdown",
]

WorkerLogErrorCode = Literal[
    "BACKEND_TRANSPORT_ERROR", "INVALID_SOURCE", "PDF_RENDER_FAILED",
    "OCR_FAILED", "RESULT_REJECTED", "MODEL_INITIALIZATION_FAILED",
    "UNEXPECTED_WORKER_ERROR",
]

try:
    payload = project_validated_worker_event(
        event=event,
        level=level,
        fields=fields,
        at=datetime.now(timezone.utc).isoformat(),
    )
    if error is not None:
        payload["error"] = {
            "name": sanitize_diagnostic_text(type(error).__name__)[:128],
            "message": sanitize_diagnostic_text(str(error))[:1000],
            "stack": sanitize_diagnostic_text(
                "".join(traceback.format_exception(error))
            )[:16000],
        }
    write(json.dumps(payload, separators=(",", ":")) + "\n")
except Exception:
    pass
```

Implement `project_validated_worker_event` as the only route from caller fields to JSON. At runtime—not only through `Literal` typing—it requires `event`, `level`, `phase`, and `errorCode` to match their declared finite sets; accepts `diagnosticId` only as a canonical UUID; accepts job/upload/result IDs only when they match `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; accepts `attempt`, `durationMs`, and `httpStatus` only as finite non-boolean numbers in their documented nonnegative/range bounds; and accepts `replayed` only as `bool`. It ignores unknown keys and omits or replaces invalid allowlisted values with a fixed marker. Keep projection, exception normalization, JSON serialization, and the sink write inside the non-throwing boundary shown above so logging can never stop the worker.

Use the same bounded redaction categories as the backend, plus exact configured worker token/API credential values supplied when creating the logger. Redact before truncation, remove external path basenames/original filenames, and preserve only sanitized app-relative frame/function context. Do not send the `error` object, message, or stack to the backend failure endpoint; use only the backend failure code so Task 5 selects the public message.

- [ ] **Step 4: Implement the probe server and warm one shared OCR engine**

Move Paddle construction out of the per-job extractor into a reusable provider:

```python
class PaddleOcrEngine:
    def __init__(
        self,
        model_factory: Callable[[], object] | None = None,
    ) -> None:
        self._engine: Any | None = None
        self._model_factory = model_factory or self._create_default

    def prepare(self) -> None:
        self._get_engine()

    def predict(self, **kwargs: object) -> object:
        return self._get_engine().predict(**kwargs)

    def _get_engine(self) -> Any:
        if self._engine is None:
            self._engine = self._model_factory()
        return self._engine

    @staticmethod
    def _create_default() -> object:
        from paddleocr import PaddleOCR
        return PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
```

Remove lazy Paddle import/construction from `Extractor._engine`; production always injects the provider, while legacy `.ocr(...)` parsing remains for compatibility test engines. Create one `PaddleOcrEngine` before the poll loop and pass it to each new per-job `Extractor(limits=claimed.limits, ocr_engine=shared_engine, estimate_taxonomy=claimed.taxonomy)`. This preserves authoritative per-claim limits while avoiding model recreation.

Update the model smoke exactly as specified in Step 1 while introducing the provider. The routine `-m "not model"` suite remains dependency-light; Task 8 executes this non-skippable smoke inside the exact deployment image after model assets are warmed.

Keep the existing whole-`extractor` test override: when it is supplied, mark the injected extractor ready and do not construct, import, or prepare Paddle. Otherwise `run_worker` receives the already-prepared engine plus an injectable `extractor_factory` and creates one limits-specific extractor per claim.

Own process lifecycle in a `serve_worker` boundary with injectable `engine`, `probe_factory`, and `worker_loop`:

```python
probe = probe_factory(state, settings)
try:
    log_event("worker_started", ...)
    if extractor_override is None:
        engine.prepare()
    state.model_ready = True
    log_event("model_ready", ...)
    worker_loop(
        settings,
        ocr_engine=engine,
        extractor=extractor_override,
        should_stop=lambda: state.shutting_down,
    )
except Exception as error:
    state.model_ready = False
    log_event("worker_fatal", error=error, ...)
    raise
finally:
    state.shutting_down = True
    state.model_ready = False
    log_event("worker_stopping", ...)
    probe.shutdown()
    probe.server_close()
    probe.join()
```

Start the stdlib `ThreadingHTTPServer` before preparation so liveness is available while Paddle initializes; readiness stays false until preparation returns. The `finally` owns cleanup for preparation failure, any fatal exception escaping the poll loop, normal completion, and signals. Signal handlers only set `shutting_down=True`; the loop stops claiming, lets the current request/extraction boundary finish, and then enters the same cleanup. Route every successful backend response—including 204 claim, heartbeat, completion, and failure—through one callback that sets `last_backend_success_at`.

- [ ] **Step 5: Emit lifecycle events without secrets**

Use exact event ownership:

- backend only: `extraction_completed` after first committed completion and `job_terminal_failed` only after persisted terminal state;
- worker only: `worker_started`, `model_ready`, `claim_succeeded`, `extraction_started`, `extraction_result_ready`, `completion_replayed`, `backend_retry`, `extraction_failed` (attempt-level), `worker_fatal`, and `worker_stopping`;
- reconciler only: `artifact_reconcile_summary`.

Populate approved correlation fields from `claimed.upload_id`, `claimed.attempt_count`, and the generated result ID; record elapsed monotonic durations. Generate `resultId` before emitting `extraction_result_ready`. Have `_complete_with_retry` return the validated `CompletionReceipt` so `completion_replayed` is emitted only from `receipt.replayed`, not inferred from an HTTP retry. Never pass a claim token, request headers, source path, response body, or original filename.

- [ ] **Step 6: Run worker tests**

Run: `cd ocr-worker && .venv/bin/python -m pytest -m "not model"`
Run: `cd backend && npm test -- --run tests/extraction-worker.test.ts && npm run typecheck`

Expected: PASS; no test initializes the real Paddle model unless marked `model`.

- [ ] **Step 7: Commit worker operations**

```bash
git add backend/src/services/extraction-worker.service.ts backend/tests/extraction-worker.test.ts ocr-worker/src/lisno_ocr/ocr_engine.py ocr-worker/src/lisno_ocr/structured_logging.py ocr-worker/src/lisno_ocr/health.py ocr-worker/src/lisno_ocr/contracts.py ocr-worker/src/lisno_ocr/extractor.py ocr-worker/src/lisno_ocr/worker.py ocr-worker/tests/test_structured_logging.py ocr-worker/tests/test_health.py ocr-worker/tests/test_ocr_engine.py ocr-worker/tests/test_extractor.py ocr-worker/tests/test_worker.py ocr-worker/README.md
git commit -m "feat: add OCR worker diagnostics and readiness"
```

### Task 8: Document production configuration, reconciliation, and rollout gates

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/README.md`
- Modify: `ocr-worker/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all runtime settings, probes, commands, and tests from Tasks 1-7.
- Produces: an operator runbook with an exact staged rollout and rollback-safe artifact procedure.

- [ ] **Step 1: Add the exact production storage and worker-health settings**

```dotenv
NODE_ENV=production
# Use mirror for the migration and rollback window; switch to s3 only at cutover.
STORAGE_DRIVER=mirror
STORAGE_S3_BUCKET=lisno-production
STORAGE_S3_REGION=ap-south-1
STORAGE_S3_PREFIX=lisno
STORAGE_S3_ENDPOINT=
STORAGE_S3_FORCE_PATH_STYLE=false
STORAGE_MAX_READ_BYTES=67108864
OCR_HEALTH_HOST=0.0.0.0
OCR_HEALTH_PORT=8081
OCR_HEALTH_MAX_BACKEND_AGE_SECONDS=120
```

Document that credentials use the AWS SDK default credential chain and must not be copied into these files. Steady state is `STORAGE_DRIVER=s3`; `mirror` is deliberately temporary but remains supported for rollback. The bucket and prefix must remain unchanged throughout migration, observation, cutover, and rollback.

- [ ] **Step 2: Document artifact reconciliation and reference migration**

Add exact operator commands:

```bash
cd backend
npm run reconcile:extraction-artifacts -- --dry-run --limit=100
npm run reconcile:extraction-artifacts -- --limit=100
```

Explain that a `reconcile_pending` batch is retained, same-result batches are promoted, different terminal-result batches are discarded, and operators must never manually delete `staging/` after an uncertain Mongo commit.

Document the reconciliation command as a singleton scheduled job (recommended every five minutes) in addition to the pre/post-deploy manual dry run. Repeated or overlapping invocations remain safe because promotion, deletion, and guarded repository transitions are idempotent; every invocation is still capped by `--limit`.

Add the exact storage-copy sequence after every legacy upload volume/snapshot is mounted. Repeat `--source-dir` for each volume:

```bash
cd backend
npm run migrate:storage-references -- --dry-run --batch-size=100 \
  --source-dir=/mnt/lisno-uploads-a --source-dir=/mnt/lisno-uploads-b
npm run migrate:storage-references -- --batch-size=100 \
  --source-dir=/mnt/lisno-uploads-a --source-dir=/mnt/lisno-uploads-b
npm run migrate:storage-references -- --dry-run --batch-size=100 \
  --source-dir=/mnt/lisno-uploads-a --source-dir=/mnt/lisno-uploads-b
```

The first dry run may report `wouldCopy > 0` but must report `failures = 0`. The final dry run is the cutover gate and must report both `wouldCopy = 0` and `failures = 0`. It must cover all six model fields and every legacy volume; do not proceed if any pod/volume was omitted.

- [ ] **Step 3: Document health and the approved rollout**

Document:

```bash
curl --fail http://127.0.0.1:3000/api/v1/health/live
curl --fail http://127.0.0.1:3000/api/v1/health/ready
curl --fail http://127.0.0.1:8081/live
curl --fail http://127.0.0.1:8081/ready
```

Document this exact rollout:

1. Enter an operator-enforced maintenance/write freeze before the backup boundary: the load balancer blocks user upload/extraction/mapping/submission mutations, workers stop claiming, and operators record the drain time. Back up MongoDB, snapshot every legacy local upload volume, inventory every backend replica/volume, and provision the final S3 bucket/prefix, credentials, and one shared rollback volume that every new backend replica mounts at the same `UPLOADS_DIR`. Do not delete any local file in this release.
2. While user traffic and worker claims remain frozen, deploy the compatible schema/completion backend to **all** replicas with `STORAGE_DRIVER=mirror`; drain every old local-only replica. Confirm backend readiness checks both S3 and the shared local rollback volume. No new write may occur between the database/volume snapshots and the completed storage migration except the explicitly controlled smoke in Step 5.
3. Run/review `migrate:estimate-design-mapping -- --dry-run`, take the required backup checkpoint, execute it, then rerun its dry run.
4. Mount/inventory all legacy volumes and run storage dry-run → copy → final dry-run as documented above. Exercise representative old source/page/crop downloads through every serving replica while still in mirror mode; do not lift maintenance until all six reference fields and every source volume pass.
5. Deploy the worker, then frontend. Keep general traffic frozen while a release operator enables one isolated test account/tenant and verifies backend/worker live and ready probes, diagnostic correlation/redaction, artifact reconciliation dry run, the supplied 34-page regression, the deployment-image model smoke, and one production-like upload/extraction/estimator-Misc-assignment/client-submission journey. Remove the smoke data, record its diagnostic IDs/evidence, then reopen user traffic and worker claims.
6. Keep `mirror` for the declared rollback observation window so all new S3 writes also have local rollback copies. Rollback during this window only to a mirror-capable release/configuration; never reintroduce an old local-only replica.
7. After the observation window and a fresh `wouldCopy = 0`/`failures = 0` check, deploy all replicas with `STORAGE_DRIVER=s3`. Once any S3-only replica accepts a write, rollback only to the same mirror-capable binary with `STORAGE_DRIVER=mirror`; rolling back to the old local-only binary is unsafe.
8. Retain the legacy volume snapshots/local copies for the approved retention period. Their deletion/decommission is a separately reviewed destructive change.

Document that operational metrics are derived from the allowlisted structured events, not a second in-process state store. The named release operator/SRE configures the production log sink/dashboard to count backend `extraction_completed`, backend `job_terminal_failed`, worker `backend_retry`, worker `extraction_failed` (attempt rate), and reconciler `artifact_reconcile_summary`; graph `durationMs` p50/p95; and alert on readiness failures, terminal failures, or reconciliation `failures > 0`. The production-like extraction gate must confirm the job/upload/result/attempt diagnostic fields reach that sink without a filename, claim token, header, request body, source reference, credential, or absolute path. These are explicit external/manual gates, not claims made by the local command block below: the runbook requires a change-ticket link, dashboard/alert evidence, smoke diagnostic IDs, cleanup confirmation, and operator sign-off before traffic reopens.

- [ ] **Step 4: Run complete release verification**

Run:

```bash
cd backend
npm test
npm run typecheck
npm run build
npm run reconcile:extraction-artifacts -- --dry-run --limit=100
npm run migrate:estimate-design-mapping -- --dry-run
npm run migrate:storage-references -- --dry-run --batch-size=100 \
  --source-dir=/mnt/lisno-uploads-a --source-dir=/mnt/lisno-uploads-b
```

Run:

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

Run:

```bash
: "${OCR_PRIVATE_ESTIMATE_PDF:?Set OCR_PRIVATE_ESTIMATE_PDF to the supplied 34-page PDF}"
case "$OCR_PRIVATE_ESTIMATE_PDF" in /*) ;; *) echo "OCR_PRIVATE_ESTIMATE_PDF must be absolute" >&2; exit 1;; esac
test -f "$OCR_PRIVATE_ESTIMATE_PDF"
cd ocr-worker
.venv/bin/python -m pytest -m "not model and not private_fixture"
.venv/bin/python -m pytest -m private_fixture tests/test_extractor.py -q
.venv/bin/python -m pytest -m model tests/test_extractor.py -q
```

Run the model command inside the exact deployment image/environment installed with `.[test,model]` and warmed model assets. Remove `pytest.importorskip("paddleocr")` from the model test; it must construct `PaddleOcrEngine`, call `prepare()`, and extract the committed model fixture through `Extractor(..., ocr_engine=engine)`. Missing Paddle/model assets are a release failure, not a skip.

Expected: all suites and builds PASS; the mapping/reconciliation/storage dry runs make no writes; the final storage report has `wouldCopy = 0` and `failures = 0`; private tests pass the derived first-six subset and complete 34-page source; the real model test is collected and passes without skip.

- [ ] **Step 5: Validate documentation and commit**

Run: `git diff --check`

Expected: exit 0.

```bash
git add backend/.env.example backend/README.md ocr-worker/README.md README.md
git commit -m "docs: add extraction production runbook"
```
