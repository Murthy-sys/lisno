import "dotenv/config";

import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { loadEnvironment } from "../config/env.js";
import {
  assertEstimateDesignMapping,
  autoMapDrawingTitle,
  type EstimateDesignMapping,
  type EstimateMappingContext,
  mappingContextForEstimate
} from "../domain/estimate-design-mapping.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";

const mappingFields = ["roomId", "scopeSectionId", "catalogueId", "mappingStatus"] as const;
const identifierFields = ["roomId", "scopeSectionId", "catalogueId"] as const;
const legacyNullSentinels = new Set(["", "null", "undefined"]);
const conflictDetailLimit = 1_000;

type MappingField = typeof mappingFields[number];
type LegacyRecord = Record<string, unknown>;
type RecordKind = "drawing" | "revision";

export interface EstimateDesignMappingMigrationConflict {
  recordKind: RecordKind;
  recordId: string;
  title: string;
  reason:
    | "ambiguous_title"
    | "ambiguous_legacy_room_scope"
    | "invalid_legacy_mapping"
    | "missing_estimate"
    | "estimate_changed"
    | "concurrent_change";
  candidateKeys: string[];
}

export interface EstimateDesignMappingMigrationReport {
  drawingsScanned: number;
  drawingsChanged: number;
  revisionsScanned: number;
  revisionsChanged: number;
  autoMapped: number;
  misc: number;
  sentinelValuesNormalized: number;
  conflictCount: number;
  conflicts: EstimateDesignMappingMigrationConflict[];
  conflictsTruncated: boolean;
  unresolvedCount: number;
  dryRun: boolean;
}

type EstimateContextVersion = {
  updatedAt: unknown;
  fingerprint: string;
};

type EstimateContext = {
  context: EstimateMappingContext;
  version: EstimateContextVersion;
};

type PlannedMappingWrite = {
  id: unknown;
  recordKind: RecordKind;
  title: string;
  original: LegacyRecord;
  target: EstimateDesignMapping;
  contextEstimateId?: string;
  contextVersion?: EstimateContextVersion;
  conflict: Omit<EstimateDesignMappingMigrationConflict, "recordKind" | "recordId"> | null;
};

type MappingResolution = {
  mapping: EstimateDesignMapping;
  conflict: Omit<EstimateDesignMappingMigrationConflict, "recordKind" | "recordId"> | null;
};

function emptyReport(dryRun: boolean): EstimateDesignMappingMigrationReport {
  return {
    drawingsScanned: 0,
    drawingsChanged: 0,
    revisionsScanned: 0,
    revisionsChanged: 0,
    autoMapped: 0,
    misc: 0,
    sentinelValuesNormalized: 0,
    conflictCount: 0,
    conflicts: [],
    conflictsTruncated: false,
    unresolvedCount: 0,
    dryRun
  };
}

function normalizeLegacyMappingIdentifier(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== "string") return null;
  const trimmed = value.trim();
  return legacyNullSentinels.has(trimmed.toLowerCase()) ? null : trimmed;
}

function unresolvedLegacyMapping(
  title: string,
  reason: "ambiguous_legacy_room_scope" | "invalid_legacy_mapping",
  candidateKeys: string[] = []
): MappingResolution {
  return {
    mapping: { roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" },
    conflict: { title, reason, candidateKeys }
  };
}

function mappingForLegacyRecord(record: LegacyRecord, title: string, context: EstimateMappingContext): MappingResolution {
  const roomId = normalizeLegacyMappingIdentifier(record.roomId);
  const scopeSectionId = normalizeLegacyMappingIdentifier(record.scopeSectionId);
  const catalogueId = normalizeLegacyMappingIdentifier(record.catalogueId);

  if (roomId && scopeSectionId && catalogueId) {
    const included = context.candidates.find((candidate) =>
      candidate.roomId === roomId &&
      candidate.catalogueId === catalogueId &&
      candidate.scopeSectionId === scopeSectionId
    );
    if (included) {
      return {
        mapping: {
          roomId,
          scopeSectionId,
          catalogueId,
          mappingStatus: record.mappingStatus === "auto_mapped" ? "auto_mapped" : "estimator_assigned"
        },
        conflict: null
      };
    }
    return unresolvedLegacyMapping(title, "invalid_legacy_mapping");
  }

  if (roomId && scopeSectionId && !catalogueId) {
    const candidates = context.candidates.filter((candidate) =>
      candidate.roomId === roomId && candidate.scopeSectionId === scopeSectionId
    );
    if (candidates.length === 1) {
      const candidate = candidates[0]!;
      return {
        mapping: {
          roomId: candidate.roomId,
          scopeSectionId: candidate.scopeSectionId,
          catalogueId: candidate.catalogueId,
          mappingStatus: "estimator_assigned"
        },
        conflict: null
      };
    }
    return unresolvedLegacyMapping(
      title,
      "ambiguous_legacy_room_scope",
      candidates.map((candidate) => `${candidate.roomId}\u0000${candidate.catalogueId}`).sort()
    );
  }

  if (roomId || scopeSectionId || catalogueId) {
    return unresolvedLegacyMapping(title, "invalid_legacy_mapping");
  }

  const resolution = autoMapDrawingTitle(title, context);
  if (resolution.reason === "unique") return { mapping: resolution.mapping, conflict: null };
  return {
    mapping: resolution.mapping,
    conflict: {
      title,
      // The public migration contract has no `absent_title` reason. An absent title is
      // still unresolved legacy mapping and is deliberately visible to operators.
      reason: resolution.reason === "ambiguous" ? "ambiguous_title" : "invalid_legacy_mapping",
      candidateKeys: [...resolution.candidateKeys]
    }
  };
}

function trueNullMisc(title: string, reason: "missing_estimate" | "invalid_legacy_mapping"): MappingResolution {
  return {
    mapping: { roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" },
    conflict: { title, reason, candidateKeys: [] }
  };
}

function titleFor(record: LegacyRecord, field: "detectedTitle" | "label") {
  return typeof record[field] === "string" ? record[field].trim() : "";
}

function valuesMatchTarget(record: LegacyRecord, target: EstimateDesignMapping) {
  return mappingFields.every((field) => Object.hasOwn(record, field) && record[field] === target[field]);
}

function countNormalizedIdentifiers(record: LegacyRecord) {
  return identifierFields.filter((field) => {
    const value = record[field];
    return value === undefined || (typeof value === "string" && legacyNullSentinels.has(value.trim().toLowerCase()));
  }).length;
}

function exactOriginalMappingFilter(original: LegacyRecord) {
  return Object.fromEntries(mappingFields.map((field) => [
    field,
    Object.hasOwn(original, field)
      ? { $exists: true, $eq: original[field] }
      : { $exists: false }
  ]));
}

function targetMatches(record: LegacyRecord, target: EstimateDesignMapping) {
  return mappingFields.every((field) => Object.hasOwn(record, field) && record[field] === target[field]);
}

function estimateVersion(estimate: LegacyRecord): EstimateContextVersion {
  return {
    updatedAt: estimate.updatedAt,
    fingerprint: JSON.stringify({
      rooms: estimate.rooms ?? null,
      scopes: estimate.scopes ?? null,
      lineItems: estimate.lineItems ?? null,
      updatedAt: estimate.updatedAt instanceof Date ? estimate.updatedAt.toISOString() : estimate.updatedAt ?? null
    })
  };
}

function sameEstimateVersion(left: EstimateContextVersion, right: EstimateContextVersion) {
  return left.fingerprint === right.fingerprint;
}

async function estimateContexts(ids: string[]) {
  if (ids.length === 0) return new Map<string, EstimateContext>();
  const estimates = await EstimateModel.find({ _id: { $in: ids } }).lean() as LegacyRecord[];
  return new Map(estimates.map((estimate) => [String(estimate._id), {
    context: mappingContextForEstimate(estimate),
    version: estimateVersion(estimate)
  }]));
}

function addConflict(
  report: EstimateDesignMappingMigrationReport,
  write: Pick<PlannedMappingWrite, "recordKind" | "id" | "title">,
  conflict: Omit<EstimateDesignMappingMigrationConflict, "recordKind" | "recordId">
) {
  report.conflictCount += 1;
  report.unresolvedCount += 1;
  if (report.conflicts.length >= conflictDetailLimit) {
    report.conflictsTruncated = true;
    return;
  }
  report.conflicts.push({
    recordKind: write.recordKind,
    recordId: String(write.id),
    title: conflict.title,
    reason: conflict.reason,
    candidateKeys: [...conflict.candidateKeys]
  });
}

function countCompletedWrite(report: EstimateDesignMappingMigrationReport, write: PlannedMappingWrite) {
  if (write.recordKind === "drawing") report.drawingsChanged += 1;
  else report.revisionsChanged += 1;
  if (write.target.mappingStatus === "auto_mapped") report.autoMapped += 1;
  if (write.target.mappingStatus === "misc") report.misc += 1;
}

async function recheckContextVersions(writes: PlannedMappingWrite[]) {
  const ids = [...new Set(writes.flatMap((write) => write.contextEstimateId ? [write.contextEstimateId] : []))];
  const fresh = await estimateContexts(ids);
  return writes.filter((write) => {
    if (!write.contextEstimateId || !write.contextVersion) return true;
    const current = fresh.get(write.contextEstimateId);
    return Boolean(current && sameEstimateVersion(write.contextVersion, current.version));
  });
}

async function flushMigrationBatch(
  collection: typeof EstimateDesignDrawingModel.collection,
  writes: PlannedMappingWrite[],
  report: EstimateDesignMappingMigrationReport
) {
  const current = await recheckContextVersions(writes);
  const currentIds = new Set(current.map((write) => write.id));
  for (const write of writes) {
    if (!currentIds.has(write.id)) {
      addConflict(report, write, { title: write.title, reason: "estimate_changed", candidateKeys: [] });
    }
  }
  if (current.length === 0) return;
  if (report.dryRun) {
    current.forEach((write) => {
      if (write.conflict) addConflict(report, write, write.conflict);
      countCompletedWrite(report, write);
    });
    return;
  }
  for (const write of current) assertEstimateDesignMapping(write.target);
  await collection.bulkWrite(current.map((write) => ({
    updateOne: {
      filter: { _id: write.id, ...exactOriginalMappingFilter(write.original) },
      update: { $set: write.target }
    }
  })) as never, { ordered: false });
  const stored = await collection.find({ _id: { $in: current.map((write) => write.id) } } as never).toArray() as LegacyRecord[];
  const storedById = new Map(stored.map((record) => [String(record._id), record]));
  for (const write of current) {
    if (targetMatches(storedById.get(String(write.id)) ?? {}, write.target)) {
      if (write.conflict) addConflict(report, write, write.conflict);
      countCompletedWrite(report, write);
    } else {
      addConflict(report, write, { title: write.title, reason: "concurrent_change", candidateKeys: [] });
    }
  }
}

function plan(
  record: LegacyRecord,
  recordKind: RecordKind,
  title: string,
  resolution: MappingResolution,
  contextEstimateId?: string,
  contextVersion?: EstimateContextVersion
): PlannedMappingWrite | null {
  if (valuesMatchTarget(record, resolution.mapping)) return null;
  return {
    id: record._id,
    recordKind,
    title,
    original: Object.fromEntries(mappingFields.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]])),
    target: resolution.mapping,
    contextEstimateId,
    contextVersion,
    conflict: resolution.conflict
  };
}

async function processDrawingBatch(records: LegacyRecord[], report: EstimateDesignMappingMigrationReport) {
  const contexts = await estimateContexts([...new Set(records.map((record) => String(record.estimateId)).filter(Boolean))]);
  const writes: PlannedMappingWrite[] = [];
  for (const record of records) {
    report.drawingsScanned += 1;
    report.sentinelValuesNormalized += countNormalizedIdentifiers(record);
    const title = titleFor(record, "detectedTitle");
    const estimateId = typeof record.estimateId === "string" ? record.estimateId : "";
    const estimate = contexts.get(estimateId);
    const resolution = estimate ? mappingForLegacyRecord(record, title, estimate.context) : trueNullMisc(title, "missing_estimate");
    const write = plan(record, "drawing", title, resolution, estimateId || undefined, estimate?.version);
    if (write) writes.push(write);
    else if (resolution.conflict) addConflict(report, { recordKind: "drawing", id: record._id, title }, resolution.conflict);
  }
  await flushMigrationBatch(EstimateDesignDrawingModel.collection, writes, report);
}

async function processRevisionBatch(records: LegacyRecord[], report: EstimateDesignMappingMigrationReport) {
  const drawingIds = [...new Set(records.map((record) => String(record.drawingId)).filter(Boolean))];
  const drawings = await EstimateDesignDrawingModel.find({ _id: { $in: drawingIds } }).lean() as LegacyRecord[];
  const drawingsById = new Map(drawings.map((drawing) => [String(drawing._id), drawing]));
  const contexts = await estimateContexts([...new Set(drawings.map((drawing) => String(drawing.estimateId)).filter(Boolean))]);
  const writes: PlannedMappingWrite[] = [];
  for (const record of records) {
    report.revisionsScanned += 1;
    report.sentinelValuesNormalized += countNormalizedIdentifiers(record);
    const title = titleFor(record, "label");
    const drawing = drawingsById.get(String(record.drawingId));
    const estimateId = typeof drawing?.estimateId === "string" ? drawing.estimateId : "";
    const estimate = contexts.get(estimateId);
    const resolution = estimate ? mappingForLegacyRecord(record, title, estimate.context) : trueNullMisc(title, "missing_estimate");
    const write = plan(record, "revision", title, resolution, estimateId || undefined, estimate?.version);
    if (write) writes.push(write);
    else if (resolution.conflict) addConflict(report, { recordKind: "revision", id: record._id, title }, resolution.conflict);
  }
  await flushMigrationBatch(EstimateDesignRevisionModel.collection, writes, report);
}

async function consumeCursor(records: AsyncIterable<LegacyRecord>, batchSize: number, consume: (batch: LegacyRecord[]) => Promise<void>) {
  let batch: LegacyRecord[] = [];
  for await (const record of records) {
    batch.push(record);
    if (batch.length === batchSize) {
      await consume(batch);
      batch = [];
    }
  }
  if (batch.length > 0) await consume(batch);
}

export async function migrateEstimateDesignMappings(
  options: { dryRun?: boolean; batchSize?: number } = {}
): Promise<EstimateDesignMappingMigrationReport> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new RangeError("batchSize must be an integer from 1 through 1000");
  }
  const report = emptyReport(options.dryRun === true);
  const drawingCursor = EstimateDesignDrawingModel.find().sort({ _id: 1 }).lean().cursor({ batchSize }) as unknown as AsyncIterable<LegacyRecord>;
  await consumeCursor(drawingCursor, batchSize, (batch) => processDrawingBatch(batch, report));
  const revisionCursor = EstimateDesignRevisionModel.find().sort({ _id: 1 }).lean().cursor({ batchSize }) as unknown as AsyncIterable<LegacyRecord>;
  await consumeCursor(revisionCursor, batchSize, (batch) => processRevisionBatch(batch, report));
  return report;
}

export interface EstimateDesignMappingMigrationCommandDependencies {
  argv?: string[];
  loadEnvironment?: () => { MONGODB_URI: string };
  connect?: (uri: string, options: { autoIndex: false }) => Promise<unknown>;
  disconnect?: () => Promise<unknown>;
  writeOutput?: (output: string) => void;
}

export async function runEstimateDesignMappingMigrationCommand(
  dependencies: EstimateDesignMappingMigrationCommandDependencies = {}
): Promise<void> {
  const dryRun = (dependencies.argv ?? process.argv.slice(2)).includes("--dry-run");
  const env = (dependencies.loadEnvironment ?? loadEnvironment)();
  const connect = dependencies.connect ?? ((uri: string, options: { autoIndex: false }) => mongoose.connect(uri, options));
  const disconnect = dependencies.disconnect ?? (() => mongoose.disconnect());
  const writeOutput = dependencies.writeOutput ?? ((output: string) => process.stdout.write(output));
  try {
    await connect(env.MONGODB_URI, { autoIndex: false });
    const report = await migrateEstimateDesignMappings({ dryRun });
    writeOutput(`${JSON.stringify(report)}\n`);
  } finally {
    await disconnect();
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  runEstimateDesignMappingMigrationCommand().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
