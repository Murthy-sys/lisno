import { nativeRecommendationCatalogIssues, nativeRuleTarget, nativeRuleTargetKind } from "./knowledgeNativeRules";
import { newRecommendationRule } from "../../../../shared/knowledge/knowledgeRecommendationPresentation";
import type { KnowledgeItemListItem } from "../../../../shared/knowledge/knowledgeTypes";

const item = { mainLineId: "related", basketId: "basket-a", subBasketId: "group-a", itemType: "temporary", status: "draft" } as KnowledgeItemListItem;

describe("native recommendation identity", () => {
  it("carries stable basket/group/item IDs and actual item type without erasing unrelated data", () => {
    const rule = nativeRuleTarget({ ...newRecommendationRule("mandatory"), reason: "Install together", future: "retained" }, item);
    expect(rule).toMatchObject({ targetKind: "main_line", targetBasketId: "basket-a", targetSubBasketId: "group-a", targetMainLineId: "related", targetType: "temporary", future: "retained" });
    expect(nativeRecommendationCatalogIssues([rule], [item], "source")).toEqual([]);
    expect(nativeRecommendationCatalogIssues([rule], [{ ...item, subBasketId: "different" }], "source")).toHaveLength(1);
    expect(nativeRecommendationCatalogIssues([rule], [item], "related")).toHaveLength(1);
  });
  it("normalizes whole Sub-Basket targets and requires an available child", () => {
    const rule = { ...nativeRuleTargetKind(nativeRuleTarget(newRecommendationRule("exclusions"), item), "sub_basket"), targetSubBasketId: "group-a" };
    expect(rule).toMatchObject({ targetType: null, targetMainLineId: null, targetKind: "sub_basket" });
    expect(nativeRecommendationCatalogIssues([rule], [item], "source")).toEqual([]);
    expect(nativeRecommendationCatalogIssues([rule], [{ ...item, status: "archived" }], "source")).toHaveLength(1);
    expect(nativeRecommendationCatalogIssues([{ ...rule, active: false }], [], "source")).toEqual([]);
  });
});
