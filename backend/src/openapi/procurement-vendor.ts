import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { VENDOR_ORGANIZATION_TYPES } from "../contracts/procurement-vendor.js";
import { AI_ESTIMATOR_KNOWLEDGE_COMPONENT_SCHEMAS as knowledge } from "./ai-estimator-knowledge.js";

type Shape = Record<string, unknown>;
const base = "/admin/ai-estimator-knowledge/vendors";
const id = { type: "string", minLength: 1, maxLength: 500 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const short = { type: "string", minLength: 1, maxLength: 240 };
const long = { type: "string", minLength: 1, maxLength: 4000 };
const money = { type: "integer", minimum: 0, maximum: MAX_FINANCE_AMOUNT_PAISE, description: "Integer INR paise." };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Shape, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const request = (name: string, media = "application/json") => ({ required: true, "x-lisno-schema-completeness": "exact", content: { [media]: { schema: ref(name) } } });
const saveIdentity = { type: "string", minLength: 8, maxLength: 200, pattern: "^[A-Za-z0-9_-]{8,200}$" };
const certificateMime = { type: "string", enum: ["application/pdf", "image/jpeg", "image/png", "image/webp"] };
const saveFields = { msmeCertificateUploadId: { type: "string", minLength: 1, maxLength: 128, description: "Owned, unexpired staged certificate identity. Requires procurementProfile and idempotencyKey; forbidden for MSME No." }, idempotencyKey: saveIdentity };
const executionTypes = {
  type: "array", minItems: 1, maxItems: 2, uniqueItems: true,
  items: { type: "string", enum: ["labor", "material_labour"] },
  description: "One or both selections. Canonical output order is labor, then material_labour."
};
const legacyExecutionType = { type: "string", enum: ["labor", "material_labour"], description: "Legacy scalar input is normalized to a singleton array." };
const nullExecutionType = { type: "array", nullable: true, enum: [null] };
const classifications = (execution: Shape) => [
  { properties: { vendorType: { enum: ["execution"] }, executionType: execution, supplier: { type: "boolean", nullable: true, enum: [null] } } },
  { properties: { vendorType: { enum: ["supplier"] }, executionType: nullExecutionType, supplier: { type: "boolean", nullable: false } } }
];
const bankAccountFields = {
  accountHolderName: short, bankName: short,
  accountNumber: { type: "string", minLength: 1, maxLength: 34, pattern: "^[0-9]{1,34}$", description: "Digits only; leading zeroes are preserved." },
  ifscCode: { type: "string", pattern: "^[A-Z]{4}0[A-Z0-9]{6}$", description: "Trimmed and normalized uppercase. Format validation only, not bank verification." },
  branchName: { type: "string", maxLength: 240, nullable: true }
};
const bankAccount = { ...object(bankAccountFields), nullable: true };
const bankAccountInput = { ...bankAccount, required: ["accountHolderName", "bankName", "accountNumber", "ifscCode"] };
const profile: Shape = {
  organizationType: { type: "string", enum: [...VENDOR_ORGANIZATION_TYPES, null], nullable: true, description: "Required for new profiled vendors. Legacy profiles may retain null. Omitted updates preserve the stored value; null clears it." },
  bankAccount: { ...bankAccount, description: "Private bank details or null. Optional for vendor allocation. Omitted updates preserve the stored account; null clears it." },
  vendorType: { type: "string", enum: ["execution", "supplier"] },
  executionType: { ...executionTypes, nullable: true },
  supplier: { type: "boolean", nullable: true },
  nameOfRepresentative: short, position: short,
  gstRegistered: { type: "boolean" }, gstNumber: { type: "string", nullable: true, pattern: "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", description: "Required and normalized uppercase when GST Yes. Null when GST No. Legacy reads may be null when Yes." }, msmeRegistered: { type: "boolean" },
  turnoverSelfDeclaredPaise: money, turnoverVerifiedPaise: { ...money, nullable: true },
  reference: { ...short, nullable: true }, workProfile: long, email: { type: "string", format: "email", maxLength: 320 },
  phoneNumber: { type: "string", minLength: 3, maxLength: 64 }, address: long,
  aadhar: { type: "string", pattern: "^[0-9]{12}$" },
  pan: { type: "string", pattern: "^[A-Z]{5}[0-9]{4}[A-Z]$" },
  currentAddress: long, currentAddressVerifiedPhysically: { type: "boolean" }, mainBasketId: { ...id, maxLength: 128 }, subBasketId: { ...id, maxLength: 128 }
};
const master = knowledge.KnowledgeMaster as { properties: Shape; required: string[] };
const createMaster = knowledge.KnowledgeMasterCreateRequest as { properties: Shape };
const updateMaster = knowledge.KnowledgeMasterUpdateRequest as { properties: Shape };
const vendorFields = { ...master.properties, procurementSummary: ref("KnowledgeVendorSummary") };
const storedProfile = { ...profile,
  physicalAddressVerifiedAt: { type: "string", format: "date-time", nullable: true },
  physicalAddressVerifiedById: { ...id, nullable: true }
};

export const PROCUREMENT_VENDOR_SCHEMAS: Readonly<Record<string, Shape>> = {
  KnowledgeVendorProfile: {
    ...object(profile),
    description: "Canonical profile. Execution requires one or both distinct selections and null supplier; Supplier has null executionType. Legacy Supplier false remains readable. GST Yes requires a valid GST Number on writes; MSME Yes requires an attached certificate.",
    oneOf: classifications({ ...executionTypes, nullable: false })
  },
  KnowledgeVendorProfileInput: {
    ...object({ ...profile, bankAccount: bankAccountInput, executionType: { oneOf: [{ ...executionTypes, nullable: true }, legacyExecutionType] } }, Object.keys(profile).filter(key => !["reference", "gstNumber", "supplier", "organizationType", "bankAccount"].includes(key))),
    description: "Execution accepts one or both distinct selections, or a legacy scalar normalized to one selection. Supplier requires null executionType and derives supplier true. Omitted Reference, Organization Type and Bank Account retain existing data on update. GST Yes requires GST Number; MSME Yes requires existing or staged certificate. A supplied Bank Account requires all four core fields; Branch Name is optional and normalizes to null.",
    oneOf: [classifications({ oneOf: [executionTypes, legacyExecutionType] })[0], { properties: { vendorType: { enum: ["supplier"] }, executionType: nullExecutionType } }]
  },
  KnowledgeVendorStoredProfile: object(storedProfile),
  KnowledgeVendorSummary: object({
    vendorType: { type: "string", nullable: true, enum: ["execution", "supplier", null] },
    executionType: { ...executionTypes, nullable: true },
    profileComplete: { type: "boolean" }, currentAddressVerifiedPhysically: { type: "boolean", nullable: true },
    mainBasket: { ...object({ id, name: { type: "string", nullable: true }, status: { type: "string", enum: ["active", "inactive", "archived", "unavailable"] } }), nullable: true },
    subBasket: { ...object({ id, name: { type: "string", nullable: true } }), nullable: true }
  }),
  KnowledgeVendorPhoto: object({ id, url: { type: "string", description: "Authenticated image endpoint, never an object-storage reference." },
    mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
    byteSize: { type: "integer", minimum: 1 }, uploadedAt: { type: "string", format: "date-time" }
  }),
  KnowledgeVendorCertificate: object({ id, originalFilename: { type: "string", maxLength: 255 }, mimeType: certificateMime, byteSize: { type: "integer", minimum: 1 }, uploadedAt: { type: "string", format: "date-time" }, url: { type: "string", description: "Authenticated private download endpoint with certificate revision." } }),
  KnowledgeVendorCertificateUploadPolicy: object({ maxUploadBytes: { type: "integer", minimum: 1 }, allowedMimeTypes: { type: "array", items: certificateMime }, uploadLifetimeSeconds: { type: "integer", minimum: 1 } }),
  KnowledgeVendorCertificateUploadResult: object({ uploadId: id, originalFilename: { type: "string", maxLength: 255 }, mimeType: certificateMime, byteSize: { type: "integer", minimum: 1 }, expiresAt: { type: "string", format: "date-time" } }),
  KnowledgeVendorCertificateCreateUpload: object({ certificate: { type: "string", format: "binary" }, idempotencyKey: saveIdentity }),
  KnowledgeVendorCertificateUpdateUpload: object({ certificate: { type: "string", format: "binary" }, idempotencyKey: saveIdentity, expectedVersion: version }),
  KnowledgeVendor: object(vendorFields, [...master.required, "procurementSummary"]),
  KnowledgeVendorDetail: object({ ...vendorFields,
    procurementProfile: { ...object(storedProfile), nullable: true },
    geoTaggedPicture: { allOf: [ref("KnowledgeVendorPhoto")], nullable: true },
    msmeCertificate: { allOf: [ref("KnowledgeVendorCertificate")], nullable: true }
  }, [...master.required, "procurementSummary", "procurementProfile", "geoTaggedPicture", "msmeCertificate"]),
  KnowledgeVendorDirectoryOverview: {
    ...object({ totalVendors: { type: "integer", minimum: 0 }, activeVendors: { type: "integer", minimum: 0 }, underReviewVendors: { type: "integer", minimum: 0 } }),
    description: "Global non-archived vendor counts, independent of search, lifecycle, classification, baskets and pagination filters. Active uses lifecycle active. Under review means physical-address verification is false or absent and can overlap Active."
  },
  KnowledgeVendorPage: object({ items: { type: "array", items: ref("KnowledgeVendor") }, pagination: (knowledge.KnowledgeMasterPage as { properties: Shape }).properties.pagination, directoryOverview: ref("KnowledgeVendorDirectoryOverview") }, ["items", "pagination"]),
  KnowledgeVendorCreateRequest: {
    ...object({ ...createMaster.properties, ...saveFields, procurementProfile: ref("KnowledgeVendorProfileInput"), confirmPhysicalAddressVerification: { type: "boolean" } }, ["name"]),
    description: "Entity Name is required. An omitted code is generated; an omitted procurementProfile leaves the legacy profile incomplete. A new vendor with procurementProfile requires a non-null organizationType. Existing committed save receipts remain replayable."
  },
  KnowledgeVendorUpdateRequest: object({ ...updateMaster.properties, ...saveFields, procurementProfile: ref("KnowledgeVendorProfileInput"), confirmPhysicalAddressVerification: { type: "boolean" } }, ["expectedVersion"]),
  KnowledgeVendorPhotoUpload: object({ photo: { type: "string", format: "binary" }, expectedVersion: version, idempotencyKey: { type: "string", minLength: 8, maxLength: 200, pattern: "^[A-Za-z0-9_-]{8,200}$" } }),
  KnowledgeVendorPhotoRemove: object({ expectedVersion: version }),
  KnowledgeVendorPhotoResult: object({ vendorId: id, version, geoTaggedPicture: { allOf: [ref("KnowledgeVendorPhoto")], nullable: true } }),
  KnowledgeVendorBaselineRow: object({ itemId: id, projectId: id, projectName: short, itemName: short, brand: short, version }),
  KnowledgeVendorBaselinePage: object({ items: { type: "array", items: ref("KnowledgeVendorBaselineRow") }, total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 } }),
  KnowledgeVendorBaselineRequest: object({ expectedVersion: version, allocatedWorkPaise: { ...money, minimum: 1 }, reason: { type: "string", minLength: 1, maxLength: 2000 }, idempotencyKey: { type: "string", minLength: 1, maxLength: 200 } }),
  KnowledgeVendorBaselineResult: object({ itemId: id, projectId: id, vendorId: id, allocatedWorkPaise: { ...money, minimum: 1 }, version, recordedAt: { type: "string", format: "date-time" } })
};

export const PROCUREMENT_VENDOR_REQUESTS = {
  [`POST ${base}`]: request("KnowledgeVendorCreateRequest"),
  [`PATCH ${base}/:id`]: request("KnowledgeVendorUpdateRequest"),
  [`POST ${base}/msme-certificate-uploads`]: request("KnowledgeVendorCertificateCreateUpload", "multipart/form-data"),
  [`POST ${base}/:id/msme-certificate-uploads`]: request("KnowledgeVendorCertificateUpdateUpload", "multipart/form-data"),
  [`PUT ${base}/:id/photo`]: request("KnowledgeVendorPhotoUpload", "multipart/form-data"),
  [`DELETE ${base}/:id/photo`]: request("KnowledgeVendorPhotoRemove"),
  [`POST ${base}/:id/allocation-baseline/:itemId`]: request("KnowledgeVendorBaselineRequest")
};
export const PROCUREMENT_VENDOR_RESPONSES = {
  [`GET ${base}`]: "KnowledgeVendorPage", [`POST ${base}`]: "KnowledgeMaster", [`PATCH ${base}/:id`]: "KnowledgeMaster",
  [`GET ${base}/:id`]: "KnowledgeVendorDetail",
  [`GET ${base}/msme-certificate-upload-policy`]: "KnowledgeVendorCertificateUploadPolicy",
  [`POST ${base}/msme-certificate-uploads`]: "KnowledgeVendorCertificateUploadResult",
  [`POST ${base}/:id/msme-certificate-uploads`]: "KnowledgeVendorCertificateUploadResult",
  [`PUT ${base}/:id/photo`]: "KnowledgeVendorPhotoResult", [`DELETE ${base}/:id/photo`]: "KnowledgeVendorPhotoResult",
  [`GET ${base}/:id/allocation-baseline`]: "KnowledgeVendorBaselinePage",
  [`POST ${base}/:id/allocation-baseline/:itemId`]: "KnowledgeVendorBaselineResult"
};
export const PROCUREMENT_VENDOR_QUERIES = {
  [`GET ${base}/:id/msme-certificate`]: [{ name: "v", in: "query", required: false, schema: { type: "string", maxLength: 128 }, description: "Must match the currently attached certificate; stale revisions return 404." }],
  [`GET ${base}/:id/photo`]: [{ name: "v", in: "query", required: false, schema: { type: "string" }, description: "Opaque image revision used to refresh an authenticated preview." }],
  [`GET ${base}/:id/allocation-baseline`]: [
    { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
    { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 } }
  ]
};
