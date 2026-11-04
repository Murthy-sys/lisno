import { PROJECT_NUMBER_SCHEMA } from "./project-number.js";
import { ESTIMATE_TIER_SCHEMAS } from "./estimate-tiers.js";

const id = { type: "string", minLength: 1, maxLength: 500 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const text = { type: "string" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const source = object({ revisionId: id, itemVersion: version, revisionVersion: version, uomId: id });
const tier = { type: "string", enum: ["signature", "premium", "functional"] };
const values = { source, quantity: { type: "number", minimum: 0, exclusiveMinimum: true }, modeTier: tier,
  dimensions: ref("EstimateDimensions"), selectedInHouseComponentIds: { type: "array", maxItems: 50, uniqueItems: true, items: id } };
const request = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
const grouping = { mainBasketId: id, mainBasketName: text, subBasketId: { ...id, nullable: true }, subBasketName: { ...text, nullable: true } };
const groupScope = { mainBasketId: id, subBasketId: { ...id, nullable: true }, roomId: { ...id, nullable: true } };
const sourceToken = { type: "string", pattern: "^[a-f0-9]{64}$", description: "Opaque current group/source precondition returned by quotation detail. Changed scope, visibility or Configuration requires refreshing before removal." };
const roomMeasurement = { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 1_000_000, nullable: true };
const setupRoom = { id, typeId: { ...id, nullable: true }, label: { type: "string", minLength: 1, maxLength: 200 }, length: roomMeasurement, width: roomMeasurement };
const setupFields = { propertyType: { type: "string", minLength: 1, maxLength: 200 }, bedroomCount: { type: "integer", minimum: 1, maximum: 50, nullable: true },
  rooms: { type: "array", maxItems: 200, items: object(setupRoom) }, selectedMainBasketIds: { type: "array", maxItems: 200, uniqueItems: true, items: id } };
const removal = { canRemove: { type: "boolean" }, removalBlockedReason: { type: "string", nullable: true } };

export const QUOTATION_SCHEMAS = {
  QuotationPublish: object({ expectedVersion: version, approveSales: { type: "boolean", description: "Must be true for the assigned Sales estimator to approve and send a version-3 pre-design quotation. The immutable review records this approval against its priced revision." } }, []),
  QuotationTransition: object({ expectedVersion: version, targetVersion: { type: "integer", enum: [3] },
    reason: { type: "string", minLength: 1, maxLength: 1000 }, previewFingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" } }),
  QuotationTransitionPreview: { type: "object", description: "Read-only versioned eligibility preview. No project, audit, email or artifact writes. Approved/pending history or commitments require explicit reconciliation before conversion." },
  DesignTeamUpdate: object({ expectedVersion: { type: "integer", minimum: 0 },
    designerIds: { type: "array", maxItems: 3, uniqueItems: true, items: id }, reason: { type: "string", minLength: 1, maxLength: 1000 } }, ["expectedVersion", "designerIds"]),
  DesignTeam: object({ projectId: id, version: { type: "integer", minimum: 0 }, primary: { ...object({ id, name: text }), nullable: true },
    secondaries: { type: "array", maxItems: 3, items: object({ id, name: text }) },
    candidates: { type: "array", maxItems: 100, items: object({ id, name: text }) }, canManage: { type: "boolean" }, requiresReason: { type: "boolean" } }),
  QuotationPatch: { ...object({ expectedVersion: version, operations: { type: "array", minItems: 1, maxItems: 100, items: {
    oneOf: [object({ kind: { type: "string", enum: ["add"] }, mainLineId: id, roomId: id, ...values },
      ["kind", "mainLineId", "roomId", "source", "quantity", "modeTier"]),
    object({ kind: { type: "string", enum: ["update"] }, lineItemId: id, ...values, included: { type: "boolean" } },
      ["kind", "lineItemId", "source"]),
    object({ kind: { type: "string", enum: ["exclude_group"] }, ...groupScope, sourceToken }),
    object({ kind: { type: "string", enum: ["configure"] }, sourceToken, ...setupFields })] } } }),
    description: "Atomic stable-ID operations on the current quotation. Rates and totals are server-derived from current Configuration. Client writes cannot change hidden lines. configure is Client-only and must be the sole operation; its bounded safe selection is merged into full server-owned membership, protected or dependent removal is rejected, and no-op setup saves preserve versions. exclude_group removes eligible included visible members in one transaction, including groups larger than 100 rows; null subBasketId means the whole Main Basket and null roomId means all saved rooms. Overlapping operations are rejected. Saving supersedes an undecided review; it never approves the quotation." },
  QuotationUnlock: object({ expectedVersion: version, reviewRoundId: id,
    reason: { type: "string", minLength: 1, maxLength: 1000 }, idempotencyKey: { type: "string", minLength: 8, maxLength: 128 } }),
  QuotationRevision: object({ estimateId: id, estimateVersion: version, pricedRevision: version,
    phase: { type: "string", enum: ["pre", "post"] }, status: text }),
  QuotationLine: { ...ESTIMATE_TIER_SCHEMAS.EstimateTierLine,
    properties: { ...ESTIMATE_TIER_SCHEMAS.EstimateTierLine.properties, ...grouping,
      roomId: id, included: { type: "boolean" }, source: { ...source, nullable: true } },
    required: [...ESTIMATE_TIER_SCHEMAS.EstimateTierLine.required, ...Object.keys(grouping), "roomId", "included", "source"] },
  QuotationGroup: object({ ...groupScope, includedCount: { type: "integer", minimum: 1 }, sourceToken }),
  QuotationBasket: object({ id, name: text, subBaskets: { type: "array", items: object({ id, name: text }) } }),
  QuotationSetup: object({ ...setupFields,
    rooms: { type: "array", items: object({ ...setupRoom, sqft: { type: "number", minimum: 0 }, ...removal }) },
    sourceToken, canConfigure: { type: "boolean" } }),
  QuotationSetupBasket: object({ id, name: text, canSelect: { type: "boolean" }, ...removal,
    directTemporaryItemCount: { type: "integer", minimum: 0 }, subBaskets: { type: "array", items: object({ id, name: text,
      mainLineCount: { type: "integer", minimum: 0 }, temporaryItemCount: { type: "integer", minimum: 0 } }) } }),
  QuotationSetupCatalogue: object({ projectId: id, estimateId: id, estimateVersion: version, setup: ref("QuotationSetup"),
    baskets: { type: "array", items: ref("QuotationSetupBasket"), description: "Current Client-visible eligible basket hierarchy, including unselected baskets; counts exclude protected lines." } }),
  Quotation: { type: "object", description: "Actor-scoped editable quotation with server capabilities. Uses EstimateTierChoices fields plus workflowVersion=3, phase, status, pricedRevision, rooms, reviewState and source identities on each visible line. Hidden amounts remain in the true total.",
    properties: { projectNumber: PROJECT_NUMBER_SCHEMA, workflowVersion: { type: "integer", enum: [3] }, projectId: id, estimateId: id, estimateVersion: version,
      pricedRevision: version, phase: { type: "string", enum: ["pre", "post"] }, status: text,
      reviewState: { type: "string", enum: ["draft", "awaiting_staff_review", "ready_for_approval", "approved"] },
      rooms: { type: "array", items: object({ id, name: text }) }, editingAllowed: { type: "boolean" },
      totalPaise: { type: "integer", minimum: 0, nullable: true }, lines: { type: "array", items: ref("QuotationLine") },
      excludedLines: { type: "array", items: ref("QuotationLine"), description: "Visible excluded saved rows retain stable IDs and user choices for re-addition. They do not contribute to totals." },
      baskets: { type: "array", items: ref("QuotationBasket"), description: "Complete safe hierarchy within project-selected baskets, independent of candidate pagination." },
      groups: { type: "array", items: ref("QuotationGroup") }, setup: ref("QuotationSetup") } },
  QuotationCandidates: object({ items: { type: "array", items: object({ mainLineId: id, name: text, source, ...grouping,
    pricingMode: { type: "string", enum: ["pmc", "sub_vendor", "in_house"] }, modeTier: tier, dimensionsMandatory: { type: "boolean" },
    dimensionRule: { ...ref("EstimateDimensionRule"), nullable: true }, uomName: text,
    choices: { type: "array", items: ref("EstimateTierChoice") } }) }, total: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 50 }, offset: { type: "integer", minimum: 0 } })
};
export const QUOTATION_REQUESTS = {
  "POST /leads/:leadId/estimate/submit": request("QuotationPublish"),
  "POST /estimates/:estimateId/send-client": request("QuotationPublish"),
  "POST /estimates/:estimateId/enable-collaboration": { required: true, content: { "application/json": { schema: {
    oneOf: [ref("EstimateVersionCommand"), ref("QuotationTransition")] } } } },
  "PUT /projects/:projectId/secondary-designers": request("DesignTeamUpdate"),
  "PATCH /projects/:projectId/quotation": request("QuotationPatch"),
  "POST /estimates/:estimateId/unlock": request("QuotationUnlock")
};
export const QUOTATION_RESPONSES = {
  "GET /estimates/:estimateId/collaboration-preview": "QuotationTransitionPreview",
  "GET /projects/:projectId/design-team": "DesignTeam",
  "PUT /projects/:projectId/secondary-designers": "DesignTeam",
  "GET /projects/:projectId/quotation": "Quotation",
  "PATCH /projects/:projectId/quotation": "Quotation",
  "GET /projects/:projectId/quotation/revision": "QuotationRevision",
  "GET /projects/:projectId/quotation/items": "QuotationCandidates",
  "GET /projects/:projectId/quotation/setup": "QuotationSetupCatalogue"
};
