import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeQualityParameter } from "../src/contracts/ai-estimator-knowledge.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeBasketQualityRevisionModel } from "../src/models/AiEstimatorKnowledgeBasketQualityRevision.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeContextService } from "../src/services/ai-estimator-knowledge-context.service.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { basketQualityDigest } from "../src/services/ai-estimator-knowledge-basket-quality.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-09-08T10:00:00.000Z");
const BASKET_ID = "quality-electrical";
const OTHER_BASKET_ID = "quality-pop";
const UOM_ID = "quality-number";
const SUPER_ADMIN: PublicUser = {
  id: "quality-super-admin", name: "Quality Administrator", email: "quality-admin@example.invalid", role: "super_admin"
};
const ADMIN: PublicUser = {
  id: "quality-ordinary-admin", name: "Ordinary Administrator", email: "ordinary-admin@example.invalid", role: "admin"
};
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let sequence = 0;

beforeAll(async () => {
  replica = await startMongoReplicaSet("ai-estimator-knowledge-basket-quality");
  await Promise.all([
    AuditEventModel.syncIndexes(), AiEstimatorKnowledgeBasketModel.syncIndexes(),
    AiEstimatorKnowledgeBasketQualityRevisionModel.syncIndexes(), AiEstimatorKnowledgeMainLineModel.syncIndexes(),
    AiEstimatorKnowledgeRevisionModel.syncIndexes(), AiEstimatorKnowledgeSectionModel.syncIndexes(),
    AiEstimatorKnowledgeUomModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  sequence = 0;
  await replica.clear();
  await seedActor(SUPER_ADMIN);
  await Promise.all([
    seedBasket(BASKET_ID, "Electrical", 1), seedBasket(OTHER_BASKET_ID, "POP / Gypsum", 2),
    AiEstimatorKnowledgeUomModel.create({
      _id: UOM_ID, code: "NOS", codeNormalized: "nos", name: "Number", nameNormalized: "number",
      decimalScale: 0, displayOrder: 1, status: "active", version: 1,
      createdById: SUPER_ADMIN.id, updatedById: SUPER_ADMIN.id, createdAt: NOW, updatedAt: NOW
    })
  ]);
});

afterAll(async () => { await replica?.stop(); });

describe("Main Basket shared quality checklist replica-set invariants", { timeout: 30_000 }, () => {
  it("validates submitted flags before saving every quality row as required and active", async () => {
    const { reference } = services();
    const { required: _required, active: _active, ...omitted } = electricalCheck({ id: "omitted-flags" });
    const parameters = [electricalCheck({ required: false, active: false }), omitted];
    const inputBefore = structuredClone(parameters);
    const saved = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters });
    const expected = parameters.map((parameter) => ({ ...parameter, required: true, active: true }));
    expect(saved.parameters).toEqual(expected);
    expect(saved.contentDigest).toBe(basketQualityDigest(BASKET_ID, expected));
    expect((await AiEstimatorKnowledgeBasketQualityRevisionModel.findById(saved.revisionId).lean())?.parameters).toEqual(expected);
    expect(parameters).toEqual(inputBefore);
    for (const flag of ["required", "active"]) {
      await expect(reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, {
        expectedVersion: saved.version, parameters: [{ ...omitted, [flag]: "false" }]
      })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    }
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
    expect(await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).toEqual(saved);
  });

  it.each(["false", "omitted"])("projects old %s flags as mandatory without changing their raw digest or history", async (flags) => {
    const { reference, item, context } = services();
    const line = await activateItem(item, "Existing legacy checklist item", "main_line", { configureQuality: false });
    const { required: _required, active: _active, ...omitted } = electricalCheck({ id: "legacy-omitted-flags" });
    const parameters = flags === "false" ? [electricalCheck({ required: false, active: false })] : [omitted];
    const revisionId = "legacy-shared-quality";
    const digest = basketQualityDigest(BASKET_ID, parameters);
    await AiEstimatorKnowledgeBasketQualityRevisionModel.create({
      _id: revisionId, basketId: BASKET_ID, revisionNumber: 1, parameters,
      contentDigest: digest, createdById: SUPER_ADMIN.id, createdAt: NOW
    });
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: BASKET_ID }, { $set: { qualityRevisionId: revisionId } });
    const rawBefore = await AiEstimatorKnowledgeBasketQualityRevisionModel.findById(revisionId).lean();
    const itemHistory = await item.history(SUPER_ADMIN, line.mainLineId, { limit: 20, offset: 0 });
    const expected = parameters.map((parameter) => ({ ...parameter, required: true, active: true }));
    const effective = await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID);
    expect(effective).toMatchObject({ parameters: expected, contentDigest: digest, revisionId });
    expect(basketQualityDigest(BASKET_ID, effective.parameters)).not.toBe(digest);
    const resolved = await context.resolve(SUPER_ADMIN, { mainBasketId: BASKET_ID, mainLineId: line.mainLineId });
    expect(resolved.sections.quality).toMatchObject({ parameters: expected, source: { contentDigest: digest, revisionId } });
    expect(resolved.lineage.basketQualityContentDigest).toBe(digest);
    expect(resolved.availability).toContainEqual({ sectionKey: "quality", state: "available", reasonCode: null });
    expect((await item.getItem(SUPER_ADMIN, line.mainLineId)).completeness.sections)
      .toContainEqual({ sectionKey: "quality", state: "complete", findings: [] });
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.findById(revisionId).lean()).toEqual(rawBefore);
    expect(await item.history(SUPER_ADMIN, line.mainLineId, { limit: 20, offset: 0 })).toEqual(itemHistory);
  });

  it("distinguishes an unset checklist from an explicitly saved empty checklist", async () => {
    const { reference } = services();
    expect(await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).toMatchObject({
      basketId: BASKET_ID, basketName: "Electrical", basketStatus: "active", version: 1,
      revisionId: null, revisionNumber: 0, contentDigest: null, parameters: []
    });
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments()).toBe(0);
    const saved = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters: [] });
    expect(saved).toMatchObject({ version: 2, revisionNumber: 1, parameters: [], updatedAt: NOW.toISOString() });
    expect(saved.revisionId).toEqual(expect.any(String));
    expect(saved.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).toEqual(saved);
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: BASKET_ID })).toBe(1);
  });

  it("requires the stored, active, sole Super Admin for both reads and writes", async () => {
    const { reference } = services();
    await seedActor(ADMIN);
    const attempt = async (actor: PublicUser, expected: { status: number; code: string }) => {
      await expect(reference.getBasketQuality(actor, BASKET_ID)).rejects.toMatchObject(expected);
      await expect(reference.updateBasketQuality(actor, BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck()] }))
        .rejects.toMatchObject(expected);
    };
    await attempt(ADMIN, { status: 403, code: "FORBIDDEN" });
    await attempt({ ...SUPER_ADMIN, role: "admin" }, { status: 401, code: "INVALID_TOKEN" });
    await UserModel.updateOne({ _id: SUPER_ADMIN.id }, { $set: { active: false } });
    await attempt(SUPER_ADMIN, { status: 401, code: "INVALID_TOKEN" });
    await UserModel.updateOne({ _id: SUPER_ADMIN.id }, { $set: { active: true } });
    await seedActor({ ...SUPER_ADMIN, id: "quality-second-super-admin", email: "second@example.invalid" });
    await attempt(SUPER_ADMIN, { status: 409, code: "SOLE_SUPER_ADMIN_REQUIRED" });
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeBasketModel.findById(BASKET_ID).lean()).toMatchObject({ version: 1, qualityRevisionId: null });
  });

  it("rejects missing and archived baskets without creating orphan revisions", async () => {
    const { reference } = services();
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: OTHER_BASKET_ID }, { $set: { status: "archived" } });
    for (const [basketId, error] of [
      ["missing-basket", { status: 404, code: "NOT_FOUND" }],
      [OTHER_BASKET_ID, { status: 409, code: "RESOURCE_ARCHIVED" }]
    ] as const) {
      await expect(reference.getBasketQuality(SUPER_ADMIN, basketId)).rejects.toMatchObject(error);
      await expect(reference.updateBasketQuality(SUPER_ADMIN, basketId, { expectedVersion: 1, parameters: [electricalCheck()] }))
        .rejects.toMatchObject(error);
    }
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments()).toBe(0);
  });

  it("preserves immutable revision history and keeps different baskets independent", async () => {
    const { reference } = services();
    const first = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck()] });
    const historical = await AiEstimatorKnowledgeBasketQualityRevisionModel.findById(first.revisionId).lean();
    const pop = await reference.updateBasketQuality(SUPER_ADMIN, OTHER_BASKET_ID, {
      expectedVersion: 1, parameters: [electricalCheck({ id: "pop-level", label: "Is the finished ceiling level?", sampling: { method: "all", unit: "ceiling areas" } })]
    });
    const second = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, {
      expectedVersion: first.version, parameters: [electricalCheck({ sampling: { method: "percentage", value: 10.5, unit: "installed electrical fixtures" } })]
    });
    expect(second).toMatchObject({ version: 3, revisionNumber: 2 });
    expect((await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).parameters[0]).toMatchObject({ sampling: { value: 10.5 } });
    expect(second.revisionId).not.toBe(first.revisionId);
    expect(second.contentDigest).not.toBe(first.contentDigest);
    await expect(AiEstimatorKnowledgeBasketQualityRevisionModel.updateOne({ _id: first.revisionId }, { $set: { parameters: [] } }))
      .rejects.toThrow("immutable");
    await expect(AiEstimatorKnowledgeBasketQualityRevisionModel.replaceOne({ _id: first.revisionId }, { ...historical, parameters: [] }))
      .rejects.toThrow("immutable");
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.findById(first.revisionId).lean()).toEqual(historical);
    expect(await reference.getBasketQuality(SUPER_ADMIN, OTHER_BASKET_ID)).toEqual(pop);
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: BASKET_ID })).toBe(2);
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: OTHER_BASKET_ID })).toBe(1);
  });

  it("uses basket version CAS so a competing save has exactly one winner and one committed revision", async () => {
    const { reference } = services();
    const results = await Promise.allSettled([
      reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck({ label: "First inspector's question" })] }),
      reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck({ label: "Second inspector's question" })] })
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    expect(await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).toEqual(successes[0]?.value);
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: BASKET_ID })).toBe(1);
    expect(await AuditEventModel.countDocuments({ entityId: BASKET_ID })).toBe(1);
    await expect(reference.updateBasket(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, name: "Stale basket rename" }))
      .rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    expect((await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).basketName).toBe("Electrical");
  });

  it.each([
    ["zero percentage", [electricalCheck({ sampling: { method: "percentage", value: 0, unit: "fixtures" } })]],
    ["over 100 percent", [electricalCheck({ sampling: { method: "percentage", value: 101, unit: "fixtures" } })]],
    ["fractional count", [electricalCheck({ sampling: { method: "fixed_count", value: 1.5, unit: "fixtures" } })]],
    ["photo evidence with missing minimum", [electricalCheck({ evidence: { photos: true, documents: false, video: false } })]],
    ["photo count without photos", [electricalCheck({ evidence: { photos: false, documents: false, video: false, minPhotosPerSample: 1 } })]],
    ["duplicate row identity", [electricalCheck(), electricalCheck()]],
    ["unknown metadata", [{ ...electricalCheck(), automatedPass: true }]]
  ])("rejects invalid %s without writing data or audit events", async (_name, parameters) => {
    const { reference } = services();
    await expect(reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeBasketModel.findById(BASKET_ID).lean()).toMatchObject({ version: 1, qualityRevisionId: null });
  });

  it("enforces the 200-row and 256 KiB limits, including their valid boundaries", async () => {
    const { reference } = services();
    const rows = Array.from({ length: 200 }, (_, index) => ({ id: `check-${index}`, type: "checkbox" as const, label: `Quality check ${index}` }));
    const first = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters: rows });
    expect(first.parameters).toHaveLength(200);
    await expect(reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, {
      expectedVersion: first.version, parameters: [...rows, { id: "check-201", type: "checkbox", label: "One too many" }]
    })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    const largeRows = Array.from({ length: 70 }, (_, index) => ({ id: `large-${index}`, type: "checkbox" as const, label: "Check", instructions: "x", required: true, active: true }));
    let remainingBytes = 256 * 1024 - Buffer.byteLength(JSON.stringify({ parameters: largeRows }), "utf8");
    for (const row of largeRows) {
      const bytes = Math.min(3999, remainingBytes);
      row.instructions += "x".repeat(bytes);
      remainingBytes -= bytes;
    }
    expect(remainingBytes).toBe(0);
    expect(Buffer.byteLength(JSON.stringify({ parameters: largeRows }), "utf8")).toBe(256 * 1024);
    const boundary = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: first.version, parameters: largeRows });
    // Omitted flags may fit the request limit but exceed it after mandatory flags are added.
    const omittedAtLimit = largeRows.map(({ required: _required, active: _active, ...row }) => row);
    let freedBytes = 256 * 1024 - Buffer.byteLength(JSON.stringify({ parameters: omittedAtLimit }), "utf8");
    for (const row of omittedAtLimit) {
      const bytes = Math.min(4000 - row.instructions.length, freedBytes);
      row.instructions += "x".repeat(bytes);
      freedBytes -= bytes;
    }
    expect(freedBytes).toBe(0);
    await expect(reference.updateBasketQuality(SUPER_ADMIN, OTHER_BASKET_ID, { expectedVersion: 1, parameters: omittedAtLimit }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: OTHER_BASKET_ID })).toBe(0);
    const last = largeRows.at(-1)!;
    last.instructions += "x";
    await expect(reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: boundary.version, parameters: largeRows }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: BASKET_ID })).toBe(2);
    expect(await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).toEqual(boundary);
  });

  it("rolls back the new revision, basket pointer, authorization coordination, and audit on audit failure", async () => {
    const reference = createAiEstimatorKnowledgeReferenceService({
      audit: { appendInMongoTransaction: async () => { throw new Error("injected quality audit outage"); } },
      now: () => NOW, createId: nextId
    });
    await expect(reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck()] }))
      .rejects.toThrow("injected quality audit outage");
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeBasketModel.findById(BASKET_ID).lean()).toMatchObject({ version: 1, qualityRevisionId: null });
    expect(await services().reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck()] }))
      .toMatchObject({ version: 2, revisionNumber: 1 });
  });

  it("deletes every revision of the deleted basket while retaining the other basket's checklist", async () => {
    const { reference } = services();
    const first = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck()] });
    const second = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: first.version, parameters: [] });
    const other = await reference.updateBasketQuality(SUPER_ADMIN, OTHER_BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck({ id: "pop-check" })] });
    const deletion = {
      expectedVersion: second.version, confirmationName: "Electrical", reason: "Remove obsolete QA-only basket and its checklist history."
    };
    const failingReference = createAiEstimatorKnowledgeReferenceService({
      audit: { appendInMongoTransaction: async () => { throw new Error("injected basket deletion audit outage"); } },
      now: () => NOW, createId: nextId
    });
    await expect(failingReference.permanentlyDeleteBasket(SUPER_ADMIN, BASKET_ID, deletion))
      .rejects.toThrow("injected basket deletion audit outage");
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: BASKET_ID })).toBe(2);
    expect(await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).toEqual(second);
    expect(await AuditEventModel.countDocuments({ entityId: BASKET_ID })).toBe(2);
    await reference.permanentlyDeleteBasket(SUPER_ADMIN, BASKET_ID, deletion);
    expect(await AiEstimatorKnowledgeBasketModel.findById(BASKET_ID)).toBeNull();
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: BASKET_ID })).toBe(0);
    expect(await reference.getBasketQuality(SUPER_ADMIN, OTHER_BASKET_ID)).toEqual(other);
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments({ basketId: OTHER_BASKET_ID })).toBe(1);
  });

  it("resolves shared active checks for Main Lines and temporary items, with legacy fallback only before a shared save", async () => {
    const { reference, item, context } = services();
    const mainLine = await activateItem(item, "Electrical fixtures", "main_line");
    const temporary = await activateItem(item, "Temporary surface conduit", "temporary");
    const input = (mainLineId: string) => ({ mainBasketId: BASKET_ID, mainLineId });
    expect((await context.resolve(SUPER_ADMIN, input(mainLine.mainLineId))).sections.quality)
      .toMatchObject({ parameters: [{ id: "legacy-check", label: "Legacy item-specific check" }] });

    const active = electricalCheck();
    const shared = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, {
      expectedVersion: (await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).version,
      parameters: [active, electricalCheck({ id: "disabled-check", label: "Disabled check", active: false })]
    });
    const source = { kind: "main_basket", basketId: BASKET_ID, revisionId: shared.revisionId, revisionNumber: shared.revisionNumber, contentDigest: shared.contentDigest };
    for (const line of [mainLine, temporary]) {
      const resolved = await context.resolve(SUPER_ADMIN, input(line.mainLineId));
      expect(resolved.sections.quality).toEqual({ parameters: [active, electricalCheck({ id: "disabled-check", label: "Disabled check" })], source });
      expect(resolved.lineage).toMatchObject({ basketQualityRevisionId: shared.revisionId, basketQualityContentDigest: shared.contentDigest });
      expect(resolved.availability).toContainEqual(expect.objectContaining({ sectionKey: "quality", state: "available" }));
    }
    expect(await item.getSection(SUPER_ADMIN, mainLine.mainLineId, mainLine.activeRevisionId!, "quality"))
      .toMatchObject({ payload: { parameters: [{ id: "legacy-check" }] } });

    const empty = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: shared.version, parameters: [] });
    for (const line of [mainLine, temporary]) {
      const resolved = await context.resolve(SUPER_ADMIN, input(line.mainLineId));
      expect(resolved.sections.quality).toEqual({ parameters: [], source: { ...source, revisionId: empty.revisionId, revisionNumber: empty.revisionNumber, contentDigest: empty.contentDigest } });
      expect(resolved.availability).toContainEqual({ sectionKey: "quality", state: "not_configured", reasonCode: "NO_ACTIVE_QUALITY_CHECKS" });
    }
  });

  it("projects shared quality into current list/detail completeness without changing persisted revisions or history", async () => {
    const { reference, item } = services();
    const lines = await Promise.all([
      activateItem(item, "Current Electrical fixtures", "main_line", { configureQuality: false }),
      activateItem(item, "Current temporary conduit", "temporary", { configureQuality: false })
    ]);
    for (const line of lines) await item.createRevision(SUPER_ADMIN, line.mainLineId, { expectedVersion: line.version });
    const unrelated = await activateItem(item, "Unrelated POP ceiling", "main_line", { basketId: OTHER_BASKET_ID, configureQuality: false });
    const before = await Promise.all(lines.map((line) => item.getItem(SUPER_ADMIN, line.mainLineId)));
    const histories = await Promise.all(lines.map((line) => item.history(SUPER_ADMIN, line.mainLineId, { limit: 20, offset: 0 })));
    const storedRevisions = await AiEstimatorKnowledgeRevisionModel.find({}).sort({ _id: 1 }).lean();
    const storedSections = await AiEstimatorKnowledgeSectionModel.find({}).sort({ _id: 1 }).lean();
    for (const detail of before) {
      expect(detail.completeness.sections).toContainEqual(expect.objectContaining({ sectionKey: "quality", state: "not_configured" }));
      expect(detail.warnings).toContainEqual(expect.objectContaining({ sectionKey: "quality", code: "SECTION_NOT_CONFIGURED" }));
      expect(detail.activeRevision).not.toBeNull();
      expect(detail.draftRevision).not.toBeNull();
    }
    await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, {
      expectedVersion: (await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).version, parameters: [electricalCheck()]
    });
    const qualityFind = vi.spyOn(AiEstimatorKnowledgeBasketQualityRevisionModel, "find");
    let listed: Awaited<ReturnType<typeof item.listItems>>;
    try {
      listed = await item.listItems(SUPER_ADMIN, {}, { limit: 20, offset: 0 });
      expect(qualityFind).toHaveBeenCalledTimes(1);
    } finally {
      qualityFind.mockRestore();
    }
    expect(await item.listItems(SUPER_ADMIN, { uomId: UOM_ID }, { limit: 20, offset: 0 })).toEqual(listed!);
    for (const [index, line] of lines.entries()) {
      const detail = await item.getItem(SUPER_ADMIN, line.mainLineId);
      expect(detail.completeness.sections).toContainEqual({ sectionKey: "quality", state: "complete", findings: [] });
      expect(detail.completeness.percentage).toBeGreaterThan(before[index]!.completeness.percentage);
      expect(detail.completeness.sections.filter((section) => section.sectionKey !== "quality"))
        .toEqual(before[index]!.completeness.sections.filter((section) => section.sectionKey !== "quality"));
      expect(listed!.items.find((entry) => entry.mainLineId === line.mainLineId)?.completeness).toEqual(detail.completeness);
      expect(detail.warnings).toEqual(detail.completeness.warnings);
      expect(detail.blockers).toEqual(detail.completeness.blockers);
      expect(detail.warnings.some((warning) => warning.sectionKey === "quality")).toBe(false);
      expect(detail.activeRevision).toEqual(before[index]!.activeRevision);
      expect(detail.draftRevision).toEqual(before[index]!.draftRevision);
      expect(await item.history(SUPER_ADMIN, line.mainLineId, { limit: 20, offset: 0 })).toEqual(histories[index]);
    }
    expect((await item.getItem(SUPER_ADMIN, unrelated.mainLineId)).completeness).toEqual(unrelated.completeness);
    expect(listed!.items.find((entry) => entry.mainLineId === unrelated.mainLineId)?.completeness).toEqual(unrelated.completeness);
    expect(await AiEstimatorKnowledgeRevisionModel.find({}).sort({ _id: 1 }).lean()).toEqual(storedRevisions);
    expect(await AiEstimatorKnowledgeSectionModel.find({}).sort({ _id: 1 }).lean()).toEqual(storedSections);
  });

  it("treats an empty shared checklist as currently unconfigured while preserving configured item history", async () => {
    const { reference, item } = services();
    const lines = [
      await activateItem(item, "Legacy configured Electrical", "main_line"),
      await activateItem(item, "Legacy configured temporary conduit", "temporary")
    ];
    const histories = await Promise.all(lines.map((line) => item.history(SUPER_ADMIN, line.mainLineId, { limit: 20, offset: 0 })));
    const stored = await AiEstimatorKnowledgeRevisionModel.find({}).sort({ _id: 1 }).lean();
    await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, {
      expectedVersion: (await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).version,
      parameters: []
    });
    const listed = await item.listItems(SUPER_ADMIN, { basketId: BASKET_ID }, { limit: 20, offset: 0 });
    for (const [index, line] of lines.entries()) {
      const detail = await item.getItem(SUPER_ADMIN, line.mainLineId);
      expect(detail.completeness.sections).toContainEqual(expect.objectContaining({ sectionKey: "quality", state: "not_configured" }));
      expect(detail.completeness.percentage).toBeLessThan(line.completeness.percentage);
      expect(detail.warnings).toEqual(detail.completeness.warnings);
      expect(detail.warnings).toContainEqual(expect.objectContaining({ sectionKey: "quality", code: "SECTION_NOT_CONFIGURED" }));
      expect(detail.blockers).toEqual(detail.completeness.blockers);
      expect(listed.items.find((entry) => entry.mainLineId === line.mainLineId)?.completeness).toEqual(detail.completeness);
      expect(detail.activeRevision).toEqual(line.activeRevision);
      expect(await item.history(SUPER_ADMIN, line.mainLineId, { limit: 20, offset: 0 })).toEqual(histories[index]);
    }
    expect(await AiEstimatorKnowledgeRevisionModel.find({}).sort({ _id: 1 }).lean()).toEqual(stored);
  });

  it.each(["missing revision", "corrupt digest", "another basket's revision"])(
    "fails closed for %s instead of exposing legacy item checks",
    async (corruption) => {
      const { reference, item, context } = services();
      const line = await activateItem(item, "Electrical core with legacy quality", "main_line");
      const shared = await reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, {
        expectedVersion: (await reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).version, parameters: [electricalCheck()]
      });
      if (corruption === "missing revision") {
        await AiEstimatorKnowledgeBasketQualityRevisionModel.deleteOne({ _id: shared.revisionId });
      } else if (corruption === "corrupt digest") {
        // Raw collection access is limited to the corrupt-data fixture; application writes stay immutable.
        await AiEstimatorKnowledgeBasketQualityRevisionModel.collection.updateOne({ _id: shared.revisionId }, { $set: { contentDigest: "invalid-digest" } });
      } else {
        const other = await reference.updateBasketQuality(SUPER_ADMIN, OTHER_BASKET_ID, { expectedVersion: 1, parameters: [electricalCheck({ id: "unrelated-pop-check" })] });
        await AiEstimatorKnowledgeBasketModel.updateOne({ _id: BASKET_ID }, { $set: { qualityRevisionId: other.revisionId } });
      }
      const expected = { status: 409, code: "BASKET_QUALITY_NOT_RESOLVABLE" };
      await expect(reference.getBasketQuality(SUPER_ADMIN, BASKET_ID)).rejects.toMatchObject(expected);
      await expect(item.getItem(SUPER_ADMIN, line.mainLineId)).rejects.toMatchObject(expected);
      await expect(item.listItems(SUPER_ADMIN, {}, { limit: 20, offset: 0 })).rejects.toMatchObject(expected);
      await expect(context.resolve(SUPER_ADMIN, { mainBasketId: BASKET_ID, mainLineId: line.mainLineId })).rejects.toMatchObject(expected);
      const auditCount = await AuditEventModel.countDocuments();
      await expect(reference.updateBasketQuality(SUPER_ADMIN, BASKET_ID, { expectedVersion: shared.version, parameters: [] })).rejects.toMatchObject(expected);
      expect(await AuditEventModel.countDocuments()).toBe(auditCount);
      expect(await AiEstimatorKnowledgeBasketModel.findById(BASKET_ID).lean()).toMatchObject({ version: shared.version });
    }
  );
});

function services() {
  const audit = createAuditService(createMemoryRepository());
  return {
    reference: createAiEstimatorKnowledgeReferenceService({ audit, now: () => NOW, createId: nextId }),
    item: createAiEstimatorKnowledgeItemService({ audit, now: () => NOW, uuid: nextId }),
    context: createAiEstimatorKnowledgeContextService({ now: () => NOW })
  };
}

async function activateItem(
  item: ReturnType<typeof createAiEstimatorKnowledgeItemService>, name: string, itemType: "main_line" | "temporary",
  options: { basketId?: string; configureQuality?: boolean } = {}
) {
  let detail = await item.createMainLine(SUPER_ADMIN, options.basketId ?? BASKET_ID, { name, itemType });
  const revisionId = detail.draftRevisionId!;
  for (const [sectionKey, payload] of [
    ["overview", { description: name, uomId: UOM_ID, priorityId: null, surfaceIds: [], modeIds: [] }],
    ["quality", { parameters: [electricalCheck({ id: "legacy-check", label: "Legacy item-specific check" })] }]
  ] as const) {
    if (sectionKey === "quality" && options.configureQuality === false) continue;
    const section = await item.getSection(SUPER_ADMIN, detail.mainLineId, revisionId, sectionKey);
    await item.updateSection(SUPER_ADMIN, detail.mainLineId, revisionId, sectionKey, {
      expectedVersion: section.version, expectedAggregateVersion: detail.version, payload
    });
    detail = await item.getItem(SUPER_ADMIN, detail.mainLineId);
  }
  return item.activate(SUPER_ADMIN, detail.mainLineId, revisionId, { expectedVersion: detail.version });
}

function electricalCheck(overrides: Partial<KnowledgeQualityParameter> = {}): KnowledgeQualityParameter {
  return {
    id: "electrical-fixing-photos", type: "checkbox", label: "Are sampled electrical fixtures fixed correctly?",
    unit: null, allowedValues: [], minimum: null, maximum: null, defaultValue: null,
    required: true, category: "Installation", active: true,
    instructions: "Photograph the actual installed fixing points at the site.",
    acceptanceCriteria: "Fixings are secure and no exposed conductors are visible.",
    stage: "After installation", checkMethod: "visual", severity: "major", responsibleRole: "Site supervisor",
    failureAction: "Record the defect and reinspect after correction.",
    sampling: { method: "percentage", value: 10, unit: "installed electrical fixtures" },
    evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 1 }, ...overrides
  };
}

async function seedActor(actor: PublicUser) {
  await UserModel.create({
    _id: actor.id, name: actor.name, email: actor.email, emailNormalized: actor.email.toLowerCase(),
    passwordHash: "$2b$10$qualityOnlyHashNotUsedByAuthentication", role: actor.role, active: true,
    accountKind: "standard", version: 1, sessionVersion: 1, managerId: null, authorizedClientIds: []
  });
}

async function seedBasket(id: string, name: string, displayOrder: number) {
  await AiEstimatorKnowledgeBasketModel.create({
    _id: id, name, nameNormalized: name.toLowerCase(), displayOrder, status: "active", version: 1,
    createdById: SUPER_ADMIN.id, updatedById: SUPER_ADMIN.id, createdAt: NOW, updatedAt: NOW
  });
}

function nextId() { sequence += 1; return `quality-id-${sequence}`; }
