import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ESTIMATE_COMPONENT_PRICING_BASIS, readEstimateComponentPricing, estimateComponentLineAmountIsValid, type EstimateComponentPricing } from "../src/domain/estimate-component-pricing.js";
import { assertPublishableConfiguredLines, toEstimateSnapshot } from "../src/services/estimate-publication.service.js";
import { createEstimatePdfService, type EstimatePdfInput } from "../src/services/estimate-pdf.service.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const snapshot = (): EstimateComponentPricing => ({ formulaVersion: ESTIMATE_COMPONENT_PRICING_BASIS,
  mainLineId: "line-a", revisionId: "revision-a", sourceItemVersion: 2, sourceRevisionVersion: 3,
  modeTier: "signature", quantity: "2", uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 2 },
  selectedComponentIds: ["component-a"], components: [{ id: "component-a", basketId: "basket-b", subBasketId: "sub-b",
    basketName: "Basket B", subBasketName: "Sub B", laborSellingPaise: 25000, materialSellingPaise: 53333, totalPaise: 78333 }],
  totalPaise: 78333, inputFingerprint: "a".repeat(64) });
const line = () => ({ source: "configuration", pricingMode: "in_house", rateSource: "configuration", pricingBasis: ESTIMATE_COMPONENT_PRICING_BASIS,
  componentPricing: snapshot(), mainLineId: "line-a", revisionId: "revision-a", sourceItemVersion: 2, sourceRevisionVersion: 3,
  modeTier: "signature", quantity: 2, uomId: "uom-a", uomDecimalScale: 2, selectedInHouseComponentIds: ["component-a"],
  ratePaise: null, rate: null, amountPaise: 78333, amount: 783.33 });

describe("exact component selling evidence", () => {
  it("keeps backend and shared snapshot validation identical", () => {
    expect(readFileSync(new URL("../src/domain/estimate-component-pricing.ts", import.meta.url), "utf8"))
      .toBe(readFileSync(new URL("../../shared/estimation/estimateComponentPricing.ts", import.meta.url), "utf8"));
  });
  it("accepts independently rounded component totals that cannot be expressed as a two-decimal unit rate", () => {
    expect(readEstimateComponentPricing(snapshot())).toEqual(snapshot());
    expect(estimateComponentLineAmountIsValid(line())).toBe(true);
    expect(estimateComponentLineAmountIsValid({ ...line(), amountPaise: 78334 })).toBe(false);
  });
  it.each(["pmc", "sub_vendor", undefined])("does not activate for estimate mode %s", pricingMode => {
    expect(estimateComponentLineAmountIsValid({ ...line(), pricingMode })).toBe(false);
  });
  it("rejects manual, foreign, changed-quantity and stale-version evidence", () => {
    for (const patch of [{ rateSource: "manual" }, { source: "legacy" }, { mainLineId: "line-b" }, { quantity: 3 },
      { sourceRevisionVersion: 4 }, { selectedInHouseComponentIds: ["component-b"] }, { uomId: "other" }, { ratePaise: 39167 }]) {
      expect(estimateComponentLineAmountIsValid({ ...line(), ...patch })).toBe(false);
    }
  });
  it("rejects malformed, duplicated and unreconciled snapshots without leaking cost settings", () => {
    for (const change of [{ totalPaise: 78334 }, { selectedComponentIds: ["component-a", "component-a"] }, { quantity: "2.00" },
      { inputFingerprint: "invalid" }, { internalCost: 60000 }, { components: [{ ...snapshot().components[0], laborSellingPaise: 25001 }] },
      { components: [{ ...snapshot().components[0], totalPaise: Number.MAX_SAFE_INTEGER + 1 }] }]) {
      expect(readEstimateComponentPricing({ ...snapshot(), ...change })).toBeNull();
    }
  });
});

const publicationFixture = () => ({
  _id: "estimate-a", leadId: "lead-a", ownerId: "estimator-a", projectId: null, version: 2, status: "draft",
  propertyType: "villa", approvalRequired: false, reviews: [], notifications: [],
  subtotal: 783.33, gst: 141, total: 924.33, subtotalPaise: 78333, gstPaise: 14100, totalPaise: 92433,
  lineItems: [{ ...line(), source: "configuration" as const, pricingMode: "in_house" as const,
    rateSource: "configuration" as const, modeTier: "signature" as const, included: true,
    id: "estimate-line-a", catalogueId: "line-a", itemType: "main_line" as const, classification: "special" as const,
    roomId: "room-a", roomName: "Living Room", mainBasketId: "basket-a", subBasketId: "sub-a",
    mainBasketName: "Source basket", subBasketName: "Source sub-basket", mainLineName: "Ceiling framework",
    uomName: "sq ft", uomCode: "SQFT", unit: "sq ft", specification: null }]
});
const publicationLead = { _id: "lead-a", ownerId: "estimator-a", projectId: null,
  clientName: "Synthetic Client", clientEmail: "client@example.test", projectName: "Synthetic Project", location: "Pune" };
const pdfFixture = (): EstimatePdfInput => ({ ...publicationFixture(), id: "estimate-a", lead: publicationLead });

describe("component evidence at publication and PDF boundaries", () => {
  it("publishes the exact saved selling amount with no inferred unit rate", () => {
    const estimate = publicationFixture();
    expect(() => assertPublishableConfiguredLines(estimate)).not.toThrow();
    const frozen = toEstimateSnapshot(estimate, publicationLead).lineItems[0];
    expect(frozen).toMatchObject({ rate: null, ratePaise: null, amountPaise: 78333, componentPricing: snapshot() });
    expect(JSON.stringify(frozen)).not.toMatch(/adjustedCost|startingMarkup|floorSelling|baseRate/u);
  });
  it("rejects malformed declared evidence even if a legacy rate was also supplied", async () => {
    const estimate = publicationFixture();
    Object.assign(estimate.lineItems[0], { rate: 391.66, ratePaise: 39166,
      componentPricing: { ...snapshot(), totalPaise: 78334 } });
    expect(() => assertPublishableConfiguredLines(estimate)).toThrow(/Complete every included/u);
    await expect(createEstimatePdfService().generate({ ...estimate, id: estimate._id, lead: publicationLead }))
      .rejects.toThrow(/valid saved component amounts/u);
  });
  it("renders the frozen exact total and a component label in the customer PDF", async () => {
    const generated = await createEstimatePdfService().generate(pdfFixture());
    const pdf = await getDocument({ data: new Uint8Array(generated.bytes), useSystemFonts: true }).promise;
    try {
      let text = "";
      for (let index = 1; index <= pdf.numPages; index += 1) {
        const content = await (await pdf.getPage(index)).getTextContent();
        text += content.items.flatMap(item => "str" in item ? [item.str] : []).join(" ");
      }
      expect(text.replace(/\s+/gu, " ")).toContain("From components");
      expect(text).toContain("783.33");
    } finally { await pdf.destroy(); }
  });
});
