/** Public procurement shapes. Never include storage keys, hashes, or raw file metadata. */
export const VENDOR_ORGANIZATION_TYPES = ["individual", "company", "firm", "associated_person", "huf", "trust", "govt"] as const;
export type VendorOrganizationType = typeof VENDOR_ORGANIZATION_TYPES[number];

export interface VendorBankAccount {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string | null;
}

export interface ProcurementVendorProfile {
  organizationType: VendorOrganizationType | null;
  bankAccount: VendorBankAccount | null;
  vendorType: "execution" | "supplier";
  executionType: ("labor" | "material_labour")[] | null;
  supplier: boolean | null;
  nameOfRepresentative: string;
  position: string;
  gstRegistered: boolean;
  gstNumber: string | null;
  msmeRegistered: boolean;
  turnoverSelfDeclaredPaise: number;
  turnoverVerifiedPaise: number | null;
  reference: string | null;
  workProfile: string;
  email: string;
  phoneNumber: string;
  address: string;
  aadhar: string;
  pan: string;
  currentAddress: string;
  currentAddressVerifiedPhysically: boolean;
  mainBasketId: string;
  subBasketId: string;
}

/** Omitted compatibility fields are normalized or retained by the server. */
export type ProcurementVendorProfileInput = Omit<ProcurementVendorProfile, "reference" | "gstNumber" | "supplier" | "organizationType" | "bankAccount"> & {
  organizationType?: VendorOrganizationType | null;
  bankAccount?: Omit<VendorBankAccount, "branchName"> & { branchName?: string | null } | null;
  reference?: string | null;
  gstNumber?: string | null;
  supplier?: boolean | null;
};

export type ProcurementVendorCertificateMimeType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export interface ProcurementVendorCertificateDescriptor {
  id: string;
  originalFilename: string;
  mimeType: ProcurementVendorCertificateMimeType;
  byteSize: number;
  uploadedAt: string;
  url: string;
}
export interface ProcurementVendorCertificateUploadPolicy {
  maxUploadBytes: number;
  allowedMimeTypes: ProcurementVendorCertificateMimeType[];
  uploadLifetimeSeconds: number;
}
export interface ProcurementVendorCertificateUploadResult {
  uploadId: string;
  originalFilename: string;
  mimeType: ProcurementVendorCertificateMimeType;
  byteSize: number;
  expiresAt: string;
}

export interface ProcurementVendorStoredProfile extends ProcurementVendorProfile {
  physicalAddressVerifiedAt: string | null;
  physicalAddressVerifiedById: string | null;
}

export interface ProcurementVendorSummary {
  vendorType: ProcurementVendorProfile["vendorType"] | null;
  executionType: ProcurementVendorProfile["executionType"];
  profileComplete: boolean;
  currentAddressVerifiedPhysically: boolean | null;
  mainBasket: { id: string; name: string | null; status: "active" | "inactive" | "archived" | "unavailable" } | null;
  subBasket: { id: string; name: string | null } | null;
}

export interface ProcurementVendorDirectoryOverview {
  totalVendors: number;
  activeVendors: number;
  underReviewVendors: number;
}

export interface ProcurementVendorPhotoDescriptor {
  id: string;
  url: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  uploadedAt: string;
}

/** Intersect with the existing KnowledgeMaster DTO, keeping its canonical identity. */
export interface ProcurementVendorDetailFields {
  procurementSummary: ProcurementVendorSummary;
  procurementProfile: ProcurementVendorStoredProfile | null;
  geoTaggedPicture: ProcurementVendorPhotoDescriptor | null;
  msmeCertificate: ProcurementVendorCertificateDescriptor | null;
}

export interface ProcurementVendorPhotoMutationResult {
  vendorId: string;
  version: number;
  geoTaggedPicture: ProcurementVendorPhotoDescriptor | null;
}

export interface ProcurementVendorBaselineRow {
  itemId: string;
  projectId: string;
  projectName: string;
  itemName: string;
  brand: string;
  version: number;
}

export interface ProcurementVendorBaselinePage {
  items: ProcurementVendorBaselineRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProcurementVendorBaselineInput {
  expectedVersion: number;
  allocatedWorkPaise: number;
  reason: string;
  idempotencyKey: string;
}

export interface ProcurementVendorBaselineResult {
  itemId: string;
  projectId: string;
  vendorId: string;
  allocatedWorkPaise: number;
  version: number;
  recordedAt: string;
}
