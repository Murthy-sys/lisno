import { describe, expect, it } from "vitest";
import {
  collectSpecificationItemNames, matchSpecificationItemNames,
  normalizeSpecificationItemName, sanitizeSpecificationItemName
} from "../../../../shared/knowledge/knowledgeSpecificationItemNames";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";

describe("specification item name vocabulary", () => {
  it("deduplicates Unicode/case/spacing with deterministic spelling without mutating input", () => {
    const input = [" plywood ", "Plywood", "Ｐｌｙｗｏｏｄ", "  Wall   panel ", "Wall panel", "Board 12mm", "Board 18mm"];
    const copy = [...input];
    expect(collectSpecificationItemNames(input)).toEqual([
      { name: "Board 12mm" }, { name: "Board 18mm" }, { name: "Plywood" }, { name: "Wall panel" }
    ]);
    expect(collectSpecificationItemNames([...input].reverse())).toEqual(collectSpecificationItemNames(input));
    expect(input).toEqual(copy);
    expect(normalizeSpecificationItemName("  WALL   Panel ")).toBe("wall panel");
  });

  it("rejects malformed names and preserves punctuation and accents", () => {
    expect(collectSpecificationItemNames([null, {}, 42, " ", "x".repeat(241), "Cafe", "Café", "MDF-12", "MDF 12"])).toHaveLength(4);
    expect(sanitizeSpecificationItemName("  My   Item  ")).toBe("My Item");
    expect(sanitizeSpecificationItemName("x".repeat(240))).toHaveLength(240);
  });

  it("separates exact matches from bounded spelling suggestions", () => {
    const items = collectSpecificationItemNames(["Plywood", "Plywod", "Cement", "PLY", "Ply", "Tile", "Tiles"]);
    expect(matchSpecificationItemNames(items, "  PLYWOOD ").exactMatch).toEqual({ name: "Plywood" });
    expect(matchSpecificationItemNames(items, "Plywod").similarItems).toContainEqual({ name: "Plywood" });
    expect(matchSpecificationItemNames(items, "Ply").similarItems).toEqual([]);
    expect(matchSpecificationItemNames(items, "Tile").similarItems).toEqual([{ name: "Tiles" }]);
    expect(matchSpecificationItemNames(items, "Completely unrelated").similarItems).toEqual([]);
  });

  it("caps suggestions and orders ties independently of source order", () => {
    const items = collectSpecificationItemNames(["Board a", "Board b", "Board c", "Board d", "Board e", "Board f"]);
    const result = matchSpecificationItemNames(items, "Board g");
    expect(result.similarItems.map(item => item.name)).toEqual(["Board a", "Board b", "Board c", "Board d", "Board e"]);
    expect(matchSpecificationItemNames([...items].reverse(), "Board g")).toEqual(result);
  });

  it("separates candidate checks and pages while sharing normalized search keys", () => {
    expect(knowledgeQueryKeys.specificationItemNameList({ search: " Wall  PANEL " })).toEqual(
      knowledgeQueryKeys.specificationItemNameList({ search: "wall panel", limit: 20, offset: 0 })
    );
    expect(knowledgeQueryKeys.specificationItemNameList({ offset: 20 })).not.toEqual(knowledgeQueryKeys.specificationItemNameList());
    expect(knowledgeQueryKeys.specificationItemNameList({ checkName: "Plywod" })).not.toEqual(knowledgeQueryKeys.specificationItemNameList({ search: "Plywod" }));
  });
});
