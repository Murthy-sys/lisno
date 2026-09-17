import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { type: "string", minLength: 1, maxLength: 200 };
const label = { type: "string", minLength: 1, maxLength: 200, description: "Unicode NFKC normalized, trimmed and whitespace collapsed." };
const pricePaise = { type: "integer", minimum: 1, maximum: MAX_FINANCE_AMOUNT_PAISE, description: "Positive INR unit price in integer paise." };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const option = { id, code: { type: "string" }, name: { type: "string" } };
const reference = object({ ...option, status: { type: "string", enum: ["active", "inactive", "archived", "unavailable"] } });
const input = { itemName: label, brand: label, uomId: id, vendorId: { ...id, nullable: true, default: null }, pricePaise };
const inputRequired = ["itemName", "brand", "uomId", "pricePaise"];
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
const page = (item: string) => object({ items: { type: "array", items: ref(item) }, total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 } });

export const PROJECT_PROCUREMENT_SCHEMAS = {
  ProjectProcurementUomOption: object(option),
  ProjectProcurementUomOptions: { type: "array", items: ref("ProjectProcurementUomOption") },
  ProjectProcurementItem: object({ id, projectId: id, itemName: label, brand: label,
    uom: reference, vendor: { ...reference, nullable: true },
    pricePaise, version, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }
  }),
  ProjectProcurementPage: page("ProjectProcurementItem"),
  ProjectProcurementCreate: object(input, inputRequired),
  ProjectProcurementUpdate: object({ ...input, expectedVersion: { ...version, maximum: Number.MAX_SAFE_INTEGER - 1 } }, [...inputRequired, "expectedVersion"]),
  ProcurementVendorOption: object({ ...option, status: { type: "string", enum: ["active"] } }),
  ProcurementVendorPage: page("ProcurementVendorOption"),
  ProcurementVendorCreate: object({ name: { ...label, description: "Name also must fit the Configuration master's 240-character normalized identity limit. Existing active names are reused; inactive names return 409." } })
};
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
