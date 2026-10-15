import { buildConfiguredLines, configuredLineAmountPaise, deselectConfiguredRecommendationSources, parseSellingRate, updateConfiguredLinePricing } from "./configuredEstimate";
import { getEstimateRoomDefinitions, mergeSelectedRoomDefinitions, parseBedroomCount } from "./estimateRoomOptions";
import { estimateEditable, previewEstimateTotals, refreshStaffForm, restoreStaffForm, staffFormInput, validateStaffForm } from "./staffEstimateModel";
import { catalogueFixture, estimateFixture, leadFixture, lifecycleFixture } from "./__tests__/fixtures";

describe("native estimate authoring model", () => {
 it.each([["1BHK", null, 1], ["2BHK", null, 2], ["2.5BHK", null, 2], ["4BHK", null, 4], ["Villa", 6, 6], ["Duplex", 3, 3], ["Penthouse", 5, 5]] as const)("offers optional bedroom, balcony and bathroom entries for %s", (type, count, expected) => {
  const rooms = getEstimateRoomDefinitions(type, count); expect(rooms.filter((room) => /^Bedroom \d+$/.test(room.label))).toHaveLength(expected);
  expect(rooms.filter((room) => /Bedroom \d+ Balcony/.test(room.label))).toHaveLength(expected); expect(rooms.filter((room) => /Bedroom \d+ Bathroom/.test(room.label))).toHaveLength(expected);
  expect(rooms.map((room) => room.label)).toEqual(expect.arrayContaining(["Living & Dining", "Kitchen", "Common Bathroom", "Custom Room"]));
 });
 it("keeps Studio combined and saved labels/removed property rooms stable", () => {
  const rooms = getEstimateRoomDefinitions("Studio", null); expect(rooms.some((room) => room.label === "Living / Sleeping Area")).toBe(true); expect(rooms.some((room) => room.label.startsWith("Bedroom"))).toBe(false);
  const restored = mergeSelectedRoomDefinitions(rooms, [{ typeId: "master", label: "Saved master suite" }, { typeId: "kitchen", label: "Saved kitchen" }]);
  expect(restored.find((room) => room.typeId === "master")).toMatchObject({ group: "Previously selected", label: "Saved master suite" }); expect(restored.find((room) => room.typeId === "kitchen")?.label).toBe("Saved kitchen");
  for (const bad of ["0", "51", "1.5", "abc", ""]) expect(parseBedroomCount(bad)).toBeNull();
 });
 it("refreshes current source IDs/names/rates while keeping manual prices and stable saved identities", () => {
  const saved = estimateFixture(); const form = restoreStaffForm(saved, leadFixture, catalogueFixture); const line = form.lines[0]!;
  expect(line).toMatchObject({ persistedId: "saved-line-one", mainLineId: "main-one", revisionId: "revision-current", revisionVersion: 5, itemVersion: 3, rateInput: "111.11", mainLineName: "Oak cabinet", sourceMissing: false });
  const configured = refreshStaffForm({ ...form, lines: [{ ...line, rateSource: "configuration" }] }, catalogueFixture); expect(configured.lines[0]?.rateInput).toBe("234.56");
  const payload = staffFormInput(form, 7); expect(payload.expectedVersion).toBe(7); expect(payload.lineItems[0]).toMatchObject({ id: "saved-line-one", mainLineId: "main-one", roomId: "room-one", revisionVersion: 5, ratePaise: 11111 });
 });
 it("fails closed for changed unit precision and missing catalogue sources instead of reusing old rates", () => {
  const form = restoreStaffForm(estimateFixture(), leadFixture, catalogueFixture); const changed = structuredClone(catalogueFixture); changed.items[0]!.subBaskets[0]!.mainLines[0]!.uom.decimalScale = 0;
  const next = refreshStaffForm(form, changed); expect(next.lines[0]?.uomNeedsQuantityReview).toBe(true); expect(validateStaffForm(next)).toContain("confirm the quantity");
  const missing = refreshStaffForm({ ...form, lines: [{ ...form.lines[0]!, rateSource: "configuration" }] }, { items: [], ineligibleLineCount: 1 }); expect(missing.lines[0]).toMatchObject({ sourceMissing: true, rateInput: "" }); expect(validateStaffForm(missing)).toContain("source is unavailable");
 });
 it("keeps approved historical names and rates immutable even when current Configuration differs", () => {
  const saved = estimateFixture({ status: "client_approved", estimation: { ...lifecycleFixture, status: "client_approved", editClosedAt: "2026-10-14T00:00:00Z" } });
  expect(estimateEditable(saved)).toBe(false); const restored = restoreStaffForm(saved, leadFixture, catalogueFixture); expect(restored.lines[0]).toMatchObject({ mainLineName: "Old cabinet name", revisionId: "revision-old", rateInput: "111.11" });
 });
 it("uses integer paise, explicit special modes and standard Sub-Vendor rate resets", () => {
  const form = restoreStaffForm(estimateFixture(), leadFixture, catalogueFixture); const line = form.lines[0]!;
  expect(configuredLineAmountPaise(line)).toBe(27778); expect(previewEstimateTotals(form)).toEqual({ subtotalPaise: 27778, gstPaise: 5000, totalPaise: 32778 });
  const pmc = updateConfiguredLinePricing(line, { pricingMode: "pmc" }); expect(pmc).toMatchObject({ rateSource: "configuration", rateInput: "123.45" });
  const standard = updateConfiguredLinePricing(pmc, { classification: "standard" }); expect(standard).toMatchObject({ pricingMode: "sub_vendor", rateInput: "234.56" });
  expect(parseSellingRate("12.345").kind).toBe("invalid"); expect(previewEstimateTotals({ ...form, lines: [{ ...line, rateInput: "" }] })).toBeNull();
 });
 it("preserves legacy items and stable IDs alongside configured items", () => {
  const legacy = { source: "legacy" as const, id: "legacy-one", catalogueId: "historical", roomName: "Kitchen", specification: "Existing fixture", unit: "set", rate: 901, quantity: 2, included: true };
  const form = restoreStaffForm(estimateFixture({ lineItems: [legacy, ...estimateFixture().lineItems] }), leadFixture, catalogueFixture);
  expect(staffFormInput(form, 7).lineItems[0]).toMatchObject({ id: "legacy-one", specification: "Existing fixture", quantity: 2 }); expect(previewEstimateTotals(form)?.subtotalPaise).toBe(207978);
 });
 it("retains recommendation lineage per room and recursively deselects orphaned selections", () => {
  const base = buildConfiguredLines(catalogueFixture, [{ id: "one", label: "One" }, { id: "two", label: "Two" }], new Set(["basket-one"]), []);
  const source = { ...base[0]!, included: true }; const child = { ...base[0]!, key: '["one","child"]', mainLineId: "child", included: true, recommendationSourceMainLineIds: [source.mainLineId] };
  const secondRoom = { ...base[1]!, included: true }; const next = deselectConfiguredRecommendationSources([source, child, secondRoom], new Set([source.key]));
  expect(next.map((line) => line.included)).toEqual([false, false, true]);
 });
});
