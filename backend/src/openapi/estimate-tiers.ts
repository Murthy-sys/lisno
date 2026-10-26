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
  EstimateTierSelection: { ...object({ expectedVersion: version, modeTier: tier, ...source.properties,
    selectedInHouseComponentIds: { type: "array", maxItems: 50, uniqueItems: true, items: id } },
    ["expectedVersion", "modeTier", "revisionId", "itemVersion", "revisionVersion", "uomId"]),
    description: "Select a tier for one included working estimate line. Prices and totals are calculated on the server. In-house component selections are explicit and scoped to the selected tier. No manual prices, quantities or pricing modes are accepted. Stale versions, hidden client rows and pending/final reviews are rejected." },
  EstimateTierChoice: object({ modeTier: tier, available: boolean, unavailableReason: { ...string, nullable: true },
    ratePaise: money, amountPaise: money, source: { ...source, nullable: true },
    inHouseComponents: { type: "array", items: object({ id, label: string, ratePaise: money, available: boolean }) } },
    ["modeTier", "available", "unavailableReason", "ratePaise", "amountPaise", "source"]),
  EstimateTierLine: object({ id, mainLineId: id, mainLineName: string, roomName: string, quantity: { type: "number", exclusiveMinimum: true, minimum: 0 },
    dimensionsMandatory: boolean, dimensionRule: { ...ref("EstimateDimensionRule"), nullable: true },
    dimensions: ref("EstimateDimensions"), dimensionsNeedReview: boolean,
    uomName: string, pricingMode: { type: "string", enum: ["pmc", "sub_vendor", "in_house"], nullable: true }, modeTier: tier,
    ratePaise: money, amountPaise: money, selectedInHouseComponentIds: { type: "array", items: id },
    choices: { type: "array", maxItems: 3, items: ref("EstimateTierChoice") } },
    ["id", "mainLineId", "mainLineName", "roomName", "quantity", "uomName", "pricingMode", "modeTier", "ratePaise", "amountPaise", "choices"]),
  EstimateTierChoices: { ...object({ projectId: id, estimateId: { ...id, nullable: true }, estimateVersion: { ...version, nullable: true },
    editingAllowed: boolean, editingBlockReason: { type: "string", enum: ["review_pending", "closed", "not_started"], nullable: true },
    totalPaise: money, isIncomplete: boolean, lines: { type: "array", items: ref("EstimateTierLine") } }),
    description: "Safe working-estimate projection, separate from immutable submitted quotations. Clients receive only their visible included lines. The total still includes hidden amounts. Tier prices contain no raw Configuration or margin payloads." }
};
export const ESTIMATE_TIER_REQUESTS = {
  "PATCH /projects/:projectId/estimate-dimensions/:lineItemId": { required: true,
    content: { "application/json": { schema: ref("EstimateDimensionsUpdate") } } },
  "PATCH /projects/:projectId/estimate-tiers/:lineItemId": { required: true,
    content: { "application/json": { schema: ref("EstimateTierSelection") } } }
};
export const ESTIMATE_TIER_RESPONSES = {
  "PATCH /projects/:projectId/estimate-dimensions/:lineItemId": "EstimateTierChoices",
  "GET /projects/:projectId/estimate-tiers": "EstimateTierChoices",
  "PATCH /projects/:projectId/estimate-tiers/:lineItemId": "EstimateTierChoices"
};
