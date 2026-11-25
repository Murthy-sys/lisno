import { describe, expect, it } from "vitest";
import { createProcurementGroupBrowserFixture, createProcurementGroupFixture, qaEmptyModeGroups } from "../../test/fixtures/enterpriseProcurementData";
import { hasValidProcurementModeGroups, hasValidProcurementPriorityGroups, type ProcurementBasketList } from "./procurementBasketApi";

describe("Procurement mode overview response compatibility", () => {
  it("accepts explicit mixed-basket partitions and valid empty modes", () => {
    const { list } = createProcurementGroupFixture();
    expect(hasValidProcurementModeGroups(list)).toBe(true);
    expect(hasValidProcurementModeGroups({ ...list, baskets: [], modeGroups: qaEmptyModeGroups() })).toBe(true);
  });
  it("accepts a separate pending execution group before unrecorded and rejects reordered or duplicate groups", () => {
    const { list } = createProcurementGroupFixture();
    const pending = structuredClone(list.modeGroups![3]!);
    pending.mode = "execution_pending";
    pending.baskets[0]!.sourceLineItemKeys = ["living:execution-pending"];
    list.modeGroups!.splice(3, 0, pending);
    expect(hasValidProcurementModeGroups(list)).toBe(true);
    const reversed = structuredClone(list);
    reversed.modeGroups!.splice(3, 2, reversed.modeGroups![4]!, reversed.modeGroups![3]!);
    expect(hasValidProcurementModeGroups(reversed)).toBe(false);
    const duplicate = structuredClone(list);
    duplicate.modeGroups![4]!.mode = "execution_pending";
    expect(hasValidProcurementModeGroups(duplicate)).toBe(false);
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
    ["empty unresolved section", (list) => { Object.assign(list.modeGroups![3]!, { ...qaEmptyModeGroups()[0]!, mode: "unrecorded" }); }],
    ["empty pending section", (list) => { Object.assign(list.modeGroups![3]!, { ...qaEmptyModeGroups()[0]!, mode: "execution_pending" }); }]
  ])("rejects %s without modifying the canonical response", (_name, mutate) => {
    const { list } = createProcurementGroupFixture();
    mutate(list);
    const canonical = structuredClone(list.baskets);
    expect(hasValidProcurementModeGroups(list)).toBe(false);
    expect(list.baskets).toEqual(canonical);
  });
});

describe("Procurement priority overview response compatibility", () => {
  it("accepts explicit priority partitions, the larger browser fixture, and a genuinely empty source", () => {
    const { list } = createProcurementGroupFixture();
    expect(hasValidProcurementPriorityGroups(list)).toBe(true);
    expect(hasValidProcurementPriorityGroups(createProcurementGroupBrowserFixture().list)).toBe(true);
    expect(hasValidProcurementPriorityGroups({ ...list, baskets: [], priorityGroups: [] })).toBe(true);
  });

  it("accepts unresolved source metadata without inventing a priority", () => {
    for (const state of ["unset", "unavailable", "invalid", "legacy"] as const) {
      const { list } = createProcurementGroupFixture();
      const item = list.priorityGroups!.at(-1)!.items[0]!;
      item.resolution = { state, value: null, revision: state === "unset" ? item.resolution.revision : null };
      if (state === "legacy") item.mainLineId = null;
      expect(hasValidProcurementPriorityGroups(list)).toBe(true);
    }
  });

  it("retains a commitment-only source without counting it as included work", () => {
    const { list } = createProcurementGroupFixture();
    list.priorityGroups![0]!.items[0]!.scope = "commitment_only";
    list.baskets[0]!.includedLineCount -= 1;
    expect(hasValidProcurementPriorityGroups(list)).toBe(true);
    list.baskets[0]!.committedNetPaise = 0;
    expect(hasValidProcurementPriorityGroups(list)).toBe(false);
  });

  it.each<[string, (list: ProcurementBasketList) => void]>([
    ["missing metadata", list => { delete list.priorityGroups; }],
    ["empty groups with included work", list => { list.priorityGroups = []; }],
    ["reordered priorities", list => { list.priorityGroups!.reverse(); }],
    ["unknown priority", list => { Object.assign(list.priorityGroups![0]!, { priority: "P4" }); }],
    ["duplicate priority", list => { list.priorityGroups![1]!.priority = "P1"; }],
    ["empty panel", list => { list.priorityGroups![0]!.items = []; list.priorityGroups![0]!.lineCount = 0; }],
    ["wrong panel count", list => { list.priorityGroups![0]!.lineCount += 1; }],
    ["duplicate source key", list => { list.priorityGroups![1]!.items[0]!.sourceLineItemKey = list.priorityGroups![0]!.items[0]!.sourceLineItemKey; }],
    ["foreign basket", list => { list.priorityGroups![0]!.items[0]!.basketId = "another-project-basket"; }],
    ["wrong basket name", list => { list.priorityGroups![0]!.items[0]!.basketName = "Different basket"; }],
    ["resolution disagrees with group", list => { list.priorityGroups![0]!.items[0]!.resolution.value = "P2"; }],
    ["unresolved item in P1", list => { list.priorityGroups![0]!.items[0]!.resolution = { state: "unavailable", value: null, revision: null }; }],
    ["invented legacy priority", list => { list.priorityGroups!.at(-1)!.items[0]!.resolution = { state: "legacy", value: "P1", revision: null }; }],
    ["resolved without revision", list => { list.priorityGroups![0]!.items[0]!.resolution.revision = null; }],
    ["resolved without Main Line identity", list => { list.priorityGroups![0]!.items[0]!.mainLineId = null; }],
    ["invalid revision version", list => { list.priorityGroups![0]!.items[0]!.resolution.revision!.version = 0; }],
    ["invalid revision lifecycle", list => { Object.assign(list.priorityGroups![0]!.items[0]!.resolution.revision!, { status: "superseded" }); }],
    ["coercible revision lifecycle", list => { Object.assign(list.priorityGroups![0]!.items[0]!.resolution.revision!, { status: ["draft"] }); }],
    ["unknown execution mode", list => { Object.assign(list.priorityGroups![0]!.items[0]!, { mode: "new_mode" }); }],
    ["missing source identity", list => { list.priorityGroups![0]!.items[0]!.sourceLineItemKey = ""; }],
    ["missing included item", list => { list.priorityGroups![0]!.items.pop(); list.priorityGroups![0]!.lineCount -= 1; }],
    ["unlinked unset priority", list => { list.priorityGroups!.at(-1)!.items[0]!.mainLineId = null; }]
  ])("rejects %s and preserves canonical basket data", (_name, mutate) => {
    const { list } = createProcurementGroupFixture();
    mutate(list);
    const before = structuredClone(list.baskets);
    expect(hasValidProcurementPriorityGroups(list)).toBe(false);
    expect(list.baskets).toEqual(before);
    expect(hasValidProcurementModeGroups(list)).toBe(true);
  });
});
