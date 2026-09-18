import { describe, expect, it } from "vitest";
import { workflowApprovedLines, workflowEstimateRooms, WorkflowEstimateSourceError, type WorkflowEstimateApproval, type WorkflowEstimateLine } from "../src/domain/workflow-estimate-items.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const rooms = [{ id: "room-a", label: "Living room" }, { id: "room-b", label: "Bedroom" }];
const line: WorkflowEstimateLine = { id: "item-a", catalogueId: "CUSTOM", roomName: "Living room", specification: "Existing sofa", unit: "nos", quantity: 2, included: true };
const round: WorkflowEstimateApproval = { id: "round-a", estimateId: "estimate-a", projectId: "project-a", estimateVersion: 3, status: "approved", decision: "approve", decidedById: "client-a", decidedAt: "2026-09-17T00:00:00.000Z", decisionSource: "client_portal", lineItems: [line] };
const source = { projectId: "project-a", estimateId: "estimate-a", estimateVersion: 3, rounds: [round], legacyLines: [{ ...line, id: "unapproved-live-item" }] };

describe("selected approved estimate furniture items", () => {
  it("maps every included line, including zero quantities, to exact room IDs without prices or catalogue filtering", () => {
    const result = workflowEstimateRooms("estimate-a", 3, rooms, [
      { ...line, rate: 99, amount: 198 } as WorkflowEstimateLine,
      { ...line, id: "ceiling", catalogueId: "FC01", roomName: "Bedroom", quantity: 7, unit: "sqft" },
      { ...line, id: "excluded", included: false }, { ...line, id: "zero", quantity: 0 }
    ]);
    expect(result).toEqual([
      { id: "room-a", name: "Living room", estimateItems: [{ id: "item-a", name: "CUSTOM — Existing sofa", catalogueId: "CUSTOM", specification: "Existing sofa", quantity: 2, uom: "nos", measurementType: "dimensions" }, { id: "zero", name: "CUSTOM — Existing sofa", catalogueId: "CUSTOM", specification: "Existing sofa", quantity: 0, uom: "nos", measurementType: "dimensions" }] },
      { id: "room-b", name: "Bedroom", estimateItems: [{ id: "ceiling", name: "False ceiling - main area", catalogueId: "FC01", specification: "Existing sofa", quantity: 7, uom: "sqft", measurementType: "dimensions" }] }
    ]);
    expect(JSON.stringify(result)).not.toMatch(/rate|amount|subtotal/);
  });
  it("generates stable legacy keys at original snapshot positions across excluded and zero-quantity lines", () => {
    const lines = [{ ...line, included: false }, { ...line, id: null, quantity: 0 }, { ...line, id: null }];
    const first = workflowEstimateRooms("estimate-a", 3, rooms, lines);
    expect(first[0]!.estimateItems[0]!.id).toBe("legacy-estimate-line:estimate-a:3:1");
    expect(first[0]!.estimateItems[1]!.id).toBe("legacy-estimate-line:estimate-a:3:2");
    expect(workflowEstimateRooms("estimate-a", 3, rooms, lines)).toEqual(first);
  });
  it.each([
    { rooms: [...rooms, { id: "duplicate-label", label: "Living room" }], lines: [line] },
    { rooms: [...rooms, rooms[0]!], lines: [line] },
    { rooms, lines: [{ ...line, roomName: "living room" }] },
    { rooms, lines: [line, { ...line, roomName: "Bedroom" }] },
    { rooms, lines: [{ ...line, quantity: -1 }] },
    { rooms, lines: [{ ...line, quantity: Infinity }] },
    { rooms, lines: [{ ...line, quantity: NaN }] },
    { rooms, lines: [{ ...line, quantity: 0, roomName: "Missing room" }] },
    { rooms, lines: [{ ...line, quantity: 0, unit: "" }] },
    { rooms, lines: [line, { ...line, quantity: 0 }] },
    { rooms, lines: [{ ...line, id: "x".repeat(501) }] },
    { rooms, lines: [{ ...line, unit: "" }] }
  ])("rejects ambiguous or malformed approved items %j", ({ rooms, lines }) => {
    expect(() => workflowEstimateRooms("estimate-a", 3, rooms, lines)).toThrow(WorkflowEstimateSourceError);
  });
  it("prefers the immutable matching snapshot and permits the bounded legacy source only when no approved round exists", () => {
    expect(workflowApprovedLines(source)).toEqual([line]);
    expect(workflowApprovedLines({ ...source, rounds: [] })).toEqual(source.legacyLines);
    expect(workflowApprovedLines({ ...source, reviewRoundId: "round-a" })).toEqual([line]);
  });
  it.each([
    { rounds: [{ ...round, estimateVersion: 2 }] },
    { rounds: [round, { ...round, id: "second-round" }] },
    { rounds: [{ ...round, projectId: "project-b" }] },
    { rounds: [{ ...round, decision: "reject" }] },
    { rounds: [{ ...round, decidedById: null }] },
    { rounds: [{ ...round, decidedAt: null }] },
    { rounds: [{ ...round, decisionSource: null }] },
    { rounds: [], reviewRoundId: "missing-pinned-round" },
    { rounds: [round], reviewRoundId: "different-pinned-round" }
  ])("never falls back to mutable lines over conflicting approval lineage %j", (change) => {
    expect(() => workflowApprovedLines({ ...source, ...change })).toThrow(WorkflowEstimateSourceError);
  });
  it("keeps memory source selection and sanitized projection aligned with the shared adapter", async () => {
    const seed = structuredClone(demoSeedData);
    seed.estimateSummaries = [{ ...seed.estimateSummaries![0]!, id: "estimate-a", projectId: "project-a", version: 4, status: "client_approved", approvedBaseline: null, rooms, lineItems: source.legacyLines }];
    seed.estimateReviewRounds = [round, { ...round, id: "foreign-round", estimateId: "foreign-estimate", projectId: "project-b" }];
    const repository = createMemoryRepository(seed);
    const expected = { estimateId: "estimate-a", estimateVersion: 3, rooms: workflowEstimateRooms("estimate-a", 3, rooms, [line]) };
    expect(await repository.findDesignWorkflowRoomContext("project-a", true)).toEqual(expected);
    expect(await repository.runInTransaction((tx) => tx.findDesignWorkflowRoomContext("project-a", true))).toEqual(expected);
    expect(await repository.findDesignWorkflowRoomOptions("project-a")).toEqual(expected.rooms);
    expect(await repository.findDesignWorkflowRoomContext("project-b")).toBeNull();
  });
  it("projects zero-only Master Bedroom and Kitchen selections from the immutable memory snapshot", async () => {
    const selectedRooms = [{ id: "living", label: "Living & Dining" }, { id: "bedroom", label: "Master Bedroom" }, { id: "kitchen", label: "Kitchen" }];
    const lines = [
      { ...line, id: "sofa", roomName: "Living & Dining" },
      { ...line, id: "wardrobe", roomName: "Master Bedroom", quantity: 0 },
      { ...line, id: null, roomName: "Kitchen", quantity: 0, unit: "pts" },
      { ...line, id: "excluded-bedroom", roomName: "Master Bedroom", included: false }
    ];
    const seed = structuredClone(demoSeedData);
    seed.estimateSummaries = [{ ...seed.estimateSummaries![0]!, id: "estimate-a", projectId: "project-a", version: 4, status: "client_approved", approvedBaseline: null, rooms: selectedRooms, lineItems: lines.map(item => ({ ...item, id: "live-only", included: false, quantity: 99 })) }];
    seed.estimateReviewRounds = [{ ...round, lineItems: lines }];
    const repository = createMemoryRepository(seed);
    const expected = { estimateId: "estimate-a", estimateVersion: 3, rooms: workflowEstimateRooms("estimate-a", 3, selectedRooms, lines) };
    expect(expected.rooms.map(room => room.estimateItems.map(item => ({ id: item.id, quantity: item.quantity, measurementType: item.measurementType })))).toEqual([
      [{ id: "sofa", quantity: 2, measurementType: "dimensions" }],
      [{ id: "wardrobe", quantity: 0, measurementType: "dimensions" }],
      [{ id: "legacy-estimate-line:estimate-a:3:2", quantity: 0, measurementType: "count" }]
    ]);
    expect(await repository.findDesignWorkflowRoomContext("project-a", true)).toEqual(expected);
    expect(await repository.runInTransaction(tx => tx.findDesignWorkflowRoomContext("project-a", true))).toEqual(expected);
    expect(await repository.findDesignWorkflowRoomOptions("project-a")).toEqual(expected.rooms);
  });
});

describe("workflow point classification from approved snapshots", () => {
  it.each(["pt", "pts", "point", "points", " PT ", "pTs.", " Point . ", "\tPOINTS.\n"])("classifies explicit unit %j as a count", unit => {
    const result = workflowEstimateRooms("estimate-a", 3, rooms, [{ ...line, unit }]);
    expect(result[0]!.estimateItems[0]).toMatchObject({ measurementType: "count", uom: unit });
  });
  it.each(["nos", "lot", "sqft", "mm", "points per room", "points extra", "pointss", "point.."])("retains dimensions for %j even when its name says points", unit => {
    const result = workflowEstimateRooms("estimate-a", 3, rooms, [{ ...line, specification: "Light fan switch points", unit }]);
    expect(result[0]!.estimateItems[0]!.measurementType).toBe("dimensions");
  });
  it("uses frozen approved units despite contradictory live lines", () => {
    const selected = workflowApprovedLines({ ...source, rounds: [{ ...round, lineItems: [{ ...line, unit: "pts" }] }], legacyLines: [{ ...line, unit: "nos" }] });
    expect(workflowEstimateRooms("estimate-a", 3, rooms, selected)[0]!.estimateItems[0]!.measurementType).toBe("count");
  });
});
