import { describe, expect, it } from "vitest";
import { projectProcurementBasketPriorityGroups, resolveProcurementPriority,
  type ProcurementPriorityResolution } from "../src/domain/procurement-basket-priority-groups.js";
import type { ProcurementBasketDetailDto, ProcurementBasketLineDto } from "../src/domain/procurement-basket-projection.js";

const selected = { id: "draft-a", status: "draft" as const };
const revision = { _id: "draft-a", mainLineId: "line-a", status: "draft", version: 3 };
const overview = (payload: unknown) => ({ mainLineId: "line-a", revisionId: "draft-a", sectionKey: "overview", payload });
const resolved = (value: "P1" | "P2" | "P3"): ProcurementPriorityResolution => ({
  state: "resolved", value, revision: { ...selected, version: 3 }
});

function line(key: string, mainLineId: string, extra: Partial<ProcurementBasketLineDto> = {}): ProcurementBasketLineDto {
  return { sourceLineItemKey: key, mainLineId, mainLineName: "Same display name", roomId: "living", roomName: "Living",
    subBasketId: "sub-a", subBasketName: "Walls", approvedQuantity: "1", approvedUnit: "sqft", approvedAmountPaise: 10_000,
    included: true, source: "configuration", mode: null, baseUnitRatePaise: null,
    projectRate: { version: 0, overridePaise: null }, standardCost: null, ...extra };
}
function basket(id: string, lines: ProcurementBasketLineDto[]): ProcurementBasketDetailDto {
  return { id, name: "Same basket name", projectId: "project-a", classification: "standard", automaticSubVendor: false,
    boqReady: false, standardCost: null, includedLineCount: lines.filter(row => row.included).length,
    readyLineCount: 0, approvedEstimatePaise: 10_000, baseCostPaise: 0, adjustedCostPaise: 0,
    workingTotalPaise: 0, workingTotalComplete: false, committedNetPaise: 0, state: "partial",
    estimateSource: { estimateId: "estimate-a", estimateVersion: 1, estimateReviewRoundId: "round-a" },
    preparationDigest: "a".repeat(64), lines };
}

describe("current revision closure priority validation", () => {
  it.each(["P1", "P2", "P3"] as const)("resolves %s only from a verified revision and Overview", priority => {
    expect(resolveProcurementPriority("line-a", selected, revision, overview({ closurePriority: priority })))
      .toEqual(resolved(priority));
  });
  it("keeps unset and unavailable separate without defaulting", () => {
    expect(resolveProcurementPriority("line-a", selected, revision, overview({})))
      .toEqual({ state: "unset", value: null, revision: { ...selected, version: 3 } });
    expect(resolveProcurementPriority("line-a", selected, revision, undefined))
      .toEqual({ state: "unavailable", value: null, revision: { ...selected, version: 3 } });
    expect(resolveProcurementPriority("line-a", selected, undefined, overview({ closurePriority: "P1" })))
      .toEqual({ state: "unavailable", value: null, revision: null });
    expect(resolveProcurementPriority("line-a", null, revision, overview({ closurePriority: "P1" })))
      .toEqual({ state: "unavailable", value: null, revision: null });
  });
  it.each([null, "", "p1", "P4", 1, true, [], {}])("rejects invalid saved priority %j", value => {
    expect(resolveProcurementPriority("line-a", selected, revision, overview({ closurePriority: value })))
      .toEqual({ state: "invalid", value: null, revision: { ...selected, version: 3 } });
  });
  it.each([
    [{ ...revision, mainLineId: "foreign-line" }, overview({ closurePriority: "P1" })],
    [{ ...revision, _id: "foreign-revision" }, overview({ closurePriority: "P1" })],
    [{ ...revision, status: "superseded" }, overview({ closurePriority: "P1" })],
    [{ ...revision, version: 0 }, overview({ closurePriority: "P1" })],
    [revision, { ...overview({ closurePriority: "P1" }), mainLineId: "foreign-line" }],
    [revision, { ...overview({ closurePriority: "P1" }), revisionId: "foreign-revision" }]
  ])("does not expose revision metadata on invalid ownership or identity", (current, section) => {
    expect(resolveProcurementPriority("line-a", selected, current, section))
      .toEqual({ state: "invalid", value: null, revision: null });
  });
  it.each([null, [], "P1"])("rejects malformed Overview payload %j", payload => {
    expect(resolveProcurementPriority("line-a", selected, revision, overview(payload)).state).toBe("invalid");
  });
});

describe("Procurement priority source partition", () => {
  it("splits mixed baskets in priority order while retaining repeated names and room instances", () => {
    const baskets = [basket("basket-a", [line("living:p3", "third"), line("living:p1", "first"), line("living:p2", "second")]),
      basket("basket-b", [line("bedroom:p1", "first", { roomId: "bedroom", roomName: "Bedroom" })])];
    const before = structuredClone(baskets);
    const groups = projectProcurementBasketPriorityGroups(baskets, new Map([
      ["first", resolved("P1")], ["second", resolved("P2")], ["third", resolved("P3")]
    ]));
    expect(groups.map(group => [group.priority, group.lineCount, group.items.map(row => row.sourceLineItemKey)]))
      .toEqual([["P1", 2, ["living:p1", "bedroom:p1"]], ["P2", 1, ["living:p2"]], ["P3", 1, ["living:p3"]]]);
    expect(groups[0]?.items.map(row => row.basketId)).toEqual(["basket-a", "basket-b"]);
    expect(baskets).toEqual(before);
    expect(JSON.stringify(groups)).not.toMatch(/Paise|baseRates|components|preparationDigest/);
  });
  it("includes only actionable scope and retained commitments, with explicit unresolved states", () => {
    const rows = [line("included", "unset"), line("zero", "first", { approvedAmountPaise: 0 }),
      line("historical", "first", { included: false }), line("excluded", "first", { included: false }),
      line("legacy", "first", { source: "legacy" }), line("unlinked", "first", { mainLineId: null }),
      line("missing", "missing")];
    const groups = projectProcurementBasketPriorityGroups([basket("basket-a", rows)], new Map([
      ["first", resolved("P1")], ["unset", { state: "unset", value: null, revision: { ...selected, version: 3 } }]
    ]), new Map([["historical", 333], ["zero", 222]]));
    expect(groups.map(group => [group.priority, group.lineCount])).toEqual([["P1", 2], ["unassigned", 4]]);
    expect(groups[0]?.items.map(row => [row.sourceLineItemKey, row.scope])).toEqual([["zero", "commitment_only"], ["historical", "commitment_only"]]);
    expect(groups[1]?.items.map(row => [row.sourceLineItemKey, row.resolution.state]))
      .toEqual([["included", "unset"], ["legacy", "legacy"], ["unlinked", "legacy"], ["missing", "unavailable"]]);
    expect(projectProcurementBasketPriorityGroups([], new Map())).toEqual([]);
  });
  it("keeps the existing execution labels and rejects duplicate source identity", () => {
    const rows = [line("pmc", "first", { mode: { executionPolicy: { intent: "pmc" } } as ProcurementBasketLineDto["mode"] }),
      line("pending", "first", { mode: { executionPolicy: { intent: "execution" } } as ProcurementBasketLineDto["mode"] }),
      line("selected", "first", { mode: { executionPolicy: { intent: "execution" }, decision: { mode: "in_house" } } as ProcurementBasketLineDto["mode"] })];
    expect(projectProcurementBasketPriorityGroups([basket("basket-a", rows)], new Map())[0]?.items.map(row => row.mode))
      .toEqual(["pmc", "execution_pending", "in_house"]);
    expect(() => projectProcurementBasketPriorityGroups([basket("a", [rows[0]!]), basket("b", [rows[0]!])], new Map()))
      .toThrow(/more than one priority item/);
  });
});
