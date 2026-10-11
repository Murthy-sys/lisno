import { mongo } from "mongoose";
import { AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES, AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES, AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES, AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES, AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY, AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES, createKnowledgeContentDigest, createKnowledgePriceScopeKey, normalizeKnowledgeIdentity, type KnowledgeSectionKey } from "../../domain/ai-estimator-knowledge.js";
import { validateKnowledgeSectionPayload } from "../../domain/ai-estimator-knowledge-validation.js";
import { isKnowledgeQualityControlOptionReference, normalizeKnowledgeQualityControlOptionName } from "../../domain/ai-estimator-knowledge-quality-control-option.js";
import { AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS } from "../../domain/ai-estimator-knowledge-priority.js";
import { AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID, isExactFixedGstRule, isExactFixedGstVersion } from "../../domain/ai-estimator-knowledge-fixed-gst.js";
import { createKnowledgeRevisionDigest } from "../../domain/ai-estimator-knowledge-completeness.js";
import { canonical, hash, opaqueReference, safeInteger } from "./canonical.js";
import type { BaselineEntry, PlannedWrite, SyncConflict, SyncDocument, SyncSnapshot } from "./contracts.js";
import { IMMUTABLE_COLLECTIONS, SEQUENCE_COLLECTION, SYNC_COLLECTIONS, type SyncCollection } from "./manifest.js";

type Row = Record<string, unknown>;
type Dataset = Map<SyncCollection, Map<string, SyncDocument>>;
interface Issue extends SyncConflict { collection: SyncCollection; id: string; detail: string }
const C = {
  baskets: "aiEstimatorKnowledgeBaskets", quality: "aiEstimatorKnowledgeBasketQualityRevisions", lines: "aiEstimatorKnowledgeMainLines", revisions: "aiEstimatorKnowledgeRevisions", sections: "aiEstimatorKnowledgeSections", prices: "aiEstimatorKnowledgePriceVersions", taxes: "aiEstimatorKnowledgeTaxRules", taxVersions: "aiEstimatorKnowledgeTaxVersions", vendors: "aiEstimatorKnowledgeVendors", uoms: "aiEstimatorKnowledgeUoms", subBaskets: "aiEstimatorKnowledgeSubBaskets", options: "aiEstimatorKnowledgeQualityControlOptions", modes: "aiEstimatorKnowledgeModes", priorities: "aiEstimatorKnowledgePriorities", surfaces: "aiEstimatorKnowledgeSurfaces"
} as const satisfies Record<string, SyncCollection>;
const masterCollections = new Set<SyncCollection>([C.vendors, C.uoms, C.modes, C.priorities, C.surfaces, C.taxes]);
const common = ["_id", "createdById", "updatedById", "createdAt", "updatedAt", "version"];
const named = ["name", "nameNormalized", "description", "displayOrder", "dependencyEpoch"];
const archive = ["status", "archivedAt", "archivedById"];
const fields: Record<SyncCollection, string[]> = {
  [C.baskets]: [...common, ...named, ...archive, "qualityRevisionId"],
  [C.quality]: ["_id", "basketId", "revisionNumber", "parameters", "contentDigest", "createdById", "createdAt"],
  aiEstimatorKnowledgeDisplayOrderSequences: ["_id", "highWaterOrder", "createdAt", "updatedAt"],
  [C.lines]: [...common, ...named, ...archive, "basketId", "itemType", "subBasketId", "activeRevisionId", "draftRevisionId", "deactivatedAt", "deactivatedById"],
  [C.modes]: [...common, ...named, ...archive, "code", "codeNormalized"],
  [C.prices]: [...common, "mainLineId", "revisionId", "priceEntryId", "scopeKey", "versionNumber", "vendorId", "uomId", "specificationId", "modeId", "taxRuleId", "taxVersionId", "currency", "treatment", "inputAmountPaise", "baseAmountPaise", "taxAmountPaise", "totalAmountPaise", "effectiveFrom", "effectiveTo", "status", "reviewRequired"],
  [C.priorities]: [...common, ...named, ...archive, "code", "codeNormalized", "semanticTier"],
  [C.options]: [...common, "kind", "name", "normalizedName"],
  [C.revisions]: [...common, "mainLineId", "revisionNumber", "status", "sourceRevisionId", "contentDigest", "completeness", "activatedAt", "activatedById", "supersededAt", "supersededById"],
  [C.sections]: [...common, "mainLineId", "revisionId", "sectionKey", "applicability", "payload"],
  [C.subBaskets]: [...common, "basketId", "name", "nameNormalized", "displayOrder", "dependencyEpoch"],
  [C.surfaces]: [...common, ...named, ...archive, "code", "codeNormalized"],
  [C.taxes]: [...common, ...named, ...archive, "code", "codeNormalized"],
  [C.taxVersions]: [...common, "taxRuleId", "versionNumber", "rateBps", "treatment", "applicability", "effectiveFrom", "effectiveTo", "status"],
  [C.uoms]: [...common, ...named, ...archive, "code", "codeNormalized", "decimalScale"],
  [C.vendors]: [...common, ...named, ...archive, "code", "codeNormalized", "kpiRubricGeneration", "procurementProfile", "geoTaggedPicture", "msmeCertificate"]
};
const relationFields: Record<string, SyncCollection> = { basketId: C.baskets, mainBasketId: C.baskets, mainBasketIds: C.baskets, targetBasketId: C.baskets, subBasketId: C.subBaskets, subBasketIds: C.subBaskets, targetSubBasketId: C.subBaskets, mainLineId: C.lines, targetMainLineId: C.lines, revisionId: C.revisions, activeRevisionId: C.revisions, draftRevisionId: C.revisions, sourceRevisionId: C.revisions, vendorId: C.vendors, vendorIds: C.vendors, uomId: C.uoms, uomIds: C.uoms, modeId: C.modes, modeIds: C.modes, surfaceId: C.surfaces, surfaceIds: C.surfaces, priorityId: C.priorities, taxRuleId: C.taxes, taxVersionId: C.taxVersions, priceVersionId: C.prices, effectivePriceVersionId: C.prices, qualityRevisionId: C.quality };
const object = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !("_bsontype" in value);
const text = (value: unknown, max = 240) => typeof value === "string" && value.length > 0 && value.length <= max;
const date = (value: unknown) => value instanceof Date && Number.isFinite(value.getTime());
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => { const number = safeInteger(value); return number !== null && number >= min && number <= max; };
const enumeration = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
const optional = (value: unknown) => value === undefined || value === null;
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const oneOf = (collection: SyncCollection, values: readonly SyncCollection[]) => values.includes(collection);
const recordKey = (collection: SyncCollection, id: string) => JSON.stringify([collection, id]);

/** Validators consume JS numbers; snapshots and persisted payloads retain their BSON numeric types. */
function domainValue(value: unknown): unknown {
  if (value instanceof mongo.BSON.Double) return value.valueOf();
  if (value instanceof mongo.BSON.Int32 || value instanceof mongo.BSON.Long) return safeInteger(value) ?? Number.NaN;
  if (Array.isArray(value)) return value.map(domainValue);
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, domainValue(child)]));
  return value;
}
function dataset(snapshot: SyncSnapshot): Dataset {
  return new Map(SYNC_COLLECTIONS.map(name => [name, new Map((snapshot.collections.find(row => row.name === name)?.documents ?? []).map(row => [row._id, row]))]));
}
function makeIssue(code: string, collection: SyncCollection, id: string, detail = ""): Issue {
  return { code, collection, id, detail, reference: opaqueReference(collection, id) };
}
function publicIssue({ code, collection, reference }: Issue): SyncConflict { return { code, collection, reference }; }

function validProfile(value: unknown): boolean {
  if (!object(value)) return false;
  const allowed = ["organizationType", "bankAccount", "vendorType", "executionType", "supplier", "nameOfRepresentative", "position", "gstRegistered", "msmeRegistered", "gstNumber", "turnoverSelfDeclaredPaise", "turnoverVerifiedPaise", "reference", "workProfile", "email", "phoneNumber", "address", "aadhar", "pan", "currentAddress", "currentAddressVerifiedPhysically", "mainBasketIds", "subBasketIds", "mainBasketId", "subBasketId", "physicalAddressVerifiedAt", "physicalAddressVerifiedById"];
  if (Object.keys(value).some(field => !allowed.includes(field)) || !enumeration(value.vendorType, ["execution", "supplier"]) ||
    !["nameOfRepresentative", "position", "mainBasketId", "subBasketId"].every(field => text(value[field])) ||
    !["workProfile", "address", "currentAddress"].every(field => text(value[field], 4000)) || !text(value.email, 320) || !text(value.phoneNumber, 64) ||
    !["gstRegistered", "msmeRegistered", "currentAddressVerifiedPhysically"].every(field => typeof value[field] === "boolean") ||
    !integer(value.turnoverSelfDeclaredPaise) || (!optional(value.turnoverVerifiedPaise) && !integer(value.turnoverVerifiedPaise)) ||
    typeof value.aadhar !== "string" || !/^\d{12}$/u.test(value.aadhar) || typeof value.pan !== "string" || !/^[A-Z]{5}\d{4}[A-Z]$/u.test(value.pan)) return false;
  if (value.vendorType === "execution" && (!Array.isArray(value.executionType) || !value.executionType.length || value.executionType.length > 2 || new Set(value.executionType).size !== value.executionType.length || !value.executionType.every(item => ["labor", "material_labour"].includes(item)) || !optional(value.supplier))) return false;
  if (value.vendorType === "supplier" && (typeof value.supplier !== "boolean" || !optional(value.executionType))) return false;
  if (value.currentAddressVerifiedPhysically !== (typeof value.physicalAddressVerifiedAt === "string" && typeof value.physicalAddressVerifiedById === "string")) return false;
  if (!optional(value.organizationType) && !enumeration(value.organizationType, ["individual", "company", "firm", "associated_person", "huf", "trust", "govt"])) return false;
  if (!optional(value.bankAccount)) {
    const bank = value.bankAccount;
    if (!object(bank) || Object.keys(bank).some(field => !["accountHolderName", "bankName", "accountNumber", "ifscCode", "branchName"].includes(field)) || !text(bank.accountHolderName) || !text(bank.bankName) || typeof bank.accountNumber !== "string" || !/^[0-9]{1,34}$/u.test(bank.accountNumber) || typeof bank.ifscCode !== "string" || !/^[A-Z]{4}0[A-Z0-9]{6}$/u.test(bank.ifscCode) || (!optional(bank.branchName) && !text(bank.branchName))) return false;
  }
  if (!!value.mainBasketIds !== !!value.subBasketIds) return false;
  for (const [plural, singular, max] of [["mainBasketIds", "mainBasketId", 100], ["subBasketIds", "subBasketId", 500]] as const) {
    const ids = value[plural];
    if (ids !== undefined && (!Array.isArray(ids) || ids.length < 1 || ids.length > max || new Set(ids).size !== ids.length || !ids.every(id => text(id, 128)) || !ids.includes(value[singular]))) return false;
  }
  return true;
}

function schemaIssues(collection: SyncCollection, document: SyncDocument): Issue[] {
  const issues: Issue[] = [];
  const fail = (detail: string) => issues.push(makeIssue("SCHEMA_INVALID", collection, document._id, detail));
  if (Object.keys(document).some(field => !fields[collection].includes(field))) fail("unknown-field");
  if (!text(document._id, 512)) fail("id");
  if (collection === SEQUENCE_COLLECTION) {
    if (!integer(document.highWaterOrder) || !(document._id === "baskets" || /^(main-lines|sub-baskets):.+$/u.test(document._id) || /^masters:(uoms|vendors|taxes|priorities|surfaces|modes)$/u.test(document._id))) fail("sequence");
    for (const field of ["createdAt", "updatedAt"]) if (document[field] !== undefined && !date(document[field])) fail(field);
    return issues;
  }
  if (!text(document.createdById, 512) || !date(document.createdAt)) fail("created-metadata");
  if (collection !== C.quality && (!text(document.updatedById, 512) || !date(document.updatedAt) || !integer(document.version, 1))) fail("updated-metadata");
  if (document.dependencyEpoch !== undefined && !integer(document.dependencyEpoch)) fail("dependencyEpoch");
  if (masterCollections.has(collection) || oneOf(collection, [C.baskets, C.lines, C.subBaskets])) {
    if (!text(document.name) || document.nameNormalized !== normalizeKnowledgeIdentity(String(document.name)) || document.name !== String(document.name).normalize("NFKC").trim().replace(/\s+/gu, " ") || !integer(document.displayOrder)) fail("named-record");
    if (!optional(document.description) && (typeof document.description !== "string" || document.description.length > 4000)) fail("description");
    if (masterCollections.has(collection) && (!text(document.code, 64) || document.codeNormalized !== normalizeKnowledgeIdentity(String(document.code)))) fail("code");
    if (collection !== C.subBaskets) {
      if (!enumeration(document.status, collection === C.lines ? AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES : AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES)) fail("status");
      const archived = document.status === "archived";
      if (archived !== date(document.archivedAt) || archived !== (typeof document.archivedById === "string")) fail("archive-metadata");
    }
  }
  if (collection === C.uoms && !integer(document.decimalScale, 0, 3)) fail("decimalScale");
  if (collection === C.priorities && document.semanticTier !== undefined && !enumeration(document.semanticTier, AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS)) fail("semanticTier");
  if (collection === C.vendors) {
    if (document.kpiRubricGeneration !== undefined && !integer(document.kpiRubricGeneration)) fail("kpiRubricGeneration");
    if (document.procurementProfile !== undefined && !validProfile(domainValue(document.procurementProfile))) fail("procurementProfile");
    for (const field of ["geoTaggedPicture", "msmeCertificate"]) {
      const upload = document[field];
      if (optional(upload)) continue;
      if (!object(upload) || Object.keys(upload).some(key => !["id", "storageReference", "originalFilename", "mimeType", "byteSize", "sha256", "uploadedAt", "uploadedById"].includes(key)) || !text(upload.id) || !text(upload.storageReference, 4096) || !text(upload.originalFilename, 255) || !integer(upload.byteSize, 1) || typeof upload.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(upload.sha256) || !text(upload.uploadedAt) || !text(upload.uploadedById) || !enumeration(upload.mimeType, field === "msmeCertificate" ? ["application/pdf", "image/jpeg", "image/png", "image/webp"] : ["image/jpeg", "image/png", "image/webp"])) fail(field);
    }
  }
  const requiredRelations: Partial<Record<SyncCollection, string[]>> = { [C.lines]: ["basketId"], [C.subBaskets]: ["basketId"], [C.quality]: ["basketId"], [C.revisions]: ["mainLineId"], [C.sections]: ["mainLineId", "revisionId"], [C.prices]: ["mainLineId", "revisionId", "vendorId", "uomId", "taxRuleId", "taxVersionId"], [C.taxVersions]: ["taxRuleId"] };
  for (const field of requiredRelations[collection] ?? []) if (!text(document[field], 512)) fail(field);
  if (collection === C.lines && document.itemType !== undefined && !enumeration(document.itemType, ["main_line", "temporary"])) fail("itemType");
  if (collection === C.sections) {
    if (!enumeration(document.sectionKey, AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS) || !enumeration(document.applicability, AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY)) fail("section-envelope");
    else if (validateKnowledgeSectionPayload(document.sectionKey as KnowledgeSectionKey, domainValue(document.payload)).length) fail("section-payload");
  }
  if (collection === C.quality) {
    if (!integer(document.revisionNumber, 1) || validateKnowledgeSectionPayload("quality", domainValue({ parameters: document.parameters })).length || document.contentDigest !== createKnowledgeContentDigest(domainValue({ basketId: document.basketId, parameters: document.parameters }))) fail("quality-snapshot");
  }
  if (collection === C.options) {
    if (!isKnowledgeQualityControlOptionReference(document._id) || !enumeration(document.kind, ["frequency", "performer"]) || !text(document.name, 80) || safeInteger(document.version) !== 1 || document.normalizedName !== normalizeKnowledgeQualityControlOptionName(String(document.name)).normalizedName) fail("quality-option");
  }
  if (collection === C.revisions) {
    const activated = date(document.activatedAt) && text(document.activatedById, 512);
    const superseded = date(document.supersededAt) && text(document.supersededById, 512);
    if (!integer(document.revisionNumber, 1) || !enumeration(document.status, AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES) || (document.status === "draft" && (activated || superseded)) || (document.status === "active" && (!activated || superseded)) || (document.status === "superseded" && (!activated || !superseded)) || (document.status !== "draft" && (typeof document.contentDigest !== "string" || !/^[a-f0-9]{64}$/u.test(document.contentDigest)))) fail("revision-lifecycle");
    for (const prefix of ["activated", "superseded"]) {
      const timestamp = document[`${prefix}At`];
      const actor = document[`${prefix}ById`];
      if (optional(timestamp) !== optional(actor) || (!optional(timestamp) && !date(timestamp)) || (!optional(actor) && !text(actor, 512))) fail(`${prefix}-metadata`);
    }
    const completeness = document.completeness;
    if (!object(completeness) || !integer(completeness.percentage, 0, 100) || !["sections", "blockers", "warnings"].every(field => Array.isArray(completeness[field]))) fail("completeness");
    else {
      const sections = completeness.sections as unknown[];
      if (sections.some(section => !object(section) || !enumeration(section.sectionKey, AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS) || !enumeration(section.state, AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES) || !Array.isArray(section.findings))) fail("completeness-sections");
      const findings = [...completeness.blockers as unknown[], ...completeness.warnings as unknown[], ...sections.flatMap(section => object(section) && Array.isArray(section.findings) ? section.findings : [])];
      if (findings.some(finding => !object(finding) || Object.keys(finding).some(field => !["code", "sectionKey", "message", "blocking"].includes(field)) || !text(finding.code, 96) || !enumeration(finding.sectionKey, AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS) || !text(finding.message, 500) || typeof finding.blocking !== "boolean")) fail("completeness-findings");
    }
  }
  if (collection === C.prices || collection === C.taxVersions) {
    if (!integer(document.versionNumber, 1) || !enumeration(document.status, AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES) || !enumeration(document.treatment, ["exclusive", "inclusive"]) || !date(document.effectiveFrom) || (!optional(document.effectiveTo) && (!date(document.effectiveTo) || (document.effectiveFrom as Date).getTime() >= (document.effectiveTo as Date).getTime()))) fail("financial-window");
    if (collection === C.taxVersions && (!integer(document.rateBps, 0, 100_000) || !text(document.applicability))) fail("tax-version");
    if (collection === C.prices) {
      const moneyFields = ["inputAmountPaise", "baseAmountPaise", "taxAmountPaise", "totalAmountPaise"];
      if (!moneyFields.every(field => integer(document[field])) || document.currency !== "INR" || typeof document.reviewRequired !== "boolean" || !text(document.priceEntryId, 512)) fail("price-version");
      else if (BigInt(safeInteger(document.baseAmountPaise)!) + BigInt(safeInteger(document.taxAmountPaise)!) !== BigInt(safeInteger(document.totalAmountPaise)!) || (document.treatment === "exclusive" ? safeInteger(document.inputAmountPaise) !== safeInteger(document.baseAmountPaise) : safeInteger(document.inputAmountPaise) !== safeInteger(document.totalAmountPaise))) fail("price-arithmetic");
      if (document.scopeKey !== createKnowledgePriceScopeKey({ vendorId: String(document.vendorId), uomId: String(document.uomId), specificationId: document.specificationId ?? null, modeId: document.modeId ?? null })) fail("price-scope");
    }
  }
  return issues;
}

function visit(value: unknown, callback: (field: string, child: unknown, path: string) => void, path = "", depth = 0): void {
  if (depth > 20) return;
  if (Array.isArray(value)) { value.forEach((child, index) => visit(child, callback, `${path}.${index}`, depth + 1)); return; }
  if (!object(value)) return;
  for (const [field, child] of Object.entries(value)) {
    callback(field, child, `${path}.${field}`);
    visit(child, callback, `${path}.${field}`, depth + 1);
  }
}

function graphIssues(data: Dataset, dependencies?: SyncSnapshot["dependencies"]): Issue[] {
  const issues: Issue[] = [];
  const actors = new Set(dependencies?.actorIds);
  const files = new Set(dependencies?.availableStorageReferences);
  const sectionsByRevision = new Map<string, SyncDocument[]>();
  for (const section of data.get(C.sections)!.values()) sectionsByRevision.set(section.revisionId, [...sectionsByRevision.get(section.revisionId) ?? [], section]);
  for (const [collection, rows] of data) for (const row of rows.values()) {
    const issue = (code: string, detail: string) => issues.push(makeIssue(code, collection, row._id, detail));
    visit(row, (field, value, path) => {
      if (optional(value)) return;
      const relation = relationFields[field];
      if (relation) for (const id of Array.isArray(value) ? value : [value]) if (typeof id !== "string" || !data.get(relation)!.has(id)) issue("REFERENCE_MISSING", `${path}:${hash(id)}`);
      const fixedGstActor = value === AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID &&
        ((collection === C.taxes && isExactFixedGstRule(domainValue(row) as Row)) || (collection === C.taxVersions && isExactFixedGstVersion(domainValue(row) as Row)));
      if (dependencies && field.endsWith("ById") && (typeof value !== "string" || (!actors.has(value) && !fixedGstActor))) issue("ACTOR_REFERENCE_MISSING", `${path}:${hash(value)}`);
      if (dependencies && field === "storageReference" && (typeof value !== "string" || !files.has(value))) issue("STORAGE_REFERENCE_MISSING", `${path}:${hash(value)}`);
      if (typeof value === "string" && isKnowledgeQualityControlOptionReference(value)) {
        const option = data.get(C.options)!.get(value);
        const kind = field === "responsibleRole" ? "performer" : field === "unit" ? "frequency" : null;
        if (kind && (!option || option.kind !== kind)) issue("QUALITY_OPTION_REFERENCE_INVALID", `${path}:${hash(value)}`);
      }
    });
    if (collection === C.lines) {
      for (const [field, status] of [["draftRevisionId", "draft"], ["activeRevisionId", "active"]]) {
        const revision = data.get(C.revisions)!.get(row[field]);
        if (revision && (revision.mainLineId !== row._id || revision.status !== status)) issue("REVISION_POINTER_INVALID", field);
      }
      const subBasket = data.get(C.subBaskets)!.get(row.subBasketId);
      if (subBasket && subBasket.basketId !== row.basketId) issue("PARENT_OWNERSHIP_INVALID", "subBasketId");
      if (row.status === "active" && !row.activeRevisionId) issue("REVISION_POINTER_INVALID", "active-without-revision");
    }
    if (oneOf(collection, [C.sections, C.prices])) {
      const revision = data.get(C.revisions)!.get(row.revisionId);
      if (revision && revision.mainLineId !== row.mainLineId) issue("PARENT_OWNERSHIP_INVALID", "revisionId");
    }
    if (collection === C.revisions && row.sourceRevisionId) {
      const original = data.get(C.revisions)!.get(row.sourceRevisionId);
      if (original && (original.mainLineId !== row.mainLineId || (safeInteger(original.revisionNumber) ?? 0) >= (safeInteger(row.revisionNumber) ?? 0))) issue("REVISION_LINEAGE_INVALID", "sourceRevisionId");
    }
    if (collection === C.revisions) {
      const line = data.get(C.lines)!.get(row.mainLineId);
      if ((row.status === "draft" && line && line.draftRevisionId !== row._id) || (row.status === "active" && line && line.activeRevisionId !== row._id)) issue("REVISION_POINTER_INVALID", "unpointed-current-revision");
      if (row.status !== "draft" && integer(row.revisionNumber, 1)) {
        const sections = (sectionsByRevision.get(row._id) ?? []).map(section => ({ sectionKey: section.sectionKey, applicability: section.applicability, payload: domainValue(section.payload) }));
        const expected = createKnowledgeRevisionDigest({ mainLineId: row.mainLineId, revisionNumber: safeInteger(row.revisionNumber)!, sections });
        if (row.contentDigest !== expected) issue("REVISION_CONTENT_DIGEST_INVALID", "sections");
      }
    }
    if (collection === C.baskets && row.qualityRevisionId) {
      if (data.get(C.quality)!.get(row.qualityRevisionId)?.basketId !== row._id) issue("PARENT_OWNERSHIP_INVALID", "qualityRevisionId");
    }
    if (collection === C.prices) {
      const tax = data.get(C.taxVersions)!.get(row.taxVersionId);
      if (tax && tax.taxRuleId !== row.taxRuleId) issue("PARENT_OWNERSHIP_INVALID", "taxVersionId");
    }
    if (collection === C.sections || collection === C.prices) {
      const revisionId = row.revisionId;
      const pricing = sectionsByRevision.get(revisionId)?.find(section => section.sectionKey === "pricing");
      const specifications = object(pricing?.payload) && Array.isArray(pricing.payload.specifications) ? pricing.payload.specifications : [];
      const specificationIds = new Set(specifications.filter(object).map(specification => specification.id));
      visit(collection === C.sections ? row.payload : row, (field, value, path) => {
        if ((field === "specificationId" || field === "specificationIds") && !optional(value)) for (const id of Array.isArray(value) ? value : [value]) if (!specificationIds.has(id)) issue("SPECIFICATION_REFERENCE_MISSING", `${path}:${hash(id)}`);
        if (field === "priceVersionId" && typeof value === "string") {
          const price = data.get(C.prices)!.get(value);
          if (price && price.revisionId !== revisionId) issue("PARENT_OWNERSHIP_INVALID", `${path}:${hash(value)}`);
        }
      });
    }
    if (collection === C.vendors && object(row.procurementProfile)) {
      const profile = row.procurementProfile;
      const mains = Array.isArray(profile.mainBasketIds) ? profile.mainBasketIds : [profile.mainBasketId];
      const subs = Array.isArray(profile.subBasketIds) ? profile.subBasketIds : [profile.subBasketId];
      for (const id of subs) {
        const sub = data.get(C.subBaskets)!.get(String(id));
        if (sub && !mains.includes(sub.basketId)) issue("PARENT_OWNERSHIP_INVALID", `procurementProfile:${hash(id)}`);
      }
    }
  }
  for (const collection of [C.taxVersions, C.prices]) {
    const groups = new Map<string, SyncDocument[]>();
    for (const row of data.get(collection)!.values()) if (row.status === "active" && date(row.effectiveFrom) && (optional(row.effectiveTo) || date(row.effectiveTo))) {
      const scope = collection === C.taxVersions ? hash([row.taxRuleId]) : hash([row.revisionId, row.scopeKey]);
      groups.set(scope, [...groups.get(scope) ?? [], row]);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => (a.effectiveFrom as Date).getTime() - (b.effectiveFrom as Date).getTime() || a._id.localeCompare(b._id));
      let latestEnd = -Infinity;
      for (const row of rows) {
        if ((row.effectiveFrom as Date).getTime() < latestEnd) issues.push(makeIssue("ACTIVE_FINANCIAL_WINDOWS_OVERLAP", collection, row._id));
        latestEnd = Math.max(latestEnd, row.effectiveTo instanceof Date ? row.effectiveTo.getTime() : Infinity);
      }
    }
  }
  return issues;
}

function atPath(document: Row, path: string): unknown {
  let value: unknown = document;
  for (const part of path.split(".")) { if (!object(value)) return undefined; value = value[part]; }
  return value;
}
/** Only the predicate forms present in our index inventory are accepted. Unknown semantics fail closed. */
function matches(document: Row, filter: unknown): boolean {
  if (!object(filter)) throw new Error("unsupported");
  return Object.entries(filter).map(([path, expression]) => {
    if (path.startsWith("$")) {
      if (!["$and", "$or"].includes(path) || !Array.isArray(expression) || !expression.length) throw new Error("unsupported");
      const values = expression.map(child => matches(document, child));
      return path === "$and" ? values.every(Boolean) : values.some(Boolean);
    }
    const value = atPath(document, path);
    if (!object(expression)) return indexValue(value) === indexValue(expression);
    return Object.entries(expression).map(([operator, operand]) => {
      if (operator === "$in" && Array.isArray(operand) && operand.every(item => !object(item) && !Array.isArray(item))) return operand.some(item => indexValue(item) === indexValue(value));
      if (operator === "$eq" && !object(operand) && !Array.isArray(operand)) return indexValue(value) === indexValue(operand);
      if (operator === "$exists" && typeof operand === "boolean") return (value !== undefined) === operand;
      if (operator === "$type" && operand === "string") return typeof value === "string";
      throw new Error("unsupported");
    }).every(Boolean);
  }).every(Boolean);
}
function indexValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value) || object(value)) throw new Error("unsupported");
  const number = safeInteger(value);
  return number === null ? canonical(value) : `number:${number}`;
}
function uniqueIssues(snapshot: SyncSnapshot, data: Dataset): Issue[] {
  const issues: Issue[] = [];
  for (const collection of snapshot.collections) {
    const name = collection.name as SyncCollection;
    const rows = data.get(name);
    if (!rows) continue;
    for (const index of [...collection.indexes, ...requiredUniqueIndexes(name)]) {
      if (index.unique !== true && index.name !== "_id_") continue;
      try {
        if (!object(index.key) || !Object.keys(index.key).length || Object.values(index.key).some(direction => ![1, -1].includes(safeInteger(direction) ?? 0))) throw new Error("unsupported");
        const collation = index.collation ?? collection.options.collation;
        if (collation && (!object(collation) || collation.locale !== "simple" || Object.keys(collation).some(field => field !== "locale"))) throw new Error("unsupported");
        if (index.partialFilterExpression) matches({}, index.partialFilterExpression);
        if (index.sparse !== undefined && typeof index.sparse !== "boolean") throw new Error("unsupported");
        const seen = new Map<string, string>();
        for (const row of rows.values()) {
          if (index.partialFilterExpression && !matches(row, index.partialFilterExpression)) continue;
          const values = Object.keys(index.key).map(field => atPath(row, field));
          if (index.sparse && values.every(value => value === undefined)) continue;
          const signature = JSON.stringify(values.map(indexValue));
          const existing = seen.get(signature);
          if (existing) issues.push(makeIssue("UNIQUE_KEY_COLLISION", name, row._id, hash([index.key, existing, signature])));
          else seen.set(signature, row._id);
        }
      } catch { issues.push(makeIssue("UNSUPPORTED_UNIQUE_INDEX", name, "index", hash(index))); }
    }
  }
  return issues;
}

function requiredUniqueIndexes(collection: SyncCollection): mongo.Document[] {
  const nonArchived = { status: { $in: ["active", "inactive"] } };
  if (masterCollections.has(collection)) return [
    { key: { codeNormalized: 1 }, unique: true, partialFilterExpression: nonArchived },
    { key: { nameNormalized: 1 }, unique: true, partialFilterExpression: nonArchived },
    ...(collection === C.priorities ? [{ key: { semanticTier: 1 }, unique: true, partialFilterExpression: { ...nonArchived, semanticTier: { $type: "string" } } }] : [])
  ];
  const keys: Partial<Record<SyncCollection, mongo.Document>> = { [C.baskets]: { nameNormalized: 1 }, [C.subBaskets]: { basketId: 1, nameNormalized: 1 }, [C.lines]: { basketId: 1, nameNormalized: 1 }, [C.revisions]: { mainLineId: 1, revisionNumber: 1 }, [C.sections]: { revisionId: 1, sectionKey: 1 }, [C.quality]: { basketId: 1, revisionNumber: 1 }, [C.options]: { kind: 1, normalizedName: 1 }, [C.prices]: { revisionId: 1, priceEntryId: 1, versionNumber: 1 }, [C.taxVersions]: { taxRuleId: 1, versionNumber: 1 } };
  const key = keys[collection];
  return key ? [{ key, unique: true, ...(collection === C.baskets ? { partialFilterExpression: nonArchived } : collection === C.lines ? { partialFilterExpression: { status: { $in: ["draft", "active", "inactive"] } } } : {}) }] : [];
}

function immutableIssues(target: Dataset, writes: PlannedWrite[]): Issue[] {
  const issues: Issue[] = [];
  const writeMap = new Map(writes.map(write => [recordKey(write.collection, write.id), write]));
  for (const write of writes) {
    const before = target.get(write.collection)!.get(write.id);
    if (write.collection === C.sections) {
      for (const [collection, id] of [[C.lines, write.document.mainLineId], [C.revisions, write.document.revisionId]] as const) {
        const originalParent = target.get(collection)!.get(id);
        const parentWrite = writeMap.get(recordKey(collection, id));
        if (originalParent && (!parentWrite || (safeInteger(parentWrite.document.version) ?? 0) <= (safeInteger(originalParent.version) ?? 0))) issues.push(makeIssue("AGGREGATE_VERSION_NOT_ADVANCED", write.collection, write.id));
      }
      const revision = target.get(C.revisions)!.get(write.document.revisionId);
      if (revision && revision.status !== "draft") issues.push(makeIssue("IMMUTABLE_ACTIVE_HISTORY_CHANGED", write.collection, write.id));
    }
    if (!before) continue;
    const after = write.document;
    const fail = (code: string, detail = "") => issues.push(makeIssue(code, write.collection, write.id, detail));
    if (IMMUTABLE_COLLECTIONS.has(write.collection)) { fail("IMMUTABLE_DOCUMENT_CHANGED"); continue; }
    const immutable = ["_id", "createdAt", "createdById"];
    if (oneOf(write.collection, [C.lines, C.subBaskets])) immutable.push("basketId");
    if (write.collection === C.lines) immutable.push("itemType", "subBasketId");
    if (write.collection === C.revisions) immutable.push("mainLineId", "revisionNumber", "sourceRevisionId");
    if (write.collection === C.sections) immutable.push("mainLineId", "revisionId", "sectionKey");
    if (write.collection === C.prices) immutable.push("mainLineId", "revisionId", "priceEntryId", "scopeKey", "versionNumber", "vendorId", "uomId", "specificationId", "modeId", "taxRuleId", "taxVersionId", "currency", "treatment", "inputAmountPaise", "baseAmountPaise", "taxAmountPaise", "totalAmountPaise", "effectiveFrom", "effectiveTo");
    if (write.collection === C.taxVersions) immutable.push("taxRuleId", "versionNumber", "rateBps", "treatment", "applicability", "effectiveFrom");
    if (immutable.some(field => !equal(before[field], after[field]))) fail("IMMUTABLE_FIELD_CHANGED");
    if (write.collection === C.sections && target.get(C.revisions)!.get(before.revisionId)?.status !== "draft") fail("IMMUTABLE_ACTIVE_HISTORY_CHANGED");
    if (write.collection === C.revisions && before.status !== "draft") {
      if (["mainLineId", "revisionNumber", "sourceRevisionId", "contentDigest", "completeness", "activatedAt", "activatedById"].some(field => !equal(before[field], after[field])) || (before.status === "superseded" && after.status !== "superseded") || after.status === "draft") fail("IMMUTABLE_ACTIVE_HISTORY_CHANGED");
    }
    if (write.collection === C.vendors && ["procurementProfile.email", "procurementProfile.vendorType", "procurementProfile.executionType", "procurementProfile.supplier", "kpiRubricGeneration"].some(field => !equal(atPath(before, field), atPath(after, field)))) fail("EXCLUDED_SIDE_EFFECT_REQUIRED");
    if (write.collection === C.uoms && !equal(before.decimalScale, after.decimalScale)) fail("EXCLUDED_SIDE_EFFECT_REQUIRED");
    if (write.collection === C.taxVersions && before.status === "active" && (!equal(before.effectiveTo, after.effectiveTo) || before.status !== after.status)) fail("EXCLUDED_SIDE_EFFECT_REQUIRED");
  }
  return issues;
}

function protectedGraphIssues(target: Dataset, writes: PlannedWrite[], entries: BaselineEntry[]): Issue[] {
  const protectedLines = new Set<string>();
  const protectedBaskets = new Set<string>();
  for (const entry of entries) {
    const row = target.get(entry.collection)!.get(entry.id);
    if (entry.collection === C.lines) protectedLines.add(entry.id);
    if (oneOf(entry.collection, [C.revisions, C.sections, C.prices])) {
      const line = row?.mainLineId ?? entry.mainLineId;
      if (typeof line === "string") protectedLines.add(line);
    }
    if (entry.collection === C.baskets) protectedBaskets.add(entry.id);
    if (entry.collection === C.quality) {
      const basket = row?.basketId ?? entry.basketId;
      if (typeof basket === "string") protectedBaskets.add(basket);
    }
  }
  const issues: Issue[] = [];
  for (const write of writes) {
    const row = write.document;
    const line = write.collection === C.lines ? write.id : oneOf(write.collection, [C.revisions, C.sections, C.prices]) ? row.mainLineId : null;
    const basket = write.collection === C.baskets ? write.id : write.collection === C.quality ? row.basketId : null;
    if ((typeof line === "string" && protectedLines.has(line)) || (typeof basket === "string" && protectedBaskets.has(basket))) issues.push(makeIssue("PROTECTED_LOCAL_GRAPH", write.collection, write.id));
  }
  return issues;
}

export function validatePlannedIntegrity(source: SyncSnapshot, target: SyncSnapshot, writes: PlannedWrite[], protectedEntries: BaselineEntry[]): { conflicts: SyncConflict[]; warnings: SyncConflict[] } {
  const original = dataset(target);
  const incoming = dataset(source);
  const proposed = new Map([...original].map(([collection, rows]) => [collection, new Map(rows)]));
  const changed = new Set<string>();
  const conflicts: Issue[] = [];
  for (const write of writes) {
    const rows = proposed.get(write.collection);
    if (!target.collections.find(row => row.name === write.collection)?.exists) conflicts.push(makeIssue("TARGET_COLLECTION_ABSENT", write.collection, write.id));
    if (!rows || write.id !== write.document._id || changed.has(recordKey(write.collection, write.id))) {
      conflicts.push(makeIssue("PLAN_WRITE_INVALID", write.collection, write.id));
      continue;
    }
    const before = rows.get(write.id);
    if ((before ? hash(before) : null) !== write.beforeHash) conflicts.push(makeIssue("PLAN_PRECONDITION_INVALID", write.collection, write.id));
    changed.add(recordKey(write.collection, write.id));
    rows.set(write.id, write.document);
  }
  // Source schema and internal references must be trustworthy even when a row is protected locally.
  for (const [collection, rows] of incoming) for (const row of rows.values()) conflicts.push(...schemaIssues(collection, row).map(issue => ({ ...issue, code: `SOURCE_${issue.code}` })));
  conflicts.push(...graphIssues(incoming).map(issue => ({ ...issue, code: `SOURCE_${issue.code}` })), ...uniqueIssues(source, incoming).map(issue => ({ ...issue, code: `SOURCE_${issue.code}` })));
  const existing = [...graphIssues(original, target.dependencies), ...uniqueIssues(target, original)];
  for (const [collection, rows] of original) for (const row of rows.values()) existing.push(...schemaIssues(collection, row));
  const existingKeys = new Set(existing.map(issue => hash(issue)));
  const finalIssues = [...graphIssues(proposed, target.dependencies), ...uniqueIssues(target, proposed)];
  for (const [collection, rows] of proposed) for (const row of rows.values()) finalIssues.push(...schemaIssues(collection, row));
  const warnings: SyncConflict[] = [];
  for (const issue of finalIssues) {
    let touchedDependency = false;
    const row = proposed.get(issue.collection)?.get(issue.id);
    if (row) visit(row, (field, value) => {
      const collection = relationFields[field];
      if (collection) for (const id of Array.isArray(value) ? value : [value]) if (typeof id === "string" && changed.has(recordKey(collection, id))) touchedDependency = true;
    });
    // Unsupported index semantics cannot be accepted merely because they predate the sync.
    const touchedUniqueCollection = issue.code === "UNIQUE_KEY_COLLISION" && writes.some(write => write.collection === issue.collection);
    if (existingKeys.has(hash(issue)) && !changed.has(recordKey(issue.collection, issue.id)) && !touchedDependency && !touchedUniqueCollection && issue.code !== "UNSUPPORTED_UNIQUE_INDEX") warnings.push({ ...publicIssue(issue), code: `PREEXISTING_${issue.code}` });
    else conflicts.push(issue);
  }
  conflicts.push(...immutableIssues(original, writes), ...protectedGraphIssues(original, writes, protectedEntries));
  return { conflicts: [...new Map(conflicts.map(issue => { const value = publicIssue(issue); return [hash(value), value]; })).values()], warnings: [...new Map(warnings.map(issue => [hash(issue), issue])).values()] };
}
