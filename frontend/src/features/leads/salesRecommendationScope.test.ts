import { describe, expect, it } from "vitest";
import { emptyAutomaticBasketIds, inferEmptySavedBasketIds, inferRecommendationOnlyBasketIds, salesCatalogueBrowseBasketIds } from "./salesRecommendationScope";

type ScopeLine = Parameters<typeof inferRecommendationOnlyBasketIds>[0][number];
const line = (mainBasketId: string, recommendationSourceMainLineIds?: string[], included = true): ScopeLine => ({
  mainBasketId, included, ...(recommendationSourceMainLineIds === undefined ? {} : { recommendationSourceMainLineIds })
});

describe("Sales recommendation basket scope", () => {
  it("infers compact saved empty groups without changing selected scope or excluded history", () => {
    const lines = [
      { mainBasketId: "saved-empty", included: false, persistedId: "saved-line" },
      { mainBasketId: "unsaved-empty", included: false },
      { mainBasketId: "unselected", included: false, persistedId: "unselected-line" }
    ];
    const selected = new Set(["saved-empty", "unsaved-empty", "fresh-setup-empty"]);
    const before = structuredClone(lines);
    expect(inferEmptySavedBasketIds(lines, selected)).toEqual(new Set(["saved-empty"]));
    expect(lines).toEqual(before);
    expect(selected).toEqual(new Set(["saved-empty", "unsaved-empty", "fresh-setup-empty"]));
    expect(inferEmptySavedBasketIds([], selected)).toEqual(new Set());
  });

  it("never infers an empty saved group while another room has an included row", () => {
    const lines = [
      { mainBasketId: "shared", included: false, persistedId: "saved-living", roomId: "living" },
      { mainBasketId: "shared", included: true, roomId: "bedroom" },
      { mainBasketId: "other-id", included: false, persistedId: "saved-other", roomId: "living" }
    ];
    expect(inferEmptySavedBasketIds(lines, new Set(["shared", "other-id"]))).toEqual(new Set(["other-id"]));
    expect(inferEmptySavedBasketIds([...lines].reverse(), new Set(["shared", "other-id"]))).toEqual(new Set(["other-id"]));
  });

  it("releases only empty automatic basket IDs while preserving explicit setup scope and excluded rows", () => {
    const lines = [line("recommended", ["source"], false), line("ordinary-add", [], false),
      line("automatic-with-independent-item", ["source"], false), line("automatic-with-independent-item", []),
      line("explicit-empty", [], false), line("same-name-other-id", ["source"])];
    const automatic = new Set(["recommended", "ordinary-add", "automatic-with-independent-item", "no-rows"]);
    const before = structuredClone(lines);
    expect(emptyAutomaticBasketIds(lines, automatic)).toEqual(new Set(["recommended", "ordinary-add", "no-rows"]));
    expect(lines).toEqual(before);
    expect(automatic).toEqual(new Set(["recommended", "ordinary-add", "automatic-with-independent-item", "no-rows"]));
  });

  it("keeps automatic scope while any other room still contains an included item", () => {
    const lines = [
      { ...line("shared-basket", ["living-source"], false), roomId: "living" },
      { ...line("shared-basket", ["bedroom-source"]), roomId: "bedroom" },
      { ...line("empty-basket", ["living-source"], false), roomId: "living" }
    ];
    expect(emptyAutomaticBasketIds(lines, new Set(["shared-basket", "empty-basket"])))
      .toEqual(new Set(["empty-basket"]));
    expect(emptyAutomaticBasketIds(lines.map(entry => ({ ...entry, included: false })), new Set(["shared-basket", "empty-basket"])))
      .toEqual(new Set(["shared-basket", "empty-basket"]));
  });

  it("starts only selected baskets with exclusively recommendation-derived included items compact", () => {
    const lines = [
      line("recommendations", ["living-ceiling"]), line("recommendations", ["kitchen-wall", "kitchen-ceiling"]),
      line("mixed", ["living-ceiling"]), line("mixed", []),
      line("missing-origin"), line("excluded-only", ["source"], false),
      line("unselected", ["source"])
    ];
    const selected = new Set(["recommendations", "mixed", "missing-origin", "empty", "excluded-only"]);
    const before = structuredClone(lines);
    expect(inferRecommendationOnlyBasketIds(lines, selected)).toEqual(new Set(["recommendations"]));
    expect(lines).toEqual(before);
    expect(selected).toEqual(new Set(["recommendations", "mixed", "missing-origin", "empty", "excluded-only"]));
  });

  it("treats independent selections as authoritative regardless of input order and ignores excluded lines", () => {
    const lines = [line("mixed", []), line("mixed", ["source"]),
      line("recommended", ["source"]), line("recommended", undefined, false)];
    const selected = new Set(["mixed", "recommended"]);
    expect(inferRecommendationOnlyBasketIds(lines, selected)).toEqual(new Set(["recommended"]));
    expect(inferRecommendationOnlyBasketIds([...lines].reverse(), selected)).toEqual(new Set(["recommended"]));
    expect(inferRecommendationOnlyBasketIds([], selected)).toEqual(new Set());
    expect(inferRecommendationOnlyBasketIds(lines, new Set())).toEqual(new Set());
  });

  it("reveals a compact basket only for the room whose browse set includes it", () => {
    const selected = new Set(["setup", "recommended", "other-recommended"]);
    const compact = new Set(["recommended", "other-recommended", "removed"]);
    const livingBrowsed = new Set(["recommended", "removed"]);
    const kitchenBrowsed = new Set<string>();
    expect(salesCatalogueBrowseBasketIds(selected, compact, livingBrowsed)).toEqual(new Set(["setup", "recommended"]));
    expect(salesCatalogueBrowseBasketIds(selected, compact, kitchenBrowsed)).toEqual(new Set(["setup"]));
    expect(selected).toEqual(new Set(["setup", "recommended", "other-recommended"]));
    expect(compact).toEqual(new Set(["recommended", "other-recommended", "removed"]));
    expect(livingBrowsed).toEqual(new Set(["recommended", "removed"]));
    expect(kitchenBrowsed).toEqual(new Set());
  });

  it("uses normal browsing for Setup baskets and ignores browse choices outside selected scope", () => {
    const selected = new Set(["setup"]);
    expect(salesCatalogueBrowseBasketIds(selected, new Set(), new Set(["outside"]))).toEqual(selected);
    expect(salesCatalogueBrowseBasketIds(new Set(), new Set(["setup"]), selected)).toEqual(new Set());
  });
});
