import { describe, expect, it } from "vitest";
import { budgetAlterationIssues } from "./knowledgeBudgetAlterations";
import { moveRecommendationRule, recommendationMoveBlockReason } from "./knowledgeRecommendationMoves";
import { RECOMMENDATION_GROUPS, recommendationGroup, type RecommendationGroup } from "./knowledgeRecommendationPresentation";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

const base: KnowledgeJsonObject = {
  id: "rule-a", trigger: "added", action: "add", requirement: "must", targetKind: "main_line", targetType: "catalog",
  targetBasketId: "basket-a", targetSubBasketId: "sub-a", targetMainLineId: "line-a", reason: "Retain the detailed explanation.", active: true
};
const seeds: Record<RecommendationGroup, KnowledgeJsonObject> = {
  mandatory: base,
  probable: { ...base, requirement: "can" },
  exclusions: { ...base, action: "remove" },
  other: { ...base, trigger: "removed", action: "remove" }
};
const transitions = RECOMMENDATION_GROUPS.flatMap(({ key: from }) => RECOMMENDATION_GROUPS
  .filter(({ key }) => key !== from).map(({ key: to }) => ({ from, to })));

describe("recommendation section moves", () => {
  it.each(transitions)("moves $from to $to without replacing the rule or target", ({ from, to }) => {
    const source = seeds[from];
    const before = structuredClone(source);
    const result = moveRecommendationRule([source], source.id, to);
    expect(result.status).toBe("changed");
    if (result.status !== "changed") return;
    expect(recommendationGroup(result.row)).toBe(to);
    expect(result.row).toEqual({ ...source,
      trigger: to === "other" ? "removed" : "added",
      action: to === "other" ? source.action : to === "exclusions" ? "remove" : "add",
      requirement: to === "mandatory" ? "must" : to === "probable" ? "can" : source.requirement
    });
    expect(budgetAlterationIssues(result.rows)).toEqual([]);
    expect(source).toEqual(before);
  });

  it.each(["must", "can"])("keeps %s when entering exclusions and Other", (requirement) => {
    for (const action of ["add", "remove"]) {
      const other = { ...base, trigger: "removed", action, requirement };
      const exclusion = moveRecommendationRule([other], base.id, "exclusions");
      expect(exclusion).toMatchObject({ status: "changed", row: { trigger: "added", action: "remove", requirement } });
      const entry = { ...base, action, requirement };
      expect(moveRecommendationRule([entry], base.id, "other")).toMatchObject({ status: "changed", row: { trigger: "removed", action, requirement } });
    }
  });

  it.each(["main_line", "sub_basket"])("preserves disabled %s rules and extra data through repeated moves", (targetKind) => {
    const source: KnowledgeJsonObject = { ...base, targetKind, active: false, extra: { retained: [1, "original"] },
      ...(targetKind === "sub_basket" ? { targetType: null, targetMainLineId: null } : {}) };
    let rows: KnowledgeJsonObject[] = [source];
    for (const destination of ["probable", "exclusions", "other", "mandatory"] as const) {
      const result = moveRecommendationRule(rows, base.id, destination);
      expect(result.status).toBe("changed");
      if (result.status !== "changed") return;
      rows = result.rows;
      expect(result.row).toMatchObject({ id: source.id, targetKind, targetType: source.targetType, targetBasketId: source.targetBasketId,
        targetSubBasketId: source.targetSubBasketId, targetMainLineId: source.targetMainLineId, active: false, reason: source.reason, extra: source.extra });
    }
    expect(rows).toEqual([source]);
  });

  it("appends after destination rows and preserves unaffected objects and order", () => {
    const second = { ...base, id: "rule-b", targetMainLineId: "line-b", requirement: "can" };
    const third = { ...base, id: "rule-c", targetMainLineId: "line-c", trigger: "removed" };
    const result = moveRecommendationRule([base, second, third], base.id, "probable");
    expect(result.status).toBe("changed");
    if (result.status !== "changed") return;
    expect(result.rows.map((row) => row.id)).toEqual(["rule-b", "rule-c", "rule-a"]);
    expect(result.rows[0]).toBe(second);
    expect(result.rows[1]).toBe(third);
    expect(result.rows.filter((row) => recommendationGroup(row) === "probable").map((row) => row.id)).toEqual(["rule-b", "rule-a"]);
  });

  it("leaves a same-section drop untouched, including an absent legacy target kind", () => {
    const { targetKind: _kind, ...legacy } = base;
    expect(moveRecommendationRule([legacy], legacy.id, "mandatory")).toEqual({ status: "unchanged" });
    expect(legacy).not.toHaveProperty("targetKind");
    expect(moveRecommendationRule([legacy], legacy.id, "probable")).toMatchObject({ status: "changed", row: { targetKind: "main_line" } });
    const malformed: KnowledgeJsonObject = { ...base, targetKind: "unsupported" };
    expect(moveRecommendationRule([malformed], malformed.id, "probable")).toMatchObject({ status: "changed", row: { targetKind: "unsupported" } });
  });

  it.each([undefined, null, "", " ", 4, "missing"])("rejects an unavailable or invalid identity %s", (id) => {
    expect(recommendationMoveBlockReason([base], id)).toBeTypeOf("string");
    expect(moveRecommendationRule([base], id, "probable")).toMatchObject({ status: "rejected" });
  });

  it("rejects a duplicated source identity without changing either row", () => {
    const rows = [base, { ...base, targetMainLineId: "line-b" }];
    const before = structuredClone(rows);
    expect(moveRecommendationRule(rows, base.id, "probable")).toMatchObject({ status: "rejected", message: expect.stringMatching(/duplicate rule identities/) });
    expect(rows).toEqual(before);
  });

  it.each<KnowledgeJsonObject>([{ trigger: "unknown" }, { action: "unknown" }, { requirement: "unknown" }, { requirement: null }])("retains malformed semantics %j", (change) => {
    const source = { ...base, ...change };
    const before = structuredClone(source);
    expect(moveRecommendationRule([source], base.id, "probable")).toMatchObject({ status: "rejected" });
    expect(source).toEqual(before);
  });

  it.each(["main_line", "sub_basket"])("rejects another active %s rule for the destination trigger", (targetKind) => {
    const source: KnowledgeJsonObject = { ...base, targetKind, ...(targetKind === "sub_basket" ? { targetType: null, targetMainLineId: null } : {}) };
    const paired = { ...source, id: "rule-b", trigger: "removed", action: "remove" };
    const rows = [source, paired];
    const before = structuredClone(rows);
    expect(moveRecommendationRule(rows, base.id, "other")).toMatchObject({ status: "rejected", message: expect.stringContaining("already exists") });
    expect(moveRecommendationRule(rows, paired.id, "probable")).toMatchObject({ status: "rejected" });
    expect(rows).toEqual(before);
    expect(moveRecommendationRule([source, { ...paired, active: false }], source.id, "other").status).toBe("changed");
    expect(moveRecommendationRule([{ ...source, active: false }, paired], source.id, "other").status).toBe("changed");
  });

  it("does not conflate different target kinds and retains existing overlap validation", () => {
    const group = { ...base, id: "rule-b", targetKind: "sub_basket", targetType: null, targetSubBasketId: base.targetMainLineId, targetMainLineId: null, trigger: "removed" };
    expect(moveRecommendationRule([base, group], base.id, "other").status).toBe("changed");
  });

  it("keeps incomplete fields and uses the newest row content", () => {
    const source = { ...base, reason: "", targetMainLineId: null, targetBasketId: "" };
    const result = moveRecommendationRule([source], base.id, "probable");
    expect(result).toMatchObject({ status: "changed", row: { reason: "", targetMainLineId: null, targetBasketId: "" } });
    if (result.status === "changed") expect(budgetAlterationIssues(result.rows).map((issue) => issue.path)).toEqual(expect.arrayContaining(["budgetAlterations.0.reason", "budgetAlterations.0.targetMainLineId"]));
    expect(moveRecommendationRule([{ ...base, reason: "Newer local edit" }], base.id, "other")).toMatchObject({ status: "changed", row: { reason: "Newer local edit" } });
  });
});
