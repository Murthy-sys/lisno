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
      ["kind", "lineItemId", "source"])] } } }),
    description: "Atomic stable-ID operations on the current quotation. Rates and totals are server-derived from current Configuration. Client writes cannot change hidden lines. Saving supersedes an undecided review; it never approves the quotation." },
  QuotationUnlock: object({ expectedVersion: version, reviewRoundId: id,
    reason: { type: "string", minLength: 1, maxLength: 1000 }, idempotencyKey: { type: "string", minLength: 8, maxLength: 128 } }),
  QuotationRevision: object({ estimateId: id, estimateVersion: version, pricedRevision: version,
    phase: { type: "string", enum: ["pre", "post"] }, status: text }),
  Quotation: { type: "object", description: "Actor-scoped editable quotation with server capabilities. Uses EstimateTierChoices fields plus workflowVersion=3, phase, status, pricedRevision, rooms, reviewState and source identities on each visible line. Hidden amounts remain in the true total.",
    properties: { workflowVersion: { type: "integer", enum: [3] }, projectId: id, estimateId: id, estimateVersion: version,
      pricedRevision: version, phase: { type: "string", enum: ["pre", "post"] }, status: text,
      reviewState: { type: "string", enum: ["draft", "awaiting_staff_review", "ready_for_approval", "approved"] },
      rooms: { type: "array", items: object({ id, name: text }) }, editingAllowed: { type: "boolean" },
      totalPaise: { type: "integer", minimum: 0, nullable: true }, lines: { type: "array", items: ref("EstimateTierLine") } } },
  QuotationCandidates: object({ items: { type: "array", items: object({ mainLineId: id, name: text, source,
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
  "GET /projects/:projectId/quotation/items": "QuotationCandidates"
};
