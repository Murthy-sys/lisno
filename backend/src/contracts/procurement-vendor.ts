/** Public procurement shapes. Never include storage keys, hashes, or raw file metadata. */
export interface ProcurementVendorProfile {
  vendorType: "execution" | "supplier";
  executionType: ("labor" | "material_labour")[] | null;
  supplier: boolean | null;
  nameOfRepresentative: string;
  position: string;
  gstRegistered: boolean;
  msmeRegistered: boolean;
  turnoverSelfDeclaredPaise: number;
  turnoverVerifiedPaise: number | null;
  reference: string;
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
