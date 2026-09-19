export type KnowledgeItemStatus = "draft" | "active" | "inactive" | "archived";
export type KnowledgeRevisionStatus = "draft" | "active" | "superseded";
export type KnowledgeAllowedAction =
  | "update_section"
  | "review_and_activate"
  | "create_revision"
  | "duplicate"
  | "deactivate"
  | "archive";

export interface KnowledgeFinding {
  readonly code: string;
  readonly sectionKey: string;
  readonly message: string;
  readonly blocking: boolean;
}

export interface KnowledgeCompleteness {
  readonly percentage: number;
  readonly blockers: readonly KnowledgeFinding[];
  readonly warnings: readonly KnowledgeFinding[];
}

export interface KnowledgeRevision {
  readonly id: string;
  readonly mainLineId: string;
  readonly revisionNumber: number;
  readonly status: KnowledgeRevisionStatus;
  readonly sourceRevisionId: string | null;
  readonly completeness: KnowledgeCompleteness;
  readonly activatedAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeItemSummary {
  readonly id: string;
  readonly version: number;
  readonly basketId: string;
  readonly basketName: string;
  readonly subBasketId?: string | null;
  readonly subBasketName?: string | null;
  readonly mainLineId: string;
  readonly mainLineName: string;
  readonly description: string | null;
  readonly status: KnowledgeItemStatus;
  readonly activeRevisionId: string | null;
  readonly draftRevisionId: string | null;
  readonly revisionNumber: number | null;
  readonly completeness: KnowledgeCompleteness;
  readonly allowedActions: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeItemDetail extends KnowledgeItemSummary {
  readonly activeRevision: KnowledgeRevision | null;
  readonly draftRevision: KnowledgeRevision | null;
  readonly blockers: readonly KnowledgeFinding[];
  readonly warnings: readonly KnowledgeFinding[];
}

export interface KnowledgeBasket {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: "active" | "inactive" | "archived";
  readonly version: number;
}

export interface KnowledgePagination {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
}

export interface KnowledgePage<T> {
  readonly items: readonly T[];
  readonly pagination: KnowledgePagination;
}

export interface KnowledgeCreateDraft {
  readonly basketId: string;
  readonly subBasketName: string;
  readonly name: string;
  readonly description: string;
}

export interface KnowledgeDuplicateDraft {
  readonly name: string;
  readonly reason: string;
}

export interface KnowledgeCreateInput {
  readonly name: string;
  readonly subBasketName: string;
  readonly description?: string;
}

export type KnowledgeValidationResult<T> =
  | { readonly value: T; readonly error?: never }
  | { readonly value?: never; readonly error: string };

function trimmedText(value: string, label: string, maximum: number): KnowledgeValidationResult<string> {
  const normalized = value.trim();
  if (!normalized) return { error: `${label} is required.` };
  if (normalized.length > maximum) return { error: `${label} must be ${maximum} characters or fewer.` };
  return { value: normalized };
}

export function validateKnowledgeCreate(
  draft: KnowledgeCreateDraft,
  baskets: readonly KnowledgeBasket[]
): KnowledgeValidationResult<{ readonly basketId: string; readonly input: KnowledgeCreateInput }> {
  const basket = baskets.find((candidate) => candidate.id === draft.basketId && candidate.status === "active");
  if (!basket) return { error: "Choose an active Main Basket." };
  const subBasketName = trimmedText(draft.subBasketName, "Sub Basket", 240);
  if ("error" in subBasketName) return { error: subBasketName.error };
  const name = trimmedText(draft.name, "Main Line name", 240);
  if ("error" in name) return { error: name.error };
  const description = draft.description.trim();
  if (description.length > 4_000) return { error: "Description must be 4000 characters or fewer." };
  return {
    value: {
      basketId: basket.id,
      input: {
        name: name.value,
        subBasketName: subBasketName.value,
        ...(description ? { description } : {})
      }
    }
  };
}

export function validateKnowledgeDuplicate(
  draft: KnowledgeDuplicateDraft
): KnowledgeValidationResult<{ readonly name: string; readonly reason?: string }> {
  const name = trimmedText(draft.name, "Duplicate name", 240);
  if ("error" in name) return { error: name.error };
  const reason = draft.reason.trim();
  if (reason.length > 1_000) return { error: "Reason must be 1000 characters or fewer." };
  return { value: { name: name.value, ...(reason ? { reason } : {}) } };
}

function assertSnapshot(mainLineId: string, version: number): void {
  if (!mainLineId || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("The current knowledge version is unavailable.");
  }
}

export function knowledgeListPath(input: {
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}): string {
  const query = new URLSearchParams();
  const search = input.search?.trim();
  if (search) query.set("search", search);
  query.set("limit", String(input.limit));
  query.set("offset", String(input.offset));
  return `/admin/ai-estimator-knowledge/items?${query.toString()}`;
}

export function knowledgeDetailPath(mainLineId: string): string {
  if (!mainLineId) throw new Error("A Main Line ID is required.");
  return `/admin/ai-estimator-knowledge/main-lines/${encodeURIComponent(mainLineId)}`;
}

export function knowledgeHistoryPath(mainLineId: string): string {
  return `${knowledgeDetailPath(mainLineId)}/history?limit=20&offset=0`;
}

export function knowledgeCreateCommand(
  basketId: string,
  input: KnowledgeCreateInput
): { readonly path: string; readonly body: KnowledgeCreateInput } {
  if (!basketId) throw new Error("A Main Basket ID is required.");
  return {
    path: `/admin/ai-estimator-knowledge/baskets/${encodeURIComponent(basketId)}/main-lines`,
    body: input
  };
}

export function knowledgeDuplicateCommand(
  item: Pick<KnowledgeItemSummary, "mainLineId" | "version">,
  input: { readonly name: string; readonly reason?: string }
): { readonly path: string; readonly body: { readonly expectedVersion: number; readonly name: string; readonly reason?: string } } {
  assertSnapshot(item.mainLineId, item.version);
  return {
    path: `${knowledgeDetailPath(item.mainLineId)}/duplicate`,
    body: { expectedVersion: item.version, name: input.name, ...(input.reason ? { reason: input.reason } : {}) }
  };
}

export function knowledgeActivateCommand(
  item: Pick<KnowledgeItemDetail, "mainLineId" | "version" | "draftRevision">
): { readonly path: string; readonly body: { readonly expectedVersion: number } } {
  assertSnapshot(item.mainLineId, item.version);
  if (!item.draftRevision?.id) throw new Error("A Draft revision is required for activation.");
  return {
    path: `${knowledgeDetailPath(item.mainLineId)}/revisions/${encodeURIComponent(item.draftRevision.id)}/activate`,
    body: { expectedVersion: item.version }
  };
}

export function knowledgeDeactivateCommand(
  item: Pick<KnowledgeItemDetail, "mainLineId" | "version">,
  reason: string
): { readonly path: string; readonly body: { readonly expectedVersion: number; readonly reason: string } } {
  assertSnapshot(item.mainLineId, item.version);
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("Enter a reason for deactivation.");
  if (normalizedReason.length > 1_000) throw new Error("Reason must be 1000 characters or fewer.");
  return {
    path: `${knowledgeDetailPath(item.mainLineId)}/deactivate`,
    body: { expectedVersion: item.version, reason: normalizedReason }
  };
}

export function supportsKnowledgeAction(
  item: Pick<KnowledgeItemSummary, "allowedActions">,
  action: KnowledgeAllowedAction
): boolean {
  return item.allowedActions.includes(action);
}
