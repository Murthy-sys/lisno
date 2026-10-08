import { describe, expect, it } from "vitest";
import { createProcurementGroupFixture, qaEmptyModeGroups } from "../../test/fixtures/enterpriseProcurementData";
import { hasValidProcurementModeGroups, type ProcurementBasketList } from "./procurementBasketApi";

describe("Procurement mode overview response compatibility", () => {
  it("accepts explicit mixed-basket partitions and valid empty modes", () => {
    const { list } = createProcurementGroupFixture();
    expect(hasValidProcurementModeGroups(list)).toBe(true);
    expect(hasValidProcurementModeGroups({ ...list, baskets: [], modeGroups: qaEmptyModeGroups() })).toBe(true);
  });
  it.each<[string, (list: ProcurementBasketList) => void]>([
    ["missing groups", (list) => { delete list.modeGroups; }],
    ["duplicated source occurrence across modes", (list) => { list.modeGroups![2]!.baskets[0]!.sourceLineItemKeys = ["living:standard"]; }],
    ["unrelated canonical basket", (list) => { list.modeGroups![2]!.baskets[0]!.id = "foreign-basket"; }],
    ["unsafe amount", (list) => { list.modeGroups![2]!.currentCostPaise = Number.MAX_SAFE_INTEGER + 1; }],
    ["fabricated zero for incomplete cost", (list) => { list.modeGroups![0]!.currentCostPaise = 0; }],
    ["missing complete cost", (list) => { list.modeGroups![2]!.currentCostPaise = null; }],
    ["ready count exceeds included count", (list) => { list.modeGroups![2]!.boqReadyLineCount = 3; }],
    ["mismatched basket count", (list) => { list.modeGroups![1]!.basketCount = 3; }],
    ["empty unresolved section", (list) => { Object.assign(list.modeGroups![3]!, { ...qaEmptyModeGroups()[0]!, mode: "unrecorded" }); }]
  ])("rejects %s without modifying the canonical response", (_name, mutate) => {
    const { list } = createProcurementGroupFixture();
    mutate(list);
    const canonical = structuredClone(list.baskets);
    expect(hasValidProcurementModeGroups(list)).toBe(false);
    expect(list.baskets).toEqual(canonical);
  });
});
