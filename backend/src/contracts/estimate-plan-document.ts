/** Internal immutable inputs. Storage references must never be serialized into public DTOs. */
export interface PlanDocumentRect { x: number; y: number; width: number; height: number }

export interface PlanDocumentSource {
  kind: "pdf" | "image";
  reference: string;
  pageNumber: number;
  width: number;
  height: number;
  crop: PlanDocumentRect;
  croppedFileReference: string;
}

export interface PlanDocumentPatch {
  drawingId: string;
  revisionId: string;
  originRevisionId: string;
  destination: PlanDocumentRect;
  source: PlanDocumentSource;
  /** Mapping-only revisions do not repaint original PDF content. */
  contentChanged: boolean;
}

export interface PlanDocumentPage {
  sourcePageId: string;
  pageNumber: number;
  width: number;
  height: number;
  basePageReference: string;
  patches: PlanDocumentPatch[];
}

export interface PlanDocumentManifest {
  schemaVersion: 1;
  rendererVersion: 1;
  estimateId: string;
  sourceUploadId: string;
  originalFilename: string;
  originalMimeType: string;
  originalFileReference: string;
  originalSizeBytes: number;
  pages: PlanDocumentPage[];
}

export interface PlanDocumentManifestSet {
  manifestHash: string;
  documents: PlanDocumentManifest[];
}

export type PlanDocumentStatus = "not_prepared" | "preparing" | "ready" | "failed" | "blocked";

export interface PlanDocumentDto {
  sourceUploadId: string;
  originalFilename: string;
  documentId: string | null;
  manifestHash: string;
  status: PlanDocumentStatus;
  pageCount: number;
  pdfUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface PlanDocumentWorkspace {
  manifestHash: string;
  readyForSubmission: boolean;
  documents: PlanDocumentDto[];
  reviewRoundId: string | null;
}

export interface PreparedPlanDocument {
  documentId: string;
  sourceUploadId: string;
  manifestHash: string;
  manifest: PlanDocumentManifest;
  filename: string;
  mimeType: "application/pdf";
  byteSize: number;
  sha256: string;
  storageReference: string;
}

export interface PreparedPlanDocuments {
  manifestHash: string;
  documents: PreparedPlanDocument[];
}
