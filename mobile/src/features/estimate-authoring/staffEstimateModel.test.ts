import { buildConfiguredLines, configuredLineAmountPaise, deselectConfiguredRecommendationSources, parseSellingRate, updateConfiguredLinePricing } from "./configuredEstimate";
import { getEstimateRoomDefinitions, mergeSelectedRoomDefinitions, parseBedroomCount } from "./estimateRoomOptions";
import { estimateEditable, previewEstimateTotals, refreshStaffForm, restoreStaffForm, staffFormInput, validateStaffForm } from "./staffEstimateModel";
import { catalogueFixture, componentCatalogueFixture, componentLineFixture, componentAmountLineFixture, estimateFixture, leadFixture, lifecycleFixture } from "./__tests__/fixtures";

describe("native estimate authoring model", () => {
 it("preserves exact component totals and fingerprint through read-only native restore, refresh and save", () => {
  const catalogue = componentCatalogueFixture();
  const form = refreshStaffForm(restoreStaffForm(estimateFixture({ lineItems: [componentAmountLineFixture] }), leadFixture, catalogue), catalogue);
  expect(configuredLineAmountPaise(form.lines[0]!)).toBe(78333);
  expect(previewEstimateTotals(form)).toEqual({ subtotalPaise: 78333, gstPaise: 14100, totalPaise: 92433 });
  expect(validateStaffForm(form, true)).toBeNull();
  expect(staffFormInput(form).lineItems[0]).toMatchObject({ ratePaise: null, pricingBasis: "in_house_components_v1", componentPricingFingerprint: "a".repeat(64) });
  expect(staffFormInput(form).lineItems[0]).not.toHaveProperty("componentPricing");
  expect(updateConfiguredLinePricing(form.lines[0]!, { quantity: 5 })).toBe(form.lines[0]);
  expect(configuredLineAmountPaise({ ...form.lines[0]!, quantity: 3 })).toBeNull();
  expect(configuredLineAmountPaise({ ...form.lines[0]!, included: false })).toBe(0);
 });
 it("preserves component selection, price and version pins through restore, refresh and transport", () => {
  const catalogue = componentCatalogueFixture();
  const restored = restoreStaffForm(estimateFixture({ lineItems: [componentLineFixture] }), leadFixture, catalogue);
  const form = refreshStaffForm(restored, catalogue);
  expect(form.lines[0]).toMatchObject({ rateInput: "111.11", selectedInHouseComponentIds: ["component-one"], revisionId: "revision-current", itemVersion: 3, revisionVersion: 5, inHouseComponents: catalogue.items[0]!.subBaskets[0]!.mainLines[0]!.inHouseComponents, inHouseComponentsNeedReview: false });
  expect(staffFormInput(form).lineItems[0]).toMatchObject({ selectedInHouseComponentIds: ["component-one"], ratePaise: 11111, rateSource: "configuration", itemVersion: 3, revisionVersion: 5 });
  expect(validateStaffForm(form)).toBeNull();
  expect(updateConfiguredLinePricing(form.lines[0]!, { rateInput: "999", quantity: 4 })).toBe(form.lines[0]);
  const missing = refreshStaffForm(form, { items: [], ineligibleLineCount: 1 });
  expect(missing.lines[0]).toMatchObject({ sourceMissing: true, rateInput: "111.11", selectedInHouseComponentIds: ["component-one"] });
 });
 it("blocks unsupported component selection and routes changed or incomplete selections to web review", () => {
  const catalogue = componentCatalogueFixture();
  const fresh = buildConfiguredLines(catalogue, [{ id: "room-one", label: "Kitchen" }], new Set(["basket-one"]), [])[0]!;
  expect(updateConfiguredLinePricing(fresh, { pricingMode: "in_house" })).toBe(fresh);
  for (const saved of [{ ...componentLineFixture, selectedInHouseComponentIds: [] }, { ...componentLineFixture, selectedInHouseComponentIds: ["removed"] }, { ...componentLineFixture, revisionVersion: 4 }]) {
   const form = restoreStaffForm(estimateFixture({ lineItems: [saved] }), leadFixture, catalogue);
   expect(validateStaffForm(form)).toContain("web estimate workspace");
   expect(form.lines[0]?.rateInput).toBe("111.11");
   expect(staffFormInput(form).lineItems[0]).toMatchObject({ revisionVersion: saved.revisionVersion, selectedInHouseComponentIds: saved.selectedInHouseComponentIds });
  }
  const zero = restoreStaffForm(estimateFixture({ lineItems: [{ ...componentLineFixture, selectedInHouseComponentIds: ["component-two"], ratePaise: 0 }] }), leadFixture, catalogue);
  expect(validateStaffForm(zero)).toBeNull();
  expect(staffFormInput(zero).lineItems[0]).toMatchObject({ selectedInHouseComponentIds: ["component-two"], ratePaise: 0 });
 });
 it("preserves valid saved manual component prices when configured costs are blank", () => {
  const catalogue = componentCatalogueFixture();
  const component = catalogue.items[0]!.subBaskets[0]!.mainLines[0]!.inHouseComponents![0]!;
  component.baseRatePaise = null;
  const estimate = estimateFixture({ lineItems: [{ ...componentLineFixture, rateSource: "manual" as const, ratePaise: 500 }] });
  const manual = restoreStaffForm(estimate, leadFixture, catalogue);
  expect(validateStaffForm(manual)).toBeNull();
  expect(staffFormInput(manual).lineItems[0]).toMatchObject({ selectedInHouseComponentIds: ["component-one"], rateSource: "manual", ratePaise: 500 });
  expect(validateStaffForm(restoreStaffForm(estimateFixture({ lineItems: [componentLineFixture] }), leadFixture, catalogue))).toContain("web estimate workspace");
  component.unavailableReason = "Unavailable Main Basket";
  expect(validateStaffForm(restoreStaffForm(estimate, leadFixture, catalogue))).toContain("web estimate workspace");
 });
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


describe("native selected-tier compatibility", () => {
 it.each(["premium", "functional"] as const)("preserves %s prices and component IDs without adopting Signature on refresh", modeTier => {
  for (const pricingMode of ["pmc", "sub_vendor", "in_house"] as const) {
   const catalogue = componentCatalogueFixture();
   const source = catalogue.items[0]!.subBaskets[0]!.mainLines[0]!;
   source.applicableTiers = ["signature", "premium", "functional"];
   source.inHouseComponents = []; // Signature's components cannot validate another tier.
   const saved = { ...componentLineFixture, modeTier, pricingMode, ratePaise: 45678, selectedInHouseComponentIds: pricingMode === "in_house" ? ["premium-component"] : undefined };
   const form = refreshStaffForm(restoreStaffForm(estimateFixture({ lineItems: [saved] }), leadFixture, catalogue), catalogue);
   expect(form.lines[0]).toMatchObject({ modeTier, pricingMode, rateInput: "456.78", revisionId: saved.revisionId, nativeTierNeedsReview: false });
   expect(updateConfiguredLinePricing(form.lines[0]!, { rateInput: "234.56", quantity: 99, pricingMode: "sub_vendor" })).toBe(form.lines[0]);
   expect(staffFormInput(form).lineItems[0]).toMatchObject({ modeTier, pricingMode, ratePaise: 45678, revisionVersion: 5, ...(saved.selectedInHouseComponentIds ? { selectedInHouseComponentIds: saved.selectedInHouseComponentIds } : {}) });
   expect(validateStaffForm(form)).toBeNull();
   expect(refreshStaffForm(form, { items: [], ineligibleLineCount: 1 }).lines[0]?.rateInput).toBe("456.78");
   source.revisionVersion = 6;
   const changed = refreshStaffForm(form, catalogue);
   expect(changed.lines[0]).toMatchObject({ rateInput: "456.78", revisionVersion: 5, nativeTierNeedsReview: true });
   expect(validateStaffForm(changed)).toContain("web estimate workspace");
  }
 });
 it("blocks unavailable tiers and preserves an explicit Signature through transport", () => {
  const catalogue = componentCatalogueFixture();
  catalogue.items[0]!.subBaskets[0]!.mainLines[0]!.applicableTiers = ["signature"];
  const unavailable = restoreStaffForm(estimateFixture({ lineItems: [{ ...componentLineFixture, modeTier: "premium" as const }] }), leadFixture, catalogue);
  expect(validateStaffForm(unavailable)).toContain("selected configuration tier");
  const signature = restoreStaffForm(estimateFixture({ lineItems: [{ ...componentLineFixture, modeTier: "signature" as const }] }), leadFixture, catalogue);
  expect(staffFormInput(signature).lineItems[0]).toMatchObject({ modeTier: "signature", ratePaise: 11111 });
  catalogue.items[0]!.subBaskets[0]!.mainLines[0]!.applicableTiers = ["premium"];
  expect(validateStaffForm(refreshStaffForm(signature, catalogue))).toContain("selected configuration tier");
  const fresh = buildConfiguredLines(catalogue, signature.rooms, new Set(["basket-one"]), [])[0]!;
  expect(updateConfiguredLinePricing(fresh, { included: true })).toBe(fresh);
 });
});


describe("native dimension-owned quantity compatibility", () => {
 const rule = { formula: "length_width" as const, inputUnit: "ft" as const, quantityUnit: "sq_ft" as const, uomId: "uom-one", decimalScale: 2 };
 const dimensions = { length: "1.25", width: "2", height: "9" };
 it("retains measurements, exact quantity and source pins and prevents scalar editing", () => {
  const catalogue = componentCatalogueFixture();
  Object.assign(catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, { dimensionsMandatory: true, dimensionRule: rule });
  const saved = { ...componentLineFixture, pricingMode: "sub_vendor" as const, selectedInHouseComponentIds: undefined, dimensionsMandatory: true, dimensions, dimensionRule: rule };
  const form = refreshStaffForm(restoreStaffForm(estimateFixture({ lineItems: [saved] }), leadFixture, catalogue), catalogue);
  expect(form.lines[0]).toMatchObject({ quantity: 2.5, rateInput: "111.11", dimensions, dimensionRule: rule, nativeDimensionsNeedReview: false });
  expect(updateConfiguredLinePricing(form.lines[0]!, { quantity: 99 })).toBe(form.lines[0]);
  expect(validateStaffForm(form)).toBeNull();
  expect(staffFormInput(form).lineItems[0]).toMatchObject({ dimensions, quantity: 2.5, revisionId: "revision-current", itemVersion: 3, revisionVersion: 5 });
  expect(staffFormInput(form).lineItems[0]).not.toHaveProperty("dimensionRule");
  expect(staffFormInput(form).lineItems[0]).not.toHaveProperty("dimensionsMandatory");
  expect(staffFormInput(form).lineItems[0]).toMatchObject({ expectedDimensionRule: rule });
  catalogue.items[0]!.subBaskets[0]!.mainLines[0]!.dimensionRule = { ...rule, decimalScale: 3 };
  const changed = refreshStaffForm(form, catalogue);
  expect(changed.lines[0]).toMatchObject({ dimensions, dimensionRule: rule, quantity: 2.5, nativeDimensionsNeedReview: true });
  expect(validateStaffForm(changed)).toContain("web estimate workspace");
 });
 it("routes newly mandatory or invalid saved measurements to web without fabricating inputs", () => {
  const catalogue = componentCatalogueFixture();
  Object.assign(catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, { dimensionsMandatory: true, dimensionRule: rule });
  for (const saved of [componentLineFixture, { ...componentLineFixture, dimensionsMandatory: true, dimensions, dimensionRule: rule, quantity: 99 }]) {
   const form = restoreStaffForm(estimateFixture({ lineItems: [saved] }), leadFixture, catalogue);
   expect(validateStaffForm(form)).toContain("web estimate workspace");
   expect(form.lines[0]?.quantity).toBe(saved.quantity);
  }
  const fresh = buildConfiguredLines(catalogue, [{ id: "room-one", label: "Kitchen" }], new Set(["basket-one"]), [])[0]!;
  expect(updateConfiguredLinePricing(fresh, { included: true })).toBe(fresh);
 });
 it("retains inactive measurements and original units without owning manual quantity", () => {
  const saved = { ...componentLineFixture, pricingMode: "sub_vendor" as const, selectedInHouseComponentIds: undefined, dimensionsMandatory: false, dimensions, dimensionRule: rule, quantity: 20 };
  const form = restoreStaffForm(estimateFixture({ lineItems: [saved] }), leadFixture, catalogueFixture);
  expect(form.lines[0]).toMatchObject({ dimensions, dimensionRule: rule, quantity: 20 });
  expect(updateConfiguredLinePricing(form.lines[0]!, { quantity: 25 }).quantity).toBe(25);
  expect(staffFormInput(form).lineItems[0]).toMatchObject({ dimensions, quantity: 20 });
 });
});
