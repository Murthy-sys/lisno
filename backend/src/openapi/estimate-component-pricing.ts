const id = { type: "string", minLength: 1, maxLength: 500 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const paise = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const tier = { type: "string", enum: ["signature", "premium", "functional"] };
const basis = { type: "string", enum: ["in_house_components_v1"] };
const fingerprint = { type: "string", pattern: "^[a-f0-9]{64}$" };
const ids = { type: "array", minItems: 1, maxItems: 50, uniqueItems: true, items: id };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });

export const ESTIMATE_COMPONENT_PRICING_SCHEMAS = {
  EstimateComponentPricing: { ...object({ formulaVersion: basis, mainLineId: id, revisionId: id,
    sourceItemVersion: version, sourceRevisionVersion: version, modeTier: tier,
    quantity: { type: "string", pattern: "^(0|[1-9][0-9]*)(\\.[0-9]{1,3})?$" },
    uom: object({ id, code: id, name: id, decimalScale: { type: "integer", minimum: 0, maximum: 3 } }),
    selectedComponentIds: ids,
    components: { type: "array", minItems: 1, maxItems: 50, items: object({ id, basketId: id,
      subBasketId: { ...id, nullable: true }, basketName: id, subBasketName: { ...id, nullable: true },
      laborSellingPaise: paise, materialSellingPaise: paise, totalPaise: paise }) },
    totalPaise: paise, inputFingerprint: fingerprint }),
    description: "Server-derived, selling-only evidence for explicitly selected In-house components. Independently rounded component totals are authoritative; the line unit rate may be null. Contains no raw cost or margin settings." },
  EstimateInHousePreviewInput: object({ lines: { type: "array", minItems: 1, maxItems: 100,
    items: object({ key: id, mainLineId: id, roomId: id, pricingMode: { type: "string", enum: ["in_house"] },
      rateSource: { type: "string", enum: ["configuration"] }, modeTier: tier, selectedInHouseComponentIds: { ...ids, minItems: 0 },
      quantity: { type: "number", minimum: 0 }, revisionId: id, itemVersion: version, revisionVersion: version, uomId: id,
      dimensions: ref("EstimateDimensions"), expectedDimensionRule: ref("EstimateDimensionRule") },
    ["key", "mainLineId", "roomId", "pricingMode", "rateSource", "modeTier", "selectedInHouseComponentIds", "quantity", "revisionId", "itemVersion", "revisionVersion", "uomId"]) } }),
  EstimateInHousePreviewResponse: { ...object({ lines: { type: "array", maxItems: 100, items: object({ key: id,
    state: { type: "string", enum: ["ready", "incomplete", "conflict"] },
    componentPricing: { ...ref("EstimateComponentPricing"), nullable: true },
    issues: { type: "array", items: object({ code: id, message: { type: "string" } }) } }) } }),
    description: "Read-only estimate-authoring preview. Save recomputes against current Configuration and rejects stale fingerprints. Other estimate pricing modes do not use this endpoint." }
};
export const ESTIMATE_COMPONENT_PRICING_REQUESTS = {
  "POST /leads/:leadId/estimate/in-house-preview": { required: true, content: { "application/json": { schema: ref("EstimateInHousePreviewInput") } } }
};
export const ESTIMATE_COMPONENT_PRICING_RESPONSES = {
  "POST /leads/:leadId/estimate/in-house-preview": "EstimateInHousePreviewResponse"
};
