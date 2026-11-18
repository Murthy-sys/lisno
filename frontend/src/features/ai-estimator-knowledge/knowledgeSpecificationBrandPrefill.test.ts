import { describe, expect, it, vi } from "vitest";
import { prefillSpecificationBrands, type KnowledgeSpecificationItemSelection } from "./knowledgeSpecificationBrandPrefill";
import { parseKnowledgeSpecifications, serializeKnowledgeSpecifications } from "./knowledgeSpecificationConfiguration";
import type { KnowledgeJsonObject, KnowledgeSpecificationBrandPrefill } from "./knowledgeTypes";

const specification = () => parseKnowledgeSpecifications([{ id: "local-spec", name: "Before", description: "Keep guidance", type: "text", value: "Keep value", options: [] }]).specifications[0]!;
const selection = (names: string[] = ["Gyproc", "Saint Gobain"]): KnowledgeSpecificationItemSelection => ({
  name: "Gypsum Board", origin: "saved", brandPrefill: { status: "ready", names }
});
function factory() {
  let id = 0;
  return vi.fn((name: string) => ({ id: `new-local-${++id}`, name }));
}

describe("saved specification Brand prefill", () => {
  it("reuses destination Brands and imports only missing names with independent IDs", () => {
    const create = factory();
    const local = { id: "local-gyproc", name: " GYPROC ", description: "Keep local detail" };
    const unrelated = { id: "local-other", name: "Other" };
    const result = prefillSpecificationBrands(specification(), selection(), [local, unrelated], create);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(create).toHaveBeenCalledExactlyOnceWith("Saint Gobain");
    expect(result.brands).toEqual([local, unrelated, { id: "new-local-1", name: "Saint Gobain" }]);
    expect(serializeKnowledgeSpecifications([result.specification])).toEqual([{
      id: "local-spec", name: "Gypsum Board", description: "Keep guidance", type: "text", value: "Keep value", options: [],
      brandIds: ["local-gyproc", "new-local-1"]
    }]);
    expect(local).toEqual({ id: "local-gyproc", name: " GYPROC ", description: "Keep local detail" });
  });

  it("deduplicates Unicode, case and spacing while retaining meaningful distinct names", () => {
    const create = factory();
    const result = prefillSpecificationBrands(specification(), selection(["ＡＢＣ", "abc", "  ABC  ", "Brand  A", "brand a", "Brand-A"]), [], create);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.brands).toHaveLength(3);
    expect(new Set(result.specification.brandIds).size).toBe(3);
  });

  it.each([{ brandId: "keep" }, { brandIds: ["keep", "second"] }, { brandId: "keep", brandIds: [] }, { brandIds: [null] }])(
    "preserves an existing or malformed association while renaming: %j", association => {
      const original = { id: "local-spec", name: "Before", ...association } as KnowledgeJsonObject;
      const parsed = parseKnowledgeSpecifications([original]).specifications[0]!;
      const create = factory();
      const result = prefillSpecificationBrands(parsed, selection(), [{ id: "keep", name: "Existing" }], create);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(serializeKnowledgeSpecifications([result.specification])).toEqual([{ ...original, name: "Gypsum Board" }]);
      expect(create).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, { status: "unavailable", reason: "invalid_source" }, { status: "unavailable", reason: "too_many_brands" }] as const)(
    "does not invent Brands for unavailable or legacy metadata: %j", brandPrefill => {
      const create = factory();
      const result = prefillSpecificationBrands(specification(), { name: "Gypsum Board", origin: "saved", brandPrefill }, [], create);
      expect(result).toMatchObject({ ok: true, specification: { name: "Gypsum Board", brandIds: [] }, brands: [], notice: expect.stringContaining("Choose Brands manually") });
      expect(create).not.toHaveBeenCalled();
    }
  );

  it.each(["new", "draft"] as const)("keeps a %s name independent of saved suggestions", origin => {
    const create = factory();
    expect(prefillSpecificationBrands(specification(), { ...selection(), origin }, [], create)).toMatchObject({ ok: true, specification: { brandIds: [] }, brands: [] });
    expect(create).not.toHaveBeenCalled();
  });

  it("distinguishes a verified empty saved set from unavailable data", () => {
    expect(prefillSpecificationBrands(specification(), selection([]), [], factory())).toEqual({ ok: true, specification: { ...specification(), name: "Gypsum Board" }, brands: [] });
  });

  it("rejects exceeding the destination limit before allocating IDs or changing the draft", () => {
    const local = Array.from({ length: 200 }, (_, index) => ({ id: `id-${index}`, name: `Brand ${index}` }));
    const create = factory();
    expect(prefillSpecificationBrands(specification(), selection(), local, create)).toMatchObject({ ok: false, error: expect.stringContaining("200-Brand limit") });
    expect(local).toHaveLength(200);
    expect(create).not.toHaveBeenCalled();
    expect(prefillSpecificationBrands(specification(), selection(["Brand 1"]), local, create)).toMatchObject({ ok: true, specification: { brandIds: ["id-1"] } });
  });

  it.each([
    [{ id: "same", name: "One" }, { id: "same", name: "Two" }],
    [{ id: "one", name: "Brand" }, { id: "two", name: " brand " }],
    [{ id: "", name: "Invalid" }],
    { malformed: true }
  ])("rejects ambiguous or invalid local definitions without allocation: %j", brands => {
    const create = factory();
    expect(prefillSpecificationBrands(specification(), selection(), brands, create)).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects malformed ready metadata rather than partially importing it", () => {
    const create = factory();
    const malformed = { status: "ready", names: ["Valid", null] } as unknown as KnowledgeSpecificationBrandPrefill;
    expect(prefillSpecificationBrands(specification(), { ...selection(), brandPrefill: malformed }, [], create)).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    { ...selection(), origin: "new" as const },
    selection([]),
    { name: "Gypsum Board", origin: "saved" as const }
  ])("never discards a malformed Brand collection during a name-only selection: %j", selected => {
    const create = factory();
    expect(prefillSpecificationBrands(specification(), selected, { malformed: true }, create)).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
  });
});
