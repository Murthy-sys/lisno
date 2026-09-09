import { describe, expect, it } from "vitest";
import { qualityPendingChanges, qualityPendingRowState } from "./knowledgeQualityPendingChanges";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

const saved: KnowledgeJsonObject = {
  id: "check-1", label: "Are fittings aligned?", type: "boolean", required: true, active: true,
  acceptanceCriteria: "Match the approved detail.", evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 2 }
};
const project = (baseline: readonly KnowledgeJsonObject[], parameters: readonly KnowledgeJsonObject[]) => qualityPendingChanges({ sourceKey: "item:revision:quality", basketId: "electrical", basketName: "Electrical", baseline, parameters });
const entries = (baseline: readonly KnowledgeJsonObject[], parameters: readonly KnowledgeJsonObject[]) => project(baseline, parameters).groups.flatMap(group => group.entries);

describe("quality pending changes", () => {
  it("omits a saved checklist and all untouched hidden metadata", () => {
    expect(entries([saved], [structuredClone(saved)])).toEqual([]);
    expect(entries([{ ...saved, required: false, active: false, severity: "critical", instructions: "Saved instructions" }], [{ ...saved, severity: "minor", instructions: "Different legacy metadata" }])).toEqual([]);
  });

  it("shows only a changed field and the existing question identity", () => {
    expect(project([saved], [{ ...saved, acceptanceCriteria: "Fixings match the new layout." }])).toEqual({
      sourceKey: "item:revision:quality", groups: [{ key: "quality:electrical", label: "Shared checklist · Electrical", entries: [{
        key: "id:check-1", title: "Are fittings aligned?", kind: "updated", incomplete: false,
        fields: [{ key: "acceptanceCriteria", label: "Acceptance criteria", value: "Fixings match the new layout." }]
      }] }]
    });
  });

  it("keeps the current question, whitespace and complete entered content", () => {
    const label = "  Inspect every fitting  ";
    expect(entries([saved], [{ ...saved, label }])[0]).toMatchObject({ title: label, fields: [{ key: "label", value: label }] });
  });

  it("uses readable answer labels and includes changed answer options", () => {
    const rows = entries([saved], [{ ...saved, type: "radio", allowedValues: ["Pass", "Fail", "Not applicable"] }]);
    expect(rows[0]?.fields).toEqual([
      { key: "type", label: "Answer type", value: "Single choice (radio)" },
      { key: "allowedValues", label: "Answer options", value: "Pass, Fail, Not applicable" }
    ]);
  });

  it("identifies cleared choice options as incomplete without copying the saved options", () => {
    const original = { ...saved, type: "dropdown", allowedValues: ["Approved", "Rejected"] };
    expect(entries([original], [{ ...original, allowedValues: [] }])[0]).toMatchObject({
      incomplete: true, fields: [{ key: "allowedValues", value: "", cleared: true }]
    });
  });

  it("ignores type-driven changes to hidden defaults, bounds and units", () => {
    expect(entries([{ ...saved, type: "number", minimum: "0", maximum: "10", defaultValue: "5", unit: "mm" }], [{ ...saved, defaultValue: null }])[0]?.fields).toEqual([
      { key: "type", label: "Answer type", value: "Yes / No" }
    ]);
  });

  it("treats absent/null/empty optional text and default false photo evidence equally", () => {
    expect(entries([{ id: "one", label: "Question", type: "text" }], [{ id: "one", label: "Question", type: "text", acceptanceCriteria: null, evidence: { photos: false, documents: false, video: false, minPhotosPerSample: null } }])).toEqual([]);
  });

  it("marks a cleared required question and criteria without exposing old values", () => {
    expect(entries([saved], [{ ...saved, label: "", acceptanceCriteria: null }])[0]).toMatchObject({
      title: "Are fittings aligned?", incomplete: true, fields: [
        { key: "label", value: "", cleared: true }, { key: "acceptanceCriteria", value: "", cleared: true }
      ]
    });
  });

  it("shows only a changed photo count and preserves invalid zero", () => {
    expect(entries([saved], [{ ...saved, evidence: { photos: true, minPhotosPerSample: 0 } }])[0]).toMatchObject({
      incomplete: true, fields: [{ key: "photoCount", label: "Required photos", value: "0" }]
    });
  });

  it("shows disabled photo evidence and a cleared count", () => {
    expect(entries([saved], [{ ...saved, evidence: { photos: false, minPhotosPerSample: null } }])[0]?.fields).toEqual([
      { key: "photos", label: "Photo evidence", value: "Not required" },
      { key: "photoCount", label: "Required photos", value: "", cleared: true }
    ]);
  });

  it("shows a compact intentionally added blank row", () => {
    expect(entries([], [{ id: "new", type: "text", label: "", required: true, active: true }])).toEqual([
      { key: "id:new", title: "New quality check", kind: "added", incomplete: true, fields: [{ key: "type", label: "Answer type", value: "Text" }] }
    ]);
  });

  it("shows imported entered fields but excludes hidden workbook metadata", () => {
    expect(entries([], [{ ...saved, category: "Saved import category", sampling: { method: "all", unit: "fittings" } }])[0]?.fields.map(field => field.key)).toEqual(["label", "type", "acceptanceCriteria", "photos", "photoCount"]);
  });

  it("shows minimal removal identity and no saved row fields", () => {
    expect(entries([saved], [])).toEqual([{ key: "id:check-1", title: "Are fittings aligned?", kind: "removed", fields: [] }]);
  });

  it("removes reverted changes and add-then-remove entries", () => {
    expect(entries([saved], [{ ...saved, acceptanceCriteria: "Match the approved detail." }])).toEqual([]);
    expect(entries([saved], [saved])).toEqual([]);
    expect(entries([], [])).toEqual([]);
  });

  it("does not match duplicate question labels instead of distinct IDs", () => {
    const second = { ...saved, id: "check-2" };
    expect(entries([saved, second], [saved, { ...second, acceptanceCriteria: "Second check only" }])[0]).toMatchObject({ key: "id:check-2", kind: "updated", fields: [{ value: "Second check only" }] });
  });

  it("shows retained-row reordering separately without counting deletion shifts", () => {
    const second = { ...saved, id: "check-2", label: "Second" };
    expect(entries([saved, second], [second, saved])).toEqual([{ key: "check-order", title: "Checklist order", kind: "reordered", fields: [] }]);
    expect(entries([saved, second], [second])).toHaveLength(1);
    expect(entries([saved, second], [second])[0]?.kind).toBe("removed");
  });

  it("tracks successive distinct ID-less local edits without changing persisted rows", () => {
    const initial: KnowledgeJsonObject[] = [{ label: "First legacy check", type: "text", required: false }, { label: "Second legacy check", type: "boolean" }];
    const baselineRows = qualityPendingRowState(initial);
    const firstEdit = [{ ...initial[0], label: "First pending", required: true }, initial[1]!];
    const first = qualityPendingRowState(firstEdit, baselineRows);
    const secondEdit = [firstEdit[0]!, { ...initial[1], label: "Second pending" }];
    const second = qualityPendingRowState(secondEdit, first);
    const result = qualityPendingChanges({ sourceKey: "legacy", basketId: "other", basketName: "Carpentry", baseline: initial, parameters: secondEdit, baselineRows, parameterRows: second });
    expect(result.groups[0]?.entries).toHaveLength(2);
    expect(result.groups[0]?.entries.every(entry => entry.kind === "updated")).toBe(true);
    expect(initial.every(row => !Object.hasOwn(row, "id"))).toBe(true);
    expect(secondEdit.every(row => !Object.hasOwn(row, "id"))).toBe(true);
  });

  it("does not reuse a removed local identity for a new ID-less addition", () => {
    const baseline = qualityPendingRowState([{ label: "Original", type: "text" }]);
    const empty = qualityPendingRowState([], baseline);
    const next = qualityPendingRowState([{ label: "New", type: "text" }], empty);
    expect(next.rows[0]?.identity).not.toBe(baseline.rows[0]?.identity);
  });

  it("keeps identical legacy rows in place through edits and complete revert", () => {
    const initial = [{ label: "Same check", type: "text" }, { label: "Same check", type: "text" }];
    const baselineRows = qualityPendingRowState(initial);
    const firstValues = initial.map((row, index) => ({ ...row, type: index === 0 ? "boolean" : row.type, required: true, active: true }));
    const first = qualityPendingRowState(firstValues, baselineRows);
    expect(first.rows.map(row => row.identity)).toEqual(baselineRows.rows.map(row => row.identity));
    const project = (parameters: readonly KnowledgeJsonObject[], parameterRows: ReturnType<typeof qualityPendingRowState>) => qualityPendingChanges({
      sourceKey: "legacy", basketId: "basket", basketName: "Carpentry", baseline: initial, parameters, baselineRows, parameterRows
    }).groups.flatMap(group => group.entries);
    expect(project(firstValues, first)).toEqual([expect.objectContaining({ kind: "updated", fields: [{ key: "type", label: "Answer type", value: "Yes / No" }] })]);
    const secondValues = firstValues.map((row, index) => ({ ...row, label: index === 1 ? "Second pending check" : row.label }));
    const second = qualityPendingRowState(secondValues, first);
    expect(project(secondValues, second).map(entry => entry.kind)).toEqual(["updated", "updated"]);
    const revertFirstValues = secondValues.map((row, index) => ({ ...row, type: index === 0 ? "text" : row.type }));
    const revertFirst = qualityPendingRowState(revertFirstValues, second);
    const reverted = qualityPendingRowState(initial, revertFirst);
    expect(project(initial, reverted)).toEqual([]);
    expect(initial.every(row => !Object.hasOwn(row, "id"))).toBe(true);
  });

  it("still tracks a real reorder after editing a formerly identical legacy row", () => {
    const initial = [{ label: "Same check", type: "text" }, { label: "Same check", type: "text" }];
    const baselineRows = qualityPendingRowState(initial);
    const edited = [{ ...initial[0], type: "boolean" }, { ...initial[1] }];
    const afterEdit = qualityPendingRowState(edited, baselineRows);
    const moved = [edited[1]!, edited[0]!];
    const afterMove = qualityPendingRowState(moved, afterEdit);
    expect(afterMove.rows.map(row => row.identity)).toEqual([...afterEdit.rows].reverse().map(row => row.identity));
    const entries = qualityPendingChanges({ sourceKey: "legacy", basketId: "basket", basketName: "Carpentry", baseline: initial, parameters: moved, baselineRows, parameterRows: afterMove }).groups[0]?.entries;
    expect(entries?.map(entry => entry.kind)).toEqual(["updated", "reordered"]);
  });

  it("keeps ambiguous ID-less replacements as additions/removals instead of label joins", () => {
    const baseline = [{ label: "Same", type: "text" }, { label: "Same", type: "text" }];
    const result = entries(baseline, [{ label: "Same", type: "boolean" }, { label: "Same", type: "number" }]);
    expect(result.map(entry => entry.kind)).toEqual(["added", "added", "removed", "removed"]);
  });
});
