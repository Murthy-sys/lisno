# Idempotent Extraction Completion and Retry Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project and estimate extraction completion safely replayable, keep transient backend outages out of OCR failure reporting, and prevent repeatedly failing jobs from monopolizing either extraction queue.

**Architecture:** A shared backend lifecycle module owns the completion receipt, result-conflict rule, retry policy, and retry schedule. Both job collections persist `nextAttemptAt`, perform the same-result check before lease validation and again inside the completion transaction, and use one capped failure policy for delayed retry and terminalization. The Python worker creates one result ID per extracted payload, retries only transient backend operations with bounded jittered exponential backoff, and lets an unreconciled completion lease expire without calling `/fail`.

**Tech Stack:** Node.js, TypeScript, Express, Mongoose transactions, Zod, Vitest, Supertest, `mongodb-memory-server` 11.2.0, Python 3.11, `urllib`, pytest.

## Global Constraints

- Apply every lifecycle rule to both `project_design` and `estimate_design` jobs, including estimate replacement jobs.
- A single extracted payload gets one UUID `resultId`; every completion retry for that payload reuses it.
- A completed job with the same `resultId` returns its persisted success before claim-token or lease-expiry validation.
- Repeat the same-result/conflicting-result decision after rereading the job inside the transaction; the preflight read is an optimization, not the concurrency guard.
- A completed job with a different `resultId` returns `409 EXTRACTION_RESULT_CONFLICT` and does not write pages, drawings, sections, revisions, audit records, or generated references.
- Backend transport failures never call `/fail`. If all completion retries are exhausted, stop heartbeating that job and leave its lease to expire.
- Only source decoding/rendering/OCR/result-construction failures call `/fail`; `/fail` transport errors may be retried, but they must not be reclassified as OCR failures.
- Backend retry defaults are exactly five total processing attempts, a 30-second initial poison-job delay, and a 15-minute maximum poison-job delay.
- Worker transport retry defaults are exactly four requests, a 0.5-second initial backoff, and an 8-second maximum backoff, using equal jitter.
- `queuedAt` remains queue age. `nextAttemptAt` is the eligibility gate: it equals `queuedAt` on enqueue/manual reset, is `null` while processing or terminal, and is set to a future instant after a retryable extraction failure.
- `claimGeneration` is a monotonic, non-secret counter initialized to zero and incremented on every successful claim/reclaim. It is never reset by automatic or manual retry, so later artifact reconciliation can prove an old attempt is stale without storing a claim token.
- Automatic retries preserve `attemptCount`; safe manual retry resets `attemptCount` to zero and clears claim, lease, completion, failure, scheduling, and `workerResultId` state atomically.
- Keep `RESULT_REJECTED` accepted by the backend `/fail` schema for compatibility with the prior worker during rollout, even though the updated worker no longer calls `/fail` for completion rejection.
- Do not add S3/object-storage work, general logging/readiness work, mapping UI/persistence changes, or extraction pixel/text-bound changes in this plan.

---

## File and Responsibility Map

- Create `backend/src/domain/extraction-lifecycle.ts`: shared `CompletionReceipt`, `ExtractionRetryPolicy`, completion inspection, and deterministic poison-job scheduling.
- Modify `backend/src/models/DesignExtractionJob.ts`: project `nextAttemptAt` persistence and claim index.
- Modify `backend/src/models/EstimateDesignExtractionJob.ts`: estimate `nextAttemptAt` persistence and claim index.
- Modify `backend/src/repositories/types.ts`: project job field and atomic retry/terminalization interfaces.
- Modify `backend/src/repositories/memory.ts`: in-memory eligibility, completion, failure scheduling, terminalization, and safe reset.
- Modify `backend/src/repositories/mongo.ts`: Mongo eligibility, transactional completion support, failure scheduling, terminalization, and safe reset.
- Modify `backend/src/services/design-version.service.ts`: initialize project jobs as immediately eligible.
- Modify `backend/src/services/design-section.service.ts`: preserve the existing authorized manual retry boundary while consuming the safe repository reset.
- Modify `backend/src/services/estimate-design.service.ts`: estimate replay/conflict logic, transactional recheck, delayed retry, attempt terminalization, and safe reset.
- Modify `backend/src/services/extraction-worker.service.ts`: shared completion receipt, project transactional recheck, poison-candidate arbitration, and retry-policy use.
- Modify `backend/src/routes/extraction-worker.ts`: return the complete receipt from `/complete`.
- Modify `backend/src/config/env.ts`: parse backend retry-policy environment values.
- Modify `backend/.env.example` and `backend/README.md`: document backend retry-policy values.
- Modify `backend/src/app.ts`: inject one retry policy into project and estimate worker paths.
- Modify `backend/src/server.ts`: map runtime environment values into milliseconds.
- Modify `backend/tests/config.test.ts`: retry-policy defaults and validation.
- Modify `backend/tests/repository.test.ts`: in-memory scheduling, terminalization, and reset contracts.
- Modify `backend/tests/mongo-repository.test.ts`: Mongo query/update contracts.
- Modify `backend/tests/extraction-worker.test.ts`: project replay/conflict and cross-queue poison behavior.
- Modify `backend/tests/estimate-design-extraction.test.ts`: estimate replay/conflict, scheduled retry, terminalization, replacement reservation, and reset behavior.
- Modify `backend/tests/design-sections.test.ts` and `backend/tests/design-section-review.test.ts`: add `nextAttemptAt` to typed project job fixtures and verify safe project reset.
- Modify `backend/tests/estimate-design-upload.test.ts`: assert new estimate jobs initialize `nextAttemptAt`.
- Modify `backend/tests/uploads.test.ts` only where typed project job fixtures require `nextAttemptAt`.
- Modify `ocr-worker/src/lisno_ocr/contracts.py`: Python completion receipt, transport error, and retry settings.
- Modify `ocr-worker/src/lisno_ocr/worker.py`: stable result ID, transport classification, jittered backoff, bounded callbacks, and durable claim loop.
- Modify `ocr-worker/tests/test_worker.py`: deterministic retry, classification, reconciliation, and loop-survival tests.
- Modify `backend/package.json`: add the focused completion replica-set script; the pinned dependency is installed by the preceding mapping plan.
- Reuse `backend/tests/helpers/mongo-replica-set.ts`: one-node WiredTiger replica-set lifecycle from the preceding mapping plan.
- Create `backend/tests/extraction-completion.replica-set.test.ts`: real transactional replay, concurrency, conflict, and rollback coverage for both job kinds.

---

### Task 1: Add the shared lifecycle contract, scheduling field, and runtime policy

**Files:**
- Create: `backend/src/domain/extraction-lifecycle.ts`
- Modify: `backend/src/models/DesignExtractionJob.ts`
- Modify: `backend/src/models/EstimateDesignExtractionJob.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/design-version.service.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/config.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/estimate-design-upload.test.ts`
- Test fixture updates: `backend/tests/design-sections.test.ts`, `backend/tests/design-section-review.test.ts`, `backend/tests/extraction-worker.test.ts`, `backend/tests/estimate-design-extraction.test.ts`, `backend/tests/uploads.test.ts`

**Interfaces:**
- Consumes: existing project/estimate status strings and ISO timestamps.
- Produces:

```ts
export type SuccessfulExtractionStatus =
  | "designer_review"
  | "estimator_review"
  | "submitted"
  | "changes_requested"
  | "approved";

export interface CompletionReceipt {
  id: string;
  status: SuccessfulExtractionStatus;
  resultId: string;
  completedAt: string;
  replayed: boolean;
}

export interface ExtractionRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export const defaultExtractionRetryPolicy: Readonly<ExtractionRetryPolicy> = {
  maxAttempts: 5,
  initialDelayMs: 30_000,
  maxDelayMs: 15 * 60_000
};
```

- `completionReceiptFor(job, resultId, replayed) -> CompletionReceipt | null` returns `null` only when no result has committed; it throws `ExtractionResultConflictError` when a successful job already stores a different result.
- `retrySchedule(failedAt, attemptCount, policy) -> { terminal: boolean; nextAttemptAt: string | null }` uses `initialDelayMs * 2 ** (attemptCount - 1)`, capped at `maxDelayMs`.
- Add `nextAttemptAt: string | null` and `claimGeneration: number` to `DesignExtractionJobRecord`, `EstimateWorkerJobRecord`, both Mongoose schemas, Mongo mapping, and in-memory records.

- [ ] **Step 1: Write failing contract, default, and initialization tests**

Add these assertions:

```ts
it("loads the bounded extraction retry policy defaults", () => {
  const env = loadEnvironment({
    JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
    OCR_WORKER_TOKEN: "config-worker-token-with-at-least-32-characters"
  });
  expect(env.OCR_MAX_ATTEMPTS).toBe(5);
  expect(env.OCR_RETRY_INITIAL_SECONDS).toBe(30);
  expect(env.OCR_RETRY_MAX_SECONDS).toBe(900);
});

it("rejects an extraction retry cap below its initial delay", () => {
  expect(() => loadEnvironment({
    JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
    OCR_WORKER_TOKEN: "config-worker-token-with-at-least-32-characters",
    OCR_RETRY_INITIAL_SECONDS: "60",
    OCR_RETRY_MAX_SECONDS: "30"
  })).toThrow("OCR_RETRY_MAX_SECONDS");
});
```

In `backend/tests/repository.test.ts`, assert enqueue defaults scheduling to queue time:

```ts
expect(await repository.enqueueExtractionJob({
  id: "job-scheduled",
  designVersionId: "version-scheduled",
  status: "queued",
  attemptCount: 0,
  queuedAt: "2026-07-30T10:00:00.000Z",
  startedAt: null,
  completedAt: null,
  leaseExpiresAt: null,
  failureCode: null,
  failureMessage: null,
  claimGeneration: 0
})).toMatchObject({
  nextAttemptAt: "2026-07-30T10:00:00.000Z"
});
```

In `backend/tests/estimate-design-upload.test.ts`, extend the existing create assertion:

```ts
expect(EstimateDesignExtractionJobModel.create).toHaveBeenCalledWith(
  [expect.objectContaining({
    uploadId: response.body.data.id,
    status: "queued",
    attemptCount: 0,
    claimGeneration: 0,
    nextAttemptAt: expect.any(Date)
  })],
  { session }
);
```

- [ ] **Step 2: Run focused tests and verify the missing contract fails**

Run:

```bash
cd backend
npm test -- tests/config.test.ts tests/repository.test.ts tests/estimate-design-upload.test.ts
```

Expected: FAIL because the retry environment fields and `nextAttemptAt` do not exist.

- [ ] **Step 3: Implement the shared lifecycle module**

Create `backend/src/domain/extraction-lifecycle.ts` with:

```ts
export type SuccessfulExtractionStatus =
  | "designer_review"
  | "estimator_review"
  | "submitted"
  | "changes_requested"
  | "approved";

const successfulStatuses = new Set<string>([
  "designer_review",
  "estimator_review",
  "submitted",
  "changes_requested",
  "approved"
]);

export interface CompletionReceipt {
  id: string;
  status: SuccessfulExtractionStatus;
  resultId: string;
  completedAt: string;
  replayed: boolean;
}

export interface CompletionRecord {
  id: string;
  status: string;
  workerResultId: string | null;
  completedAt: string | null;
}

export class ExtractionResultConflictError extends Error {
  constructor() {
    super("A different result has already completed this extraction job.");
    this.name = "ExtractionResultConflictError";
  }
}

export function completionReceiptFor(
  job: CompletionRecord,
  resultId: string,
  replayed: boolean
): CompletionReceipt | null {
  if (job.workerResultId === null) return null;
  if (
    job.workerResultId !== resultId ||
    !successfulStatuses.has(job.status) ||
    job.completedAt === null
  ) {
    throw new ExtractionResultConflictError();
  }
  return {
    id: job.id,
    status: job.status as SuccessfulExtractionStatus,
    resultId: job.workerResultId,
    completedAt: job.completedAt,
    replayed
  };
}

export interface ExtractionRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export const defaultExtractionRetryPolicy: Readonly<ExtractionRetryPolicy> = {
  maxAttempts: 5,
  initialDelayMs: 30_000,
  maxDelayMs: 15 * 60_000
};

export function retrySchedule(
  failedAt: string,
  attemptCount: number,
  policy: ExtractionRetryPolicy
): { terminal: boolean; nextAttemptAt: string | null } {
  if (attemptCount >= policy.maxAttempts) {
    return { terminal: true, nextAttemptAt: null };
  }
  const exponent = Math.max(0, attemptCount - 1);
  const delayMs = Math.min(
    policy.maxDelayMs,
    policy.initialDelayMs * (2 ** exponent)
  );
  return {
    terminal: false,
    nextAttemptAt: new Date(new Date(failedAt).getTime() + delayMs).toISOString()
  };
}
```

- [ ] **Step 4: Persist and map scheduling plus monotonic claim generation**

Add these fields to both Mongoose schemas:

```ts
nextAttemptAt: {
  type: Date,
  default: function (this: { status?: string; queuedAt?: Date }) {
    return this.status === "queued"
      ? (this.queuedAt ?? new Date())
      : null;
  }
},
claimGeneration: {
  type: Number,
  required: true,
  default: 0,
  min: 0
},
```

Replace both claim indexes with:

```ts
schema.index({
  status: 1,
  nextAttemptAt: 1,
  leaseExpiresAt: 1,
  queuedAt: 1,
  _id: 1
});
```

Map a legacy record without the field as immediately eligible:

```ts
nextAttemptAt:
  document.nextAttemptAt === null || document.nextAttemptAt === undefined
    ? (document.status === "queued" ? iso(document.queuedAt) : null)
    : iso(document.nextAttemptAt),
claimGeneration:
  Number.isSafeInteger(document.claimGeneration) &&
  document.claimGeneration >= 0
    ? document.claimGeneration
    : 0,
```

Initialize new project and both normal/replacement estimate jobs with:

```ts
nextAttemptAt: uploadedAt,
claimGeneration: 0,
```

For the ISO-string project path use:

```ts
nextAttemptAt: uploadedAt,
claimGeneration: 0,
```

In every typed project and estimate fixture, use `nextAttemptAt: status === "queued" ? queuedAt : null` and add the fixture's explicit nonnegative `claimGeneration`. New enqueue assertions require zero; reclaimed fixtures retain their current generation.

- [ ] **Step 5: Parse and inject the exact backend retry policy**

Extend `environmentSchema` with:

```ts
OCR_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
OCR_RETRY_INITIAL_SECONDS: z.coerce.number().positive().default(30),
OCR_RETRY_MAX_SECONDS: z.coerce.number().positive().default(900),
```

Add a `.superRefine` issue on `OCR_RETRY_MAX_SECONDS` when it is smaller than `OCR_RETRY_INITIAL_SECONDS`. Add `ocrRetryPolicy?: ExtractionRetryPolicy` to `AppDependencies`, default it to `defaultExtractionRetryPolicy`, pass the same object to `createEstimateDesignService` and `createExtractionWorkerService`, and map the server environment exactly:

```ts
ocrRetryPolicy: {
  maxAttempts: env.OCR_MAX_ATTEMPTS,
  initialDelayMs: env.OCR_RETRY_INITIAL_SECONDS * 1000,
  maxDelayMs: env.OCR_RETRY_MAX_SECONDS * 1000
}
```

Add the three exact backend defaults to `backend/.env.example` and document units, bounds, delayed eligibility, terminalization, and the manual-reset behavior in `backend/README.md`.

- [ ] **Step 6: Run the focused tests and typecheck**

Run:

```bash
cd backend
npm test -- tests/config.test.ts tests/repository.test.ts tests/estimate-design-upload.test.ts
npm run typecheck
```

Expected: PASS; TypeScript reports no missing `nextAttemptAt` fixture fields.

- [ ] **Step 7: Commit Task 1**

```bash
git add backend/src/domain/extraction-lifecycle.ts backend/src/models/DesignExtractionJob.ts backend/src/models/EstimateDesignExtractionJob.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/services/design-version.service.ts backend/src/services/estimate-design.service.ts backend/src/config/env.ts backend/src/app.ts backend/src/server.ts backend/.env.example backend/README.md backend/tests/config.test.ts backend/tests/repository.test.ts backend/tests/estimate-design-upload.test.ts backend/tests/design-sections.test.ts backend/tests/design-section-review.test.ts backend/tests/extraction-worker.test.ts backend/tests/estimate-design-extraction.test.ts backend/tests/uploads.test.ts
git commit -m "feat: define extraction retry lifecycle"
```

---

### Task 2: Make project completion replayable and conflicting results deterministic

**Files:**
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/routes/extraction-worker.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Test: `backend/tests/extraction-worker.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`

**Interfaces:**
- Change `ExtractionWorkerService.complete(...)` to `Promise<CompletionReceipt>`.
- `completeExtractionJob(id, claimId, resultId, completedAt)` must set `workerResultId` and the successful state in the same transaction as the draft replacement.
- `completionReceiptFor` is called once on the preflight read and once on the transaction-scoped read, before `requireCurrentClaim`.
- Map `ExtractionResultConflictError` to `409 EXTRACTION_RESULT_CONFLICT`.

- [ ] **Step 1: Write failing project replay and conflict route tests**

Refactor the test clock in `setup` to a mutable `let now = new Date(TEST_NOW)` and return `advanceTo(iso)`. Add:

```ts
it("replays the same project result after lease expiry and rejects a different result", async () => {
  const { app, repository, storage, advanceTo } = await setup();
  const leased = await claim(app);
  const first = await request(app)
    .post("/api/v1/internal/extraction-jobs/job-1/complete")
    .set("Authorization", `Bearer ${WORKER_TOKEN}`)
    .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
    .send(completeBody())
    .expect(200);
  const referencesAfterFirst = [...storage.objects.keys()].sort();

  advanceTo("2026-07-27T11:00:00.000Z");
  const replay = await request(app)
    .post("/api/v1/internal/extraction-jobs/job-1/complete")
    .set("Authorization", `Bearer ${WORKER_TOKEN}`)
    .set("X-Extraction-Claim-Token", "expired-or-lost-claim")
    .send(completeBody())
    .expect(200);

  expect(first.body.data).toMatchObject({
    id: "job-1",
    status: "designer_review",
    resultId: "result-1",
    replayed: false
  });
  expect(replay.body.data).toEqual({
    ...first.body.data,
    replayed: true
  });
  expect([...storage.objects.keys()].sort()).toEqual(referencesAfterFirst);
  expect(await repository.listSourcePages("version-aurora-plan-1")).toHaveLength(1);

  await request(app)
    .post("/api/v1/internal/extraction-jobs/job-1/complete")
    .set("Authorization", `Bearer ${WORKER_TOKEN}`)
    .set("X-Extraction-Claim-Token", "expired-or-lost-claim")
    .send({ ...completeBody(), resultId: "result-conflict" })
    .expect(409)
    .expect(({ body }) => {
      expect(body.error.code).toBe("EXTRACTION_RESULT_CONFLICT");
    });
});
```

Add a repository transaction test that rereads the job after another transaction completes and returns the same receipt without calling `replaceExtractionDraft` a second time.

- [ ] **Step 2: Run focused tests and verify stale-claim failures**

Run:

```bash
cd backend
npm test -- tests/extraction-worker.test.ts tests/repository.test.ts tests/mongo-repository.test.ts
```

Expected: FAIL because a replay currently reaches `requireCurrentClaim`/`completeExtractionJob` and returns `409 STALE_EXTRACTION_CLAIM`.

- [ ] **Step 3: Add the project preflight decision before lease validation**

At the start of the project branch of `complete`:

```ts
const job = await requireJob(repository, jobId);
const replay = completionReceiptFor(job, result.resultId, true);
if (replay) return replay;
requireCurrentClaim(job, claimToken, processedAt);
```

Map result conflict explicitly:

```ts
function mapCompletionError(error: unknown): unknown {
  if (error instanceof ExtractionResultConflictError) {
    return new ApiError(
      409,
      "EXTRACTION_RESULT_CONFLICT",
      "A different result has already completed this extraction job."
    );
  }
  return mapRepositoryError(error);
}
```

Wrap the entire `/complete` service dispatch—including project preflight, estimate/replacement dispatch, and both transaction calls—in one outer `try/catch` that passes every thrown value through `mapCompletionError` exactly once before the route error handler. Do not limit this mapping to the existing project storage catch. Add project and estimate tests for both a preflight conflict and a conflict discovered only by the transaction reread; all four must return `409 EXTRACTION_RESULT_CONFLICT`, never 500.

- [ ] **Step 4: Repeat the decision inside the project transaction**

Keep image validation and current page/section document construction before the transaction. Replace the transaction callback with this control flow:

```ts
let transactionReplayed = false;
const receipt = await repository.runInTransaction(async (transaction) => {
  const current = await transaction.findExtractionJobById(jobId);
  if (!current) {
    throw new RepositoryNotFoundError(
      `Design extraction job ${jobId} was not found.`
    );
  }
  const concurrentReplay = completionReceiptFor(
    current,
    result.resultId,
    true
  );
  if (concurrentReplay) {
    transactionReplayed = true;
    return concurrentReplay;
  }
  requireCurrentClaim(current, claimToken, processedAt);
  await transaction.replaceExtractionDraft({
    jobId,
    claimId: claimToken,
    processedAt,
    designVersionId: version.id,
    workerResultId: result.resultId,
    sourcePages,
    sections
  });
  const completed = await transaction.completeExtractionJob(
    jobId,
    claimToken,
    result.resultId,
    processedAt
  );
  await audit.append({
    actorId: "system:ocr-worker",
    action: "design_extraction_completed",
    entityType: "design_extraction_job",
    entityId: jobId,
    occurredAt: processedAt,
    newValues: {
      designVersionId: version.id,
      resultId: result.resultId,
      pageCount: sourcePages.length,
      sectionCount: sections.length
    }
  }, transaction);
  return completionReceiptFor(completed, result.resultId, false)!;
});
if (transactionReplayed) await cleanup(storage, storedReferences);
return receipt;
```

Update the memory and Mongo `completeExtractionJob` filters to require the current claim and unexpired lease, then atomically set:

```ts
{
  status: "designer_review",
  completedAt,
  nextAttemptAt: null,
  leaseExpiresAt: null,
  claimId: null,
  failureCode: null,
  failureMessage: null,
  workerResultId: resultId
}
```

Do not treat `replaceExtractionDraft` alone as a completed replay. Its same-result early return remains useful only inside the active transaction.

- [ ] **Step 5: Return the full receipt from the route**

Replace the route response body with:

```ts
response.json({ data: receipt });
```

This response is the reconciliation contract used by the Python worker.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
cd backend
npm test -- tests/extraction-worker.test.ts tests/repository.test.ts tests/mongo-repository.test.ts
npm run typecheck
```

Expected: PASS; same-result replay returns `200`, conflicting result returns `409`, and no second draft is stored.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/src/services/extraction-worker.service.ts backend/src/routes/extraction-worker.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/tests/extraction-worker.test.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts
git commit -m "feat: make project extraction completion idempotent"
```

---

### Task 3: Apply the same completion contract to estimate and replacement jobs

**Files:**
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/services/extraction-worker.service.ts`
- Test: `backend/tests/estimate-design-extraction.test.ts`
- Test: `backend/tests/extraction-worker.test.ts`

**Interfaces:**
- Change `EstimateDesignService.completeWorkerJob(...)` to `Promise<CompletionReceipt>`.
- Both ordinary estimate completion and `completeQueuedReplacement` must perform the same preflight and transaction-scoped result check.
- A concurrent same-result loser deletes only references generated by that losing request, then returns the persisted receipt.

- [ ] **Step 1: Write failing estimate replay, conflict, and transactional-race tests**

Add:

```ts
it("replays the same estimate completion without claim validity or duplicate publication", async () => {
  const { app, jobs, pages, drawings, revisions, storage } = setup();
  const leased = await claim(app);
  const first = await complete(app, leased.body.data.claimToken);
  const referencesAfterFirst = [...storage.objects.keys()].sort();
  const countsAfterFirst = [pages.length, drawings.length, revisions.length];

  const replay = await complete(app, "expired-claim", completeBody());

  expect(first.status).toBe(200);
  expect(first.body.data).toMatchObject({
    id: "estimate-job-1",
    status: "estimator_review",
    resultId: "estimate-result-1",
    replayed: false
  });
  expect(replay.status).toBe(200);
  expect(replay.body.data).toEqual({ ...first.body.data, replayed: true });
  expect(jobs[0]).toMatchObject({ workerResultId: "estimate-result-1" });
  expect([pages.length, drawings.length, revisions.length])
    .toEqual(countsAfterFirst);
  expect([...storage.objects.keys()].sort()).toEqual(referencesAfterFirst);
});

it("rejects a different result for a completed estimate job", async () => {
  const { app, pages, drawings, revisions } = setup();
  const leased = await claim(app);
  await complete(app, leased.body.data.claimToken);
  const counts = [pages.length, drawings.length, revisions.length];

  const response = await complete(app, "expired-claim", {
    ...completeBody(),
    resultId: "estimate-result-conflict"
  });

  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe("EXTRACTION_RESULT_CONFLICT");
  expect([pages.length, drawings.length, revisions.length]).toEqual(counts);
});
```

For the transaction race, make `session.withTransaction` replace the in-memory current job with a committed `estimator_review` record carrying the same result before invoking the callback; assert the callback returns `replayed: true`, creates no Mongo documents, and deletes the request-local generated references. Repeat the assertion with a replacement upload fixture.

- [ ] **Step 2: Run the estimate tests and verify the current stale-claim failure**

Run:

```bash
cd backend
npm test -- tests/estimate-design-extraction.test.ts tests/extraction-worker.test.ts
```

Expected: FAIL because `completeWorkerJob` validates `requireEstimateClaim` before checking `workerResultId`.

- [ ] **Step 3: Add estimate preflight replay before normalization and storage**

At the start of `completeWorkerJob`:

```ts
const job = await EstimateDesignExtractionJobModel.findById(jobId).lean();
if (!job) throw estimateNotFound();
const replay = completionReceiptFor(
  {
    id: String(job._id),
    status: String(job.status),
    workerResultId: job.workerResultId ? String(job.workerResultId) : null,
    completedAt: job.completedAt
      ? new Date(job.completedAt).toISOString()
      : null
  },
  result.resultId,
  true
);
if (replay) return replay;
requireEstimateClaim(job, claimToken, processedAt);
```

This must run before taxonomy calculation, image decoding, or `saveGeneratedImage`.

- [ ] **Step 4: Add the transaction-scoped check to ordinary estimate completion**

Immediately after the transaction reads `currentJob`, before `requireEstimateClaim`, insert:

```ts
const concurrentReplay = completionReceiptFor(
  {
    id: String(currentJob._id),
    status: String(currentJob.status),
    workerResultId: currentJob.workerResultId
      ? String(currentJob.workerResultId)
      : null,
    completedAt: currentJob.completedAt
      ? new Date(currentJob.completedAt).toISOString()
      : null
  },
  result.resultId,
  true
);
if (concurrentReplay) {
  receipt = concurrentReplay;
  replayedInsideTransaction = true;
  return;
}
requireEstimateClaim(currentJob, claimToken, processedAt);
```

On the first successful update, set `nextAttemptAt: null` with the existing completion fields and build:

```ts
receipt = {
  id: jobId,
  status: "estimator_review",
  resultId: result.resultId,
  completedAt: processedAt,
  replayed: false
};
```

If the existing frozen-estimate branch terminally cancels during the transaction, do not fabricate a completion receipt or store `workerResultId`. After the transaction cleans the request-local references, return a deterministic terminal conflict:

```ts
throw new ApiError(
  409,
  "EXTRACTION_JOB_CANCELLED",
  "This extraction job is no longer active."
);
```

After `withMongoTransaction`, clean `references` only when `replayedInsideTransaction` or the existing frozen cancellation flag is true. Return `receipt` only for a persisted successful result; never synthesize a `workerJobDto` or a false success receipt for cancellation. Task 5 classifies `EXTRACTION_JOB_CANCELLED` as a non-transient backend rejection and abandons it without `/fail`.

- [ ] **Step 5: Apply the identical transaction guard to replacements**

Change `completeQueuedReplacement` to return `CompletionReceipt`. Before replacement lifecycle checks or writes, inspect its transaction-scoped `currentJob` with `resultId`. On replay, set `replayedInsideTransaction`, return from the callback, delete the newly saved replacement reference after the transaction, and return the stored receipt. On first success set `nextAttemptAt: null` and return:

```ts
{
  id: String(currentJob._id),
  status: "estimator_review",
  resultId,
  completedAt: processedAt,
  replayed: false
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
cd backend
npm test -- tests/estimate-design-extraction.test.ts tests/extraction-worker.test.ts
npm run typecheck
```

Expected: PASS for ordinary estimate jobs and replacement jobs; replay does not rerun normalization/publication, and conflict is deterministic.

- [ ] **Step 7: Commit Task 3**

```bash
git add backend/src/services/estimate-design.service.ts backend/src/services/extraction-worker.service.ts backend/tests/estimate-design-extraction.test.ts backend/tests/extraction-worker.test.ts
git commit -m "feat: make estimate extraction completion idempotent"
```

---

### Task 4: Schedule poison-job retries, cap attempts, terminalize exhausted work, and reset safely

**Files:**
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/services/design-section.service.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/extraction-worker.test.ts`
- Test: `backend/tests/estimate-design-extraction.test.ts`
- Test: `backend/tests/design-sections.test.ts`

**Interfaces:**
- Project repository additions:

```ts
failExtractionJob(
  id: string,
  claimId: string,
  failureCode: string,
  failureMessage: string,
  failedAt: string,
  policy: ExtractionRetryPolicy
): Promise<DesignExtractionJobRecord>;

terminalizeExhaustedExtractionJob(
  id: string,
  terminalAt: string,
  maxAttempts: number
): Promise<boolean>;
```

- Estimate service addition:

```ts
terminalizeExhaustedWorkerJob(
  jobId: string,
  terminalAt: string
): Promise<boolean>;
```

- Exhausted claim-candidate terminalization, where no worker `/fail` callback supplied a more specific cause, is exactly:

```ts
const exhaustedFailure = {
  code: "ATTEMPTS_EXHAUSTED",
  message: "Extraction stopped after the configured attempt limit."
} as const;
```

- [ ] **Step 1: Write failing delayed-retry and terminalization tests**

For the project route, configure `ocrRetryPolicy: { maxAttempts: 2, initialDelayMs: 30_000, maxDelayMs: 60_000 }`, fail attempt one, and assert:

```ts
expect(await repository.findExtractionJobById("job-1")).toMatchObject({
  status: "queued",
  attemptCount: 1,
  nextAttemptAt: "2026-07-27T10:00:30.000Z",
  claimId: null,
  leaseExpiresAt: null,
  failureCode: "OCR_FAILED"
});
expect((await claim(app)).status).toBe(204);
advanceTo("2026-07-27T10:00:30.000Z");
expect((await claim(app)).body.data).toMatchObject({
  id: "job-1",
  attemptCount: 2
});
```

Fail attempt two and assert terminal state:

```ts
expect(await repository.findExtractionJobById("job-1")).toMatchObject({
  status: "processing_failed",
  attemptCount: 2,
  nextAttemptAt: null,
  failureCode: "OCR_FAILED",
  completedAt: "2026-07-27T10:00:30.000Z"
});
```

Add a separate expired-processing fixture with `attemptCount: 2`; call `/claim`, assert it becomes `processing_failed` with `ATTEMPTS_EXHAUSTED`, then assert the later healthy job is returned by the same claim request. Repeat with an expired capped estimate replacement and assert the job/upload terminalize and its `replacementUploadId` reservation is released in the same transaction.

Mirror these tests for an estimate job and upload. For a retryable replacement failure assert its `replacementUploadId` reservation remains set; for a terminal replacement failure assert the reservation is released.

- [ ] **Step 2: Write failing safe-reset tests**

Extend project and estimate manual retry assertions to require:

```ts
expect(resetJob).toMatchObject({
  status: "queued",
  attemptCount: 0,
  nextAttemptAt: resetAt,
  startedAt: null,
  completedAt: null,
  leaseExpiresAt: null,
  claimId: null,
  failureCode: null,
  failureMessage: null,
  workerResultId: null
});
```

Also submit a stale `/complete` with the pre-reset claim token and assert `409 STALE_EXTRACTION_CLAIM`. Existing ownership and `processing_failed` guards must remain unchanged.

- [ ] **Step 3: Run the focused backend lifecycle tests**

Run:

```bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/extraction-worker.test.ts tests/estimate-design-extraction.test.ts tests/design-sections.test.ts
```

Expected: FAIL because `/fail` terminalizes immediately, claims ignore `nextAttemptAt`, attempts are uncapped, and resets retain the old attempt counter.

- [ ] **Step 4: Gate queued claims by schedule and clear the gate while processing**

Use this shape in both Mongo claimable filters:

```ts
{
  $or: [
    {
      status: "queued",
      $or: [
        { nextAttemptAt: { $lte: new Date(now) } },
        { nextAttemptAt: null },
        { nextAttemptAt: { $exists: false } }
      ]
    },
    {
      status: "processing",
      leaseExpiresAt: { $lte: new Date(now) }
    }
  ]
}
```

Use the equivalent boolean expression in memory. Every successful claim sets `nextAttemptAt: null`, increments both `attemptCount` and `claimGeneration`, and keeps the existing fresh claim UUID/lease behavior. Add reclaim tests proving the generations are 1 then 2.

- [ ] **Step 5: Make `/fail` choose delayed retry or terminal failure atomically**

After validating the current claim inside the transaction, compute:

```ts
const schedule = retrySchedule(
  failedAt,
  currentJob.attemptCount,
  retryPolicy
);
```

For a retryable project failure set:

```ts
{
  status: "queued",
  nextAttemptAt: schedule.nextAttemptAt,
  startedAt: null,
  completedAt: null,
  leaseExpiresAt: null,
  claimId: null,
  failureCode,
  failureMessage
}
```

For a terminal project failure set:

```ts
{
  status: "processing_failed",
  nextAttemptAt: null,
  completedAt: failedAt,
  leaseExpiresAt: null,
  claimId: null,
  failureCode,
  failureMessage
}
```

Apply the same two states to both estimate job and upload within the existing Mongo transaction. A retryable estimate upload returns to `queued`; a terminal upload becomes `processing_failed`. Only the terminal replacement branch releases `replacementUploadId`.

- [ ] **Step 6: Terminalize a capped candidate and continue queue arbitration**

Before attempting `claimWorkerJob`/`claimExtractionJobById`, add:

```ts
if (chosenCandidate.attemptCount >= retryPolicy.maxAttempts) {
  const terminalized = chooseEstimate
    ? await estimateDesigns!.terminalizeExhaustedWorkerJob(
        chosenCandidate.id,
        at
      )
    : await repository.terminalizeExhaustedExtractionJob(
        chosenCandidate.id,
        at,
        retryPolicy.maxAttempts
      );
  if (!terminalized) {
    contentionRescans += 1;
  }
  continue;
}
```

The project compare-and-set must match `_id`, `attemptCount: { $gte: maxAttempts }`, and either eligible queued state or expired processing state. The estimate implementation performs that job transition and matching upload transition in one transaction. Both set `ATTEMPTS_EXHAUSTED`, `completedAt`, `nextAttemptAt: null`, `claimId: null`, and `leaseExpiresAt: null`. If the exhausted estimate candidate is a replacement, the same transaction compare-and-set clears the matching current revision's `replacementUploadId`; a stale reservation mismatch aborts rather than clearing another replacement.

Add a regression with 100 older capped jobs followed by one healthy job. One claim request must terminalize all 100 and return the healthy job; only failed compare-and-set races consume the 64-rescan contention budget.

- [ ] **Step 7: Make both manual retries clean resets**

Project memory and Mongo reset:

```ts
{
  status: "queued",
  attemptCount: 0,
  queuedAt,
  nextAttemptAt: queuedAt,
  startedAt: null,
  completedAt: null,
  leaseExpiresAt: null,
  claimId: null,
  failureCode: null,
  failureMessage: null,
  workerResultId: null,
  updatedAt: queuedAt
}
```

Omit `claimGeneration` from the reset `$set` so Mongo preserves it; copy it unchanged in the memory adapter. Use the equivalent `Date` values in estimate `retryUpload`, in the same transaction as upload state, replacement reservation, lifecycle guard, and audit. Do not expose a reset endpoint that bypasses the existing authorized project/estimate retry routes.

- [ ] **Step 8: Run lifecycle tests and typecheck**

Run:

```bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/extraction-worker.test.ts tests/estimate-design-extraction.test.ts tests/design-sections.test.ts
npm run typecheck
```

Expected: PASS; delayed jobs are invisible until due, a capped poison job is terminalized without blocking later work, and manual reset invalidates old claims.

- [ ] **Step 9: Commit Task 4**

```bash
git add backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/services/extraction-worker.service.ts backend/src/services/estimate-design.service.ts backend/src/services/design-section.service.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/extraction-worker.test.ts backend/tests/estimate-design-extraction.test.ts backend/tests/design-sections.test.ts
git commit -m "feat: cap and schedule extraction retries"
```

---

### Task 5: Give the Python worker stable completion IDs and transport-only retries

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/contracts.py`
- Modify: `ocr-worker/src/lisno_ocr/worker.py`
- Test: `ocr-worker/tests/test_worker.py`
- Modify: `ocr-worker/README.md`
- Modify: `README.md`

**Interfaces:**
- Add:

```python
@dataclass(frozen=True, slots=True)
class CompletionReceipt:
    id: str
    status: str
    result_id: str
    completed_at: str
    replayed: bool


class BackendTransportError(Exception):
    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.status = status
```

- Change the worker protocol to:

```python
class Api(Protocol):
    def complete(
        self,
        job_id: str,
        result_id: str,
        pages: Sequence[Mapping[str, object]],
    ) -> CompletionReceipt:
        raise NotImplementedError

    def release_claim(self, job_id: str) -> None:
        raise NotImplementedError
```

- Add settings:

```python
transport_retry_attempts: int = 4
transport_retry_initial_seconds: float = 0.5
transport_retry_max_seconds: float = 8.0
```

- Add `backoff_delay(attempt, initial_seconds, maximum_seconds, random_value=random.random) -> float` using equal jitter.

- [ ] **Step 1: Write failing deterministic backoff and settings tests**

Add:

```python
def test_backoff_delay_is_capped_equal_jitter():
    assert backoff_delay(0, 1.0, 4.0, random_value=lambda: 0.0) == 0.5
    assert backoff_delay(2, 1.0, 4.0, random_value=lambda: 1.0) == 4.0
    assert backoff_delay(20, 1.0, 4.0, random_value=lambda: 0.5) == 3.0
    assert backoff_delay(
        100_000, 1.0, 4.0, random_value=lambda: 0.5
    ) == 3.0


def test_transport_retry_settings_have_bounded_defaults(monkeypatch):
    monkeypatch.setenv(
        "OCR_WORKER_TOKEN",
        "worker-token-with-at-least-32-characters",
    )
    configured = WorkerSettings.from_environment()
    assert configured.transport_retry_attempts == 4
    assert configured.transport_retry_initial_seconds == 0.5
    assert configured.transport_retry_max_seconds == 8.0
```

- [ ] **Step 2: Write failing transport-classification and stable-result tests**

Extend `FakeApi.complete` to record `(job_id, result_id, pages)` on every call. Add a tiny `PayloadPage` test helper whose `to_payload()` returns a copied mapping, then add:

```python
def test_completion_retries_reuse_one_result_id_and_never_call_fail(monkeypatch):
    generated = iter(["stable-result-id", "second-result-id"])
    monkeypatch.setattr("lisno_ocr.worker.uuid4", lambda: next(generated))
    api = FakeApi(
        [job(), second_job()],
        complete_errors=[
            BackendTransportError("response lost", status=503),
            None,
            None,
        ],
    )
    pages = [PayloadPage({"pageNumber": 1, "sections": []})]

    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(pages=pages),
        sleep=lambda _seconds: None,
        random_value=lambda: 0.0,
        max_iterations=2,
    )

    first_job_attempts = [
        result_id
        for job_id, result_id, _pages in api.completion_attempts
        if job_id == "job-1"
    ]
    assert first_job_attempts == ["stable-result-id", "stable-result-id"]
    assert [
        result_id
        for job_id, result_id, _pages in api.completion_attempts
        if job_id == "job-2"
    ] == ["second-result-id"]
    assert api.failed == []
```

Use these exact fake methods so a scripted claim exception is raised and every completion request, including failed transport attempts, is observable:

```python
def claim(self):
    result = self.jobs.pop(0) if self.jobs else None
    if isinstance(result, Exception):
        raise result
    return result


def complete(self, job_id, result_id, pages):
    self.completion_attempts.append((job_id, result_id, pages))
    if self.complete_errors:
        error = self.complete_errors.pop(0)
        if error:
            raise error
    receipt = CompletionReceipt(
        id=job_id,
        status="designer_review",
        result_id=result_id,
        completed_at="2026-07-30T10:01:00.000Z",
        replayed=False,
    )
    self.completed.append(receipt)
    return receipt
```

Add exhausted completion and claim-survival tests:

```python
def test_exhausted_completion_transport_leaves_lease_and_continues_claiming():
    api = FakeApi(
        [job(), second_job()],
        complete_errors=[
            BackendTransportError("down"),
            BackendTransportError("down"),
            BackendTransportError("down"),
            BackendTransportError("down"),
            None,
        ],
    )
    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(pages=[]),
        sleep=lambda _seconds: None,
        random_value=lambda: 0.0,
        max_iterations=2,
    )
    assert api.failed == []
    assert [attempt[0] for attempt in api.completion_attempts] == [
        "job-1",
        "job-1",
        "job-1",
        "job-1",
        "job-2",
    ]


def test_transient_claim_error_does_not_stop_the_poll_loop():
    api = FakeApi([BackendTransportError("claim timeout"), job()])
    run_worker(
        settings(),
        api=api,
        extractor=FakeExtractor(pages=[]),
        sleep=lambda _seconds: None,
        random_value=lambda: 0.0,
        max_iterations=2,
    )
    assert api.downloaded == ["job-1"]
```

Assert a download `URLError`, heartbeat timeout, completion `503`, invalid-JSON `200`, top-level-array `200`, and malformed receipt never append to `api.failed`. Keep an `InvalidSourceError`/`PdfRenderError`/`OcrError` test proving extraction errors still call `/fail`. Add a page whose `to_payload()` raises and one whose payload is not JSON-serializable; both are local result-construction failures, call `/fail` once through the bounded helper, and do not stop the next claim.

Add real `WorkerApi` bookkeeping tests for completion success, exhausted completion transport, download rejection, and exhausted `/fail` transport. After the per-job `finally`, `_claim_tokens`, `_claim_kinds`, and any per-claim metadata maps must have no entry for the abandoned job; a retry within the same turn must still observe those entries.

- [ ] **Step 3: Run worker tests and verify current behavior fails**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_worker.py -q
```

Expected: FAIL because `WorkerApi.complete` creates a new UUID internally, claim transport errors escape the loop, and completion errors are sent to `/fail` as `OCR_FAILED`.

- [ ] **Step 4: Implement explicit transient backend classification**

In `_request_json`, classify `408`, `425`, `429`, and every `500`–`599` response as `BackendTransportError`; classify `URLError`, `TimeoutError`, and `OSError` as `BackendTransportError`; keep non-transient `400`–`499` as `ResultRejectedError`. In particular, `STALE_EXTRACTION_CLAIM`, `EXTRACTION_JOB_CANCELLED`, and `EXTRACTION_RESULT_CONFLICT` stop the current job without `/fail`. Give `_request_json` an explicit `invalid_success_body_is_transport` option. `complete` sets it true so invalid UTF-8/JSON in any 2xx completion response becomes `BackendTransportError`; other endpoints preserve their existing response parsing. Treat every invalid/mismatched `200` completion receipt as `BackendTransportError`, because the commit outcome is ambiguous and must be retried rather than failed.

Apply the same HTTP/network split in `_download_source`. An empty successfully downloaded file remains `InvalidSourceError`.

- [ ] **Step 5: Implement receipt parsing and stable caller-owned result IDs**

Import `datetime` from `datetime` for strict receipt timestamps and import `math` for overflow-safe backoff capping.

Build the payload with the supplied ID:

```python
def complete(
    self,
    job_id: str,
    result_id: str,
    pages: Sequence[Mapping[str, object]],
) -> CompletionReceipt:
    result: dict[str, object] = {
        "resultId": result_id,
        "pages": [dict(page) for page in pages],
    }
    if self._claim_kinds.get(job_id) == "estimate_design":
        result["kind"] = "estimate_design"
    _status, payload = self._request_json(
        "POST",
        f"/internal/extraction-jobs/{job_id}/complete",
        result,
        claim_token=self._claim_tokens.get(job_id),
        invalid_success_body_is_transport=True,
    )
    data = payload.get("data") if isinstance(payload, dict) else None
    receipt = _completion_receipt(data)
    if receipt.id != job_id or receipt.result_id != result_id:
        raise BackendTransportError("The backend returned a mismatched completion receipt.")
    return receipt
```

Implement `WorkerApi.release_claim(job_id)` to remove token, kind, and (after the bounds plan) limit metadata together. Do not clear dictionaries inside `complete` or on a transport exception; retries and the heartbeat still need them. `run_worker` calls `release_claim` exactly once in the per-job `finally`, after stopping/joining heartbeat, whether completion succeeded, completion retries exhausted, download was rejected, or `/fail` transport retries exhausted.

Use completion-specific parsing so every malformed 200 is treated as an ambiguous transport outcome:

```python
_SUCCESSFUL_RECEIPT_STATUSES = frozenset({
    "designer_review", "estimator_review", "submitted",
    "changes_requested", "approved",
})

def _completion_receipt(value: object) -> CompletionReceipt:
    try:
        if not isinstance(value, dict):
            raise ValueError("data")
        identifier = value["id"]
        status = value["status"]
        result_id = value["resultId"]
        completed_at = value["completedAt"]
        replayed = value["replayed"]
        if not isinstance(identifier, str) or not identifier:
            raise ValueError("id")
        if status not in _SUCCESSFUL_RECEIPT_STATUSES:
            raise ValueError("status")
        if not isinstance(result_id, str) or not result_id:
            raise ValueError("resultId")
        if not isinstance(completed_at, str):
            raise ValueError("completedAt")
        parsed_at = datetime.fromisoformat(
            completed_at.replace("Z", "+00:00")
        )
        if parsed_at.tzinfo is None:
            raise ValueError("completedAt")
        if not isinstance(replayed, bool):
            raise ValueError("replayed")
    except (KeyError, TypeError, ValueError) as error:
        raise BackendTransportError(
            "The backend returned an invalid completion receipt."
        ) from error
    return CompletionReceipt(
        id=identifier,
        status=status,
        result_id=result_id,
        completed_at=completed_at,
        replayed=replayed,
    )
```

Add malformed completion cases for invalid JSON bytes, a top-level JSON array, missing field, unknown/processing-failed status, naïve/invalid timestamp, wrong boolean, mismatched job ID, and mismatched result ID. Each case must consume the configured completion retries, keep one stable `resultId`, and never call `/fail`.

- [ ] **Step 6: Implement equal-jitter backoff and bounded callback helpers**

```python
def backoff_delay(
    attempt: int,
    initial_seconds: float,
    maximum_seconds: float,
    *,
    random_value: Callable[[], float] = random.random,
) -> float:
    normalized_attempt = max(0, attempt)
    steps_to_cap = max(
        0,
        math.ceil(math.log2(maximum_seconds / initial_seconds)),
    )
    cap = (
        maximum_seconds
        if normalized_attempt >= steps_to_cap
        else initial_seconds * (2 ** normalized_attempt)
    )
    return (cap / 2.0) + (cap / 2.0) * random_value()
```

Create `_download_with_retry` and `_complete_with_retry`, and update `_report_failure_with_retry`, so each retries only `BackendTransportError`, uses `backoff_delay`, and stops after `settings.transport_retry_attempts`. A `ResultRejectedError` returns/fails immediately. None of the helpers calls another. `WorkerApi._download_source` owns removal of every partial temporary file before an error reaches the retry helper.

Parse the three new environment values in `WorkerSettings.from_environment` and reject a maximum below the initial delay:

```python
transport_retry_attempts = _positive_int("OCR_TRANSPORT_RETRY_ATTEMPTS", 4)
transport_retry_initial_seconds = _positive_float(
    "OCR_TRANSPORT_RETRY_INITIAL_SECONDS",
    0.5,
)
transport_retry_max_seconds = _positive_float(
    "OCR_TRANSPORT_RETRY_MAX_SECONDS",
    8.0,
)
if transport_retry_max_seconds < transport_retry_initial_seconds:
    raise ValueError(
        "OCR_TRANSPORT_RETRY_MAX_SECONDS must be greater than or equal to "
        "OCR_TRANSPORT_RETRY_INITIAL_SECONDS."
    )
```

Document all three worker variables and their units/defaults in `ocr-worker/README.md`; add the backend and worker retry-variable tables plus ownership distinction to the root README. Backend poison scheduling and worker HTTP retry are separate controls and must not be presented as interchangeable.

- [ ] **Step 7: Separate extraction failures from backend callback failures in `run_worker`**

Use this phase ordering:

```python
try:
    claimed = worker_api.claim()
except BackendTransportError:
    sleep(backoff_delay(
        claim_failure_count,
        settings.transport_retry_initial_seconds,
        settings.transport_retry_max_seconds,
        random_value=random_value,
    ))
    claim_failure_count += 1
    continue
except ResultRejectedError:
    sleep(settings.poll_seconds)
    continue

claim_failure_count = 0
if claimed is None:
    sleep(settings.poll_seconds)
    continue

try:
    source_path = _download_with_retry(
        worker_api, claimed, settings, sleep, random_value
    )
    if source_path is None:
        continue
    pages = _extract_before_deadline(
        page_extractor,
        source_path,
        mode=claimed.kind,
        deadline=extraction_deadline,
    )
    result_id = str(uuid4())
    page_payloads = prepare_completion_pages(pages)
except (BackendTransportError, ResultRejectedError):
    continue
except Exception as error:
    _report_failure_with_retry(
        worker_api,
        claimed.id,
        classify_failure(error),
        settings,
        sleep,
        random_value,
    )
    continue

_complete_with_retry(
    worker_api,
    claimed.id,
    result_id,
    page_payloads,
    settings,
    sleep,
    random_value,
)
```

`prepare_completion_pages` calls every `to_payload()`, serializes once with `json.dumps(..., allow_nan=False)`, and decodes that JSON back to a detached list of mappings. This puts field conversion and JSON-encoding errors inside the local result-construction failure boundary while giving all completion retries one immutable serializable snapshot. The per-job `finally` stops heartbeat, joins it, cleans the local source, and then calls `worker_api.release_claim(claimed.id)`. If completion exhausts its retries, do nothing to backend job state: no `/fail` and no synthetic OCR failure; local claim metadata is still released because that worker turn is over. Update `_heartbeat_loop` to retry `BackendTransportError` with bounded jitter while the deadline remains, and stop immediately on `ResultRejectedError`.

- [ ] **Step 8: Run the worker suite**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_worker.py -q
.venv/bin/python -m pytest -m 'not model'
```

Expected: PASS; transport failures never appear in `/fail` calls, all completion retries share one result ID, and the claim loop processes later jobs.

- [ ] **Step 9: Commit Task 5**

```bash
git add ocr-worker/src/lisno_ocr/contracts.py ocr-worker/src/lisno_ocr/worker.py ocr-worker/tests/test_worker.py ocr-worker/README.md README.md
git commit -m "feat: reconcile worker completion retries"
```

---

### Task 6: Prove transaction and replay behavior on a real Mongo replica set

**Files:**
- Modify: `backend/package.json`
- Reuse: `backend/tests/helpers/mongo-replica-set.ts` from the mapping migration plan
- Create: `backend/tests/extraction-completion.replica-set.test.ts`

**Interfaces:**
- `startReplicaSet(databaseName: string) -> Promise<MongoMemoryReplSet>` starts one real `mongod` member with WiredTiger and connects Mongoose.
- `clearReplicaSet() -> Promise<void>` deletes all collections between tests.
- `stopReplicaSet(replSet) -> Promise<void>` disconnects Mongoose and stops the process.
- The integration suite uses the actual Mongo repository, actual services/routes, and actual transactions; it must not mock `mongoose.startSession`, model methods, or transaction callbacks.

- [ ] **Step 1: Reuse the shared replica-set helper and add the failing completion suite**

Confirm the shared helper created by the preceding mapping plan exposes:

```ts
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

export async function startReplicaSet(databaseName: string) {
  const replicaSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  });
  await mongoose.connect(replicaSet.getUri(databaseName));
  return replicaSet;
}

export async function clearReplicaSet() {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
}

export async function stopReplicaSet(replicaSet: MongoMemoryReplSet) {
  await mongoose.disconnect();
  await replicaSet.stop();
}
```

Create the integration test imports and lifecycle:

```ts
import { Readable } from "node:stream";
import mongoose from "mongoose";
import request from "supertest";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DesignExtractionJobModel } from "../src/models/DesignExtractionJob.js";
import { DesignSourcePageModel } from "../src/models/DesignSourcePage.js";
import { DesignVersionModel } from "../src/models/DesignVersion.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import {
  clearReplicaSet,
  startReplicaSet,
  stopReplicaSet
} from "./helpers/mongo-replica-set.js";

const WORKER_TOKEN = "replica-worker-token-with-at-least-32-characters";
const JWT_SECRET = "replica-jwt-secret-with-at-least-32-characters";
let replicaSet: Awaited<ReturnType<typeof startReplicaSet>>;
let png: Buffer;

beforeAll(async () => {
  replicaSet = await startReplicaSet("lisno_completion");
  png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "white" }
  }).png().toBuffer();
}, 120_000);

afterEach(clearReplicaSet);
afterAll(async () => stopReplicaSet(replicaSet));
```

- [ ] **Step 2: Run the new test and verify the transactional behavior is missing**

Run:

```bash
cd backend
npm test -- tests/extraction-completion.replica-set.test.ts
```

Expected: FAIL on the new replay/concurrency/rollback assertions; the pinned replica-set dependency and helper already exist from the mapping migration plan.

- [ ] **Step 3: Add a focused replica-set script**

Add:

```json
"test:replica-set": "vitest run tests/extraction-completion.replica-set.test.ts"
```

- [ ] **Step 4: Add real project and estimate seed helpers**

Use actual documents:

```ts
async function seedProjectJob() {
  await DesignVersionModel.create({
    _id: "version-replica",
    projectId: "project-replica",
    floorId: "floor-replica",
    stageId: "stage-replica",
    taskId: null,
    versionNumber: 1,
    originalFilename: "plan.pdf",
    storedFileReference: "source-project.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    uploaderId: "designer-replica",
    uploadedAt: new Date("2026-07-30T10:00:00.000Z"),
    approvalStatus: "draft",
    reviewerId: null,
    approvedAt: null,
    clientVisible: false
  });
  await DesignExtractionJobModel.create({
    _id: "project-job-replica",
    designVersionId: "version-replica",
    status: "queued",
    attemptCount: 0,
    claimGeneration: 0,
    queuedAt: new Date("2026-07-30T10:00:00.000Z"),
    nextAttemptAt: new Date("2026-07-30T10:00:00.000Z"),
    startedAt: null,
    completedAt: null,
    leaseExpiresAt: null,
    claimId: null,
    failureCode: null,
    failureMessage: null,
    workerResultId: null
  });
}

async function seedEstimateJob() {
  await EstimateModel.create({
    _id: "estimate-replica",
    leadId: "lead-replica",
    ownerId: "estimator-replica",
    status: "draft",
    propertyType: "Apartment",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: 0,
    gst: 0,
    total: 0,
    approvalRequired: false
  });
  await EstimateDesignUploadModel.create({
    _id: "estimate-upload-replica",
    estimateId: "estimate-replica",
    leadId: "lead-replica",
    originalFilename: "estimate.pdf",
    storedFileReference: "source-estimate.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    uploaderId: "estimator-replica",
    uploadedAt: new Date("2026-07-30T10:00:00.000Z"),
    extractionStatus: "queued"
  });
  await EstimateDesignExtractionJobModel.create({
    _id: "estimate-job-replica",
    uploadId: "estimate-upload-replica",
    status: "queued",
    attemptCount: 0,
    claimGeneration: 0,
    queuedAt: new Date("2026-07-30T10:00:00.000Z"),
    nextAttemptAt: new Date("2026-07-30T10:00:00.000Z"),
    startedAt: null,
    completedAt: null,
    leaseExpiresAt: null,
    claimId: null,
    failureCode: null,
    failureMessage: null,
    workerResultId: null
  });
}
```

Use an in-memory `FileStorage` implementation with `save`, `saveGenerated`, `read`, `open`, and `delete`; source references contain `Buffer.from("%PDF-1.7\nfixture")`.

Use this exact implementation and request helpers:

```ts
class TestStorage {
  private sequence = 0;
  readonly objects = new Map<string, Buffer>([
    ["source-project.pdf", Buffer.from("%PDF-1.7\nfixture")],
    ["source-estimate.pdf", Buffer.from("%PDF-1.7\nfixture")]
  ]);

  async save(input: { data: Buffer; extension: string }) {
    return this.saveGenerated(input);
  }

  async saveGenerated(input: { data: Buffer; extension: string }) {
    this.sequence += 1;
    const reference = `generated-${this.sequence}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async read(reference: string) {
    const data = this.objects.get(reference);
    if (!data) throw new Error(`Missing test object ${reference}.`);
    return Buffer.from(data);
  }

  async open(reference: string) {
    return Readable.from(await this.read(reference));
  }

  async delete(reference: string) {
    this.objects.delete(reference);
  }
}

function workerRequest(test: request.Test) {
  return test.set("Authorization", `Bearer ${WORKER_TOKEN}`);
}

async function claimRequest(app: ReturnType<typeof createApp>) {
  return workerRequest(
    request(app).post("/api/v1/internal/extraction-jobs/claim")
  ).send();
}

async function completeRequest(
  app: ReturnType<typeof createApp>,
  jobId: string,
  claimToken: string,
  body: Record<string, unknown>
) {
  return workerRequest(
    request(app).post(
      `/api/v1/internal/extraction-jobs/${encodeURIComponent(jobId)}/complete`
    )
  )
    .set("X-Extraction-Claim-Token", claimToken)
    .send(body);
}
```

- [ ] **Step 5: Add real concurrent replay and conflict tests for both job kinds**

Build the app with `createMongoRepository()`, `enableEstimateDesignJobs: true`, a mutable clock, and the test storage. For each kind:

```ts
const [left, right] = await Promise.all([
  completeRequest(app, jobId, claimToken, body),
  completeRequest(app, jobId, claimToken, body)
]);
expect([left.status, right.status]).toEqual([200, 200]);
expect([left.body.data.replayed, right.body.data.replayed].sort()).toEqual([
  false,
  true
]);
```

For project assert one `DesignSourcePage` and one completion audit. For estimate assert one `EstimateDesignSourcePage`, one completion audit, and matching `estimator_review` state on job/upload. Advance the clock beyond the original lease, replay with a stale token, and assert the same persisted receipt. Then change only `resultId` and assert `409 EXTRACTION_RESULT_CONFLICT` with unchanged collection counts.

Use bodies with one valid 2×2 PNG page and no sections:

```ts
const projectBody = {
  kind: "project_design",
  resultId: "project-result-replica",
  pages: [{
    pageNumber: 1,
    width: 2,
    height: 2,
    imageBase64: png.toString("base64"),
    sections: []
  }]
};

const estimateBody = {
  kind: "estimate_design",
  resultId: "estimate-result-replica",
  pages: [{
    pageNumber: 1,
    width: 2,
    height: 2,
    imageBase64: png.toString("base64"),
    sections: []
  }]
};
```

- [ ] **Step 6: Add a real rollback assertion**

Use the actual repository transaction, write a replacement and completion, then throw:

```ts
await expect(repository.runInTransaction(async (transaction) => {
  await transaction.replaceExtractionDraft(replacement);
  await transaction.completeExtractionJob(
    "project-job-replica",
    claimToken,
    "project-result-rollback",
    "2026-07-30T10:01:00.000Z"
  );
  throw new Error("force rollback");
})).rejects.toThrow("force rollback");

expect(await DesignSourcePageModel.countDocuments({
  designVersionId: "version-replica"
})).toBe(0);
expect(await DesignExtractionJobModel.findById("project-job-replica").lean())
  .toMatchObject({
    status: "processing",
    workerResultId: null,
    claimId: claimToken
  });
```

Construct the rollback replacement exactly:

```ts
const replacement = {
  jobId: "project-job-replica",
  claimId: claimToken,
  processedAt: "2026-07-30T10:01:00.000Z",
  designVersionId: "version-replica",
  workerResultId: "project-result-rollback",
  sourcePages: [{
    id: "page-rollback",
    designVersionId: "version-replica",
    pageNumber: 1,
    renderedFileReference: "generated-rollback.png",
    width: 2,
    height: 2,
    createdAt: "2026-07-30T10:01:00.000Z",
    updatedAt: "2026-07-30T10:01:00.000Z"
  }],
  sections: []
};
```

- [ ] **Step 7: Run the real replica-set suite**

Run:

```bash
cd backend
npm run test:replica-set
```

Expected: PASS against a one-node WiredTiger replica set; no mocked transaction API is involved.

- [ ] **Step 8: Commit Task 6**

```bash
git add backend/package.json backend/tests/extraction-completion.replica-set.test.ts
git commit -m "test: verify extraction completion on replica set"
```

---

## Final Verification

- [ ] Run the complete backend test suite, real replica-set test, typecheck, and production build:

```bash
cd backend
npm test
npm run test:replica-set
npm run typecheck
npm run build
```

Expected: every command exits zero. The replica-set file may run once through `npm test` and once through the focused command; both runs must pass.

- [ ] Run the complete non-model worker suite:

```bash
cd ocr-worker
.venv/bin/python -m pytest -m 'not model'
```

Expected: PASS with no completion-transport test observing a `/fail` call.

- [ ] Confirm unchanged frontend compatibility:

```bash
cd frontend
npm test -- --run
npm run build
```

Expected: PASS; no frontend file changes are required by this plan.

- [ ] Check formatting, scope, and worktree state:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; changes are limited to the backend/worker lifecycle files and tests listed above. No S3, general logging/readiness, mapping UI, or extraction pixel/text-bound changes are present.
