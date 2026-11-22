import { describe, expect, it } from "vitest";
import type { MarginChange, MarginTier, MarginPair } from "../src/contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { buildMarginMatrix, validMarginChange, type SubBasketMarginLine } from "../src/domain/ai-estimator-knowledge-margin-matrix.js";
import { planMarginDecision } from "../src/domain/ai-estimator-knowledge-margin-decision.js";
import { savedMarginDeltas } from "../src/domain/ai-estimator-knowledge-pending-margins.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";

const owner = { basketId: "basket", subBasketId: "sub" };
const line = (id: string, signature: object, premium?: object): SubBasketMarginLine => ({
  line: { _id: id, name: id }, revision: { _id: id + "-revision" },
  section: { sectionKey: "advanced", applicability: "configured", payload: {
    ...signature, ...(premium ? { tierConfigurations: { premium: { applicability: "configured", payload: premium } } } : {})
  } }
});
const subVendor = (max: number) => ({ subVendorMinimumMarginBps: 2000, subVendorMarginBps: max });
const vendorChange = (tier: MarginTier, max: number): MarginChange => ({ tier, mode: "sub_vendor",
  ranges: [{ key: "margin", minimumBps: 2000, maximumBps: max }] });
const cost = (rate: number, start: number) => ({ baseRatePaise: rate, lowQuantityLimit: "10", minimumMarkupBps: 1000, startingMarkupBps: start });
const component = (basketId: string, subBasketId: string, id: string, start: number) =>
  ({ basketId, subBasketId, id, inclusions: [], exclusions: [], labor: cost(5000, start), material: cost(10000, start) });

describe("reviewed tier margins", () => {
  it("treats a pre-edit baseline independently of the first line, source order and other tiers", () => {
    const first = line("line-a", subVendor(2500), subVendor(3000));
    const unchanged = line("line-b", subVendor(2500), subVendor(3000));
    const defaults = buildMarginMatrix(owner, [first, unchanged], undefined, "v1").defaults;
    const lines = [line("line-a", subVendor(2500), subVendor(3500)), unchanged, line("line-c", subVendor(2500), subVendor(4500))];
    lines[0]!.pending = [{ ...vendorChange("premium", 3500), revisionId: "line-a-revision", sectionVersion: 2, actorId: "admin" }];
    const captured = { version: 1, defaults, updatedById: "actor", updatedAt: new Date() };
    const matrix = buildMarginMatrix(owner, lines, captured, "v2");
    expect(matrix.defaults.find(row => row.tier === "premium" && row.mode === "sub_vendor")?.ranges).toEqual(vendorChange("premium", 3000).ranges);
    expect(matrix.exceptions.map(row => row.mainLineId)).toEqual(["line-a"]);
    expect(buildMarginMatrix(owner, lines.slice().reverse(), captured, "v3").defaults).toEqual(matrix.defaults);
    const decision = { kind: "approve", candidate: { tier: "premium", mode: "sub_vendor", mainLineId: "line-a" } } as const;
    const plan = planMarginDecision({ matrix, lines }, { versionToken: "v2", decision });
    expect(plan.preview.impacts[0].competing.map(row => row.mainLineId)).toEqual(["line-c"]);
    expect([...plan.patches.keys()]).toEqual(["line-b", "line-c"]);
    expect([...plan.patches.get("line-b")!]).toEqual([["premium", subVendor(3500)]]);
    expect(plan.defaults.filter(row => row.provenance === "approved")).toMatchObject([vendorChange("premium", 3500)]);
    expect(() => planMarginDecision({ matrix, lines }, { versionToken: "v1", decision })).toThrow(/changed/);
    expect(() => planMarginDecision({ matrix, lines }, { versionToken: "v2", decision: { ...decision, candidate: { ...decision.candidate, mainLineId: "other-sub-line" } } })).toThrow(/no longer available/);
  });

  it("requires a changed percentage at the indicated bound, even when fields are implicitly supplied by the editor", () => {
    const max = { mode: "sub_vendor", key: "margin", bound: "maximumBps" } as const;
    const before = subVendor(3000);
    const after = { ...subVendor(3500), modeDescription: "Changed" };
    const changed = (a: object, b: object, hints?: readonly (typeof max)[]) =>
      savedMarginDeltas("premium", owner, { ...a }, { ...b }, true, true, hints).filter(row => row.manual);
    expect(changed(before, after)).toEqual([]);
    expect(changed(before, after, [max])).toHaveLength(1);
    expect(changed(before, subVendor(3500))).toHaveLength(1);
    expect(changed({}, after)).toEqual([]);
    expect(changed({}, after, [])).toEqual([]);
    expect(changed({}, after, [max])).toHaveLength(1);
    expect(changed(before, { ...before, subVendorMinimumMarginBps: 1500 }, [max])).toEqual([]);
    expect(savedMarginDeltas("premium", owner, before, before, false, true, [max])).toEqual([]);
  });

  it("tracks the edited component bound through a reorder and excludes cost-only changes", () => {
    const a = component("a", "sub-a", "1", 2200);
    const b = component("b", "sub-b", "2", 2400);
    const before = { inHouseComponents: [a, b] };
    const copied = { inHouseComponents: [a, { ...b, labor: { ...b.labor, startingMarkupBps: a.labor.startingMarkupBps },
      material: { ...b.material, startingMarkupBps: a.material.startingMarkupBps } }] };
    expect(savedMarginDeltas("premium", owner, before, copied, true, true).some(delta => delta.manual)).toBe(false);
    const scope = { mode: "in_house", component: { basketId: "a", subBasketId: "sub-a" }, key: "labor", bound: "maximumBps" } as const;
    const after = { inHouseComponents: [b, { ...a, labor: { ...a.labor, baseRatePaise: 9000, startingMarkupBps: 2600 } }] };
    expect(savedMarginDeltas("premium", owner, before, after, true, true, [scope]).filter(row => row.manual)).toMatchObject([
      { scope: { tier: "premium", mode: "in_house", component: scope.component } }]);
    expect(savedMarginDeltas("premium", owner, before, { inHouseComponents: [b, { ...a, labor: { ...a.labor, baseRatePaise: 9000 } }] },
      true, true, [scope])).toEqual([]);
    expect(savedMarginDeltas("premium", owner, before, after, true, true, [{ ...scope, component: { basketId: "b", subBasketId: "sub-b" } }])
      .filter(row => row.manual)).toEqual([]);
  });

  it("matches one component by identity even when the target has different IDs and ordering", () => {
    const a = component("a", "sub-a", "source-first", 2200);
    const b = component("b", "sub-b", "source-second", 2500);
    const lines = [line("first", { inHouseComponents: [a, b] }), line("second", { inHouseComponents: [{ ...b, id: "second-first" }, { ...a, id: "second-last" }] }),
      line("excluded", { inHouseComponents: [b] })];
    const matrix = buildMarginMatrix(owner, lines, undefined, "v1");
    const ranges: MarginPair[] = [{ key: "labor", minimumBps: 1200, maximumBps: 2700 }, { key: "material", minimumBps: 1800, maximumBps: 3500 }];
    const plan = planMarginDecision({ matrix, lines }, { versionToken: "v1", decision: { kind: "edit", changes: [
      { tier: "signature", mode: "in_house", component: { basketId: "a", subBasketId: "sub-a" }, ranges }
    ] } });
    expect(plan.preview.impacts[0].blockers).toEqual([]);
    expect(plan.preview.impacts[0].excluded).toMatchObject([{ mainLineId: "excluded" }]);
    expect(plan.patches.get("second")?.get("signature")?.inHouseComponents).toEqual([{ ...b, id: "second-first" }, {
      ...a, id: "second-last", labor: { ...a.labor, minimumMarkupBps: 1200, startingMarkupBps: 2700 }, material: { ...a.material, minimumMarkupBps: 1800, startingMarkupBps: 3500 }
    }]);
  });

  it("preserves missing tiers and distinguishes blocked legacy costs from missing setups", () => {
    const settings = { modeCalculations: { pmc: null, sub_vendor: null, in_house: cost(3000, 2000) } };
    const lines = [line("legacy", settings, subVendor(2500)), line("other", subVendor(3000))];
    const matrix = buildMarginMatrix(owner, lines, undefined, "v1");
    const plan = planMarginDecision({ matrix, lines }, { versionToken: "v1", decision: { kind: "edit", changes: [
      vendorChange("premium", 3500), { tier: "signature", mode: "in_house", component: owner, ranges: [
        { key: "labor", minimumBps: 1500, maximumBps: 2600 }, { key: "material", minimumBps: 2000, maximumBps: 3500 }
      ] }
    ] } });
    expect(plan.preview.impacts[0].excluded).toMatchObject([{ mainLineId: "other", reason: "Tier is not configured." }]);
    expect(plan.preview.impacts[1].blockers).toMatchObject([{ mainLineId: "legacy" }]);
    expect(plan.preview.impacts[1].excluded).toMatchObject([{ mainLineId: "other" }]);
  });

  it("resolves one shared default from complete approved or unanimous existing sets", () => {
    const first = component("b", "one", "first", 2600);
    const second = component("b", "two", "second", 2600);
    const lines = [line("main", { inHouseComponents: [first, second] })];
    const original = buildMarginMatrix(owner, lines, undefined, "legacy").defaults;
    const baseline = { version: 1, updatedAt: new Date(), updatedById: "actor", defaults: original };
    const read = () => buildMarginMatrix(owner, lines, baseline, "shared", "sub_basket");
    const signature = () => read().defaults.find(row => row.tier === "signature" && row.mode === "in_house")!;
    expect(read().defaults).toHaveLength(9);
    expect(signature()).toMatchObject({ resolution: "suggested", provenance: "existing", canApplyPrefilled: true });
    expect(signature().component).toBeUndefined();
    const legacyRows = original.filter(row => row.mode === "in_house" && row.tier === "signature");
    legacyRows[0]!.ranges = legacyRows[0]!.ranges.map(row => ({ ...row, minimumBps: 1400 }));
    expect(signature()).toMatchObject({ resolution: "choose", ranges: [] });
    expect(signature().choices?.map(choice => choice.component)).toEqual(legacyRows.map(row => row.component));
    legacyRows[0]!.provenance = "approved";
    expect(signature()).toMatchObject({ resolution: "suggested", ranges: legacyRows[0]!.ranges, provenance: "approved" });
    legacyRows[1]!.provenance = "approved";
    expect(signature()).toMatchObject({ resolution: "choose", ranges: [] });
    expect(read().defaults.find(row => row.tier === "functional" && row.mode === "in_house"))
      .toMatchObject({ resolution: "unset", ranges: [], canApplyPrefilled: false });
  });

  it("rejects old component edits in a shared preview and applies a prefilled choice to every eligible component", () => {
    const first = component("a", "s1", "first", 2600);
    const second = component("b", "s2", "second", 3100);
    const lines = [line("main", { inHouseComponents: [first, second] }),
      line("partial", { inHouseComponents: [{ ...second, material: null }, first] })];
    const defaults = buildMarginMatrix(owner, lines, undefined, "legacy").defaults;
    const preferred = defaults.find(row => row.component?.basketId === "a" && row.tier === "signature")!;
    preferred.provenance = "approved";
    const matrix = buildMarginMatrix(owner, lines, { version: 1, defaults, updatedAt: new Date(), updatedById: "actor" }, "v2", "sub_basket");
    const input = { versionToken: "v2", inHouseScope: "sub_basket" } as const;
    expect(() => planMarginDecision({ matrix, lines }, { ...input, decision: { kind: "edit", changes: [preferred] } })).toThrow();
    const { tier, mode, ranges } = preferred;
    const plan = planMarginDecision({ matrix, lines }, { ...input, decision: { kind: "edit", changes: [{ tier, mode, ranges }] } });
    const impact = plan.preview.impacts[0]!;
    expect(impact.affected).toEqual([{ mainLineId: "main", mainLineName: "main" }]);
    expect(impact.excluded).toMatchObject([{ mainLineId: "partial", component: { basketId: "b", subBasketId: "s2" } }]);
    expect(impact.blockers).toEqual([]);
    expect(impact.componentChanges).toMatchObject([{ mainLineId: "main", component: { basketId: "b", subBasketId: "s2" },
      previous: [{ key: "labor", maximumBps: 3100 }, { key: "material", maximumBps: 3100 }] }]);
    expect(plan.defaults).toContainEqual(expect.objectContaining({ tier, mode, ranges, resolution: "shared" }));
  });

  it("discloses each saved lower and upper bound before repairing partially populated component or legacy costs", () => {
    const modern = component("b", "s", "finish", 3200);
    const labor = { ...modern.labor, minimumMarkupBps: 2300 };
    const material = { ...modern.material, minimumMarkupBps: 1700, startingMarkupBps: undefined };
    const lines = [line("components", { inHouseComponents: [{ ...modern, labor, material }] }),
      line("split-legacy", { modeCalculations: { pmc: null, sub_vendor: null, in_house_labor: labor, in_house_material: material } })];
    const matrix = buildMarginMatrix(owner, lines, undefined, "shared", "sub_basket");
    const ranges: MarginPair[] = [{ key: "labor", minimumBps: 1500, maximumBps: 2000 },
      { key: "material", minimumBps: 1000, maximumBps: 2000 }];
    const plan = planMarginDecision({ matrix, lines }, { versionToken: "shared", inHouseScope: "sub_basket",
      decision: { kind: "edit", changes: [{ tier: "signature", mode: "in_house", ranges }] } });
    const impact = plan.preview.impacts[0]!;
    expect(impact.blockers).toEqual([]);
    const previous = [{ key: "labor", minimumBps: 2300, maximumBps: 3200 }, { key: "material", minimumBps: 1700, maximumBps: null }];
    expect(impact.componentChanges).toMatchObject([{ mainLineId: "components", previous }, { mainLineId: "split-legacy", previous }]);
  });

  it("blocks uncopyable active costs and invalid retained Mode namespaces during shared review", () => {
    const modern = component("b", "s", "finish", 3200);
    const partial = { ...modern, material: { ...modern.material, startingMarkupBps: undefined } };
    const lines = [line("historical", { inHouseComponents: [partial] }),
      line("retained", { inHouseComponents: [modern] }, { unknownHistoricalField: "invalid" })];
    lines[0]!.revision!.status = "active";
    lines[1]!.revision!.status = "draft";
    const matrix = buildMarginMatrix(owner, lines, undefined, "shared", "sub_basket");
    const ranges: MarginPair[] = [{ key: "labor", minimumBps: 1500, maximumBps: 2000 },
      { key: "material", minimumBps: 1000, maximumBps: 2000 }];
    const plan = planMarginDecision({ matrix, lines }, { versionToken: "shared", inHouseScope: "sub_basket",
      decision: { kind: "edit", changes: [{ tier: "signature", mode: "in_house", ranges }] } });
    expect(plan.preview.impacts[0]!.blockers).toMatchObject([
      { mainLineId: "historical", reason: expect.stringContaining("cannot be copied to a Draft") },
      { mainLineId: "retained", reason: expect.stringContaining("tierConfigurations.premium") }
    ]);
  });

  it("discloses missing and invalid saved base costs even when their margin ranges already match", () => {
    const margins = { minimumMarkupBps: 1500, startingMarkupBps: 2000 };
    const legacy = (settings: object) => ({ modeCalculations: { pmc: null, sub_vendor: null, in_house: { ...margins, ...settings } } });
    const lines = [line("missing", legacy({})), line("invalid", legacy({ baseRatePaise: -5, lowQuantityLimit: "8" }))];
    const matrix = buildMarginMatrix(owner, lines, undefined, "shared", "sub_basket");
    const ranges: MarginPair[] = [{ key: "labor", minimumBps: 1500, maximumBps: 2000 }, { key: "material", minimumBps: 1500, maximumBps: 2000 }];
    const { preview } = planMarginDecision({ matrix, lines }, { versionToken: "shared", inHouseScope: "sub_basket",
      decision: { kind: "edit", changes: [{ tier: "signature", mode: "in_house", ranges }] } });
    expect(preview.impacts[0]).toMatchObject({ affected: [],
      excluded: [{ mainLineId: "missing", reason: expect.stringContaining("base rate") }],
      blockers: [{ mainLineId: "invalid", reason: expect.stringContaining("Invalid saved In-house cost") }] });
  });

  it("validates empty Sub-Baskets, zero ranges, and persisted baseline scopes", async () => {
    const matrix = buildMarginMatrix(owner, [], undefined, "v1");
    expect(matrix.defaults).toHaveLength(9);
    expect(matrix.exceptions).toEqual([]);
    const change = { ...vendorChange("functional", 0), ranges: [{ key: "margin", minimumBps: 0, maximumBps: 0 }] } as const;
    expect(validMarginChange({ ...change, ranges: [...change.ranges] })).toBe(true);
    const invalid = { ...vendorChange("premium", 3000), ranges: [{ key: "labor", minimumBps: 12.5, maximumBps: 3010 }] };
    const doc = new AiEstimatorKnowledgeSubBasketModel({ _id: "sub", basketId: "basket", name: "Test", displayOrder: 0,
      createdById: "actor", updatedById: "actor", marginBaseline: { updatedById: "actor", updatedAt: new Date(), version: 1,
        defaults: [{ ...invalid, provenance: "approved" }] } });
    await expect(doc.validate()).rejects.toThrow(/defaults/);
  });
});
