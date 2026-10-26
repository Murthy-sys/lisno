import { describe, expect, it } from "vitest";
import { purchaseOrderComponentKey, purchaseOrderComponentLabel } from "./purchaseOrderComponentPresentation";

describe("purchase order component presentation", () => {
  const rows = ["private-first", "private-second"].flatMap(componentId => ["in_house_labor", "in_house_material"].map(scope => ({ componentId, scope, componentBasketId: "basket-one", componentSubBasketId: componentId === "private-first" ? "sub-one" : "sub-two" })));
  it("keeps repeated cost scopes distinct and numbers each paired component consistently", () => {
    expect(new Set(rows.map(purchaseOrderComponentKey)).size).toBe(4);
    expect(rows.map(row => purchaseOrderComponentLabel(row, rows, row.scope))).toEqual(["Component 1 · Labour", "Component 1 · Material", "Component 2 · Labour", "Component 2 · Material"]);
  });
  it("uses matching saved catalog names, never a different group's names or raw IDs", () => {
    const names = { mainBasketId: "basket-one", mainBasketName: "Materials", subBasketId: "sub-one", subBasketName: "Boards" };
    expect(purchaseOrderComponentLabel(rows[0]!, rows, "In-house labor", names)).toBe("Materials / Boards · Labour");
    expect(purchaseOrderComponentLabel(rows[2]!, rows, "In-house labor", names)).toBe("Component 2 · Labour");
    expect(purchaseOrderComponentLabel({ scope: "pmc" }, [], "PMC", names)).toBe("PMC");
  });
});
