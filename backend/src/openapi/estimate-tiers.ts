import { PROJECT_NUMBER_SCHEMA } from "./project-number.js";
const id = { type: "string", minLength: 1, maxLength: 500 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const tier = { type: "string", enum: ["signature", "premium", "functional"] };
const money = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, nullable: true };
const string = { type: "string" };
const boolean = { type: "boolean" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const source = object({ revisionId: id, itemVersion: version, revisionVersion: version, uomId: id });

export const ESTIMATE_TIER_SCHEMAS = {
  EstimateDimensionsUpdate: { ...object({ expectedVersion: version, ...source.properties, dimensions: ref("EstimateDimensions"), expectedDimensionRule: ref("EstimateDimensionRule") }),
    description: "Update the required measurements of one included working line. Quantity is Length × Width; Height is required but is not multiplied. Units come from the configured area UOM. Prices, quantity, tier and mode cannot be submitted. Existing manual rates and component choices are retained; stale configured prices require review." },
  EstimateTierBatchSelection: { ...object({ expectedVersion: version, lines: { type: "array", minItems: 1, maxItems: 1000,
    items: object({ lineItemId: id, modeTier: tier, ...source.properties,
      selectedInHouseComponentIds: { type: "array", maxItems: 50, uniqueItems: true, items: id } },
      ["lineItemId", "modeTier", "revisionId", "itemVersion", "revisionVersion", "uomId"]) } }),
    description: "Atomic legacy estimate tier changes. All lines belong to the authorized estimate; the version increments once. V3 quotations use set_group_tier instead." },
  EstimateTierComparisonInput: { ...object({ expectedVersion: version, mainBasketId: id, subBasketId: { ...id, nullable: true }, roomId: id,
    lines: { type: "array", minItems: 1, maxItems: 1000, items: object({ mainLineId: id, lineItemId: id, ...source.properties,
      quantity: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: Number.MAX_SAFE_INTEGER },
      pricingMode: { type: "string", enum: ["pmc", "sub_vendor", "in_house"], nullable: true }, modeTier: tier,
      rateSource: { type: "string", enum: ["configuration", "manual"] }, manualRateChanged: boolean,
      selectedInHouseComponentIds: { type: "array", maxItems: 50, uniqueItems: true, items: id },
      dimensions: ref("EstimateDimensions"), expectedDimensionRule: ref("EstimateDimensionRule") },
      ["mainLineId", "revisionId", "itemVersion", "revisionVersion", "uomId", "quantity", "modeTier"]) } },
      ["mainBasketId", "subBasketId", "roomId", "lines"]),
    description: "Read-only current Configuration comparison. expectedVersion is required for saved estimates. No submitted prices or totals. null subBasketId means direct items only. Unsaved manual rates require saving; destination In-house tiers require explicit component choices." },
  EstimateTierComparisonLine: object({ mainLineId: id, name: string, quantity: { type: "number", minimum: 0 }, uomName: string,
    ratePaise: money, amountPaise: money, unavailableReason: { ...string, nullable: true } }),
  EstimateTierComparison: object({ mainBasketId: id, subBasketId: { ...id, nullable: true }, roomId: id, roomName: string,
    mainBasketName: string, subBasketName: { ...string, nullable: true }, estimateVersion: { ...version, nullable: true },
    tiers: { type: "array", minItems: 4, maxItems: 4, items: object({ modeTier: { type: "string", enum: ["current", "signature", "premium", "functional"] },
      label: string, available: boolean, subtotalPaise: money, lines: { type: "array", items: ref("EstimateTierComparisonLine") } }) } }),
  EstimateTierSelection: { ...object({ expectedVersion: version, modeTier: tier, ...source.properties,
    selectedInHouseComponentIds: { type: "array", maxItems: 50, uniqueItems: true, items: id } },
    ["expectedVersion", "modeTier", "revisionId", "itemVersion", "revisionVersion", "uomId"]),
    description: "Select a tier for one included working estimate line. Prices and totals are calculated on the server. In-house component selections are explicit and scoped to the selected tier. No manual prices, quantities or pricing modes are accepted. Stale versions, hidden client rows and pending/final reviews are rejected." },
  EstimateTierChoice: object({ modeTier: tier, available: boolean, unavailableReason: { ...string, nullable: true },
    pricingBasis: { type: "string", enum: ["in_house_components_v1"] }, componentPricing: ref("EstimateComponentPricing"),
    ratePaise: money, amountPaise: money, source: { ...source, nullable: true },
    inHouseComponents: { type: "array", items: object({ id, label: string, ratePaise: money, amountPaise: money, available: boolean }, ["id", "label", "ratePaise", "available"]) } },
    ["modeTier", "available", "unavailableReason", "ratePaise", "amountPaise", "source"]),
  EstimateTierLine: object({ id, roomId: id, mainBasketId: id, mainBasketName: string,
    subBasketId: { ...id, nullable: true }, subBasketName: { ...string, nullable: true }, mainLineId: id, mainLineName: string, roomName: string, quantity: { type: "number", exclusiveMinimum: true, minimum: 0 },
    pricingBasis: { type: "string", enum: ["in_house_components_v1"] }, componentPricing: ref("EstimateComponentPricing"),
    dimensionsMandatory: boolean, dimensionRule: { ...ref("EstimateDimensionRule"), nullable: true },
    dimensions: ref("EstimateDimensions"), dimensionsNeedReview: boolean,
    uomName: string, pricingMode: { type: "string", enum: ["pmc", "sub_vendor", "in_house"], nullable: true }, modeTier: tier,
    ratePaise: money, amountPaise: money, selectedInHouseComponentIds: { type: "array", items: id },
    choices: { type: "array", maxItems: 3, items: ref("EstimateTierChoice") } },
    ["id", "mainLineId", "mainLineName", "roomName", "quantity", "uomName", "pricingMode", "modeTier", "ratePaise", "amountPaise", "choices"]),
  EstimateTierChoices: { ...object({ projectNumber: PROJECT_NUMBER_SCHEMA, projectId: id, estimateId: { ...id, nullable: true }, estimateVersion: { ...version, nullable: true },
    editingAllowed: boolean, editingBlockReason: { type: "string", enum: ["review_pending", "closed", "not_started"], nullable: true },
    totalPaise: money, roundOffPaise: { type: "integer", minimum: -50, maximum: 49, description: "Signed final-total adjustment in paise, applied after GST. More than 50 paise rounds up; exactly 50 rounds down. Absent on historical unrounded estimates." }, isIncomplete: boolean, lines: { type: "array", items: ref("EstimateTierLine") } },
    ["projectNumber", "projectId", "estimateId", "estimateVersion", "editingAllowed", "editingBlockReason", "totalPaise", "isIncomplete", "lines"]),
    description: "Safe working-estimate projection, separate from immutable submitted quotations. Clients receive only their visible included lines. The total still includes hidden amounts. Tier prices contain no raw Configuration or margin payloads." }
};
export const ESTIMATE_TIER_REQUESTS = {
  "PATCH /projects/:projectId/estimate-tiers": { required: true, content: { "application/json": { schema: ref("EstimateTierBatchSelection") } } },
  ...Object.fromEntries(["POST /projects/:projectId/estimate-tier-comparison", "POST /projects/:projectId/estimate-tier-comparison/pdf",
    "POST /leads/:leadId/estimate/tier-comparison", "POST /leads/:leadId/estimate/tier-comparison/pdf"].map(key => [key,
      { required: true, content: { "application/json": { schema: ref("EstimateTierComparisonInput") } } }])),
  "PATCH /projects/:projectId/estimate-dimensions/:lineItemId": { required: true,
    content: { "application/json": { schema: ref("EstimateDimensionsUpdate") } } },
  "PATCH /projects/:projectId/estimate-tiers/:lineItemId": { required: true,
    content: { "application/json": { schema: ref("EstimateTierSelection") } } }
};
export const ESTIMATE_TIER_RESPONSES = {
  "PATCH /projects/:projectId/estimate-tiers": "EstimateTierChoices",
  "POST /projects/:projectId/estimate-tier-comparison": "EstimateTierComparison",
  "POST /leads/:leadId/estimate/tier-comparison": "EstimateTierComparison",
  "PATCH /projects/:projectId/estimate-dimensions/:lineItemId": "EstimateTierChoices",
  "GET /projects/:projectId/estimate-tiers": "EstimateTierChoices",
  "PATCH /projects/:projectId/estimate-tiers/:lineItemId": "EstimateTierChoices"
};
