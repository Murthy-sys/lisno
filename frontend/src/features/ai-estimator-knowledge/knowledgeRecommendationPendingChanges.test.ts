import { describe, expect, it } from "vitest";
import {
  acknowledgeRecommendationPendingChangesTracker,
  advanceRecommendationPendingChangesTracker,
  createRecommendationPendingChangesTracker,
  projectRecommendationPendingChanges,
  type KnowledgeRecommendationPendingChangesTracker
} from "./knowledgeRecommendationPendingChanges";
import type { KnowledgeBasket, KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeMaster } from "./knowledgeTypes";

const baskets = [
  { id: "electrical-id", name: "Electrical" },
  { id: "gypsum-id", name: "POP / Gypsum" }
] as KnowledgeBasket[];
const items = [
  { mainLineId: "light-id", mainLineName: "Recessed downlight", basketId: "electrical-id", subBasketId: "lighting-id", subBasketName: "Ceiling lighting", itemType: "main_line" },
  { mainLineId: "gypsum-light-id", mainLineName: "Recessed downlight", basketId: "gypsum-id", subBasketId: "ceiling-id", subBasketName: "Ceiling details", itemType: "main_line" },
  { mainLineId: "temporary-id", mainLineName: "Pendant alternative", basketId: "electrical-id", subBasketId: null, itemType: "temporary" }
] as KnowledgeItemListItem[];
const masters = { priorities: [{ id: "priority-id", name: "High" }, { id: "other-priority-id", name: "Low" }] as KnowledgeMaster[] };
const rule: KnowledgeJsonObject = { id: "rule-id", trigger: "removed", action: "remove", requirement: "must", targetType: "catalog", targetBasketId: "electrical-id", targetSubBasketId: "lighting-id", targetMainLineId: "light-id", reason: "Saved explanation", active: true };
const recommendation: KnowledgeJsonObject = { id: "recommendation-id", name: "Specify warm light", priorityId: "priority-id", reason: "Saved recommendation reason", active: true, dependency: false };
const exclusion: KnowledgeJsonObject = { id: "exclusion-id", name: "Decorative pendants", reason: "Saved exclusion reason", active: true };
const saved: KnowledgeJsonObject = { budgetAlterations: [rule], recommendations: [recommendation], exclusions: [exclusion] };
const project = (baseline: KnowledgeJsonObject, payload: KnowledgeJsonObject, references: Partial<Parameters<typeof projectRecommendationPendingChanges>[0]> = {}) => projectRecommendationPendingChanges({ baseline, payload, baskets, items, masters, ...references });
const changedRule = (changes: KnowledgeJsonObject) => ({ ...saved, budgetAlterations: [{ ...rule, ...changes }] });

describe("recommendation pending changes", () => {
  it("omits all saved rows and unrelated metadata even when envelopes are new objects", () => {
    expect(project(saved, structuredClone(saved))).toEqual([]);
    expect(project(saved, { ...saved, hiddenMetadata: "changed", recommendations: [{ ...recommendation, active: false, dependency: true }], exclusions: [{ ...exclusion, active: false }] })).toEqual([]);
    expect(project({}, { budgetAlterations: [], recommendations: [], exclusions: [] })).toEqual([]);
  });

  it("groups a single changed rule field without saved descriptions or selections", () => {
    const groups = project(saved, changedRule({ reason: "Coordinate access with the ceiling installer" }));
    expect(groups).toEqual([{ key: "budgetAlterations", label: "Budget Alterations", entries: [{ key: "id:rule-id", title: "Rule 1", kind: "updated", fields: [{ key: "reason", label: "Reason", value: "Coordinate access with the ceiling installer" }] }] }]);
    expect(JSON.stringify(groups)).not.toMatch(/Saved explanation|Recessed downlight|Specify warm light/);
  });

  it("projects trigger, paired scope action and explicit disabled state without unrelated context", () => {
    const [entry] = project(saved, changedRule({ trigger: "added", action: "add", requirement: "can", active: false }))[0]!.entries;
    expect(entry.fields).toEqual([
      { key: "trigger", label: "Trigger", value: "The item is added to scope" },
      { key: "scopeAction", label: "Scope action", value: "Can be added" },
      { key: "active", label: "Enabled", value: "No" }
    ]);
    expect(project(changedRule({ active: false }), saved)[0]!.entries[0]!.fields).toEqual([{ key: "active", label: "Enabled", value: "Yes" }]);
  });

  it("uses real target identities and exact basket context even when item names are the same", () => {
    const entry = project(saved, changedRule({ targetBasketId: "gypsum-id", targetSubBasketId: "ceiling-id", targetMainLineId: "gypsum-light-id" }))[0]!.entries[0]!;
    expect(entry.fields).toEqual([
      { key: "targetBasketId", label: "Main Basket", value: "POP / Gypsum" },
      { key: "targetSubBasketId", label: "Sub Basket", value: "Ceiling details" },
      { key: "targetMainLineId", label: "Related item", value: "Recessed downlight" }
    ]);
    expect(entry.fields.map((field) => field.value).join(" ")).not.toMatch(/gypsum-id|ceiling-id|gypsum-light-id/);
  });

  it("shows temporary selection changes without suggesting that catalog creation is unsaved", () => {
    const entry = project(saved, changedRule({ targetType: "temporary", targetSubBasketId: null, targetMainLineId: "temporary-id" }))[0]!.entries[0]!;
    expect(entry.fields).toEqual([
      { key: "targetType", label: "Item type", value: "Temporary item" },
      { key: "targetSubBasketId", label: "Sub Basket", value: "", cleared: true },
      { key: "targetMainLineId", label: "Related item", value: "Pendant alternative" }
    ]);
    expect(entry.kind).toBe("updated");
  });

  it("uses readable unavailable references without leaking IDs or another basket's labels", () => {
    const entry = project(saved, changedRule({ targetBasketId: "missing-basket", targetSubBasketId: "missing-sub", targetMainLineId: "gypsum-light-id" }))[0]!.entries[0]!;
    expect(entry.fields.map((field) => field.value)).toEqual([
      "Selected Main Basket — details unavailable", "Selected Sub Basket — details unavailable", "Selected related item — details unavailable"
    ]);
    expect(project(saved, changedRule({ targetType: "temporary", targetMainLineId: "light-id" }))[0]!.entries[0]!.fields.map((field) => field.key)).toEqual(["targetType"]);
    const invalid = project(saved, changedRule({ targetMainLineId: "temporary-id" }))[0]!.entries[0]!;
    expect(invalid.fields[0]!.value).toBe("Selected related item — details unavailable");
  });

  it("uses already confirmed details during an incomplete list refresh", () => {
    const confirmed = { ...items[0], mainLineId: "new-id", mainLineName: "Newly created access fitting" };
    const entry = project(saved, changedRule({ targetMainLineId: "new-id" }), { items: [...items, confirmed] })[0]!.entries[0]!;
    expect(entry.fields).toEqual([{ key: "targetMainLineId", label: "Related item", value: confirmed.mainLineName }]);
    expect(project(saved, saved, { items: [...items, confirmed] })).toEqual([]);
  });

  it("retains clear operations and incomplete text instead of copying their saved values", () => {
    const entry = project(saved, changedRule({ reason: "", targetMainLineId: null }))[0]!.entries[0]!;
    expect(entry.incomplete).toBe(true);
    expect(entry.fields).toEqual([
      { key: "targetMainLineId", label: "Related item", value: "", cleared: true },
      { key: "reason", label: "Reason", value: "", cleared: true }
    ]);
    const whitespace = project(saved, changedRule({ reason: "  " }))[0]!.entries[0]!;
    expect(whitespace.fields[0]!.value).toBe("  ");
    expect(whitespace.incomplete).toBe(true);
  });

  it("shows an intentionally added blank rule as incomplete and cancels add then remove", () => {
    const blank = { id: "blank-id", trigger: "removed", action: "remove", requirement: "must", targetType: "catalog", targetBasketId: "", targetSubBasketId: null, targetMainLineId: null, reason: "", active: true };
    const entry = project(saved, { ...saved, budgetAlterations: [rule, blank] })[0]!.entries[0]!;
    expect(entry).toMatchObject({ title: "Rule 2", kind: "added", incomplete: true });
    expect(entry.fields.map((field) => field.label)).toEqual(["Trigger", "Scope action", "Item type"]);
    expect(project(saved, saved)).toEqual([]);
    expect(project({}, { budgetAlterations: [] })).toEqual([]);
  });

  it("shows saved removals as identity only without replaying deleted data", () => {
    const groups = project(saved, {});
    expect(groups.map((group) => group.entries[0])).toEqual([
      { key: "id:rule-id", title: "Rule 1", kind: "removed", fields: [] },
      { key: "id:recommendation-id", title: "Specify warm light", kind: "removed", fields: [] },
      { key: "id:exclusion-id", title: "Decorative pendants", kind: "removed", fields: [] }
    ]);
  });

  it("covers each editable legacy field while excluding unchanged hidden metadata", () => {
    const groups = project(saved, { ...saved, recommendations: [{ ...recommendation, name: "Coordinate dimmers", reason: "Confirm compatibility", priorityId: "other-priority-id" }], exclusions: [{ ...exclusion, reason: "Client supply" }] });
    expect(groups[0]!.entries[0]!.fields).toEqual([
      { key: "name", label: "Recommendation", value: "Coordinate dimmers" },
      { key: "priorityId", label: "Priority", value: "Low" },
      { key: "reason", label: "Reason", value: "Confirm compatibility" }
    ]);
    expect(groups[1]!.entries[0]!.fields).toEqual([{ key: "reason", label: "Reason", value: "Client supply" }]);
    expect(JSON.stringify(groups)).not.toMatch(/Saved recommendation reason|Saved exclusion reason|active|dependency/);
  });

  it("shows new legacy rows and unresolved/cleared optional selections precisely", () => {
    const groups = project({}, { recommendations: [{ id: "new-rec", name: "Task light", priorityId: "not-loaded", reason: null }], exclusions: [{ id: "new-ex", name: "" }] });
    expect(groups[0]!.entries[0]!).toMatchObject({ kind: "added", fields: [{ key: "name", label: "Recommendation", value: "Task light" }, { key: "priorityId", label: "Priority", value: "Selected priority — details unavailable" }] });
    expect(groups[1]!.entries[0]!).toMatchObject({ kind: "added", incomplete: true, fields: [] });
    const cleared = project(saved, { ...saved, recommendations: [{ ...recommendation, priorityId: "", reason: null }] })[0]!.entries[0]!;
    expect(cleared.incomplete).toBe(true);
    expect(cleared.fields.every((field) => field.cleared)).toBe(true);
  });

  it("normalizes editor empty-value conventions and removes reverted changes", () => {
    const baseline = { recommendations: [{ ...recommendation, reason: null }], exclusions: [{ ...exclusion, reason: "" }] };
    expect(project(baseline, { recommendations: [{ ...recommendation, reason: "" }], exclusions: [{ id: exclusion.id, name: exclusion.name }] })).toEqual([]);
    expect(project(saved, changedRule({ reason: rule.reason }))).toEqual([]);
    expect(project(saved, { ...saved, recommendations: [{ ...recommendation, name: "Specify warm light " }] })[0]!.entries[0]!.fields[0]!.value).toBe("Specify warm light ");
  });

  it("keeps duplicate labels separate by ID and reports retained row order only", () => {
    const second = { ...recommendation, id: "second-rec", reason: "Second saved reason" };
    const baseline = { recommendations: [recommendation, second] };
    const group = project(baseline, { recommendations: [{ ...second, reason: "Only second changed" }, recommendation] })[0]!;
    expect(group.entries).toEqual([
      { key: "id:second-rec", title: "Specify warm light", kind: "updated", fields: [{ key: "reason", label: "Reason", value: "Only second changed" }] },
      { key: "order", title: "Recommendations order", kind: "reordered", fields: [] }
    ]);
    expect(project(baseline, { recommendations: [second] })[0]!.entries.map((entry) => entry.kind)).toEqual(["removed"]);
  });

  it("handles a single ID-less legacy edit conservatively without name joins or persisted identities", () => {
    const old = { name: "Old legacy exclusion", reason: "Saved" };
    const baseline = { exclusions: [old] };
    const payload = { exclusions: [{ ...old, reason: "Changed" }] };
    expect(project(baseline, payload)[0]!.entries).toEqual([{ key: "local:0", title: old.name, kind: "updated", fields: [{ key: "reason", label: "Reason", value: "Changed" }] }]);
    expect(payload.exclusions[0]).not.toHaveProperty("id");
    const ambiguous = project({ exclusions: [old, { ...old, reason: "Other saved" }] }, { exclusions: [{ ...old, reason: "First edit" }, { ...old, reason: "Second edit" }] });
    expect(ambiguous[0]!.entries.map((entry) => entry.kind)).toEqual(["added", "added", "removed", "removed"]);
  });

  it("does not treat hidden metadata or empty-value normalization in multiple ID-less rows as edits", () => {
    expect(project({ exclusions: [{ name: "Decoration", reason: null, active: true }, { name: "Decoration", reason: "", active: false }] }, {
      exclusions: [{ name: "Decoration", reason: "", active: false }, { name: "Decoration", active: true }]
    })).toEqual([]);
    expect(project({ recommendations: [{ name: "Warm light", priorityId: "priority-id", reason: null }, { name: "Task light", priorityId: "other-priority-id", reason: "" }] }, {
      recommendations: [{ name: "Warm light", priorityId: "priority-id", reason: "" }, { name: "Task light", priorityId: "other-priority-id", reason: null }]
    })).toEqual([]);
  });
});

describe("recommendation session-only legacy tracking", () => {
  const projectTracker = (tracker: KnowledgeRecommendationPendingChangesTracker) => projectRecommendationPendingChanges({ ...tracker.projection, baskets, items, masters });

  it("keeps two sequential edits to ID-less saved rows as precise updates", () => {
    const first = { name: "Lighting requirement", reason: "Saved first reason", priorityId: "priority-id" };
    const second = { name: "Lighting requirement", reason: "Saved second reason", priorityId: "other-priority-id" };
    const baseline = { recommendations: [first, second] };
    let tracker = createRecommendationPendingChangesTracker(baseline);
    const firstEdit = { ...first, reason: "Coordinate dimmer compatibility" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstEdit, second] });
    const secondEdit = { ...second, priorityId: "priority-id" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstEdit, secondEdit] });
    const entries = projectTracker(tracker)[0]!.entries;
    expect(entries.map((entry) => ({ kind: entry.kind, fields: entry.fields }))).toEqual([
      { kind: "updated", fields: [{ key: "reason", label: "Reason", value: firstEdit.reason }] },
      { kind: "updated", fields: [{ key: "priorityId", label: "Priority", value: "High" }] }
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Saved first reason|Saved second reason/);
    expect(entries[0]!.key).not.toBe(entries[1]!.key);
  });

  it("keeps completely identical legacy rows distinct by retained local objects and supports full revert", () => {
    const first = { name: "Lighting requirement", reason: "Original", priorityId: "priority-id" };
    const second = { ...first };
    let tracker = createRecommendationPendingChangesTracker({ recommendations: [first, second] });
    const firstEdit = { ...first, reason: "First edited reason" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstEdit, second] });
    const secondEdit = { ...second, name: "Second edited name" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstEdit, secondEdit] });
    const entries = projectTracker(tracker)[0]!.entries;
    expect(entries.map((entry) => entry.fields)).toEqual([
      [{ key: "reason", label: "Reason", value: firstEdit.reason }],
      [{ key: "name", label: "Recommendation", value: secondEdit.name }]
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(["updated", "updated"]);
    const firstReverted = { ...first };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstReverted, secondEdit] });
    expect(projectTracker(tracker)[0]!.entries).toHaveLength(1);
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstReverted, { ...second }] });
    expect(projectTracker(tracker)).toEqual([]);
  });

  it("handles multi-edit exclusions, new-row edit/remove and complete restoration", () => {
    const first = { name: "Decorative items", reason: "First saved" };
    const second = { name: "Decorative items", reason: "Second saved" };
    const original = { exclusions: [first, second] };
    let tracker = createRecommendationPendingChangesTracker(original);
    const editedFirst = { ...first, reason: "Client supply" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [editedFirst, second] });
    const editedSecond = { ...second, name: "Movable fittings" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [editedFirst, editedSecond] });
    expect(projectTracker(tracker)[0]!.entries.map((entry) => entry.fields)).toEqual([
      [{ key: "reason", label: "Reason", value: "Client supply" }],
      [{ key: "name", label: "Exclusion", value: "Movable fittings" }]
    ]);
    const added = { name: "", reason: "" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [editedFirst, editedSecond, added] });
    const updatedAddition = { ...added, name: "Loose furniture" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [editedFirst, editedSecond, updatedAddition] });
    expect(projectTracker(tracker)[0]!.entries.map((entry) => entry.kind)).toEqual(["updated", "updated", "added"]);
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [editedFirst, editedSecond] });
    expect(projectTracker(tracker)[0]!.entries.map((entry) => entry.kind)).toEqual(["updated", "updated"]);
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [first, editedSecond] });
    tracker = advanceRecommendationPendingChangesTracker(tracker, original);
    expect(projectTracker(tracker)).toEqual([]);
  });

  it("preserves identity through reorder and removal of equal-looking legacy rows", () => {
    const first = { name: "Same name", reason: "Same reason" };
    const second = { ...first };
    let tracker = createRecommendationPendingChangesTracker({ exclusions: [first, second] });
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [second, first] });
    expect(projectTracker(tracker)[0]!.entries.map((entry) => entry.kind)).toEqual(["reordered"]);
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [second] });
    const entries = projectTracker(tracker)[0]!.entries;
    expect(entries).toEqual([{ key: "id:local:0", title: "Same name", kind: "removed", fields: [] }]);
  });

  it("ignores metadata and null/empty changes while retaining edited rows over subsequent updates", () => {
    const first: KnowledgeJsonObject = { name: "First", reason: null, active: true };
    const second: KnowledgeJsonObject = { name: "Second", reason: "", active: false };
    let tracker = createRecommendationPendingChangesTracker({ exclusions: [first, second] });
    const normalizedFirst = { ...first, reason: "", active: false };
    const normalizedSecond = { ...second, reason: null, active: true };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [normalizedFirst, normalizedSecond] });
    expect(projectTracker(tracker)).toEqual([]);
    const editedFirst = { ...normalizedFirst, reason: "Recently entered first reason" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [editedFirst, normalizedSecond] });
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [editedFirst, { ...normalizedSecond, reason: "Recently entered second reason" }] });
    expect(projectTracker(tracker)[0]!.entries.map((entry) => entry.kind)).toEqual(["updated", "updated"]);
  });

  it("keeps presentation IDs out of real payloads and leaves budget reference IDs unchanged", () => {
    const legacy = Object.freeze({ name: "Saved legacy note", reason: "Saved reason" });
    const baseline = Object.freeze({ exclusions: Object.freeze([legacy]), budgetAlterations: Object.freeze([rule]) });
    let tracker = createRecommendationPendingChangesTracker(baseline);
    const edited = Object.freeze({ ...legacy, reason: "Pending reason" });
    const actual = Object.freeze({ exclusions: Object.freeze([edited]), budgetAlterations: baseline.budgetAlterations });
    tracker = advanceRecommendationPendingChangesTracker(tracker, actual);
    expect(baseline.exclusions[0]).not.toHaveProperty("id");
    expect(actual.exclusions[0]).not.toHaveProperty("id");
    expect(tracker.projection.payload.exclusions).toEqual([{ ...edited, id: "local:0" }]);
    expect(tracker.projection.payload.budgetAlterations).toBe(actual.budgetAlterations);
    expect(JSON.stringify(actual)).not.toMatch(/local:|saved:/);
    const fields = projectTracker(tracker)[0]!.entries.flatMap((entry) => entry.fields);
    expect(JSON.stringify(fields)).not.toMatch(/local:|saved:/);
  });

  it("retains real row identities alongside legacy rows and resets after confirmed save", () => {
    const legacy = { name: "Legacy exclusion", reason: "Before" };
    const baseline = { exclusions: [exclusion, legacy] };
    let tracker = createRecommendationPendingChangesTracker(baseline);
    const changedLegacy = { ...legacy, reason: "After" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [exclusion, changedLegacy] });
    const changedStable = { ...exclusion, reason: "Client confirmed" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { exclusions: [changedStable, changedLegacy] });
    expect(projectTracker(tracker)[0]!.entries.map((entry) => entry.kind)).toEqual(["updated", "updated"]);
    const confirmedSaved = { exclusions: [{ ...changedStable }, { ...changedLegacy }] };
    tracker = createRecommendationPendingChangesTracker(confirmedSaved);
    expect(projectTracker(tracker)).toEqual([]);
    expect(projectTracker(createRecommendationPendingChangesTracker({}))).toEqual([]);
  });

  it("acknowledges only submitted edits while retaining multiple later ID-less row edits", () => {
    const first = { name: "Same recommendation", priorityId: "priority-id", reason: "First saved reason" };
    const second = { name: "Same recommendation", priorityId: "other-priority-id", reason: "Second saved reason" };
    let tracker = createRecommendationPendingChangesTracker({ recommendations: [first, second] });
    const firstSubmitted = { ...first, reason: "Submitted reason" };
    const submittedActualPayload = { recommendations: [firstSubmitted, second] };
    tracker = advanceRecommendationPendingChangesTracker(tracker, submittedActualPayload);
    const submitted = tracker;
    const firstLater = { ...firstSubmitted, name: "Later first name" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstLater, second] });
    const secondLater = { ...second, reason: "Later second reason" };
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstLater, secondLater] });
    tracker = acknowledgeRecommendationPendingChangesTracker(tracker, submitted);
    const entries = projectTracker(tracker)[0]!.entries;
    expect(entries.map((entry) => ({ kind: entry.kind, fields: entry.fields }))).toEqual([
      { kind: "updated", fields: [{ key: "name", label: "Recommendation", value: "Later first name" }] },
      { kind: "updated", fields: [{ key: "reason", label: "Reason", value: "Later second reason" }] }
    ]);
    expect(JSON.stringify(entries)).not.toContain("Submitted reason");
    expect(JSON.stringify(submittedActualPayload)).not.toMatch(/local:|saved:/);
    expect(submittedActualPayload.recommendations.every((row) => !Object.hasOwn(row, "id"))).toBe(true);
    tracker = advanceRecommendationPendingChangesTracker(tracker, { recommendations: [firstSubmitted, secondLater] });
    tracker = advanceRecommendationPendingChangesTracker(tracker, submittedActualPayload);
    expect(projectTracker(tracker)).toEqual([]);
  });
});
