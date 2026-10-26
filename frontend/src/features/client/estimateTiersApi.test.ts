import { describe, expect, it, vi } from "vitest";
import { getEstimateTiers, updateEstimateTier, updateEstimateDimensions, type UpdateEstimateTierInput } from "./estimateTiersApi";

describe("estimate tier API", () => {
  it("encodes route identifiers and sends only the authorized versioned selection fields", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: {} }));
    await getEstimateTiers("project/one");
    expect(String(fetch.mock.calls[0]![0])).toContain("/projects/project%2Fone/estimate-tiers");
    const input = { expectedVersion: 7, modeTier: "premium", revisionId: "revision", itemVersion: 4, revisionVersion: 2, uomId: "unit", selectedInHouseComponentIds: ["component"], ratePaise: 1, quantity: 999, pricingMode: "pmc" };
    fetch.mockResolvedValueOnce(Response.json({ data: {} }));
    await updateEstimateTier("project/one", "line/one", input as UpdateEstimateTierInput);
    const [url, options] = fetch.mock.calls[1]!;
    expect(String(url)).toContain("/projects/project%2Fone/estimate-tiers/line%2Fone");
    expect(options?.method).toBe("PATCH");
    expect(JSON.parse(String(options?.body))).toEqual({ expectedVersion: 7, modeTier: "premium", revisionId: "revision", itemVersion: 4, revisionVersion: 2, uomId: "unit", selectedInHouseComponentIds: ["component"] });
  });
});

it("sends dimensions without accepting client price, quantity or policy fields", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: {} }));
  const expectedDimensionRule = { formula: "length_width" as const, inputUnit: "ft" as const, quantityUnit: "sq_ft" as const, uomId: "unit", decimalScale: 2 };
  const input = { expectedDimensionRule, expectedVersion: 9, revisionId: "revision", itemVersion: 4, revisionVersion: 2, uomId: "unit",
    dimensions: { length: "2", width: "3", height: "4", quantity: 999 }, quantity: 999, ratePaise: 1, dimensionsMandatory: false, modeTier: "premium" };
  await updateEstimateDimensions("project/one", "line/one", input);
  expect(String(fetch.mock.calls[0]![0])).toContain("/projects/project%2Fone/estimate-dimensions/line%2Fone");
  expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ expectedDimensionRule, expectedVersion: 9, revisionId: "revision", itemVersion: 4, revisionVersion: 2, uomId: "unit", dimensions: { length: "2", width: "3", height: "4" } });
});
