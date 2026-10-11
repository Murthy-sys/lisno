import { describe, expect, it } from "vitest";
import { mongo } from "mongoose";
import { hash, snapshotDigest } from "../src/operations/estimator-sync/canonical.js";
import type { BaselineEntry, PlannedWrite, SyncDocument, SyncSnapshot } from "../src/operations/estimator-sync/contracts.js";
import { validatePlannedIntegrity } from "../src/operations/estimator-sync/integrity.js";
import { SYNC_COLLECTIONS, SYNC_METADATA_COLLECTIONS, type SyncCollection } from "../src/operations/estimator-sync/manifest.js";
import { createKnowledgeContentDigest } from "../src/domain/ai-estimator-knowledge.js";
import { fixedGstRuleDocument, fixedGstVersionDocument } from "../src/domain/ai-estimator-knowledge-fixed-gst.js";
import { createKnowledgeRevisionDigest } from "../src/domain/ai-estimator-knowledge-completeness.js";

const C = { baskets: "aiEstimatorKnowledgeBaskets", lines: "aiEstimatorKnowledgeMainLines", revisions: "aiEstimatorKnowledgeRevisions", sections: "aiEstimatorKnowledgeSections", vendors: "aiEstimatorKnowledgeVendors", uoms: "aiEstimatorKnowledgeUoms", quality: "aiEstimatorKnowledgeBasketQualityRevisions" } as const;
const date = new Date("2026-10-10T00:00:00Z");
const base = { version: 1, createdById: "actor", updatedById: "actor", createdAt: date, updatedAt: date };
const named = { name: "item", nameNormalized: "item", displayOrder: 0, status: "active", archivedAt: null, archivedById: null };
function vendor(id: string, patch: Record<string, unknown> = {}): SyncDocument { return { _id: id, ...base, ...named, code: id, codeNormalized: id, name: id, nameNormalized: id, ...patch }; }
function fixture(role: "source" | "target", rows: Partial<Record<SyncCollection, SyncDocument[]>>): SyncSnapshot {
  const value: SyncSnapshot = { formatVersion: 1, role, identity: hash(role), databaseName: role === "target" ? "lisno_demo" : "source", collections: SYNC_COLLECTIONS.map(name => ({ name, exists: true, uuid: name, options: {}, indexes: [{ name: "_id_", key: { _id: 1 } }], documents: rows[name] ?? [] })), metadataCollections: SYNC_METADATA_COLLECTIONS.map(name => ({ name, exists: false, uuid: null, options: {}, indexes: [], documents: [] })), dependencies: { actorIds: ["actor"], availableStorageReferences: [] }, contentDigest: "" };
  value.contentDigest = snapshotDigest(value);
  return value;
}
function write(collection: SyncCollection, document: SyncDocument, before?: SyncDocument): PlannedWrite { return { collection, id: document._id, document, beforeHash: before ? hash(before) : null }; }
const codes = (result: ReturnType<typeof validatePlannedIntegrity>) => result.conflicts.map(row => row.code);
function graph(): Partial<Record<SyncCollection, SyncDocument[]>> {
  return {
    [C.baskets]: [{ _id: "basket", ...base, ...named }],
    [C.lines]: [{ _id: "line", ...base, ...named, status: "draft", basketId: "basket", itemType: "main_line", subBasketId: null, activeRevisionId: null, draftRevisionId: "revision" }],
    [C.revisions]: [{ _id: "revision", ...base, mainLineId: "line", revisionNumber: 1, sourceRevisionId: null, status: "draft", contentDigest: null, completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, activatedAt: null, activatedById: null, supersededAt: null, supersededById: null }],
    [C.sections]: [{ _id: "section", ...base, mainLineId: "line", revisionId: "revision", sectionKey: "overview", applicability: "not_configured", payload: {} }],
    [C.vendors]: [vendor("anchor")]
  };
}

describe("estimator sync planned integrity", () => {
  it("validates complete synthetic graph without creating Mongoose models", () => {
    const rows = graph();
    const source = fixture("source", rows);
    const target = fixture("target", rows);
    expect(validatePlannedIntegrity(source, target, [], [])).toEqual({ conflicts: [], warnings: [] });
  });
  it("blocks source parent-pointer changes that bypass a protected local section", () => {
    const rows = graph();
    const target = fixture("target", rows);
    const original = rows[C.lines]![0];
    const incoming = { ...original, draftRevisionId: null, version: 2 };
    const source = fixture("source", { ...rows, [C.lines]: [incoming] });
    const protectedChild: BaselineEntry = { collection: C.sections, id: "section", sourceHash: hash(rows[C.sections]![0]), appliedHash: hash(rows[C.sections]![0]), protection: "local", mainLineId: "line", revisionId: "revision" };
    expect(codes(validatePlannedIntegrity(source, target, [write(C.lines, incoming, original)], [protectedChild]))).toContain("PROTECTED_LOCAL_GRAPH");
    const deletedTarget = fixture("target", { ...rows, [C.sections]: [] });
    expect(codes(validatePlannedIntegrity(source, deletedTarget, [write(C.lines, incoming, original)], [{ ...protectedChild, protection: "deleted" }]))).toContain("PROTECTED_LOCAL_GRAPH");
  });
  it("blocks any incoming member of a graph with a protected local Main Line", () => {
    const rows = graph();
    const before = rows[C.sections]![0];
    const after = { ...before, applicability: "not_applicable", version: 2 };
    const result = validatePlannedIntegrity(fixture("source", { ...rows, [C.sections]: [after] }), fixture("target", rows), [write(C.sections, after, before)], [{ collection: C.lines, id: "line", sourceHash: hash(rows[C.lines]![0]), appliedHash: hash(rows[C.lines]![0]), protection: "local" }]);
    expect(codes(result)).toContain("PROTECTED_LOCAL_GRAPH");
  });
  it("requires parent CAS advancement for imported section changes", () => {
    const rows = graph();
    const before = rows[C.sections]![0];
    const after = { ...before, applicability: "not_applicable", version: 2 };
    expect(codes(validatePlannedIntegrity(fixture("source", { ...rows, [C.sections]: [after] }), fixture("target", rows), [write(C.sections, after, before)], []))).toContain("AGGREGATE_VERSION_NOT_ADVANCED");
    const line = { ...rows[C.lines]![0], version: 2 };
    const revision = { ...rows[C.revisions]![0], version: 2 };
    const advancedRows = { ...rows, [C.lines]: [line], [C.revisions]: [revision], [C.sections]: [after] };
    expect(validatePlannedIntegrity(fixture("source", advancedRows), fixture("target", rows), [write(C.lines, line, rows[C.lines]![0]), write(C.revisions, revision, rows[C.revisions]![0]), write(C.sections, after, before)], []).conflicts).toEqual([]);
  });
  it("preserves active revision/section history and validates its content digest", () => {
    const rows = graph();
    rows[C.lines]![0] = { ...rows[C.lines]![0], status: "active", activeRevisionId: "revision", draftRevisionId: null };
    rows[C.revisions]![0] = { ...rows[C.revisions]![0], status: "active", activatedAt: date, activatedById: "actor", contentDigest: createKnowledgeRevisionDigest({ mainLineId: "line", revisionNumber: 1, sections: [{ sectionKey: "overview", applicability: "not_configured", payload: {} }] }) };
    expect(validatePlannedIntegrity(fixture("source", rows), fixture("target", rows), [], []).conflicts).toEqual([]);
    const before = rows[C.sections]![0];
    const after = { ...before, applicability: "not_applicable", version: 2 };
    const result = validatePlannedIntegrity(fixture("source", { ...rows, [C.sections]: [after] }), fixture("target", rows), [write(C.sections, after, before)], []);
    expect(codes(result)).toContain("IMMUTABLE_ACTIVE_HISTORY_CHANGED");
    expect(codes(result)).toContain("SOURCE_REVISION_CONTENT_DIGEST_INVALID");
  });
  it("checks compound uniqueness across the proposed local/source union by stable ID", () => {
    const before = vendor("test-pop", { name: "Duplicate", nameNormalized: "duplicate" });
    const incoming = vendor("remote", { name: "Duplicate", nameNormalized: "duplicate" });
    const source = fixture("source", { [C.vendors]: [incoming] });
    const target = fixture("target", { [C.vendors]: [before] });
    target.collections.find(row => row.name === C.vendors)!.indexes.push({ name: "name-unique", key: { nameNormalized: 1 }, unique: true, partialFilterExpression: { status: { $in: ["active", "inactive"] } } });
    expect(codes(validatePlannedIntegrity(source, target, [write(C.vendors, incoming)], []))).toContain("UNIQUE_KEY_COLLISION");
    incoming.status = "archived"; incoming.archivedAt = date; incoming.archivedById = "actor";
    expect(codes(validatePlannedIntegrity(source, target, [write(C.vendors, incoming)], []))).not.toContain("UNIQUE_KEY_COLLISION");
  });
  it.each([
    { partialFilterExpression: { status: { $regex: ".*" } } },
    { collation: { locale: "en", strength: 2 } },
    { key: { nameNormalized: "hashed" } }
  ])("fails closed for unknown unique-index semantics %#", patch => {
    const source = fixture("source", { [C.vendors]: [vendor("incoming")] });
    const target = fixture("target", { [C.vendors]: [vendor("local")] });
    target.collections.find(row => row.name === C.vendors)!.indexes.push({ name: "unsupported", key: { nameNormalized: 1 }, unique: true, ...patch });
    expect(codes(validatePlannedIntegrity(source, target, [], []))).toContain("UNSUPPORTED_UNIQUE_INDEX");
  });
  it("treats numeric index key types consistently while retaining typed document equality", () => {
    const source = fixture("source", { [C.vendors]: [vendor("incoming", { displayOrder: mongo.BSON.Long.fromNumber(1) })] });
    const target = fixture("target", { [C.vendors]: [vendor("local", { displayOrder: new mongo.BSON.Int32(1) })] });
    target.collections.find(row => row.name === C.vendors)!.indexes.push({ name: "order-unique", key: { displayOrder: new mongo.BSON.Int32(1) }, unique: true });
    expect(codes(validatePlannedIntegrity(source, target, [write(C.vendors, source.collections.find(row => row.name === C.vendors)!.documents[0])], []))).toContain("UNIQUE_KEY_COLLISION");
  });
  it("blocks immutable owner changes even when both parents are valid", () => {
    const rows = graph();
    rows[C.baskets]!.push({ ...rows[C.baskets]![0], _id: "other-basket", name: "other", nameNormalized: "other" });
    const before = rows[C.lines]![0];
    const after = { ...before, basketId: "other-basket", version: 2 };
    expect(codes(validatePlannedIntegrity(fixture("source", { ...rows, [C.lines]: [after] }), fixture("target", rows), [write(C.lines, after, before)], []))).toContain("IMMUTABLE_FIELD_CHANGED");
  });
  it("does not mutate append-only quality snapshots", () => {
    const rows = graph();
    const before = { _id: "quality", basketId: "basket", revisionNumber: 1, parameters: [], contentDigest: createKnowledgeContentDigest({ basketId: "basket", parameters: [] }), createdById: "actor", createdAt: date };
    rows[C.quality] = [before];
    const after = { ...before, revisionNumber: 2 };
    expect(codes(validatePlannedIntegrity(fixture("source", { ...rows, [C.quality]: [after] }), fixture("target", rows), [write(C.quality, after, before)], []))).toContain("IMMUTABLE_DOCUMENT_CHANGED");
  });
  it("reports pre-existing local orphan records but rejects newly imported and worsened orphans", () => {
    const source = fixture("source", { [C.vendors]: [vendor("anchor")] });
    const orphan: SyncDocument = { _id: "orphan", ...base, name: "orphan", nameNormalized: "orphan", displayOrder: 0, basketId: "missing-parent" };
    const collection: SyncCollection = "aiEstimatorKnowledgeSubBaskets";
    const target = fixture("target", { [collection]: [orphan] });
    const unchanged = validatePlannedIntegrity(source, target, [], []);
    expect(unchanged.conflicts).toEqual([]);
    expect(unchanged.warnings.map(row => row.code)).toContain("PREEXISTING_REFERENCE_MISSING");
    const changed = { ...orphan, basketId: "other-missing-parent", version: 2 };
    expect(codes(validatePlannedIntegrity(source, target, [write(collection, changed, orphan)], []))).toContain("REFERENCE_MISSING");
  });
  it("requires imported actor and storage references to exist locally", () => {
    const incoming = vendor("incoming", { createdById: "production-only-actor", geoTaggedPicture: { id: "photo", storageReference: "fixture-private-key", originalFilename: "fixture.jpg", mimeType: "image/jpeg", byteSize: 10, sha256: hash("photo"), uploadedAt: date.toISOString(), uploadedById: "actor" } });
    const source = fixture("source", { [C.vendors]: [incoming] });
    const target = fixture("target", {});
    const result = validatePlannedIntegrity(source, target, [write(C.vendors, incoming)], []);
    expect(codes(result)).toContain("ACTOR_REFERENCE_MISSING");
    expect(codes(result)).toContain("STORAGE_REFERENCE_MISSING");
    expect(JSON.stringify(result)).not.toContain("fixture-private-key");
    expect(JSON.stringify(result)).not.toContain("production-only-actor");
  });
  it("accepts documented system GST lineage only for exact canonical rows", () => {
    const rule = fixedGstRuleDocument(date) as SyncDocument;
    const version = fixedGstVersionDocument(date) as SyncDocument;
    const source = fixture("source", { aiEstimatorKnowledgeTaxRules: [rule], aiEstimatorKnowledgeTaxVersions: [version] });
    const target = fixture("target", {});
    const writes = [write("aiEstimatorKnowledgeTaxRules", rule), write("aiEstimatorKnowledgeTaxVersions", version)];
    expect(validatePlannedIntegrity(source, target, writes, []).conflicts).toEqual([]);
    const impostor = vendor("impostor", { createdById: rule.createdById });
    expect(codes(validatePlannedIntegrity(fixture("source", { [C.vendors]: [impostor] }), target, [write(C.vendors, impostor)], []))).toContain("ACTOR_REFERENCE_MISSING");
  });
  it("blocks overlapping active financial windows", () => {
    const rule = fixedGstRuleDocument(date) as SyncDocument;
    const version = fixedGstVersionDocument(date) as SyncDocument;
    const second = { ...version, _id: "second-tax-version", versionNumber: 2, createdById: "actor", updatedById: "actor" };
    const source = fixture("source", { aiEstimatorKnowledgeTaxRules: [rule], aiEstimatorKnowledgeTaxVersions: [version, second] });
    expect(codes(validatePlannedIntegrity(source, fixture("target", {}), [], []))).toContain("SOURCE_ACTIVE_FINANCIAL_WINDOWS_OVERLAP");
  });
  it("rejects wrong-parent revision pointers and malformed domain section payloads", () => {
    const rows = graph();
    rows[C.lines]![0].draftRevisionId = "revision";
    rows[C.revisions]![0].mainLineId = "other-line";
    rows[C.sections]![0].payload = { unexpectedPayload: true };
    const result = validatePlannedIntegrity(fixture("source", rows), fixture("target", {}), [], []);
    expect(codes(result)).toContain("SOURCE_REVISION_POINTER_INVALID");
    expect(codes(result)).toContain("SOURCE_SCHEMA_INVALID");
  });
  it("blocks UOM scale and vendor rubric changes requiring excluded side effects", () => {
    const originalUom = { _id: "uom", ...base, ...named, code: "uom", codeNormalized: "uom", decimalScale: 2 };
    const updatedUom = { ...originalUom, decimalScale: 3, version: 2 };
    const originalVendor = vendor("vendor", { kpiRubricGeneration: 0 });
    const updatedVendor = { ...originalVendor, kpiRubricGeneration: 1, version: 2 };
    const result = validatePlannedIntegrity(fixture("source", { [C.uoms]: [updatedUom], [C.vendors]: [updatedVendor] }), fixture("target", { [C.uoms]: [originalUom], [C.vendors]: [originalVendor] }), [write(C.uoms, updatedUom, originalUom), write(C.vendors, updatedVendor, originalVendor)], []);
    expect(result.conflicts.filter(row => row.code === "EXCLUDED_SIDE_EFFECT_REQUIRED")).toHaveLength(2);
  });
  it("rejects writes into missing target collections instead of implicitly creating unindexed data", () => {
    const source = fixture("source", { [C.vendors]: [vendor("incoming")] });
    const target = fixture("target", {});
    target.collections.find(row => row.name === C.vendors)!.exists = false;
    expect(codes(validatePlannedIntegrity(source, target, [write(C.vendors, vendor("incoming"))], []))).toContain("TARGET_COLLECTION_ABSENT");
  });
});
