import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { type: "string", minLength: 1, maxLength: 200 };
const label = { type: "string", minLength: 1, maxLength: 200, description: "Unicode NFKC normalized, trimmed and whitespace collapsed." };
const pricePaise = { type: "integer", minimum: 1, maximum: MAX_FINANCE_AMOUNT_PAISE, description: "Positive INR unit price in integer paise." };
const allocatedWorkPaise = { type: "integer", minimum: 1, maximum: MAX_FINANCE_AMOUNT_PAISE, nullable: true, description: "Total committed vendor work including applicable tax, in integer paise. Required positive on new vendor assignments; omission on updates preserves the current allocation. Null only without a vendor; historical responses may be null when not recorded." };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const option = { id, code: { type: "string" }, name: { type: "string" } };
const reference = object({ ...option, status: { type: "string", enum: ["active", "inactive", "archived", "unavailable"] } });
const input = { itemName: label, brand: label, uomId: id, vendorId: { ...id, nullable: true, default: null }, pricePaise, allocatedWorkPaise };
const inputRequired = ["itemName", "brand", "uomId", "pricePaise"];
const sourceInput = { estimateId: { ...id, maxLength: 500 }, estimateVersion: version, sourceLineItemKey: { ...id, maxLength: 500 } };
const source = object({ ...sourceInput, estimateReviewRoundId: { ...id, maxLength: 500, nullable: true }, sourceSectionId: { ...id, maxLength: 500 } });
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
const page = (item: string) => object({ items: { type: "array", items: ref(item) }, total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 } });

export const PROJECT_PROCUREMENT_SCHEMAS = {
  ProjectProcurementUomOption: object(option),
  ProjectProcurementUomOptions: { type: "array", items: ref("ProjectProcurementUomOption") },
  ProjectProcurementItem: object({ id, projectId: id, estimateSource: { ...source, nullable: true }, itemName: label, brand: label,
    uom: reference, vendor: { ...reference, nullable: true },
    pricePaise, allocatedWorkPaise, version, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }
  }),
  ProjectProcurementPage: page("ProjectProcurementItem"),
  ProjectProcurementCreate: object({ ...input, ...sourceInput }, [...inputRequired, ...Object.keys(sourceInput)]),
  ProjectProcurementUpdate: { ...object({ ...input, ...sourceInput, expectedVersion: { ...version, maximum: Number.MAX_SAFE_INTEGER - 1 } }, [...inputRequired, "expectedVersion"]), description: "Source fields are optional but must be supplied together. Legacy rows may be assigned once; linked identities cannot move and must match the current approved estimate. Omission preserves existing source." },
  ProcurementVendorOption: object({ ...option, status: { type: "string", enum: ["active"] } }),
  ProcurementVendorPage: page("ProcurementVendorOption"),
  ProcurementVendorCreate: object({ name: { ...label, description: "Name also must fit the Configuration master's 240-character normalized identity limit. Existing active names are reused; inactive names return 409." } })
};
export const PROJECT_PROCUREMENT_ITEM_QUERY_PARAMETERS = [
  { name: "q", in: "query", required: false, schema: { type: "string", maxLength: 100 }, description: "Literal normalized search across item name, brand and stored UOM/vendor labels." },
  ...Object.entries(sourceInput).map(([name, schema]) => ({ name, in: "query", required: false, schema, description: "Exact current approved estimate parent. estimateId, estimateVersion and sourceLineItemKey must be supplied together; mutually exclusive with unassigned." })),
  { name: "unassigned", in: "query", required: false, schema: { type: "boolean", enum: [true] }, description: "Returns legacy unlinked or noncurrent source items. Mutually exclusive with source fields." }
] as const;
export const PROJECT_PROCUREMENT_REQUESTS = {
  "POST /procurement/projects/:projectId/items": json("ProjectProcurementCreate"),
  "PATCH /procurement/projects/:projectId/items/:itemId": json("ProjectProcurementUpdate"),
  "POST /procurement/vendors": json("ProcurementVendorCreate")
};
export const PROJECT_PROCUREMENT_RESPONSES = {
  "GET /procurement/projects/:projectId/items": "ProjectProcurementPage",
  "GET /procurement/uoms": "ProjectProcurementUomOptions",
  "GET /procurement/projects/:projectId/items/:itemId": "ProjectProcurementItem",
  "POST /procurement/projects/:projectId/items": "ProjectProcurementItem",
  "PATCH /procurement/projects/:projectId/items/:itemId": "ProjectProcurementItem",
  "GET /procurement/vendors": "ProcurementVendorPage",
  "POST /procurement/vendors": "ProcurementVendorOption"
};
