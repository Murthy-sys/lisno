import { describe, expect, it } from "vitest";
import { createConfiguredLine, deselectConfiguredRecommendationSources, type ConfiguredLineDraft } from "./configuredEstimate";
import type { EstimationCatalogue } from "./estimationCatalogueApi";
import { estimatorRequiredBy, estimatorRequiredRemovalSources, reconcileEstimatorRequiredSelection } from "./estimatorRecommendationSelection";
import type { RecommendationDecision, RoomRecommendationView } from "./roomRecommendations";

const rooms = [{ id: "living", label: "Living", typeId: "living" }, { id: "bedroom", label: "Bedroom", typeId: "bedroom1" }];
const catalogue: EstimationCatalogue = { ineligibleLineCount: 0, items: [{ id: "basket", name: "Finish", displayOrder: 1,
  subBaskets: [{ id: "sub", basketId: "basket", name: "Surface", displayOrder: 1, mainLines: ["a", "b", "c", "d"].map(id => ({
    id, mainLineId: id, name: id.toUpperCase(), revisionId: `rev-${id}`, revisionVersion: 1, itemVersion: 1,
    basketId: "basket", subBasketId: "sub", displayOrder: 1, uom: { id: "sqft", code: "SQFT", name: "sq ft", decimalScale: 2 },
    modeBaseRatesPaise: { pmc: 500, sub_vendor: 1000, in_house: 1500 }
  })) }] }] };
const target = (id: string) => ({ mainLineId: id, basketId: "basket", subBasketId: "sub" });
const line = (id: string, origins: string[] = [], roomIndex = 0): ConfiguredLineDraft => ({
  ...createConfiguredLine(catalogue, rooms[roomIndex]!, target(id))!, included: true, recommendationSourceMainLineIds: origins
});
const decision = (id: string, sources: string[], extra: Partial<RecommendationDecision> = {}): RecommendationDecision => ({
  key: `line:${id}`, kind: "main_line", requirement: "must", name: id.toUpperCase(), basketName: "Finish", subBasketName: "Surface",
  target: target(id), children: [], available: true, selected: false, completionRequired: false, unavailableChildCount: 0,
  reasons: sources.map(sourceId => ({ ruleId: `${sourceId}-${id}`, sourceId, sourceName: sourceId.toUpperCase(), requirement: "must", reason: "Required finish" })), ...extra
});
const view = (decisions: RecommendationDecision[], extra: Partial<RoomRecommendationView> = {}): RoomRecommendationView => ({ decisions, guidance: [], historicalSources: [], stale: false, ...extra });
const reconcile = (lines: ConfiguredLineDraft[], views: ReadonlyMap<string, RoomRecommendationView>) => reconcileEstimatorRequiredSelection({
  catalogue, rooms, lines, views, classifications: new Map()
});

describe("automatic required selection", () => {
  it("adds all same-room required targets once and preserves an existing row's fields", () => {
    const existing = { ...line("b"), included: false, quantity: 7.5, modeTier: "signature" as const };
    const views = new Map([["living", view([decision("b", ["a"]), decision("c", ["a"])])]]);
    const result = reconcile([line("a"), existing, line("a", [], 1)], views);
    expect(result.issues).toEqual([]);
    expect(result.lines.filter(item => item.included)).toHaveLength(4);
    expect(result.lines.find(item => item.mainLineId === "b")).toMatchObject({ quantity: 7.5, roomId: "living", recommendationSourceMainLineIds: ["a"] });
    expect(result.lines.some(item => item.roomId === "bedroom" && item.mainLineId === "b")).toBe(false);
    expect(reconcile([...result.lines], views).addedBasketIds.size).toBe(0);
  });

  it("combines shared origins but keeps a manual target independent", () => {
    const views = new Map([["living", view([decision("c", ["a", "b"])])]]);
    const shared = reconcile([line("a"), line("b"), line("c", ["a"])], views);
    expect(shared.lines[2]!.recommendationSourceMainLineIds).toEqual(["a", "b"]);
    const manual = line("c");
    expect(reconcile([line("a"), line("b"), manual], views).lines[2]).toBe(manual);
    expect(deselectConfiguredRecommendationSources([...shared.lines], new Set([line("a").key]))[2]).toMatchObject({ included: true, recommendationSourceMainLineIds: ["b"] });
  });

  it("prunes orphan chains and cycles but retains another room and independent roots", () => {
    const lines = [line("a"), line("b", ["a", "c"]), line("c", ["b"]), line("d"), line("b", [], 1)];
    const removed = deselectConfiguredRecommendationSources(lines, new Set([lines[0]!.key]));
    expect(removed.map(item => item.included)).toEqual([false, false, false, true, true]);
    expect(removed[1]!.recommendationSourceMainLineIds).toEqual([]);
    expect(removed[2]!.recommendationSourceMainLineIds).toEqual([]);
  });

  it("blocks a dependent removal but permits removing the only independent root of a cycle", () => {
    const lines = [line("a"), line("b", ["a", "c"]), line("c", ["b"])];
    const views = new Map([["living", view([decision("b", ["a", "c"]), decision("c", ["b"]), decision("a", ["c"])])]]);
    expect(estimatorRequiredRemovalSources(lines, views, new Set([lines[1]!.key]))).toEqual(["A"]);
    expect(estimatorRequiredRemovalSources(lines, views, new Set([lines[0]!.key]))).toEqual([]);
    expect(estimatorRequiredBy(lines, views).get(lines[1]!.key)).toEqual(["A"]);
    expect(estimatorRequiredRemovalSources(lines, views, new Set(lines.map(item => item.key)))).toEqual([]);
  });

  it("adds eligible Sub Basket children and reports missing children without selecting optional targets", () => {
    const group = decision("b", ["a"], { kind: "sub_basket", target: null, unavailableChildCount: 1,
      children: [{ target: target("b"), name: "B", selected: false, completionRequired: true }] });
    const result = reconcile([line("a")], new Map([["living", view([group, decision("c", ["a"], { requirement: "can" })])]]));
    expect(result.lines.map(item => item.mainLineId)).toEqual(["a", "b"]);
    expect(result.issues).toHaveLength(1);
  });

  it("does not apply stale relationships or invent a selected tier price", () => {
    const prior = [line("a")];
    const stale = reconcile(prior, new Map([["living", view([decision("b", ["a"])], { stale: true })]]));
    expect(stale.lines).toBe(prior);
    expect(stale.issues).toHaveLength(1);
    const unavailable = { ...line("b"), included: false, modeTier: "premium" as const };
    const result = reconcile([...prior, unavailable], new Map([["living", view([decision("b", ["a"])])]]));
    expect(result.lines[1]!.included).toBe(false);
    expect(result.issues[0]).toContain("selected tier and pricing method");
  });
});
