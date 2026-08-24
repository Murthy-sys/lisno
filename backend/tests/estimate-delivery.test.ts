import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ESTIMATE_DELIVERY_FAILURE_CODE,
  sha256Hex,
  type EstimateClientReviewSummary
} from "../src/domain/estimate-client-review.js";
import { ApiError } from "../src/middleware/errors.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import type { PublicUser } from "../src/services/auth.service.js";
import type { EstimateMailer } from "../src/services/estimate-mailer.js";
import { createEstimateDeliveryService } from "../src/services/estimate-delivery.service.js";

const NOW = new Date("2026-08-24T10:30:00.000Z");
const DEADLINE = new Date("2026-08-24T10:30:30.000Z");
const ROUND_ID = "round-1";
const ESTIMATE_ID = "estimate-1";
const PDF_REFERENCE = "opaque/review-pdf-1";
const PDF_FILENAME = "aurora-villa-estimate-v3.pdf";
const PDF_BYTES = Buffer.from("%PDF-1.7\nimmutable estimate delivery bytes\n%%EOF", "utf8");

const OWNER: PublicUser = {
  id: "estimator-1",
  name: "Esha Estimator",
  email: "esha@lisno.example",
  role: "estimator_sales"
};

const SUPER_ADMIN: PublicUser = {
  id: "super-admin-1",
  name: "Sana Super Admin",
  email: "sana@lisno.example",
  role: "super_admin"
};

type Row = Record<string, unknown>;

function round(overrides: Row = {}): Row {
  return {
    _id: ROUND_ID,
    estimateId: ESTIMATE_ID,
    leadId: "lead-1",
    projectId: "project-1",
    estimateVersion: 3,
    sendGeneration: 1,
    dedupeKey: "a".repeat(64),
    recipientEmail: "Client@Example.COM",
    recipientEmailNormalized: "client@example.com",
    estimateSnapshot: {
      clientName: "Priya Shah",
      projectName: "Aurora Villa",
      location: "Bengaluru",
      propertyType: "villa",
      lineItems: [{
        catalogueId: "catalogue-1",
        roomName: "Living Room",
        specification: "Premium finish",
        unit: "sqft",
        rate: 100_000,
        quantity: 12,
        included: true,
        amount: 1_200_000
      }],
      subtotal: 1_200_000,
      gst: 216_000,
      total: 1_416_000
    },
    pdfFilename: PDF_FILENAME,
    pdfMimeType: "application/pdf",
    pdfByteSize: PDF_BYTES.byteLength,
    pdfSha256: sha256Hex(PDF_BYTES),
    pdfStorageReference: PDF_REFERENCE,
    deliveryStatus: "queued",
    deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 0,
    deliveryAttemptedAt: null,
    deliveryLeaseExpiresAt: null,
    deliveredAt: null,
    deliveryFailureCode: null,
    assignedAdminId: "admin-1",
    status: "pending",
    decision: null,
    decisionSource: null,
    decisionNote: null,
    decidedById: null,
    decidedAt: null,
    version: 1,
    createdAt: new Date("2026-08-24T10:29:00.000Z"),
    updatedAt: new Date("2026-08-24T10:29:00.000Z"),
    ...structuredClone(overrides)
  };
}

function safeSummary(value: Row): EstimateClientReviewSummary {
  return {
    id: String(value._id),
    sendGeneration: Number(value.sendGeneration),
    estimateVersion: Number(value.estimateVersion),
    version: Number(value.version),
    deliveryStatus: value.deliveryStatus as EstimateClientReviewSummary["deliveryStatus"],
    deliveryAttemptCount: Number(value.deliveryAttemptCount),
    deliveredAt:
      value.deliveredAt instanceof Date ? value.deliveredAt.toISOString() : null,
    status: value.status as EstimateClientReviewSummary["status"]
  };
}

function query<T>(load: () => T | Promise<T>) {
  const result = {
    select: vi.fn(),
    sort: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(() => Promise.resolve().then(load)),
    then: (
      resolve: (resolved: T) => unknown,
      reject?: (error: unknown) => unknown
    ) => Promise.resolve().then(load).then(resolve, reject)
  };
  result.select.mockReturnValue(result);
  result.sort.mockReturnValue(result);
  result.session.mockReturnValue(result);
  return result;
}

function matches(record: Row, filter: Row): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$and") {
      if (!(expected as Row[]).every((nested) => matches(record, nested))) return false;
      continue;
    }
    if (key === "$or") {
      if (!(expected as Row[]).some((nested) => matches(record, nested))) return false;
      continue;
    }
    if (key === "$expr") continue;

    const actual = record[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      const operators = expected as Row;
      if (Object.hasOwn(operators, "$eq") && actual !== operators.$eq) return false;
      if (Object.hasOwn(operators, "$ne") && actual === operators.$ne) return false;
      if (Object.hasOwn(operators, "$in") &&
        !(operators.$in as unknown[]).includes(actual)) return false;
      if (Object.hasOwn(operators, "$lte") &&
        comparable(actual) > comparable(operators.$lte)) return false;
      if (Object.hasOwn(operators, "$lt") &&
        comparable(actual) >= comparable(operators.$lt)) return false;
      if (Object.hasOwn(operators, "$gte") &&
        comparable(actual) < comparable(operators.$gte)) return false;
      if (Object.hasOwn(operators, "$exists") &&
        (actual !== undefined) !== Boolean(operators.$exists)) return false;
      continue;
    }
    if (expected instanceof Date) {
      if (!(actual instanceof Date) || actual.getTime() !== expected.getTime()) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function comparable(value: unknown): number | string {
  return value instanceof Date ? value.getTime() : value as number | string;
}

function applyUpdate(record: Row, update: Row): void {
  if (Array.isArray(update)) throw new Error("Delivery tests expect an atomic update document.");
  Object.assign(record, structuredClone(update.$set ?? {}));
  for (const [key, amount] of Object.entries((update.$inc ?? {}) as Row)) {
    record[key] = Number(record[key] ?? 0) + Number(amount);
  }
  for (const key of Object.keys((update.$unset ?? {}) as Row)) delete record[key];
}

function replace(target: Row, source: Row): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(source));
}

interface HarnessOptions {
  round?: Row;
  currentRound?: Row;
  currentRounds?: Row[];
  mailer?: EstimateMailer;
  bytes?: Buffer;
  storageError?: unknown;
  scopeError?: unknown;
  scopeErrorAtCall?: { call: number; error: unknown };
  auditErrorAction?: string;
  beforeAcquire?: (record: Row) => void;
  onSend?: (record: Row) => void | Promise<void>;
}

function enabledMailer(
  send: ReturnType<typeof vi.fn> = vi.fn(async () => ({ kind: "sent" as const }))
): EstimateMailer {
  return { deliveryKind: "local_test", send } as EstimateMailer;
}

function setup(options: HarnessOptions = {}) {
  const record = round(options.round);
  const currentRecord = options.currentRound
    ? round(options.currentRound)
    : record;
  const currentRecords = options.currentRounds?.map((value) => round(value));
  const audits: Row[] = [];
  const transactions: string[] = [];
  let beforeAcquirePending = true;
  let currentRoundReadCount = 0;
  let scopeCallCount = 0;
  let transactionTail = Promise.resolve();

  const session = {
    withTransaction: vi.fn(async (operation: () => Promise<unknown>) => {
      const predecessor = transactionTail;
      let releaseTransaction!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await predecessor;
      const roundSnapshot = structuredClone(record);
      const auditSnapshot = structuredClone(audits);
      transactions.push("start");
      try {
        const value = await operation();
        transactions.push("commit");
        return value;
      } catch (error) {
        replace(record, roundSnapshot);
        audits.splice(0, audits.length, ...auditSnapshot);
        transactions.push("rollback");
        throw error;
      } finally {
        releaseTransaction();
      }
    }),
    endSession: vi.fn(async () => undefined)
  };
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);

  const findOne = vi.spyOn(EstimateClientReviewRoundModel, "findOne")
    .mockImplementation(((filter: Row = {}) => query(() => {
      const selected = Object.hasOwn(filter, "estimateId") &&
        !Object.hasOwn(filter, "_id")
        ? currentRecords?.[
            Math.min(currentRoundReadCount++, currentRecords.length - 1)
          ] ?? currentRecord
        : record;
      return matches(selected, filter) ? structuredClone(selected) : null;
    })) as never);
  const findById = vi.spyOn(EstimateClientReviewRoundModel, "findById")
    .mockImplementation((id: unknown) => query(() =>
      String(id) === String(record._id) ? structuredClone(record) : null
    ) as never);
  const findOneAndUpdate = vi
    .spyOn(EstimateClientReviewRoundModel, "findOneAndUpdate")
    .mockImplementation(((filter: Row, update: Row, queryOptions: Row = {}) => query(() => {
      if (beforeAcquirePending && options.beforeAcquire) {
        beforeAcquirePending = false;
        options.beforeAcquire(record);
      }
      if (!matches(record, filter)) return null;
      const before = structuredClone(record);
      applyUpdate(record, update);
      return queryOptions.new === true || queryOptions.returnDocument === "after"
        ? structuredClone(record)
        : before;
    })) as never);
  const updateOne = vi.spyOn(EstimateClientReviewRoundModel, "updateOne")
    .mockImplementation((async (filter: Row, update: Row) => {
      if (!matches(record, filter)) {
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 } as never;
      }
      applyUpdate(record, update);
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as never;
    }) as never);
  const estimateUpdate = vi.spyOn(EstimateModel, "updateOne");

  const storage = {
    savePdfSnapshot: vi.fn(),
    saveProof: vi.fn(),
    read: vi.fn(async (reference: string) => {
      if (options.storageError) throw options.storageError;
      if (reference !== PDF_REFERENCE) throw new Error("wrong opaque reference");
      return Buffer.from(options.bytes ?? PDF_BYTES);
    }),
    deleteQuietly: vi.fn()
  };
  const reviews = {
    requireRetryScope: vi.fn(async () => {
      scopeCallCount += 1;
      if (options.scopeErrorAtCall?.call === scopeCallCount) {
        throw options.scopeErrorAtCall.error;
      }
      if (options.scopeError) throw options.scopeError;
    })
  };
  const audit = {
    appendInMongoTransaction: vi.fn(async (write: Row) => {
      if (write.action === options.auditErrorAction) {
        throw new Error(`audit failed for ${String(write.action)}`);
      }
      audits.push(structuredClone(write));
      return { id: `audit-${audits.length}`, ...structuredClone(write) };
    })
  };

  const mailer = options.mailer ?? enabledMailer();
  if ("send" in mailer && options.onSend) {
    const originalSend = vi.mocked(mailer.send).getMockImplementation();
    if (!originalSend) throw new Error("Race tests require a controlled mailer double.");
    vi.mocked(mailer.send).mockImplementation(async (input) => {
      await options.onSend?.(record);
      return originalSend(input);
    });
  }

  const delivery = createEstimateDeliveryService({
    reviews: reviews as never,
    storage: storage as never,
    mailer,
    portalUrl: "https://app.lisno.example/client",
    audit: audit as never,
    now: () => new Date(NOW)
  });

  return {
    delivery,
    record,
    audits,
    transactions,
    session,
    findOne,
    findById,
    findOneAndUpdate,
    updateOne,
    estimateUpdate,
    storage,
    reviews,
    audit,
    mailer
  };
}

function expectSafeSummary(value: unknown, expected: Row): void {
  expect(value).toEqual(safeSummary(expected));
  expect(value).not.toHaveProperty("recipientEmail");
  expect(value).not.toHaveProperty("pdfStorageReference");
  expect(value).not.toHaveProperty("deliveryFailureCode");
  expect(value).not.toHaveProperty("deliveryLeaseExpiresAt");
}

async function expectRetryConflict(operation: Promise<unknown>): Promise<void> {
  let error: unknown;
  try {
    await operation;
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 409,
    code: "ESTIMATE_EMAIL_RETRY_CONFLICT"
  });
  expect(JSON.stringify(error)).not.toMatch(
    /Client@Example|client@example|opaque\/review|provider|secret/i
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("initial Estimate PDF delivery", () => {
  it("marks an unpublished queued attempt disabled without leasing or contacting SMTP", async () => {
    const harness = setup({ mailer: { deliveryKind: "disabled" } });

    const result = await harness.delivery.deliverInitial(ROUND_ID);

    expect(harness.record).toMatchObject({
      deliveryStatus: "disabled",
      deliveryAttemptGeneration: 1,
      deliveryAttemptCount: 0,
      deliveryAttemptedAt: null,
      deliveryLeaseExpiresAt: null,
      deliveredAt: null,
      deliveryFailureCode: null
    });
    expect(harness.storage.read).not.toHaveBeenCalled();
    expect(harness.reviews.requireRetryScope).not.toHaveBeenCalled();
    expect(harness.audits).toEqual([]);
    expectSafeSummary(result, harness.record);
  });

  it("leases generation one once, sends the exact stored PDF and snapshot presentation, and atomically completes sent", async () => {
    const send = vi.fn(async () => ({ kind: "sent" as const }));
    const harness = setup({ mailer: enabledMailer(send) });

    const result = await harness.delivery.deliverInitial(ROUND_ID);

    expect(harness.findOneAndUpdate).toHaveBeenCalledOnce();
    const [leaseFilter, leaseUpdate] = harness.findOneAndUpdate.mock.calls[0]!;
    expect(leaseFilter).toMatchObject({
      _id: ROUND_ID,
      version: 1,
      status: "pending",
      deliveryStatus: "queued",
      deliveryAttemptGeneration: 1,
      deliveryAttemptCount: 0
    });
    expect(leaseUpdate).toEqual({
      $set: {
        deliveryAttemptedAt: NOW,
        deliveryLeaseExpiresAt: DEADLINE,
        deliveredAt: null,
        deliveryFailureCode: null
      },
      $inc: { version: 1, deliveryAttemptCount: 1 }
    });

    expect(harness.storage.read).toHaveBeenCalledOnce();
    expect(harness.storage.read).toHaveBeenCalledWith(PDF_REFERENCE);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      to: "Client@Example.COM",
      clientName: "Priya Shah",
      projectName: "Aurora Villa",
      estimateVersion: 3,
      total: 1_416_000,
      portalUrl: "https://app.lisno.example/client",
      attachment: {
        filename: PDF_FILENAME,
        mimeType: "application/pdf",
        bytes: PDF_BYTES
      }
    });

    const storageSelects = [
      ...harness.findOne.mock.results,
      ...harness.findById.mock.results
    ].flatMap((call) => {
      const value = call.value as { select?: ReturnType<typeof vi.fn> } | undefined;
      return value?.select?.mock.calls ?? [];
    });
    expect(storageSelects.some(([selection]) =>
      String(selection).includes("+pdfStorageReference")
    )).toBe(true);

    expect(harness.updateOne).toHaveBeenCalledOnce();
    expect(harness.updateOne).toHaveBeenCalledWith(
      {
        _id: ROUND_ID,
        deliveryStatus: "queued",
        deliveryAttemptGeneration: 1
      },
      {
        $set: {
          deliveryStatus: "sent",
          deliveryLeaseExpiresAt: null,
          deliveredAt: NOW,
          deliveryFailureCode: null
        },
        $inc: { version: 1 }
      },
      { session: harness.session }
    );
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      action: "estimate_email_delivery_sent",
      entityType: "estimate_client_review_round",
      entityId: ROUND_ID,
      occurredAt: NOW.toISOString()
    });
    expect(harness.record).toMatchObject({
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 1,
      deliveryAttemptCount: 1,
      deliveryAttemptedAt: NOW,
      deliveryLeaseExpiresAt: null,
      deliveredAt: NOW,
      deliveryFailureCode: null,
      version: 3
    });
    expect(harness.estimateUpdate).not.toHaveBeenCalled();
    expect(harness.reviews.requireRetryScope).not.toHaveBeenCalled();
    expectSafeSummary(result, harness.record);
  });

  it("stores only a bounded failure code and matching audit when the mailer reports failure", async () => {
    const send = vi.fn(async () => ({
      kind: "failed" as const,
      failureCode: "SMTP_REJECTED",
      providerResponse: "550 Client@Example.COM rejected",
      providerMessage: "secret provider payload"
    }));
    const harness = setup({ mailer: enabledMailer(send) });

    const result = await harness.delivery.deliverInitial(ROUND_ID);

    expect(harness.record).toMatchObject({
      deliveryStatus: "failed",
      deliveryAttemptGeneration: 1,
      deliveryAttemptCount: 1,
      deliveryLeaseExpiresAt: null,
      deliveredAt: null,
      deliveryFailureCode: "SMTP_REJECTED"
    });
    expect(ESTIMATE_DELIVERY_FAILURE_CODE.test(String(harness.record.deliveryFailureCode)))
      .toBe(true);
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      action: "estimate_email_delivery_failed",
      newValues: expect.objectContaining({ failureCode: "SMTP_REJECTED" })
    });
    expect(JSON.stringify({ round: harness.record, audits: harness.audits })).not.toMatch(
      /providerResponse|providerMessage|secret provider payload|550 Client/i
    );
    expectSafeSummary(result, harness.record);
  });

  it("normalizes an invalid provider failure payload instead of persisting it", async () => {
    const providerPayload = "smtp rejected Client@Example.COM: secret response";
    const harness = setup({
      mailer: enabledMailer(vi.fn(async () => ({
        kind: "failed" as const,
        failureCode: providerPayload
      })))
    });

    const result = await harness.delivery.deliverInitial(ROUND_ID);

    expect(harness.record.deliveryFailureCode).toBe("ESTIMATE_MAILER_FAILED");
    expect(harness.audits[0]).toMatchObject({
      action: "estimate_email_delivery_failed",
      newValues: expect.objectContaining({
        failureCode: "ESTIMATE_MAILER_FAILED"
      })
    });
    expect(JSON.stringify({ result, audits: harness.audits })).not.toContain(
      providerPayload
    );
  });

  it.each([
    {
      label: "storage read error",
      options: { storageError: new Error("s3://secret-bucket Client@Example.COM") },
      failureCode: "PDF_STORAGE_READ_FAILED"
    },
    {
      label: "stored byte-size mismatch",
      options: { bytes: Buffer.concat([PDF_BYTES, Buffer.from("tampered")]) },
      failureCode: "PDF_BYTE_SIZE_MISMATCH"
    },
    {
      label: "stored SHA-256 mismatch",
      options: {
        round: { pdfSha256: sha256Hex(Buffer.from("different immutable bytes")) }
      },
      failureCode: "PDF_SHA256_MISMATCH"
    },
    {
      label: "unexpected mailer throw",
      options: {
        mailer: enabledMailer(vi.fn(async () => {
          throw new Error("provider secret response for Client@Example.COM");
        }))
      },
      failureCode: "ESTIMATE_MAILER_FAILED"
    }
  ])("maps $label to bounded failed telemetry and never leaks dependency text", async ({ options, failureCode }) => {
    const harness = setup(options);

    const result = await harness.delivery.deliverInitial(ROUND_ID);

    expect(harness.record).toMatchObject({
      deliveryStatus: "failed",
      deliveryAttemptCount: 1,
      deliveredAt: null,
      deliveryFailureCode: failureCode
    });
    expect(ESTIMATE_DELIVERY_FAILURE_CODE.test(failureCode)).toBe(true);
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      action: "estimate_email_delivery_failed",
      newValues: expect.objectContaining({ failureCode })
    });
    expect(JSON.stringify({ result, round: harness.record, audits: harness.audits }))
      .not.toMatch(/secret-bucket|provider secret response/i);
    expect(harness.record).not.toHaveProperty("providerResponse");
    expect(harness.record).not.toHaveProperty("providerMessage");
    expectSafeSummary(result, harness.record);
  });

  it("rolls back completion telemetry with its audit and returns the prior safe leased state", async () => {
    const harness = setup({ auditErrorAction: "estimate_email_delivery_sent" });

    const result = await harness.delivery.deliverInitial(ROUND_ID);

    expect(harness.transactions).toContain("rollback");
    expect(harness.record).toMatchObject({
      deliveryStatus: "queued",
      deliveryAttemptGeneration: 1,
      deliveryAttemptCount: 1,
      deliveryAttemptedAt: NOW,
      deliveryLeaseExpiresAt: DEADLINE,
      deliveredAt: null,
      deliveryFailureCode: null,
      version: 2
    });
    expect(harness.audits).toEqual([]);
    expectSafeSummary(result, harness.record);
  });
});

describe("authorized retry leasing", () => {
  it.each([
    {
      label: "failed",
      overrides: {
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryAttemptedAt: new Date("2026-08-24T10:20:00.000Z"),
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 4
      }
    },
    {
      label: "disabled after mail became configurable",
      overrides: { deliveryStatus: "disabled", version: 2 },
      actor: SUPER_ADMIN
    },
    {
      label: "queued after its deadline",
      overrides: {
        deliveryStatus: "queued",
        deliveryAttemptCount: 1,
        deliveryAttemptedAt: new Date("2026-08-24T10:20:00.000Z"),
        deliveryLeaseExpiresAt: new Date("2026-08-24T10:29:59.999Z"),
        version: 2
      }
    }
  ])("retries $label with one new generation and one acquisition audit", async ({ overrides, actor = OWNER }) => {
    const harness = setup({ round: overrides });
    const requestedVersion = Number(overrides.version);
    const requestedAttemptCount = Number(overrides.deliveryAttemptCount ?? 0);

    const result = await harness.delivery.retry(actor, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version: requestedVersion
    });

    expect(harness.reviews.requireRetryScope).toHaveBeenCalledTimes(2);
    expect(harness.reviews.requireRetryScope.mock.calls).toEqual([
      [actor, ESTIMATE_ID, ROUND_ID],
      [actor, ESTIMATE_ID, ROUND_ID]
    ]);
    const [filter, update] = harness.findOneAndUpdate.mock.calls[0]!;
    expect(filter).toMatchObject({
      _id: ROUND_ID,
      estimateId: ESTIMATE_ID,
      version: requestedVersion,
      status: "pending",
      deliveryAttemptGeneration: 1
    });
    expect(JSON.stringify(filter)).toContain("deliveryStatus");
    expect(update).toEqual({
      $set: {
        deliveryStatus: "queued",
        deliveryAttemptedAt: NOW,
        deliveryLeaseExpiresAt: DEADLINE,
        deliveredAt: null,
        deliveryFailureCode: null
      },
      $inc: {
        version: 1,
        deliveryAttemptGeneration: 1,
        deliveryAttemptCount: 1
      }
    });
    expect(harness.audits.map((audit) => audit.action)).toEqual([
      "estimate_email_retry_requested",
      "estimate_email_delivery_sent"
    ]);
    expect(harness.record).toMatchObject({
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 2,
      deliveryAttemptCount: requestedAttemptCount + 1,
      deliveredAt: NOW,
      deliveryLeaseExpiresAt: null,
      version: requestedVersion + 2
    });
    expect(harness.estimateUpdate).not.toHaveBeenCalled();
    expectSafeSummary(result, harness.record);
  });

  it("rolls back the lease when the retry-requested audit cannot join acquisition", async () => {
    const prior = round({
      deliveryStatus: "failed",
      deliveryAttemptCount: 1,
      deliveryAttemptedAt: new Date("2026-08-24T10:20:00.000Z"),
      deliveryFailureCode: "SMTP_TIMEOUT",
      version: 4
    });
    const harness = setup({
      round: prior,
      auditErrorAction: "estimate_email_retry_requested"
    });

    await expect(harness.delivery.retry(OWNER, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version: 4
    })).rejects.toThrow();

    expect(harness.record).toEqual(prior);
    expect(harness.transactions).toContain("rollback");
    expect(harness.audits).toEqual([]);
    expect(harness.storage.read).not.toHaveBeenCalled();
    expect("send" in harness.mailer ? harness.mailer.send : undefined)
      .not.toHaveBeenCalled();
  });

  it.each([
    [
      "actor deactivation",
      new ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    ],
    [
      "Estimate ownership revocation",
      new Error("new owner secret-estimator-2 must not leak")
    ]
  ])("re-authorizes after leasing and blocks storage on %s", async (_label, scopeError) => {
    const send = vi.fn(async () => ({ kind: "sent" as const }));
    const harness = setup({
      round: {
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 4
      },
      mailer: enabledMailer(send),
      scopeErrorAtCall: { call: 2, error: scopeError }
    });

    await expectRetryConflict(harness.delivery.retry(OWNER, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version: 4
    }));

    expect(harness.reviews.requireRetryScope).toHaveBeenCalledTimes(2);
    expect(harness.record).toMatchObject({
      deliveryStatus: "queued",
      deliveryAttemptGeneration: 2,
      deliveryAttemptCount: 2,
      deliveryAttemptedAt: NOW,
      deliveryLeaseExpiresAt: DEADLINE,
      deliveredAt: null,
      deliveryFailureCode: null,
      version: 5
    });
    expect(harness.audits.map((audit) => audit.action)).toEqual([
      "estimate_email_retry_requested"
    ]);
    expect(harness.storage.read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "already sent",
      overrides: { deliveryStatus: "sent", deliveredAt: NOW, version: 3 },
      version: 3
    },
    {
      label: "active queued lease",
      overrides: {
        deliveryStatus: "queued",
        deliveryAttemptCount: 1,
        deliveryAttemptedAt: NOW,
        deliveryLeaseExpiresAt: new Date("2026-08-24T10:30:00.001Z"),
        version: 2
      },
      version: 2
    },
    {
      label: "approved terminal task",
      overrides: {
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryFailureCode: "SMTP_TIMEOUT",
        status: "approved",
        decision: "approve",
        decisionSource: "client_portal",
        decisionNote: "",
        decidedById: "client-1",
        decidedAt: NOW,
        version: 5
      },
      version: 5
    },
    {
      label: "stale round version",
      overrides: {
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 5
      },
      version: 4
    }
  ])("rejects $label before any bytes or SMTP are used", async ({ overrides, version }) => {
    const harness = setup({ round: overrides });

    const operation = harness.delivery.retry(OWNER, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version
    });

    await expectRetryConflict(operation);
    expect(harness.storage.read).not.toHaveBeenCalled();
    expect("send" in harness.mailer ? harness.mailer.send : undefined)
      .not.toHaveBeenCalled();
    expect(harness.audits).toEqual([]);
  });

  it.each([
    ["foreign owner", OWNER, new ApiError(404, "NOT_FOUND", "The requested resource was not found.")],
    ["stale round ID", SUPER_ADMIN, new ApiError(404, "NOT_FOUND", "The requested resource was not found.")]
  ])("rejects %s through the reviewed authorization scope before acquiring", async (_label, actor, scopeError) => {
    const harness = setup({
      round: {
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 4
      },
      scopeError
    });

    await expect(harness.delivery.retry(actor, {
      estimateId: ESTIMATE_ID,
      roundId: _label === "stale round ID" ? "round-stale" : ROUND_ID,
      version: 4
    })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    expect(harness.findOneAndUpdate).not.toHaveBeenCalled();
    expect(harness.storage.read).not.toHaveBeenCalled();
    expect(harness.audits).toEqual([]);
  });

  it("rejects an authorized historical round when a newer send generation is current", async () => {
    const harness = setup({
      round: {
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 4
      },
      currentRound: {
        _id: "round-2",
        sendGeneration: 2,
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 3
      }
    });

    await expectRetryConflict(harness.delivery.retry(OWNER, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version: 4
    }));

    expect(harness.reviews.requireRetryScope).toHaveBeenCalledWith(
      OWNER,
      ESTIMATE_ID,
      ROUND_ID
    );
    expect(harness.findOneAndUpdate).not.toHaveBeenCalled();
    expect(harness.storage.read).not.toHaveBeenCalled();
    expect(harness.audits).toEqual([]);
  });

  it("rechecks the latest round inside acquisition when send generation changes at the boundary", async () => {
    const historical = {
      deliveryStatus: "failed",
      deliveryAttemptCount: 1,
      deliveryFailureCode: "SMTP_TIMEOUT",
      version: 4
    };
    const harness = setup({
      round: historical,
      currentRounds: [
        historical,
        {
          _id: "round-2",
          sendGeneration: 2,
          deliveryStatus: "failed",
          deliveryAttemptCount: 1,
          deliveryFailureCode: "SMTP_TIMEOUT",
          version: 3
        }
      ]
    });

    await expectRetryConflict(harness.delivery.retry(OWNER, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version: 4
    }));

    expect(harness.findOne).toHaveBeenCalledTimes(2);
    const transactionalCurrentQuery = harness.findOne.mock.results[1]?.value as {
      session: ReturnType<typeof vi.fn>;
    };
    expect(transactionalCurrentQuery.session).toHaveBeenCalledWith(harness.session);
    expect(harness.findOneAndUpdate).not.toHaveBeenCalled();
    expect(harness.record).toMatchObject(historical);
    expect(harness.audits).toEqual([]);
    expect(harness.storage.read).not.toHaveBeenCalled();
    expect("send" in harness.mailer ? harness.mailer.send : undefined)
      .not.toHaveBeenCalled();
  });

  it("rejects a CAS loser whose attempt generation changed after validation", async () => {
    const harness = setup({
      round: {
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 4
      },
      beforeAcquire: (record) => {
        record.deliveryAttemptGeneration = 2;
        record.deliveryAttemptCount = 2;
        record.version = 5;
      }
    });

    const operation = harness.delivery.retry(OWNER, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version: 4
    });

    await expectRetryConflict(operation);
    expect(harness.storage.read).not.toHaveBeenCalled();
    expect("send" in harness.mailer ? harness.mailer.send : undefined)
      .not.toHaveBeenCalled();
    expect(harness.audits).toEqual([]);
  });

  it("allows only one of two concurrent retries to lease and call the mailer", async () => {
    let releaseSend!: () => void;
    const sending = new Promise<void>((resolve) => { releaseSend = resolve; });
    const send = vi.fn(async () => {
      await sending;
      return { kind: "sent" as const };
    });
    const harness = setup({
      round: {
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveryFailureCode: "SMTP_TIMEOUT",
        version: 4
      },
      mailer: enabledMailer(send)
    });

    const first = harness.delivery.retry(OWNER, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version: 4
    });
    const second = harness.delivery.retry(OWNER, {
      estimateId: ESTIMATE_ID,
      roundId: ROUND_ID,
      version: 4
    });
    const settled = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    releaseSend();
    const outcomes = await settled;

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(send).toHaveBeenCalledOnce();
    expect(harness.audits.filter((audit) =>
      audit.action === "estimate_email_retry_requested"
    )).toHaveLength(1);
    expect(harness.audits.filter((audit) =>
      audit.action === "estimate_email_delivery_sent"
    )).toHaveLength(1);
    expect(harness.record).toMatchObject({
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 2,
      deliveryAttemptCount: 2
    });
  });
});

describe("exact-generation completion races", () => {
  it("lets the exact in-flight generation finish after a task decision changes round status and version", async () => {
    const harness = setup({
      onSend: (record) => {
        Object.assign(record, {
          status: "approved",
          decision: "approve",
          decisionSource: "client_portal",
          decisionNote: "",
          decidedById: "client-1",
          decidedAt: NOW,
          version: Number(record.version) + 1
        });
      }
    });

    const result = await harness.delivery.deliverInitial(ROUND_ID);

    expect(harness.updateOne).toHaveBeenCalledWith(
      {
        _id: ROUND_ID,
        deliveryStatus: "queued",
        deliveryAttemptGeneration: 1
      },
      expect.any(Object),
      { session: harness.session }
    );
    const [completionFilter] = harness.updateOne.mock.calls[0]!;
    expect(completionFilter).not.toHaveProperty("version");
    expect(completionFilter).not.toHaveProperty("status");
    expect(harness.record).toMatchObject({
      status: "approved",
      deliveryStatus: "sent",
      deliveryAttemptGeneration: 1,
      version: 4
    });
    expect(harness.audits.map((audit) => audit.action)).toEqual([
      "estimate_email_delivery_sent"
    ]);
    expectSafeSummary(result, harness.record);
  });

  it("treats an old-generation completion as a no-op and writes no delivery audit", async () => {
    const harness = setup({
      onSend: (record) => {
        Object.assign(record, {
          deliveryStatus: "queued",
          deliveryAttemptGeneration: 2,
          deliveryAttemptCount: 2,
          deliveryAttemptedAt: new Date("2026-08-24T10:30:01.000Z"),
          deliveryLeaseExpiresAt: new Date("2026-08-24T10:30:31.000Z"),
          version: Number(record.version) + 1
        });
      }
    });

    const result = await harness.delivery.deliverInitial(ROUND_ID);

    expect(harness.updateOne).toHaveBeenCalledWith(
      {
        _id: ROUND_ID,
        deliveryStatus: "queued",
        deliveryAttemptGeneration: 1
      },
      expect.any(Object),
      { session: harness.session }
    );
    expect(harness.record).toMatchObject({
      deliveryStatus: "queued",
      deliveryAttemptGeneration: 2,
      deliveryAttemptCount: 2,
      deliveryAttemptedAt: new Date("2026-08-24T10:30:01.000Z"),
      deliveryLeaseExpiresAt: new Date("2026-08-24T10:30:31.000Z"),
      deliveredAt: null,
      version: 3
    });
    expect(harness.audits).toEqual([]);
    expect(harness.estimateUpdate).not.toHaveBeenCalled();
    expectSafeSummary(result, harness.record);
  });
});
