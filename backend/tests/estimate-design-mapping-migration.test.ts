import { afterEach, describe, expect, it, vi } from "vitest";

import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import {
  migrateEstimateDesignMappings,
  runEstimateDesignMappingMigrationCommand
} from "../src/migrations/estimate-design-mapping.js";

type LegacyRecord = Record<string, unknown>;

const estimates: LegacyRecord[] = [{
  _id: "estimate-1",
  updatedAt: new Date("2026-07-30T00:00:00.000Z"),
  rooms: [
    { id: "bed-1", label: "Bedroom 1", aliases: [] },
    { id: "bed-2", label: "Bedroom 2", aliases: [] }
  ],
  scopes: ["CA"],
  lineItems: [
    { catalogueId: "CA01", roomName: "Bedroom 1", included: true },
    { catalogueId: "CA01", roomName: "Bedroom 2", included: true }
  ]
}];

function cursor(records: LegacyRecord[]) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* records;
    }
  };
}

function query<T>(records: T[]) {
  return { lean: () => Promise.resolve(records) };
}

function installState(drawings: LegacyRecord[], revisions: LegacyRecord[]) {
  vi.spyOn(EstimateDesignDrawingModel, "find").mockImplementation((filter?: { _id?: { $in?: string[] } }) =>
    filter?._id?.$in
      ? query(drawings.filter((drawing) => filter._id!.$in!.includes(String(drawing._id)))) as never
      : { sort: () => ({ lean: () => ({ cursor: () => cursor(drawings) }) }) } as never
  );
  vi.spyOn(EstimateDesignRevisionModel, "find").mockImplementation((filter?: { _id?: { $in?: string[] } }) =>
    filter?._id?.$in
      ? query(revisions.filter((revision) => filter._id!.$in!.includes(String(revision._id)))) as never
      : { sort: () => ({ lean: () => ({ cursor: () => cursor(revisions) }) }) } as never
  );
  vi.spyOn(EstimateModel, "find").mockImplementation((filter: { _id?: { $in?: string[] } }) =>
    query(estimates.filter((estimate) => !filter?._id?.$in || filter._id.$in.includes(String(estimate._id)))) as never
  );
  vi.spyOn(EstimateDesignDrawingModel.collection, "find").mockImplementation((filter: { _id?: { $in?: string[] } }) => ({
    toArray: async () => drawings.filter((drawing) => filter._id?.$in?.includes(String(drawing._id)))
  }) as never);
  vi.spyOn(EstimateDesignRevisionModel.collection, "find").mockImplementation((filter: { _id?: { $in?: string[] } }) => ({
    toArray: async () => revisions.filter((revision) => filter._id?.$in?.includes(String(revision._id)))
  }) as never);
}

function matchesCas(record: LegacyRecord, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([field, expected]) => {
    if (field === "_id") return record._id === expected;
    const condition = expected as { $exists?: boolean; $eq?: unknown };
    if (condition.$exists !== undefined && Object.hasOwn(record, field) !== condition.$exists) return false;
    return condition.$eq === undefined || record[field] === condition.$eq;
  });
}

function installMutableState(
  drawings: LegacyRecord[],
  revisions: LegacyRecord[],
  options: { beforeDrawingWrite?: () => void; beforeEstimateRecheck?: () => void } = {}
) {
  installState(drawings, revisions);
  let estimateFinds = 0;
  vi.mocked(EstimateModel.find).mockImplementation((filter: { _id?: { $in?: string[] } }) => {
    estimateFinds += 1;
    if (estimateFinds > 1) options.beforeEstimateRecheck?.();
    return query(estimates.filter((estimate) => !filter?._id?.$in || filter._id.$in.includes(String(estimate._id)))) as never;
  });
  vi.spyOn(EstimateDesignDrawingModel.collection, "bulkWrite").mockImplementation(async (operations: Array<{ updateOne: { filter: Record<string, unknown>; update: { $set: LegacyRecord } } }>) => {
    options.beforeDrawingWrite?.();
    for (const operation of operations) {
      const record = drawings.find((drawing) => matchesCas(drawing, operation.updateOne.filter));
      if (record) Object.assign(record, operation.updateOne.update.$set);
    }
    return {} as never;
  });
  vi.spyOn(EstimateDesignRevisionModel.collection, "bulkWrite").mockImplementation(async (operations: Array<{ updateOne: { filter: Record<string, unknown>; update: { $set: LegacyRecord } } }>) => {
    for (const operation of operations) {
      const record = revisions.find((revision) => matchesCas(revision, operation.updateOne.filter));
      if (record) Object.assign(record, operation.updateOne.update.$set);
    }
    return {} as never;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("estimate design mapping migration", () => {
  it("reports dry-run mappings without writing legacy sentinels", async () => {
    const drawings = [
      { _id: "drawing-unique", estimateId: "estimate-1", detectedTitle: "TV UNIT - BEDROOM 1", roomId: "", scopeSectionId: "null" },
      { _id: "drawing-ambiguous", estimateId: "estimate-1", detectedTitle: "TV UNIT", roomId: "undefined", scopeSectionId: "" }
    ];
    const revisions = [
      { _id: "revision-unique", drawingId: "drawing-unique", label: "TV UNIT - BEDROOM 1", roomId: "", scopeSectionId: "" },
      { _id: "revision-ambiguous", drawingId: "drawing-ambiguous", label: "TV UNIT", roomId: "null", scopeSectionId: "undefined" }
    ];
    installState(drawings, revisions);
    const drawingWrite = vi.spyOn(EstimateDesignDrawingModel.collection, "bulkWrite");
    const revisionWrite = vi.spyOn(EstimateDesignRevisionModel.collection, "bulkWrite");

    await expect(migrateEstimateDesignMappings({ dryRun: true, batchSize: 1 })).resolves.toMatchObject({
      drawingsScanned: 2,
      drawingsChanged: 2,
      revisionsScanned: 2,
      revisionsChanged: 2,
      autoMapped: 2,
      misc: 2,
      sentinelValuesNormalized: 12,
      conflictCount: 2,
      unresolvedCount: 2,
      dryRun: true,
      conflicts: [
        { recordKind: "drawing", recordId: "drawing-ambiguous", title: "TV UNIT", reason: "ambiguous_title", candidateKeys: ["bed-1\u0000CA01", "bed-2\u0000CA01"] },
        { recordKind: "revision", recordId: "revision-ambiguous", title: "TV UNIT", reason: "ambiguous_title", candidateKeys: ["bed-1\u0000CA01", "bed-2\u0000CA01"] }
      ]
    });
    expect(drawingWrite).not.toHaveBeenCalled();
    expect(revisionWrite).not.toHaveBeenCalled();
  });

  it("rejects an unsafe migration batch size", async () => {
    await expect(migrateEstimateDesignMappings({ batchSize: 0 })).rejects.toThrow("batchSize must be an integer from 1 through 1000");
    await expect(migrateEstimateDesignMappings({ batchSize: 1001 })).rejects.toThrow("batchSize must be an integer from 1 through 1000");
  });

  it("preserves a coherent manual tuple, repairs invalid legacy tuples, and is idempotent", async () => {
    const drawings = [
      { _id: "manual", estimateId: "estimate-1", detectedTitle: "Site note", roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA01" },
      { _id: "invalid", estimateId: "estimate-1", detectedTitle: "TV UNIT", roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA02" }
    ];
    installMutableState(drawings, []);

    await expect(migrateEstimateDesignMappings({ batchSize: 1 })).resolves.toMatchObject({
      drawingsChanged: 2,
      misc: 1,
      conflictCount: 1,
      conflicts: [{ recordId: "invalid", reason: "invalid_legacy_mapping" }]
    });
    expect(drawings).toEqual([
      expect.objectContaining({ roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA01", mappingStatus: "estimator_assigned" }),
      expect.objectContaining({ roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" })
    ]);
    await expect(migrateEstimateDesignMappings({ batchSize: 1 })).resolves.toMatchObject({ drawingsChanged: 0, revisionsChanged: 0 });
  });

  it("does not overwrite an estimator assignment that wins the compare-and-swap race", async () => {
    const drawings = [{ _id: "race", estimateId: "estimate-1", detectedTitle: "TV UNIT - BEDROOM 1", roomId: "", scopeSectionId: "", catalogueId: "" }];
    installMutableState(drawings, [], {
      beforeDrawingWrite: () => Object.assign(drawings[0]!, { roomId: "bed-2", scopeSectionId: "CA", catalogueId: "CA01", mappingStatus: "estimator_assigned" })
    });
    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      drawingsChanged: 0,
      conflictCount: 1,
      conflicts: [{ recordId: "race", reason: "concurrent_change" }]
    });
    expect(drawings[0]).toMatchObject({ roomId: "bed-2", mappingStatus: "estimator_assigned" });
  });

  it("skips planned writes when the estimate context changes before flush", async () => {
    const drawings = [{ _id: "context-race", estimateId: "estimate-1", detectedTitle: "TV UNIT - BEDROOM 1", roomId: "", scopeSectionId: "", catalogueId: "" }];
    const originalUpdatedAt = estimates[0]!.updatedAt as Date;
    installMutableState(drawings, [], {
      beforeEstimateRecheck: () => { estimates[0]!.updatedAt = new Date(originalUpdatedAt.getTime() + 1); }
    });
    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      drawingsChanged: 0,
      conflictCount: 1,
      conflicts: [{ recordId: "context-race", reason: "estimate_changed" }]
    });
    expect(drawings[0]).toMatchObject({ roomId: "", scopeSectionId: "", catalogueId: "" });
    expect(drawings[0]).not.toHaveProperty("estimateDesignMappingMigrationVersion");
    estimates[0]!.updatedAt = originalUpdatedAt;
  });

  it("keeps exact conflict totals while capping retained details", async () => {
    const drawings = Array.from({ length: 1_001 }, (_, index) => ({
      _id: `ambiguous-${index}`,
      estimateId: "estimate-1",
      detectedTitle: "TV UNIT"
    }));
    installState(drawings, []);
    await expect(migrateEstimateDesignMappings({ dryRun: true, batchSize: 1000 })).resolves.toMatchObject({
      conflictCount: 1_001,
      unresolvedCount: 1_001,
      conflictsTruncated: true
    });
  });

  it("reports an absent all-null title as explicit unresolved invalid legacy mapping", async () => {
    installState([{ _id: "absent-title", estimateId: "estimate-1", detectedTitle: "SITE NOTE" }], []);
    await expect(migrateEstimateDesignMappings({ dryRun: true })).resolves.toMatchObject({
      misc: 1,
      conflictCount: 1,
      unresolvedCount: 1,
      conflicts: [{ recordId: "absent-title", reason: "invalid_legacy_mapping", candidateKeys: [] }]
    });
  });

  it("treats an explicit all-null Misc tuple as legacy and title-resolves drawing and revision snapshots", async () => {
    const drawings = [{
      _id: "explicit-misc-drawing", estimateId: "estimate-1", detectedTitle: "TV UNIT - BEDROOM 1",
      roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc"
    }];
    const revisions = [{
      _id: "explicit-misc-revision", drawingId: "explicit-misc-drawing", label: "TV UNIT - BEDROOM 1",
      roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc"
    }];
    installMutableState(drawings, revisions);

    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      drawingsChanged: 1,
      revisionsChanged: 1,
      autoMapped: 2,
      misc: 0,
      conflictCount: 0
    });
    expect(drawings[0]).toMatchObject({ roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA01", mappingStatus: "auto_mapped" });
    expect(revisions[0]).toMatchObject({ roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA01", mappingStatus: "auto_mapped" });
    expect(drawings[0]).toMatchObject({ estimateDesignMappingMigrationVersion: 1 });
    expect(revisions[0]).toMatchObject({ estimateDesignMappingMigrationVersion: 1 });
    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({ drawingsChanged: 0, revisionsChanged: 0 });
  });

  it("marks invalid unique-title legacy tuples so the true-null Misc repair stays idempotent", async () => {
    const drawings = [{
      _id: "invalid-unique-drawing", estimateId: "estimate-1", detectedTitle: "TV UNIT - BEDROOM 1",
      roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA02"
    }];
    const revisions = [{
      _id: "invalid-unique-revision", drawingId: "invalid-unique-drawing", label: "TV UNIT - BEDROOM 1",
      roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA02"
    }];
    installMutableState(drawings, revisions);

    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      drawingsChanged: 1,
      revisionsChanged: 1,
      misc: 2,
      conflictCount: 2,
      conflicts: [
        { recordId: "invalid-unique-drawing", reason: "invalid_legacy_mapping" },
        { recordId: "invalid-unique-revision", reason: "invalid_legacy_mapping" }
      ]
    });
    for (const record of [...drawings, ...revisions]) {
      expect(record).toMatchObject({ roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", estimateDesignMappingMigrationVersion: 1 });
    }
    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({ drawingsChanged: 0, revisionsChanged: 0, conflictCount: 0 });
  });

  it("does not trust or overwrite an incoherent tuple carrying the current migration marker", async () => {
    const drawings = [{
      _id: "incoherent-marker", estimateId: "estimate-1", detectedTitle: "TV UNIT - BEDROOM 1",
      roomId: "bed-1", scopeSectionId: null, catalogueId: "CA01", mappingStatus: "misc", estimateDesignMappingMigrationVersion: 1
    }];
    installState(drawings, []);
    const bulkWrite = vi.spyOn(EstimateDesignDrawingModel.collection, "bulkWrite");
    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      drawingsChanged: 0,
      conflictCount: 1,
      conflicts: [{ recordId: "incoherent-marker", reason: "invalid_legacy_mapping" }]
    });
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(drawings[0]).toMatchObject({ roomId: "bed-1", scopeSectionId: null, catalogueId: "CA01", mappingStatus: "misc", estimateDesignMappingMigrationVersion: 1 });
  });

  it("does not count a mapping write when post-write marker verification fails", async () => {
    const drawings = [{ _id: "marker-race", estimateId: "estimate-1", detectedTitle: "TV UNIT - BEDROOM 1", roomId: "", scopeSectionId: "", catalogueId: "" }];
    installMutableState(drawings, []);
    vi.mocked(EstimateDesignDrawingModel.collection.bulkWrite).mockImplementation(async (operations: Array<{ updateOne: { update: { $set: LegacyRecord } } }>) => {
      Object.assign(drawings[0]!, operations[0]!.updateOne.update.$set);
      delete drawings[0]!.estimateDesignMappingMigrationVersion;
      return {} as never;
    });
    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      drawingsChanged: 0,
      conflictCount: 1,
      conflicts: [{ recordId: "marker-race", reason: "concurrent_change" }]
    });
  });

  it("replaces planned mapping conflicts with a concurrent-change conflict", async () => {
    const drawings = [{ _id: "invalid-race", estimateId: "estimate-1", detectedTitle: "TV UNIT", roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA02" }];
    installMutableState(drawings, [], {
      beforeDrawingWrite: () => Object.assign(drawings[0]!, { roomId: "bed-1", scopeSectionId: "CA", catalogueId: "CA01", mappingStatus: "estimator_assigned" })
    });
    await expect(migrateEstimateDesignMappings()).resolves.toMatchObject({
      conflictCount: 1,
      unresolvedCount: 1,
      conflictsTruncated: false,
      conflicts: [{ recordId: "invalid-race", reason: "concurrent_change" }]
    });
  });

  it("replaces planned ambiguity details with exact capped estimate-change conflicts", async () => {
    const drawings = Array.from({ length: 1_001 }, (_, index) => ({ _id: `context-ambiguous-${index}`, estimateId: "estimate-1", detectedTitle: "TV UNIT" }));
    const originalUpdatedAt = estimates[0]!.updatedAt as Date;
    installMutableState(drawings, [], {
      beforeEstimateRecheck: () => { estimates[0]!.updatedAt = new Date((estimates[0]!.updatedAt as Date).getTime() + 1); }
    });
    const report = await migrateEstimateDesignMappings({ batchSize: 1000 });
    expect(report.conflictCount).toBe(1_001);
    expect(report.unresolvedCount).toBe(1_001);
    expect(report.conflictsTruncated).toBe(true);
    expect(report.conflicts).toHaveLength(1_000);
    expect(report.conflicts.every((conflict) => conflict.reason === "estimate_changed")).toBe(true);
    estimates[0]!.updatedAt = originalUpdatedAt;
  });

  it("streams and flushes records in the configured bounded batch size", async () => {
    const drawings = Array.from({ length: 1_205 }, (_, index) => ({
      _id: `bounded-${index}`,
      estimateId: "estimate-1",
      detectedTitle: "TV UNIT - BEDROOM 1",
      roomId: "",
      scopeSectionId: "",
      catalogueId: ""
    }));
    installMutableState(drawings, []);
    const bulkWrite = vi.mocked(EstimateDesignDrawingModel.collection.bulkWrite);
    await expect(migrateEstimateDesignMappings({ batchSize: 100 })).resolves.toMatchObject({ drawingsChanged: 1_205 });
    expect(bulkWrite).toHaveBeenCalledTimes(13);
    expect(Math.max(...bulkWrite.mock.calls.map(([operations]) => operations.length))).toBeLessThanOrEqual(100);
  });

  it("emits one JSON line and always disconnects the command", async () => {
    installState([], []);
    const output: string[] = [];
    const disconnect = vi.fn().mockResolvedValue(undefined);
    await runEstimateDesignMappingMigrationCommand({
      argv: ["--dry-run"],
      loadEnvironment: () => ({ MONGODB_URI: "mongodb://example.test/lisno" }),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect,
      writeOutput: (line) => output.push(line)
    });
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ dryRun: true, drawingsScanned: 0, revisionsScanned: 0 });
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
