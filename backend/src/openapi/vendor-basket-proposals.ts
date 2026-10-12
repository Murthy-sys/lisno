import { HUMAN_JWT_OPERATION_LIST } from "../domain/route-operations.js";

const id = { type: "string", minLength: 1, maxLength: 128 };
const integer = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const nullableId = { ...id, nullable: true };
const name = { type: "string", minLength: 1, maxLength: 240 };
const key = { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" };
const timestamp = { type: "string", format: "date-time" };
const ref = (value: string) => ({ $ref: `#/components/schemas/${value}` });
const object = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const version = { expectedVersion: integer, expectedRequestVersion: integer };
const metadata = { name, description: { type: "string", maxLength: 4000, nullable: true }, displayOrder: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } };
const head = object({ id, version: integer, digest: { type: "string" } });
const target = { oneOf: [object({ kind: { type: "string", enum: ["new_main_basket"] } }), object({ kind: { type: "string", enum: ["new_sub_basket"] }, basketId: id })] };
const summary = {
  target, targetParentName: { type: "string", nullable: true },
  id, kind: { type: "string", enum: ["configuration_proposal"] }, schemaVersion: { type: "integer", enum: [1] },
  requesterId: id, status: { type: "string", enum: ["draft", "pending", "fulfilled", "rejected"] },
  version: integer, requestId: nullableId, requestVersion: { ...integer, nullable: true }, vendorId: nullableId,
  vendorName: { ...name, nullable: true }, basketId: id, name, counts: object({ subBaskets: { type: "integer", minimum: 0 }, mainLines: { type: "integer", minimum: 0 } }),
  createdAt: timestamp, updatedAt: timestamp, submittedAt: { ...timestamp, nullable: true }, decidedAt: { ...timestamp, nullable: true },
  reason: { type: "string", nullable: true }, revisedFromId: nullableId, publishedBasketId: nullableId
};
const resource = {
  proposalId: id, resourceId: id, kind: { type: "string", enum: ["basket", "sub_basket", "main_line", "section", "quality", "uom", "surface"] },
  parentId: nullableId, version: integer, headId: id, payload: { type: "object", additionalProperties: true, description: "Validated Configuration payload for this resource kind. Maximum 240 KiB." },
  digest: { type: "string" }, savedById: id, savedAt: timestamp
};
const editorResource = object({ ...resource, editorPayload: { type: "object", additionalProperties: true,
  description: "Derived pricing editor projection; excluded from saved content and its digest." } }, Object.keys(resource));
const page = (items: Record<string, unknown>) => object({ items: { type: "array", items }, pagination: object({
  total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 },
  offset: { type: "integer", minimum: 0 }, hasMore: { type: "boolean" }
}) });
const masterFields = { ...version, name, description: { type: "string", maxLength: 4000, nullable: true } };
const decimalScale = { type: "integer", minimum: 0, maximum: 3 };
const masterValue = { name, code: { type: "string", minLength: 1, maxLength: 64 }, description: masterFields.description };
const proposedMaster = object({ ...resource,
  kind: { type: "string", enum: ["uom", "surface"] },
  payload: { oneOf: [object({ ...masterValue, decimalScale }), object(masterValue)] }
});
const publishedMapping = object({ basketId: id, subBasketIds: { type: "array", items: id },
  mainLines: { type: "array", items: object({ mainLineId: id, revisionId: id }) },
  prices: { type: "array", items: object({ mainLineId: id, priceEntryId: id, priceVersionId: id }) },
  sections: { type: "array", items: object({ mainLineId: id, sectionKey: { type: "string" }, sectionId: id }) },
  qualityRevisionId: nullableId,
  masters: { type: "array", items: object({ kind: { type: "string", enum: ["uoms", "surfaces"] }, resourceId: id, masterId: id }),
    description: "Proposed values published atomically with the basket. Absent on older stored decisions." }
}, ["basketId", "subBasketIds", "mainLines", "prices", "sections", "qualityRevisionId"]);

export const VENDOR_BASKET_PROPOSAL_SCHEMAS = {
  VendorBasketProposalMasterInput: { description: "Use the UOM shape when masterKind is uoms (decimalScale required), or the Surface shape when masterKind is surfaces (decimalScale forbidden). Codes, lifecycle and ownership are server-managed.",
    oneOf: [object({ ...masterFields, decimalScale }, ["expectedVersion", "name", "decimalScale"]), object(masterFields, ["expectedVersion", "name"])] },
  VendorBasketProposalMasterPage: page(proposedMaster),
  VendorBasketProposalCreate: object({ target, vendorId: nullableId, vendorName: { ...name, nullable: true }, name, idempotencyKey: key }, ["name", "idempotencyKey"]),
  VendorBasketProposalMetadataInput: object({ ...version, ...metadata }, ["expectedVersion", "name"]),
  VendorBasketProposalVersionInput: object(version, ["expectedVersion"]),
  VendorBasketProposalSectionInput: object({ ...version, applicability: { type: "string", enum: ["configured", "not_applicable", "not_configured"] }, payload: resource.payload }, ["expectedVersion", "applicability", "payload"]),
  VendorBasketProposalQualityInput: object({ ...version, parameters: { type: "array", maxItems: 200, items: { type: "object", additionalProperties: true } } }, ["expectedVersion", "parameters"]),
  VendorBasketProposalCommand: object({ ...version, idempotencyKey: key }, ["expectedVersion", "idempotencyKey"]),
  VendorBasketProposalDecisionInput: object({ ...version, idempotencyKey: key, decision: { type: "string", enum: ["approve", "reject"] }, reason: { type: "string", minLength: 1, maxLength: 1000, nullable: true } }, ["expectedVersion", "expectedRequestVersion", "idempotencyKey", "decision"]),
  VendorBasketProposalSummary: object(summary),
  VendorBasketProposalInheritedQuality: object({ basketId: id, basketName: name, basketStatus: { type: "string", enum: ["active", "inactive", "archived"] }, version: integer,
    revisionId: nullableId, revisionNumber: { type: "integer", minimum: 0 }, contentDigest: { type: "string", nullable: true },
    parameters: { type: "array", items: { type: "object", additionalProperties: true } }, updatedAt: { ...timestamp, nullable: true } }),
  VendorBasketProposalResource: editorResource,
  VendorBasketProposalDetail: object({ ...summary, head, submittedHead: { ...head, nullable: true }, approvedHead: { ...head, nullable: true },
    basket: ref("VendorBasketProposalResource"), qualityResourceId: nullableId,
    capabilities: object({ editParent: { type: "boolean" }, editQuality: { type: "boolean" }, manageSubBaskets: { type: "boolean" }, edit: { type: "boolean" }, submit: { type: "boolean" }, review: { type: "boolean" }, decide: { type: "boolean" }, revise: { type: "boolean" } }) }),
  VendorBasketProposalPage: page(ref("VendorBasketProposalSummary")),
  VendorBasketProposalHierarchyPage: page(object({ ...resource, sections: { type: "object", additionalProperties: id }, completeness: { type: "object", additionalProperties: true }, editorItem: { type: "object", additionalProperties: true, description: "Canonical saved Configuration item projection for a Main Line." } }, [...Object.keys(resource), "sections"])),
  VendorBasketProposalReferencePage: page({ type: "object", additionalProperties: true, description: "Allowlisted reference fields needed by Configuration editors." }),
  VendorBasketProposalMutation: object({ detail: ref("VendorBasketProposalDetail"), resource: { ...editorResource, nullable: true } }),
  VendorBasketProposalReadiness: object({ head, version: integer, requestVersion: { ...integer, nullable: true }, ready: { type: "boolean" }, findings: { type: "array", items: object({ resourceId: id, mainLineId: id, sectionKey: { type: "string" }, path: { type: "string" }, code: { type: "string" }, message: { type: "string" } }, ["resourceId", "code", "message"]) } }),
  VendorBasketProposalChanges: page(object({ resourceId: id, kind: resource.kind, change: { type: "string", enum: ["added", "changed", "removed"] }, before: { ...editorResource, nullable: true }, after: { ...editorResource, nullable: true }, fields: { type: "array", items: { type: "string" } } })),
  VendorBasketProposalDecision: object({ proposalId: id, requestId: id, status: { type: "string", enum: ["fulfilled", "rejected"] }, version: integer, requestVersion: integer, submittedDigest: { type: "string" }, approvedDigest: { type: "string", nullable: true }, reason: { type: "string", nullable: true }, published: { ...publishedMapping, nullable: true } })
} as const;

const operations = HUMAN_JWT_OPERATION_LIST.filter(operation => /\/basket-proposals|\/vendor-basket-proposals/u.test(operation.key));
export const VENDOR_BASKET_PROPOSAL_BODIES: Record<string, Record<string, unknown>> = {};
export const VENDOR_BASKET_PROPOSAL_RESPONSES: Record<string, string> = {};
export const VENDOR_BASKET_PROPOSAL_QUERIES: Record<string, readonly Record<string, unknown>[]> = {};
const query = (name: string, schema: Record<string, unknown>) => ({ name, in: "query", required: false, schema });
const paging = [query("limit", { type: "integer", minimum: 1, maximum: 100, default: 20 }), query("offset", { type: "integer", minimum: 0, default: 0 })];
const snapshot = query("snapshot", { type: "string", enum: ["current", "submitted", "approved"], default: "current" });
for (const operation of operations) {
  const [method, path] = operation.key.split(" ") as [string, string];
  if (method !== "GET") {
    const schema = /\/decision$/u.test(path) ? "DecisionInput" : /\/(submit|revise)$/u.test(path) ? "Command"
      : /\/sections\/[^/]+$/u.test(path) ? "SectionInput" : /\/quality$/u.test(path) ? "QualityInput"
      : method === "DELETE" ? "VersionInput" : /\/masters\//u.test(path) ? "MasterInput" : path === "/procurement/vendor-basket-proposals" ? "Create" : "MetadataInput";
    VENDOR_BASKET_PROPOSAL_BODIES[operation.key] = { required: true, content: { "application/json": { schema: ref(`VendorBasketProposal${schema}`) } }, "x-lisno-schema-completeness": schema === "SectionInput" || schema === "QualityInput" ? "generic" : "exact" };
    VENDOR_BASKET_PROPOSAL_RESPONSES[operation.key] = `VendorBasketProposal${schema === "DecisionInput" ? "Decision" : schema === "Command" || schema === "Create" ? "Detail" : "Mutation"}`;
  } else {
    const suffix = path.split("/").at(-1);
    const type = suffix === ":masterKind" ? "MasterPage" : suffix === "inherited-quality" ? "InheritedQuality" : suffix === "mine" ? "Page" : suffix === "hierarchy" ? "HierarchyPage" : suffix === "references" ? "ReferencePage" : suffix === "changes" ? "Changes" : suffix === "readiness" ? "Readiness" : suffix === ":resourceId" ? "Resource" : "Detail";
    VENDOR_BASKET_PROPOSAL_RESPONSES[operation.key] = `VendorBasketProposal${type}`;
    VENDOR_BASKET_PROPOSAL_QUERIES[operation.key] = suffix === "mine" ? [...paging, query("status", summary.status)]
      : suffix === "references" ? [...paging, { ...query("kind", { type: "string", enum: ["uoms", "taxes", "modes", "surfaces", "priorities", "quality-frequencies", "quality-performers", "baskets", "sub-baskets", "main-lines"] }), required: true }, query("ids", { type: "string" })]
      : suffix === "hierarchy" || suffix === ":masterKind" ? [...paging, snapshot] : suffix === "changes" ? paging : (suffix === "readiness" || suffix === "inherited-quality") ? [] : [snapshot];
  }
}
