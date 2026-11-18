import { describe, expect, it } from "vitest";
import { collectSpecificationItemsWithBrandPrefill } from "../src/domain/knowledge-specification-brand-prefill.js";

const ready = (name: string, names: string[] = []) => ({ name, brandPrefill: { status: "ready", names } });
const unavailable = (reason = "invalid_source") => ({ name: "Gypsum Board", brandPrefill: { status: "unavailable", reason } });

describe("specification Brand prefill source resolution", () => {
  it("resolves source-local IDs before deterministic aggregation and never changes source values", () => {
    const scopes = [{ specifications: [{ name: "Gypsum Board", brandIds: ["same-id", "second"] }],
      brands: [{ id: "same-id", name: " Saint  Gobain " }, { id: "second", name: "Knauf" }, { id: "unused", name: "Unrelated" }] },
    { specifications: [{ name: " gypsum board ", brandId: "same-id" }], brands: [{ id: "same-id", name: "USG" }] },
    { specifications: [{ name: "Gypsum Board", brandId: "third" }], brands: [{ id: "third", name: "SAINT GOBAIN" }] }];
    const before = structuredClone(scopes);
    expect(collectSpecificationItemsWithBrandPrefill(scopes)).toEqual([ready("Gypsum Board", ["Knauf", "SAINT GOBAIN", "USG"])]);
    expect(collectSpecificationItemsWithBrandPrefill([...scopes].reverse())).toEqual(collectSpecificationItemsWithBrandPrefill(scopes));
    expect(scopes).toEqual(before);
  });

  it("distinguishes empty associations and ignores invalid unused Brand records", () => {
    expect(collectSpecificationItemsWithBrandPrefill([{ specifications: [{ name: "No Brands" }, { name: "Empty Brands", brandIds: [] },
      { name: "Gypsum Board", brandId: "valid" }], brands: [null, { id: "bad", name: null }, { id: "valid", name: "Knauf" }] }]))
      .toEqual([ready("Empty Brands"), ready("Gypsum Board", ["Knauf"]), ready("No Brands")]);
  });

  it.each([
    { brandId: "one", brandIds: [] }, { brandId: null }, { brandId: " one" }, { brandId: "x".repeat(241) },
    { brandIds: null }, { brandIds: "one" }, { brandIds: ["one", null] }, { brandIds: ["one", "one"] }, { brandIds: [""] }
  ])("marks malformed associations unavailable: %j", association => {
    expect(collectSpecificationItemsWithBrandPrefill([{ specifications: [{ name: "Gypsum Board", ...association }],
      brands: [{ id: "one", name: "Knauf" }] }])).toEqual([unavailable()]);
  });

  it.each([
    undefined, null, {}, [], [{ id: "other", name: "Knauf" }], [{ id: "one", name: "" }], [{ id: "one", name: "x".repeat(241) }],
    [{ id: "one", name: "Knauf" }, { id: "one", name: "USG" }],
    [{ id: "one", name: "Knauf" }, { id: "other", name: " KNAUF " }]
  ])("does not resolve missing or ambiguous referenced definitions: %j", brands => {
    expect(collectSpecificationItemsWithBrandPrefill([{ specifications: [{ name: "Gypsum Board", brandId: "one" }], brands },
      { specifications: [{ name: "Other item", brandId: "one" }], brands: [{ id: "one", name: "Never borrowed" }] }]))
      .toEqual([unavailable(), ready("Other item", ["Never borrowed"])]);
  });

  it("never returns a partial set when one associated Brand is unavailable", () => {
    expect(collectSpecificationItemsWithBrandPrefill([{ specifications: [{ name: "Gypsum Board", brandIds: ["valid", "missing"] }],
      brands: [{ id: "valid", name: "Knauf" }] }])).toEqual([unavailable()]);
  });

  it("bounds distinct grouped Brand names and prioritizes malformed data over overflow", () => {
    const scopes = Array.from({ length: 201 }, (_, index) => ({ specifications: [{ name: "Gypsum Board", brandId: "same-local-id" }],
      brands: [{ id: "same-local-id", name: `Brand ${String(index).padStart(3, "0")}` }] }));
    expect(collectSpecificationItemsWithBrandPrefill(scopes.slice(0, 200))[0]!.brandPrefill).toMatchObject({ status: "ready", names: expect.any(Array) });
    expect(collectSpecificationItemsWithBrandPrefill(scopes)).toEqual([unavailable("too_many_brands")]);
    expect(collectSpecificationItemsWithBrandPrefill([...scopes, { specifications: [{ name: "Gypsum Board", brandId: "missing" }] }]))
      .toEqual([unavailable()]);
  });

  it("does not use invalid item names or combine similar item labels", () => {
    expect(collectSpecificationItemsWithBrandPrefill([{ specifications: [null, { name: " " }, { name: "x".repeat(241) },
      { name: "Gypsum Board", brandId: "one" }, { name: "Gypsum Boards", brandId: "two" }],
      brands: [{ id: "one", name: "Knauf" }, { id: "two", name: "USG" }] }]))
      .toEqual([ready("Gypsum Board", ["Knauf"]), ready("Gypsum Boards", ["USG"])]);
  });
});
