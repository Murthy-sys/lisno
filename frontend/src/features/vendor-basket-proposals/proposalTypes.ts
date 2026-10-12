import type { KnowledgeSectionApplicability, KnowledgeSectionKey, KnowledgeCompleteness, KnowledgeItemDetail } from "../ai-estimator-knowledge/knowledgeTypes";

export type ProposalTarget = { kind: "new_main_basket" } | { kind: "new_sub_basket"; basketId: string };

export type ProposalStatus = "draft" | "pending" | "fulfilled" | "rejected";
export type ProposalSnapshot = "current" | "submitted" | "approved";
export type ProposalScope = "procurement" | "admin";
export type ProposalResourceKind = "basket" | "sub_basket" | "main_line" | "section" | "quality" | "uom" | "surface";
export const PROPOSAL_LIMITS = { subBaskets: 50, mainLines: 100, snapshotBytes: 8 * 1024 * 1024,
  resourceBytes: 240 * 1024, pricesPerLine: 100, prices: 2000, uoms: 100, surfaces: 100 } as const;

export interface ProposalPage<T> { items: T[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }
export interface ProposalVersionInput { expectedVersion: number; expectedRequestVersion?: number }
export type ProposalMasterKind = "uoms" | "surfaces";
export interface ProposalMasterInput extends ProposalVersionInput {
  name: string; description?: string | null; decimalScale?: number;
}
export interface ProposalMasterValue {
  name: string; code: string; description: string | null; decimalScale?: number;
}
export type ProposalMasterResource = ProposalResource<ProposalMasterValue> & { kind: "uom" | "surface" };
export interface ProposalPublishedMaster { kind: ProposalMasterKind; resourceId: string; masterId: string }
export interface ProposalCreateInput { vendorId?: string | null; vendorName?: string | null; name: string; idempotencyKey: string; target?: ProposalTarget }
export interface ProposalMetadataInput extends ProposalVersionInput { name: string; description?: string | null; displayOrder?: number }
export interface ProposalSectionInput extends ProposalVersionInput { applicability: KnowledgeSectionApplicability; payload: Record<string, unknown> }
export interface ProposalQualityInput extends ProposalVersionInput { parameters: unknown[] }
export interface ProposalSubmitInput extends ProposalVersionInput { idempotencyKey: string }
export interface ProposalDecisionInput extends ProposalSubmitInput { expectedRequestVersion: number; decision: "approve" | "reject"; reason?: string | null }
export interface ProposalSummary {
  /** Absent only in older API responses; defaults to new_main_basket. */
  target?: ProposalTarget; targetParentName?: string | null;
  id: string; kind: "configuration_proposal"; schemaVersion: 1; requesterId: string;
  status: ProposalStatus; version: number; requestId: string | null; requestVersion: number | null;
  vendorId: string | null; vendorName: string | null; basketId: string; name: string;
  counts: { subBaskets: number; mainLines: number }; createdAt: string; updatedAt: string;
  submittedAt: string | null; decidedAt: string | null; reason: string | null;
  revisedFromId: string | null; publishedBasketId: string | null;
}
export interface ProposalHead { id: string; version: number; digest: string }
export interface ProposalDetail extends ProposalSummary {
  capabilities: { edit: boolean; submit: boolean; review: boolean; decide: boolean; revise: boolean; editParent?: boolean; editQuality?: boolean; manageSubBaskets?: boolean };
  head: ProposalHead; submittedHead: ProposalHead | null; approvedHead: ProposalHead | null;
  basket: ProposalResource<ProposalMetadata>; qualityResourceId: string | null;
}
export interface ProposalMetadata { name: string; description: string | null; displayOrder: number }
export interface ProposalSectionValue { sectionKey: KnowledgeSectionKey; applicability: KnowledgeSectionApplicability; payload: Record<string, unknown> }
export interface ProposalResource<T = unknown> {
  proposalId: string; resourceId: string; kind: ProposalResourceKind; parentId: string | null;
  version: number; headId: string; payload: T; digest: string; savedById: string; savedAt: string;
  editorPayload?: Record<string, unknown>;
}
export interface ProposalHierarchyNode extends ProposalResource<ProposalMetadata> {
  sections: Partial<Record<KnowledgeSectionKey, string>>;
  completeness?: KnowledgeCompleteness;
  editorItem?: KnowledgeItemDetail;
}
export interface ProposalFinding { resourceId: string; mainLineId?: string; sectionKey?: KnowledgeSectionKey; path?: string; code: string; message: string }
export interface ProposalReadiness { head: ProposalHead; version: number; requestVersion: number | null; ready: boolean; findings: ProposalFinding[] }
export interface ProposalMutationResult { detail: ProposalDetail; resource: ProposalResource | null }
export interface ProposalPublishedMapping { basketId: string; subBasketIds: string[]; mainLines: Array<{ mainLineId: string; revisionId: string }>; prices: Array<{ mainLineId: string; priceEntryId: string; priceVersionId: string }>; sections: Array<{ mainLineId: string; sectionKey: KnowledgeSectionKey; sectionId: string }>; qualityRevisionId: string | null; masters?: ProposalPublishedMaster[] }
export interface ProposalDecisionResult {
  proposalId: string; requestId: string; status: "fulfilled" | "rejected"; version: number; requestVersion: number;
  submittedDigest: string; approvedDigest: string | null; reason: string | null; published: ProposalPublishedMapping | null;
}
export interface ProposalChange { resourceId: string; kind: ProposalResourceKind; change: "added" | "changed" | "removed"; before: ProposalResource | null; after: ProposalResource | null; fields: string[] }
export type ProposalReferenceKind = "uoms" | "taxes" | "modes" | "surfaces" | "priorities" | "quality-frequencies" | "quality-performers" | "baskets" | "sub-baskets" | "main-lines";

/** Canonical materialization input; resource payloads remain isolated until publication. */
export interface ProposalPublicationSnapshot {
  target?: ProposalTarget;
  proposalId: string; basket: ProposalResource<ProposalMetadata>; subBaskets: ProposalResource<ProposalMetadata>[];
  mainLines: ProposalResource<ProposalMetadata>[]; sections: ProposalResource<ProposalSectionValue>[];
  quality: ProposalResource<{ parameters: unknown[] }> | null;
  /** Older snapshots contain no private master resources. */
  masters?: ProposalMasterResource[];
}
