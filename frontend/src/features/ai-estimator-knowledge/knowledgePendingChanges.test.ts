import { describe, expect, it } from "vitest";
import { pairPendingRows, pendingObjectRows, pendingRowsReordered, pendingText, pendingValuesEqual } from "./knowledgePendingChanges";

describe("pending change comparisons", () => {
  it("ignores object property order and omitted undefined, preserving exact values", () => {
    expect(pendingValuesEqual({ a: 1, b: false }, { b: false, a: 1, c: undefined })).toBe(true);
    for (const [a, b] of [[false, null], [0, "0"], [" ", ""], [null, undefined], [[1, 2], [2, 1]]]) expect(pendingValuesEqual(a, b)).toBe(false);
  });
  it("matches duplicate labels by IDs, with additions and removals separate", () => {
    const pairs = pairPendingRows([{ id: "one", name: "Same", value: 1 }, { id: "two", name: "Same", value: 2 }],
      [{ id: "two", name: "Same", value: 3 }, { id: "three", name: "Same", value: 4 }]);
    expect(pairs[0]).toMatchObject({ key: "id:two", before: { value: 2 }, after: { value: 3 } });
    expect(pairs[1]?.before).toBeUndefined();
    expect(pairs[2]?.after).toBeUndefined();
  });
  it("does not count added or removed row shifts as reordered", () => {
    const before = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pendingRowsReordered(pairPendingRows(before, [{ id: "x" }, { id: "b" }, { id: "c" }]))).toBe(false);
    expect(pendingRowsReordered(pairPendingRows(before, [{ id: "c" }, { id: "a" }]))).toBe(true);
  });
  it("retains legacy identities by content, with a single unambiguous edit", () => {
    const before = [{ name: "Same", value: 1 }, { name: "Same", value: 2 }];
    const pairs = pairPendingRows(before, [{ name: "Same", value: 3 }, { name: "Same", value: 2 }]);
    expect(pairs[0]?.before).toEqual(before[0]);
    expect(pairs[1]?.before).toEqual(before[1]);
  });
  it("does not guess associations for multiple ambiguous ID-less replacements", () => {
    const pairs = pairPendingRows([{ name: "Same", value: 1 }, { name: "Same", value: 2 }], [{ name: "Same", value: 3 }, { name: "Same", value: 4 }]);
    expect(pairs.filter((pair) => pair.before && pair.after)).toHaveLength(0);
  });
  it("never formats nested objects as raw JSON and keeps false and zero readable", () => {
    expect(pendingText(false)).toBe("No");
    expect(pendingText(0)).toBe("0");
    expect(pendingText({ secret: "metadata" })).toBe("");
    expect(pendingObjectRows([null, 4, [], { name: "Row" }])).toEqual([{ name: "Row" }]);
  });
});
