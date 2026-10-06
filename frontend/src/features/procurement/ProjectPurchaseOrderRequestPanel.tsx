import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import type { ProjectProcurementItem } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import { getProjectProcurementItem, projectProcurementKeys, removeProjectProcurementItem, updateProjectProcurementItem,
  sameProcurementParent, type ProcurementParentOption, type ProcurementParentSource } from "./projectProcurementApi";
import { procurementKeys } from "./procurementApi";
import { procurementError } from "./procurementPresentation";
import { ProjectProcurementItemEditor } from "./ProjectProcurementItemEditor";
import { PurchaseOrderItemRecovery, canReviewRecoveryAssignment } from "./PurchaseOrderItemRecovery";
import { PurchaseOrderEstimateTree, modeDraftFromLine, type PurchaseOrderModeDraft } from "./PurchaseOrderEstimateTree";
import {
  getPurchaseOrderPreparation, listProjectPurchaseOrderRequests, purchaseOrderKeys,
  previewPurchaseOrderMode, quoteProjectPurchaseOrderRequest, savePurchaseOrderModeDecision, submitProjectPurchaseOrderRequest,
  type ProjectPurchaseOrderRequest, type PurchaseOrderModePriceReference, type PurchaseOrderPreparationEstimateLine,
  type PurchaseOrderModeDraftPreview, type PurchaseOrderPreparationItem, type PurchaseOrderRequestLineInput,
  type PurchaseOrderRequestQuote, type PreviewPurchaseOrderModeInput, type SavePurchaseOrderModeDecisionInput
} from "./purchaseOrderApi";

const statusLabel = {
  pending_approval: "Awaiting Super Admin", changes_requested: "Changes requested by Super Admin",
  rejected: "Rejected", approved: "Approved"
} satisfies Record<ProjectPurchaseOrderRequest["status"], string>;

type QuoteInput = Parameters<typeof quoteProjectPurchaseOrderRequest>[1];
type ApprovedEstimateSource = PreviewPurchaseOrderModeInput["estimateSource"];

interface ModeDraftOrigin {
  projectId: string;
  estimateSource: ApprovedEstimateSource;
  sourceLineItemKey: string;
  expectedVersion: number;
  revisionId: string | null;
  revisionDigest: string | null;
  observedDigest: string | null;
  originalDraft: PurchaseOrderModeDraft;
}

interface ModeDraftSession { origin: ModeDraftOrigin; draft: PurchaseOrderModeDraft }
interface ModeDraftPreviewState {
  signature: string;
  status: "loading" | "ready" | "error";
  result?: PurchaseOrderModeDraftPreview;
  error?: string;
}
interface ModePreviewTask { signature: string; timer: ReturnType<typeof setTimeout>; controller: AbortController }

function approvedSourceKey(projectId: string, source: ApprovedEstimateSource) {
  return JSON.stringify([projectId, source.estimateId, source.estimateVersion, source.estimateReviewRoundId]);
}

function modeSessionKey(projectId: string, source: ApprovedEstimateSource, lineKey: string) {
  return JSON.stringify([projectId, source.estimateId, source.estimateVersion, source.estimateReviewRoundId, lineKey]);
}

function sameApprovedSource(left: ApprovedEstimateSource, right: ApprovedEstimateSource) {
  return left.estimateId === right.estimateId && left.estimateVersion === right.estimateVersion &&
    left.estimateReviewRoundId === right.estimateReviewRoundId;
}

function modeDraftConflict(session: ModeDraftSession, line: PurchaseOrderPreparationEstimateLine | undefined,
  source: ApprovedEstimateSource | undefined): string | null {
  if (!source || !sameApprovedSource(session.origin.estimateSource, source) || !line) {
    return "The approved estimate changed while this mode was being edited. Discard these changes and review the current line.";
  }
  if ((line.mode?.decision?.version ?? 0) !== session.origin.expectedVersion ||
    (line.mode?.revision?.id ?? null) !== session.origin.revisionId ||
    (line.mode?.revision?.contentDigest ?? null) !== session.origin.revisionDigest ||
    (line.mode?.integrity?.observedDigest ?? null) !== session.origin.observedDigest) {
    return "This mode decision or its saved configuration changed while you were editing. Discard your changes and review the latest calculation.";
  }
  return null;
}

function modePreviewInput(session: ModeDraftSession, line: PurchaseOrderPreparationEstimateLine): PreviewPurchaseOrderModeInput | null {
  const draft = session.draft;
  const mode = draft.modeKind === "pmc" ? "pmc" : draft.modeKind === "execution" ? draft.executionSource : "";
  if (!mode || !line.mode) return null;
  const observedDigest = line.mode.integrity?.observedDigest;
  if (observedDigest) {
    if (!draft.recoveryReviewed || session.origin.observedDigest !== observedDigest ||
      !line.mode.integrity?.candidateAvailability.some((option) => option.key === mode && option.available)) return null;
  } else if (!line.mode.options.some((option) => option.key === mode)) return null;
  const scale = line.mode.uom?.decimalScale;
  if (scale == null || scale < 0) return null;
  const quantityPattern = scale === 0 ? /^\d+$/u : new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`, "u");
  const quantity = draft.quantity.trim();
  if (!quantityPattern.test(quantity) || Number(quantity) <= 0) return null;
  const discountBps = parseGstBasisPoints(draft.discountPercent.trim() || "0");
  if (discountBps === null) return null;
  return { estimateSource: session.origin.estimateSource, sourceLineItemKey: line.key,
    expectedVersion: session.origin.expectedVersion, mode, quantity, discountBps,
    markupBasis: draft.markupBasis || "starting",
    ...(observedDigest ? { expectedObservedDigest: observedDigest } : {}) };
}

export async function allProjectRequests(projectId: string): Promise<ProjectPurchaseOrderRequest[]> {
  const requests: ProjectPurchaseOrderRequest[] = [];
  let offset = 0;
  do {
    const page = await listProjectPurchaseOrderRequests(projectId, offset);
    requests.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) break;
  } while (true);
  return requests;
}

function unorderedItems(items: PurchaseOrderPreparationItem[]) {
  return items.filter((item) => !item.blockers.some((blocker) => blocker.code === "ALREADY_ORDERED"));
}

export function parseGstBasisPoints(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/u.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return basisPoints <= 10_000 ? basisPoints : null;
}

function unique(messages: string[]) { return [...new Set(messages)]; }

interface ItemEditorSession {
  item: ProjectProcurementItem | null;
  source?: ProcurementParentSource;
  lineKey?: string;
  parentLabel?: string;
  estimate: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null };
}

interface RemovalTarget { id: string; version: number; itemName: string; brand: string; recovery: boolean }
type RemovalRequest = { kind: "line"; line: PurchaseOrderPreparationEstimateLine; item: PurchaseOrderPreparationItem } |
  { kind: "recovery"; item: ProjectProcurementItem };

function sameStoredSource(left: ProjectProcurementItem["estimateSource"], right: ProjectProcurementItem["estimateSource"]) {
  if (!left || !right) return left === right;
  return left.estimateId === right.estimateId && left.estimateVersion === right.estimateVersion &&
    left.estimateReviewRoundId === right.estimateReviewRoundId && left.sourceSectionId === right.sourceSectionId &&
    left.sourceLineItemKey === right.sourceLineItemKey;
}

function itemSource(line: PurchaseOrderPreparationEstimateLine, estimate: { estimateId: string; estimateVersion: number }): ProcurementParentSource {
  return { estimateId: estimate.estimateId, estimateVersion: estimate.estimateVersion, sourceLineItemKey: line.key };
}

function eligibleLine(line: PurchaseOrderPreparationEstimateLine) {
  return line.included && typeof line.amountPaise === "number" && line.amountPaise > 0;
}

function assignmentLabel(line: PurchaseOrderPreparationEstimateLine) {
  return [line.roomName, line.mainBasketName, line.subBasketName, line.mainLineName || "Estimate main line"].filter(Boolean).join(" / ");
}

export function ProjectPurchaseOrderRequestPanel({ projectId, projectName, canManage, canReadItems, canManageItems,
  projectSourceStale = false, currentEstimate }: {
  projectId: string; projectName: string; canManage: boolean; canReadItems: boolean; canManageItems: boolean;
  projectSourceStale?: boolean; currentEstimate?: { estimateId: string; estimateVersion: number };
}) {
  const queryClient = useQueryClient();
  const preparation = useQuery({ queryKey: purchaseOrderKeys.preparation(projectId),
    queryFn: ({ signal }) => getPurchaseOrderPreparation(projectId, signal) });
  const requests = useQuery({ queryKey: purchaseOrderKeys.requests(projectId), queryFn: () => allProjectRequests(projectId) });
  const [notice, setNotice] = useState("");
  const [gstDrafts, setGstDrafts] = useState<Record<string, string>>({});
  const [commercialReasons, setCommercialReasons] = useState<Record<string, string>>({});
  const [vendorTerms, setVendorTerms] = useState<Record<string, string>>({});
  const [modeSessions, setModeSessions] = useState<Record<string, ModeDraftSession>>({});
  const [draftPreviews, setDraftPreviews] = useState<Record<string, ModeDraftPreviewState>>({});
  const [modeGuardError, setModeGuardError] = useState<{ lineKey: string; message: string } | null>(null);
  const [quoted, setQuoted] = useState<{ signature: string; quote: PurchaseOrderRequestQuote } | null>(null);
  const [editor, setEditor] = useState<ItemEditorSession | null>(null);
  const [removing, setRemoving] = useState<RemovalTarget | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [itemActionError, setItemActionError] = useState("");
  const itemReturnFocusRef = useRef<HTMLElement>(null);
  const itemFallbackFocusRef = useRef<HTMLHeadingElement>(null);
  const sendKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const modeKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const previewTasksRef = useRef(new Map<string, ModePreviewTask>());
  const source = preparation.data;
  const projectSourceMismatch = projectSourceStale || Boolean(currentEstimate && source &&
    (currentEstimate.estimateId !== source.estimateSource.estimateId || currentEstimate.estimateVersion !== source.estimateSource.estimateVersion));
  const canUseRecoveryFailure = preparation.isError && preparation.error instanceof ApiError &&
    preparation.error.code === "PROCUREMENT_ITEM_SOURCE_CONFLICT" && Boolean(currentEstimate) && !projectSourceStale;
  const latest = requests.data?.[0] ?? null;
  const pending = requests.data?.find((request) => request.status === "pending_approval") ?? null;
  const correction = requests.data?.find((request) => request.status === "changes_requested") ?? null;
  const allItems = source?.sections.flatMap((section) => section.items) ?? [];
  const items = unorderedItems(allItems);
  const estimateLines = source?.estimateLines ?? [];
  const currentSourceKey = source ? approvedSourceKey(projectId, source.estimateSource) : null;
  const modeDrafts: Record<string, PurchaseOrderModeDraft> = {};
  const modeConflictByLine: Record<string, string> = {};
  const activeModeSessions: Array<{ key: string; line: PurchaseOrderPreparationEstimateLine; session: ModeDraftSession }> = [];
  for (const line of estimateLines) {
    if (!source) break;
    const key = modeSessionKey(projectId, source.estimateSource, line.key);
    const session = modeSessions[key];
    if (!session) continue;
    modeDrafts[line.key] = session.draft;
    activeModeSessions.push({ key, line, session });
    const conflict = modeDraftConflict(session, line, source.estimateSource);
    if (conflict) modeConflictByLine[line.key] = conflict;
  }
  const outdatedModeSessions = Object.entries(modeSessions).filter(([key, session]) => session.origin.projectId === projectId &&
    (approvedSourceKey(projectId, session.origin.estimateSource) !== currentSourceKey ||
      !activeModeSessions.some((active) => active.key === key)));
  const previewTargets = activeModeSessions.flatMap(({ key, line, session }) => {
    if (modeConflictByLine[line.key] || projectSourceMismatch || !canManage || preparation.isFetching || pending) return [];
    const input = modePreviewInput(session, line);
    if (!input) return [];
    return [{ key, lineKey: line.key, input,
      signature: JSON.stringify([projectId, input, session.origin.revisionId, session.origin.revisionDigest]) }];
  });
  const previewTargetsSignature = JSON.stringify(previewTargets.map(({ key, signature }) => [key, signature]));
  const draftPreviewByLine: Record<string, Omit<ModeDraftPreviewState, "signature">> = {};
  for (const target of previewTargets) {
    const preview = draftPreviews[target.key];
    if (preview?.signature === target.signature) draftPreviewByLine[target.lineKey] = preview;
  }
  const assignmentOptions: ProcurementParentOption[] = source ? estimateLines.filter(eligibleLine).map((line) => ({
    ...itemSource(line, source.estimateSource), label: assignmentLabel(line)
  })) : [];
  const itemWorkflowBusy = preparation.isFetching || preparation.isError || projectSourceMismatch || Boolean(editor) || Boolean(removing);
  const netPaise = items.length && items.every((item) => item.plannedLineNetPaise !== null)
    ? items.reduce((sum, item) => sum + item.plannedLineNetPaise!, 0) : null;
  const vendors = [...new Map(items.filter((item) => item.vendor).map((item) => [item.vendor!.id, item.vendor!])).values()];
  const modeDraftDirty = activeModeSessions.length > 0 || outdatedModeSessions.length > 0;
  const linkedItemIds = new Set(estimateLines.flatMap((line) => line.itemIds));
  const lineByItemId = new Map(estimateLines.flatMap((line) => line.itemIds.map((id) => [id, line] as const)));
  const reasonRequiredIds = new Set(items.filter((item) => {
    const line = lineByItemId.get(item.id);
    if (!line) return false;
    const reference = line.mode?.priceReferences?.[item.id];
    const gst = parseGstBasisPoints(gstDrafts[item.id] ?? "");
    return !reference || reference.state !== "ready" || reference.unitPricePaise !== item.pricePaise ||
      reference.gstBasisPoints === null || (gst !== null && reference.gstBasisPoints !== gst);
  }).map((item) => item.id));
  const modeBlockers = estimateLines.filter((line) => line.included && typeof line.amountPaise === "number" && line.amountPaise > 0 && line.itemIds.some((id) => items.some((item) => item.id === id)) &&
    (!line.mode || !["ready", "exception"].includes(line.mode.state)))
    .map((line) => `${line.mainLineName || line.key}: Confirm a configured mode or a documented historical exception.`);
  const blockers = unique([
    ...(!source?.estimateLines ? ["Approved estimate line hierarchy is unavailable. Refresh preparation."] : []),
    ...(!items.length ? ["No eligible purchase items are prepared for this request."] : []),
    ...items.flatMap((item) => item.blockers.filter((blocker) => blocker.code !== "ALREADY_ORDERED")
      .map((blocker) => `${item.itemName}: ${blocker.message}`)),
    ...items.filter((item) => !linkedItemIds.has(item.id)).map((item) => `${item.itemName}: Approved estimate main line mapping is missing.`),
    ...items.filter((item) => !item.vendor?.vendorType).map((item) => `${item.itemName}: Vendor type is needed.`),
    ...items.filter((item) => parseGstBasisPoints(gstDrafts[item.id] ?? "") === null)
      .map((item) => `${item.itemName}: Confirm GST between 0 and 100 percent, with up to two decimal places.`),
    ...items.filter((item) => (reasonRequiredIds.has(item.id) || Boolean(commercialReasons[item.id]?.trim())) &&
      (commercialReasons[item.id]?.trim().length ?? 0) < 10)
      .map((item) => `${item.itemName}: Explain the agreed rate or tax exception in at least 10 characters.`),
    ...modeBlockers,
    ...(modeDraftDirty ? ["Save or discard the changed mode selections before requesting a quote."] : []),
    ...vendors.filter((vendor) => !vendorTerms[vendor.id]?.trim()).map((vendor) => `${vendor.name}: Confirm vendor terms.`),
    ...(!source?.orderDefaults?.targetDate ? ["Set the project's planned end date before sending."] : []),
    ...(!source?.orderDefaults?.deliveryLocation ? ["Set the project location before sending."] : []),
    ...(source?.blockers.filter((blocker) => blocker.code !== "ALREADY_ORDERED")
      .map((blocker) => blocker.message) ?? [])
  ]);
  const readyToQuote = canManage && !projectSourceMismatch && !editor && !removing && Boolean(source) && !preparation.isPending && !preparation.isError && !preparation.isFetching &&
    !requests.isPending && !requests.isError && !requests.isFetching && !pending && blockers.length === 0 && netPaise !== null;
  const quoteInput: QuoteInput | null = readyToQuote && source ? {
    expectedPreparationDigest: source.digest,
    lines: items.map((item): PurchaseOrderRequestLineInput => ({
      procurementItemId: item.id, expectedVersion: item.version,
      gstBasisPoints: parseGstBasisPoints(gstDrafts[item.id]!)!,
      ...(commercialReasons[item.id]?.trim() ? { commercialExceptionReason: commercialReasons[item.id].trim() } : {}),
      scopeType: item.vendor!.vendorType === "execution" ? "execution" : "supply",
      description: item.itemName, targetDate: source.orderDefaults!.targetDate!,
      deliveryLocation: source.orderDefaults!.deliveryLocation!
    })),
    vendorTerms: vendors.map((vendor) => ({ vendorId: vendor.id, terms: vendorTerms[vendor.id]!.trim() }))
  } : null;
  const quoteSignature = quoteInput ? JSON.stringify(quoteInput) : null;
  const currentQuote = quoteSignature && quoted?.signature === quoteSignature && quoted.quote.preparationDigest === source?.digest ? quoted.quote : null;

  useEffect(() => {
    const desired = new Map(previewTargets.map((target) => [target.key, target]));
    for (const [key, task] of previewTasksRef.current) {
      if (desired.get(key)?.signature === task.signature) continue;
      clearTimeout(task.timer);
      task.controller.abort();
      previewTasksRef.current.delete(key);
    }
    setDraftPreviews((current) => {
      const retained = Object.fromEntries(Object.entries(current).filter(([key]) => desired.has(key)));
      return Object.keys(retained).length === Object.keys(current).length ? current : retained;
    });
    for (const target of previewTargets) {
      if (previewTasksRef.current.get(target.key)?.signature === target.signature) continue;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        void previewPurchaseOrderMode(projectId, target.input, controller.signal).then((result) => {
          if (controller.signal.aborted || previewTasksRef.current.get(target.key)?.signature !== target.signature) return;
          const matches = result.projectId === projectId && result.sourceLineItemKey === target.lineKey &&
            result.decisionVersion === target.input.expectedVersion &&
            sameApprovedSource(result.estimateSource, target.input.estimateSource) &&
            (result.revision?.contentDigest ?? null) === (activeModeSessions.find(({ key }) => key === target.key)?.session.origin.revisionDigest ?? null) &&
            (!target.input.expectedObservedDigest || result.integrity?.observedDigest === target.input.expectedObservedDigest);
          setDraftPreviews((current) => ({ ...current, [target.key]: matches
            ? { signature: target.signature, status: "ready", result }
            : { signature: target.signature, status: "error", error: "The calculation no longer matches this approved line. Refresh preparation before saving." } }));
        }).catch((error: unknown) => {
          if (controller.signal.aborted || previewTasksRef.current.get(target.key)?.signature !== target.signature) return;
          const message = error instanceof ApiError && error.status === 409
            ? "The approved line changed. Refresh preparation and review this mode again."
            : procurementError(error, "The calculation could not be loaded. Your mode entries are retained; retry by changing a field.");
          setDraftPreviews((current) => ({ ...current, [target.key]: { signature: target.signature, status: "error", error: message } }));
        });
      }, 300);
      previewTasksRef.current.set(target.key, { signature: target.signature, timer, controller });
      setDraftPreviews((current) => ({ ...current, [target.key]: { signature: target.signature, status: "loading" } }));
    }
  }, [previewTargetsSignature, projectId]);

  useEffect(() => () => {
    for (const task of previewTasksRef.current.values()) {
      clearTimeout(task.timer);
      task.controller.abort();
    }
    previewTasksRef.current.clear();
  }, []);

  function clearModePreview(key: string) {
    const task = previewTasksRef.current.get(key);
    if (task) {
      clearTimeout(task.timer);
      task.controller.abort();
      previewTasksRef.current.delete(key);
    }
    setDraftPreviews((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function discardModeDraft(key: string) {
    setModeSessions((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    clearModePreview(key);
    setModeGuardError(null);
    modeSave.reset();
    setQuoted(null);
  }

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.requests(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.pendingRequests }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.project(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.commitments(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectStatusKeys.project(projectId) }),
      queryClient.invalidateQueries({ queryKey: procurementKeys.projects }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    ]);
  };

  const editItem = useMutation({
    mutationFn: async (target: { kind: "line"; line: PurchaseOrderPreparationEstimateLine; item: PurchaseOrderPreparationItem } |
      { kind: "recovery"; item: ProjectProcurementItem }) => {
      if (!source || projectSourceMismatch || preparation.isFetching) throw new Error("The approved estimate is refreshing. Review the latest project before editing items.");
      const expectedSource = target.kind === "line" ? itemSource(target.line, source.estimateSource) : undefined;
      const item = await getProjectProcurementItem(projectId, target.item.id, expectedSource);
      if (item.version !== target.item.version) throw new Error("This item changed. Refresh the purchase lines before editing the latest version.");
      if (target.kind === "recovery" && !canReviewRecoveryAssignment(item, source)) {
        throw new Error("This item's source no longer permits direct reassignment. Refresh the assignment review.");
      }
      return { target, item, estimate: source.estimateSource, expectedSource };
    },
    onSuccess: ({ target, item, estimate, expectedSource }) => {
      setItemActionError("");
      setEditor({ item, estimate, source: expectedSource,
        ...(target.kind === "line" ? { lineKey: target.line.key, parentLabel: assignmentLabel(target.line) } : {}) });
    },
    onError: async (error) => {
      setItemActionError(error instanceof ApiError
        ? procurementError(error, "The item could not be opened. Refresh and try again.")
        : error instanceof Error ? error.message : "The item could not be opened. Refresh and try again.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists(projectId) }),
        queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) })
      ]);
    }
  });

  const prepareRemoveItem = useMutation({
    mutationFn: async (target: RemovalRequest): Promise<RemovalTarget> => {
      if ((projectSourceMismatch && !(target.kind === "recovery" && canUseRecoveryFailure)) || preparation.isFetching ||
        (preparation.isError && !(target.kind === "recovery" && canUseRecoveryFailure))) {
        throw new Error("Review the current approved estimate before removing an item.");
      }
      const expectedSource = target.kind === "line" && source ? itemSource(target.line, source.estimateSource) : undefined;
      const fresh = await getProjectProcurementItem(projectId, target.item.id, expectedSource);
      if (fresh.version !== target.item.version) {
        throw new Error("This item changed since it was displayed. Refresh the purchase items before removal.");
      }
      if (target.kind === "recovery" && !sameStoredSource(fresh.estimateSource, target.item.estimateSource)) {
        throw new Error("This item's approved source changed. Refresh the assignment review before removal.");
      }
      if (target.kind === "line" && (!expectedSource || !sameProcurementParent(fresh.estimateSource, expectedSource))) {
        throw new Error("This item's approved line changed. Refresh the purchase lines before removal.");
      }
      return { id: fresh.id, version: target.item.version, itemName: fresh.itemName, brand: fresh.brand,
        recovery: target.kind === "recovery" };
    },
    onSuccess: (target) => {
      setItemActionError("");
      setRemoving(target);
      setRemoveReason("");
    },
    onError: async (error) => {
      setItemActionError(error instanceof ApiError
        ? procurementError(error, "The item could not be loaded for removal. Refresh and try again.")
        : error instanceof Error ? error.message : "The item could not be loaded for removal. Refresh and try again.");
      await queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists(projectId) });
    }
  });

  const removeItem = useMutation({
    mutationFn: ({ target, reason }: { target: RemovalTarget; reason: string }) => {
      if ((projectSourceMismatch && !(target.recovery && canUseRecoveryFailure)) || preparation.isFetching ||
        (preparation.isError && !(target.recovery && canUseRecoveryFailure))) {
        throw new Error("Review the current approved estimate before removing an item.");
      }
      return removeProjectProcurementItem(projectId, target.id, target.version, reason);
    },
    onMutate: () => { setQuoted(null); },
    onSuccess: async (_, { target }) => {
      setRemoving(null);
      setRemoveReason("");
      setItemActionError("");
      setNotice(`${target.itemName} removed from active procurement items.`);
      await refresh();
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) await refresh();
    }
  });

  const modeSave = useMutation({
    mutationFn: (input: Omit<SavePurchaseOrderModeDecisionInput, "idempotencyKey">) => {
      if (projectSourceMismatch || preparation.isFetching) throw new Error("Refresh the approved estimate before saving a mode decision.");
      if (!source || !input.expectedEstimateSource || !sameApprovedSource(source.estimateSource, input.expectedEstimateSource)) {
        throw new Error("The approved estimate changed while you were editing. Discard this mode draft and review the latest line.");
      }
      const line = estimateLines.find((candidate) => candidate.key === input.sourceLineItemKey);
      const sessionKey = modeSessionKey(projectId, input.expectedEstimateSource, input.sourceLineItemKey);
      if (!line || !modeSessions[sessionKey] || modeDraftConflict(modeSessions[sessionKey], line, source.estimateSource)) {
        throw new Error("The saved mode or configuration changed while you were editing. Discard this draft and review the latest line.");
      }
      const signature = JSON.stringify(input);
      const key = modeKeyRef.current?.signature === signature ? modeKeyRef.current.key : crypto.randomUUID();
      modeKeyRef.current = { signature, key };
      return savePurchaseOrderModeDecision(projectId, { ...input, idempotencyKey: key });
    },
    onSuccess: async (_, input) => {
      modeKeyRef.current = null;
      if (input.expectedEstimateSource) discardModeDraft(modeSessionKey(projectId, input.expectedEstimateSource, input.sourceLineItemKey));
      setQuoted(null);
      setNotice("Mode decision saved. Review the updated calculation before quoting.");
      await refresh();
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) });
      }
    }
  });

  const applyRate = useMutation({
    mutationFn: async ({ line, item, reference }: { line: PurchaseOrderPreparationEstimateLine; item: PurchaseOrderPreparationItem; reference: PurchaseOrderModePriceReference }) => {
      if (projectSourceMismatch || preparation.isFetching) throw new Error("Refresh the approved estimate before applying a saved rate.");
      if (!source || reference.state !== "ready" || reference.unitPricePaise === null) throw new Error("The configured rate is unavailable. Refresh preparation.");
      const fresh = await getProjectProcurementItem(projectId, item.id, {
        estimateId: source.estimateSource.estimateId, estimateVersion: source.estimateSource.estimateVersion, sourceLineItemKey: line.key
      });
      if (fresh.version !== item.version || fresh.vendor?.id !== item.vendor?.id || fresh.uom.id !== item.uom.id) {
        throw new Error("The purchase item changed. Refresh preparation before applying the saved rate.");
      }
      return updateProjectProcurementItem(projectId, item.id, {
        expectedVersion: fresh.version, itemName: fresh.itemName, brand: fresh.brand, uomId: fresh.uom.id,
        vendorId: fresh.vendor?.id ?? null, pricePaise: reference.unitPricePaise,
        plannedOrderQuantityMilliUnits: fresh.plannedOrderQuantityMilliUnits ?? null,
        ...(fresh.allocatedWorkPaise == null ? {} : { allocatedWorkPaise: fresh.allocatedWorkPaise })
      });
    },
    onSuccess: async () => { setQuoted(null); setNotice("Matched saved rate applied to the purchase item. Review its allocation and request a new quote."); await refresh(); }
  });

  const quote = useMutation({
    mutationFn: async ({ signature, input }: { signature: string; input: QuoteInput }) => {
      const result = await quoteProjectPurchaseOrderRequest(projectId, input);
      const expectedIds = input.lines.map((line) => line.procurementItemId).sort().join("|");
      const returnedIds = result.lines.map((line) => line.procurementItemId).sort().join("|");
      const taxMatches = result.lines.every((line) => input.lines.find((expected) => expected.procurementItemId === line.procurementItemId)?.gstBasisPoints === line.gstBasisPoints);
      if (result.projectId !== projectId || result.preparationDigest !== input.expectedPreparationDigest || expectedIds !== returnedIds || !taxMatches) {
        throw new Error("The quote does not match the current purchase items. Refresh preparation and try again.");
      }
      return { signature, result };
    },
    onSuccess: ({ signature, result }) => { setQuoted({ signature, quote: result }); setNotice("Backend quote ready. Review payable totals before sending."); }
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!source || !quoteInput || !quoteSignature || !currentQuote || pending) throw new Error("Review a current backend quote before sending.");
      const payload = { ...quoteInput, ...(correction ? { expectedRequestVersion: correction.version } : {}) };
      const signature = JSON.stringify(payload);
      const key = sendKeyRef.current?.signature === signature ? sendKeyRef.current.key : crypto.randomUUID();
      sendKeyRef.current = { signature, key };
      return submitProjectPurchaseOrderRequest(projectId, { ...payload, idempotencyKey: key });
    },
    onSuccess: async () => {
      sendKeyRef.current = null;
      setQuoted(null);
      setNotice("Purchase order sent to Super Admin for approval.");
      await refresh();
    }
  });

  const itemsBusy = itemWorkflowBusy || editItem.isPending || prepareRemoveItem.isPending || removeItem.isPending ||
    modeSave.isPending || applyRate.isPending || quote.isPending || send.isPending;
  const recoveryBusy = (projectSourceMismatch && !canUseRecoveryFailure) || preparation.isFetching || Boolean(editor) || Boolean(removing) ||
    editItem.isPending || prepareRemoveItem.isPending || removeItem.isPending || modeSave.isPending ||
    applyRate.isPending || quote.isPending || send.isPending || (preparation.isError && !canUseRecoveryFailure);
  const removalBlocked = (projectSourceMismatch && !(removing?.recovery && canUseRecoveryFailure)) || preparation.isFetching ||
    (preparation.isError && !(removing?.recovery && canUseRecoveryFailure));
  const editorSourceStale = Boolean(editor && (!source || projectSourceMismatch || preparation.isFetching || preparation.isError ||
    editor.estimate.estimateId !== source.estimateSource.estimateId ||
    editor.estimate.estimateVersion !== source.estimateSource.estimateVersion ||
    editor.estimate.estimateReviewRoundId !== source.estimateSource.estimateReviewRoundId ||
    (editor.lineKey && !estimateLines.some((line) => line.key === editor.lineKey && eligibleLine(line))) ||
    (editor.item && !editor.lineKey && !canReviewRecoveryAssignment(editor.item, source))));

  function changeModeDraft(lineKey: string, draft: PurchaseOrderModeDraft) {
    if (!source) return;
    const line = estimateLines.find((candidate) => candidate.key === lineKey);
    if (!line) return;
    const key = modeSessionKey(projectId, source.estimateSource, lineKey);
    const previousDraft = modeSessions[key]?.draft ?? modeDraftFromLine(line);
    const calculationChanged = previousDraft.modeKind !== draft.modeKind ||
      previousDraft.executionSource !== draft.executionSource || previousDraft.quantity !== draft.quantity ||
      previousDraft.discountPercent !== draft.discountPercent || previousDraft.markupBasis !== draft.markupBasis ||
      previousDraft.recoveryReviewed !== draft.recoveryReviewed;
    setModeSessions((current) => {
      const previous = current[key];
      const originalDraft = previous?.origin.originalDraft ?? modeDraftFromLine(line);
      const next = { ...current };
      if (JSON.stringify(draft) === JSON.stringify(originalDraft)) {
        delete next[key];
      } else {
        next[key] = { draft, origin: previous?.origin ?? {
          projectId, estimateSource: { ...source.estimateSource }, sourceLineItemKey: lineKey,
          expectedVersion: line.mode?.decision?.version ?? 0,
          revisionId: line.mode?.revision?.id ?? null,
          revisionDigest: line.mode?.revision?.contentDigest ?? null,
          observedDigest: line.mode?.integrity?.observedDigest ?? null,
          originalDraft
        } };
      }
      return next;
    });
    if (calculationChanged) clearModePreview(key);
    setModeGuardError(null);
    modeSave.reset();
    setQuoted(null);
  }

  function saveModeDraft(input: Omit<SavePurchaseOrderModeDecisionInput, "idempotencyKey" | "expectedEstimateSource" | "expectedRevisionDigest">) {
    if (!source) return;
    const key = modeSessionKey(projectId, source.estimateSource, input.sourceLineItemKey);
    const session = modeSessions[key];
    const line = estimateLines.find((candidate) => candidate.key === input.sourceLineItemKey);
    const conflict = session ? modeDraftConflict(session, line, source.estimateSource) :
      "The mode draft is no longer current. Discard it and review this line again.";
    if (conflict || outdatedModeSessions.length || projectSourceMismatch || preparation.isFetching) {
      setModeGuardError({ lineKey: input.sourceLineItemKey,
        message: conflict ?? "An earlier estimate mode draft is still open. Discard it before saving a new decision." });
      return;
    }
    modeSave.mutate({ ...input, expectedVersion: session!.origin.expectedVersion,
      expectedEstimateSource: session!.origin.estimateSource,
      expectedRevisionDigest: session!.origin.revisionDigest });
  }

  function openAddItem(line: PurchaseOrderPreparationEstimateLine, trigger: HTMLButtonElement) {
    if (!source || itemsBusy || !eligibleLine(line)) return;
    itemReturnFocusRef.current = trigger;
    setItemActionError("");
    setQuoted(null);
    setEditor({ item: null, source: itemSource(line, source.estimateSource), lineKey: line.key,
      parentLabel: assignmentLabel(line), estimate: source.estimateSource });
  }

  function openEditItem(target: { kind: "line"; line: PurchaseOrderPreparationEstimateLine; item: PurchaseOrderPreparationItem } |
    { kind: "recovery"; item: ProjectProcurementItem }, trigger: HTMLButtonElement) {
    if (!source || itemsBusy) return;
    itemReturnFocusRef.current = trigger;
    setItemActionError("");
    setQuoted(null);
    editItem.mutate(target);
  }

  function openRemoveItem(target: RemovalRequest, trigger: HTMLButtonElement) {
    if (target.kind === "recovery" ? recoveryBusy : itemsBusy) return;
    itemReturnFocusRef.current = trigger;
    setItemActionError("");
    setQuoted(null);
    removeItem.reset();
    prepareRemoveItem.mutate(target);
  }

  return <div className="purchase-orders__project-request">
    <div className="purchase-orders__request-heading"><div><p className="eyebrow">Project order preparation</p>
      <h3 ref={itemFallbackFocusRef} tabIndex={-1}>Planned purchase order</h3><p>Review every approved estimate line for {projectName}, confirm its mode and supplier tax, then obtain a backend quote.</p></div></div>
    {outdatedModeSessions.length ? <InlineMessage tone="warning" action={<Button variant="secondary" size="compact" onClick={() => {
      for (const [key] of outdatedModeSessions) discardModeDraft(key);
    }}>Discard outdated mode changes</Button>}>The approved estimate or main line changed while a mode draft was open. Review the current lines before continuing.</InlineMessage> : null}
    {projectSourceMismatch && !canUseRecoveryFailure ? <InlineMessage tone="warning">The approved project or estimate changed. Purchase details are hidden and changes are paused until the current project is available. Any open item draft remains available for review.</InlineMessage> : <>
    {notice ? <p className="purchase-orders__notice" role="status">{notice}</p> : null}
    {editItem.isError || prepareRemoveItem.isError || itemActionError ? <InlineMessage tone="error" action={<Button variant="secondary" size="compact" onClick={() => {
      setItemActionError("");
      editItem.reset();
      prepareRemoveItem.reset();
      void refresh();
    }}>Refresh items</Button>}>{itemActionError || "The item could not be opened. Refresh and try again."}</InlineMessage> : null}
    {preparation.isPending ? <PageState state="loading" message="Loading approved estimate lines and procurement calculations…" />
      : preparation.isError ? <>
        <PageState state="error" message={procurementError(preparation.error, "Purchase order preparation could not be loaded.")} action={{ label: "Try again", onAction: () => void preparation.refetch() }} />
        {canUseRecoveryFailure ? <PurchaseOrderItemRecovery projectId={projectId} currentEstimate={currentEstimate}
          canReadItems={canReadItems} canManageItems={canManageItems} disabled={recoveryBusy}
          onEdit={(item, trigger) => openEditItem({ kind: "recovery", item }, trigger)}
          onRemove={(item, trigger) => openRemoveItem({ kind: "recovery", item }, trigger)} /> : null}
      </>
      : source ? <>
        {preparation.isFetching ? <p className="purchase-orders__hint" role="status">Refreshing preparation. Quote and send are paused.</p> : null}
        <dl className="purchase-orders__totals" aria-label="Project purchase order amounts">
          <div><dt>Approved estimate, before GST</dt><dd>{formatPaise(source.approvedEstimatePaise)}</dd></div>
          <div><dt>Already committed, before GST</dt><dd>{formatPaise(source.committedPaise)}</dd></div>
          <div><dt>Remaining budget, before GST</dt><dd>{formatPaise(source.remainingPaise)}</dd></div>
          <div><dt>Prepared vendor net, before GST</dt><dd>{netPaise === null ? "Incomplete" : formatPaise(netPaise)}</dd></div>
          <div><dt>Quoted GST</dt><dd>{currentQuote ? formatPaise(currentQuote.totals.gstPaise) : "Review quote"}</dd></div>
          <div><dt>Quoted vendor payable</dt><dd>{currentQuote ? formatPaise(currentQuote.totals.totalPaise) : "Review quote"}</dd></div>
        </dl>
        <p className="purchase-orders__hint">{estimateLines.length} approved estimate line{estimateLines.length === 1 ? "" : "s"} · {items.length} eligible purchase item{items.length === 1 ? "" : "s"}. Configured selling values are internal benchmarks; the supplier payable amount comes from the backend quote.</p>
        <PurchaseOrderEstimateTree lines={estimateLines} items={allItems} canManage={canManage} frozen={Boolean(pending) || projectSourceMismatch || preparation.isFetching || modeSave.isPending || applyRate.isPending || send.isPending || editItem.isPending || removeItem.isPending || Boolean(editor)}
          canManageItems={canReadItems && canManageItems} itemsBusy={itemsBusy}
          onAddItem={openAddItem}
          onEditItem={(line, item, trigger) => openEditItem({ kind: "line", line, item }, trigger)}
          onRemoveItem={(line, item, trigger) => openRemoveItem({ kind: "line", line, item }, trigger)}
          gstDrafts={gstDrafts} onGstChange={(id, value) => { setGstDrafts((current) => ({ ...current, [id]: value })); setQuoted(null); }}
          commercialReasons={commercialReasons} reasonRequiredIds={reasonRequiredIds}
          onCommercialReasonChange={(id, value) => { setCommercialReasons((current) => ({ ...current, [id]: value })); setQuoted(null); }}
          modeDrafts={modeDrafts} onModeDraftChange={changeModeDraft}
          onDiscardMode={(key) => { if (source) discardModeDraft(modeSessionKey(projectId, source.estimateSource, key)); }}
          onSaveMode={saveModeDraft} modeBusyKey={modeSave.isPending ? modeSave.variables?.sourceLineItemKey ?? null : null}
          modeErrorKey={modeGuardError?.lineKey ?? (modeSave.isError ? modeSave.variables?.sourceLineItemKey ?? null : null)}
          modeError={modeGuardError?.message ?? (modeSave.isError ? procurementError(modeSave.error, "Could not save the mode decision. Your entries are retained.") : null)}
          draftPreviewByLine={draftPreviewByLine} modeConflictByLine={modeConflictByLine}
          rateBusyItemId={applyRate.isPending ? applyRate.variables?.item.id ?? null : null}
          rateErrorItemId={applyRate.isError ? applyRate.variables?.item.id ?? null : null}
          onUseRate={(line, item, reference) => applyRate.mutate({ line, item, reference })} />
        <PurchaseOrderItemRecovery projectId={projectId} preparation={source} currentEstimate={currentEstimate} canReadItems={canReadItems}
          canManageItems={canManageItems} disabled={recoveryBusy}
          onEdit={(item, trigger) => openEditItem({ kind: "recovery", item }, trigger)}
          onRemove={(item, trigger) => openRemoveItem({ kind: "recovery", item }, trigger)} />
        {vendors.length ? <section className="purchase-orders__vendor-terms" aria-labelledby="purchase-order-vendor-terms-title"><h4 id="purchase-order-vendor-terms-title">Vendor terms</h4>
          <p>Confirm terms for each vendor. These terms are sent with that vendor's order after approval.</p>
          <div>{vendors.map((vendor) => <label key={vendor.id}>{vendor.name}
            <textarea value={vendorTerms[vendor.id] ?? ""} maxLength={2000} rows={2} disabled={!canManage || Boolean(pending) || send.isPending || projectSourceMismatch || Boolean(editor)}
              onChange={(event) => { setVendorTerms((current) => ({ ...current, [vendor.id]: event.target.value })); setQuoted(null); }} />
          </label>)}</div>
        </section> : null}
        {blockers.length ? <div className="purchase-orders__request-blockers"><InlineMessage tone="warning">Resolve these issues before requesting a quote:</InlineMessage>
          <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}
        {quote.isError ? <div><InlineMessage tone="error">{quote.error instanceof ApiError && quote.error.status === 409
          ? "Preparation changed while quoting. Your GST and vendor terms are retained. Refresh preparation, then review again."
          : procurementError(quote.error, "The quote could not be calculated. Check each line and retry.")}</InlineMessage>
          <Button variant="secondary" size="compact" onClick={() => void preparation.refetch()}>Refresh preparation</Button></div> : null}
        {canManage && !pending ? <div className="purchase-orders__actions"><Button variant="secondary" busy={quote.isPending} disabled={!readyToQuote || quote.isPending || modeSave.isPending || applyRate.isPending || editItem.isPending || removeItem.isPending}
          onClick={() => { if (quoteInput && quoteSignature) quote.mutate({ input: quoteInput, signature: quoteSignature }); }}>Review backend quote</Button></div> : null}
        {currentQuote ? <section className="purchase-orders__quote-review" aria-labelledby="purchase-order-quote-title">
          <div><p className="eyebrow">Server calculated</p><h4 id="purchase-order-quote-title">Vendor payable quote</h4><p>Actual agreed item rates and explicit GST only. Configured selling margin is not added to the purchase order.</p></div>
          <dl className="purchase-orders__request-amounts"><div><dt>Net before GST</dt><dd>{formatPaise(currentQuote.totals.netPaise)}</dd></div>
            <div><dt>GST</dt><dd>{formatPaise(currentQuote.totals.gstPaise)}</dd></div><div><dt>Payable total</dt><dd>{formatPaise(currentQuote.totals.totalPaise)}</dd></div></dl>
          {currentQuote.modeSnapshots?.length ? <details><summary>Compare configured cost and actual order</summary>
            <div className="purchase-orders__mode-comparison">{currentQuote.modeSnapshots.map((snapshot) => <div key={snapshot.sourceLineItemKey}>
              <strong>{snapshot.mainLineName || snapshot.sourceLineItemKey}</strong>
              {snapshot.mode.decision?.integrityBasis ? <p className="purchase-orders__unverified-source">Unverified saved values · Buyer reason: {snapshot.mode.decision.integrityBasis.reason}</p> : null}
              <dl><div><dt>Approved customer estimate</dt><dd>{formatPaise(snapshot.approvedAmountPaise)}</dd></div>
                <div><dt>{snapshot.mode.decision?.integrityBasis ? "Current unverified adjusted cost" : "Configured adjusted cost"}</dt><dd>{snapshot.mode.preview ? formatPaise(snapshot.mode.preview.adjustedCostPaise) : "Unavailable"}</dd></div>
                <div><dt>Actual vendor net</dt><dd>{formatPaise(snapshot.actualTotals.netPaise)}</dd></div>
                <div><dt>Actual net minus configured cost</dt><dd>{snapshot.actualNetMinusConfiguredCostPaise == null ? "Unavailable" : formatPaise(snapshot.actualNetMinusConfiguredCostPaise)}</dd></div>
              </dl>
            </div>)}</div>
          </details> : null}
          <details><summary>Review quoted items and vendors</summary>
            <div className="purchase-orders__quote-lines">{currentQuote.lines.map((line) => <p key={line.procurementItemId}>
              <span>{line.itemName} · {line.vendorName}</span><strong>{formatPaise(line.netPaise)} + {formatPaise(line.gstPaise)} GST = {formatPaise(line.totalPaise)}</strong>
            </p>)}
              {currentQuote.vendorTotals.map((vendor) => <p key={vendor.vendorId}><span>{vendor.name} total</span><strong>{formatPaise(vendor.totals.totalPaise)}</strong></p>)}
            </div>
          </details>
        </section> : null}
      </> : null}
    {!canUseRecoveryFailure ? <>
    {requests.isPending ? <p className="purchase-orders__hint">Loading request history…</p>
      : requests.isError ? <div><InlineMessage tone="error">{procurementError(requests.error, "Request history could not be loaded. Refresh before sending.")}</InlineMessage><Button variant="secondary" onClick={() => void requests.refetch()}>Retry request history</Button></div>
      : latest ? <div className="purchase-orders__request-history">
        <div><span className={`purchase-orders__status purchase-orders__status--${latest.status}`}>{statusLabel[latest.status]}</span>
          <strong>{latest.requestNumber ?? "Project request"} · Revision {latest.revision}</strong>
          <small>{latest.status === "pending_approval" ? "Pending with Super Admin" : latest.status === "changes_requested" ? "Pending with Procurement" : latest.status === "approved" ? "Vendor orders released" : "Decision recorded"}</small></div>
        <dl className="purchase-orders__request-amounts"><div><dt>Before GST</dt><dd>{formatPaise(latest.totals.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(latest.totals.gstPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(latest.totals.totalPaise)}</dd></div></dl>
        <details><summary>Sections, vendors and decision history</summary>
          <div className="purchase-orders__request-history-detail">
            {latest.sectionTotals.map((section) => <p key={section.sectionId}><span>{section.label}</span><strong>{formatPaise(section.totals.netPaise)} before GST · {formatPaise(section.totals.gstPaise)} GST · {formatPaise(section.totals.totalPaise)} total</strong></p>)}
            {latest.vendorTotals.map((vendor) => <p key={vendor.vendorId}><span>{vendor.name}</span><strong>{formatPaise(vendor.totals.netPaise)} before GST · {formatPaise(vendor.totals.gstPaise)} GST · {formatPaise(vendor.totals.totalPaise)} total</strong></p>)}
            {latest.decisions.map((decision) => <p key={decision.id}><span>{decision.decision.replaceAll("_", " ")} · {new Date(decision.decidedAt).toLocaleDateString()}</span><strong>{decision.reason ?? decision.budgetOverrideReason ?? ""}</strong></p>)}
          </div>
          {latest.revisions.length ? <div className="purchase-orders__revision-history"><h4>Submitted revisions</h4>
            {latest.revisions.map((revision) => <details key={revision.id}><summary>Revision {revision.revision} · {new Date(revision.submittedAt).toLocaleDateString()} · {formatPaise(revision.totals.totalPaise)} total</summary>
              <dl className="purchase-orders__request-amounts"><div><dt>Before GST</dt><dd>{formatPaise(revision.totals.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(revision.totals.gstPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(revision.totals.totalPaise)}</dd></div></dl>
              <ul>{revision.lines.map((line) => <li key={line.id}>{line.sectionLabel} · {line.itemName} · {line.vendorName} · {formatPaise(line.totalPaise)}</li>)}</ul>
              {revision.modeSnapshotStatus === "historical_unavailable" ? <p className="purchase-orders__hint">Configured mode snapshots were not recorded for this historical revision.</p> : null}
              {revision.modeSnapshots?.length ? <ul>{revision.modeSnapshots.map((snapshot) => <li key={snapshot.sourceLineItemKey}>
                {snapshot.mainLineName || snapshot.sourceLineItemKey}: {formatPaise(snapshot.actualTotals.netPaise)} vendor net
                {snapshot.actualNetMinusConfiguredCostPaise == null ? " · configured cost unavailable" : ` · ${formatPaise(snapshot.actualNetMinusConfiguredCostPaise)} versus configured cost`}
                {snapshot.mode.decision?.integrityBasis ? <span> · Unverified saved values · Buyer reason: {snapshot.mode.decision.integrityBasis.reason}</span> : null}
              </li>)}</ul> : null}
            </details>)}
          </div> : null}
        </details>
      </div> : null}
    {pending ? <InlineMessage tone="warning">This purchase order is waiting for Super Admin approval.</InlineMessage> : null}
    {correction?.decisions.length ? <InlineMessage tone="warning">{correction.decisions.at(-1)?.reason ?? "Super Admin requested changes to this order."}</InlineMessage> : null}
    {send.isError ? <InlineMessage tone="error">{procurementError(send.error, "The purchase order could not be sent. Your quote and entries are retained. Review and retry.")}</InlineMessage> : null}
    {canManage && !pending ? <div className="purchase-orders__actions purchase-orders__send-action"><Button busy={send.isPending}
      disabled={!currentQuote || !readyToQuote || send.isPending || send.isSuccess || itemsBusy} onClick={() => send.mutate()}>
      {correction ? "Resend purchase order to Super Admin" : "Send purchase order to Super Admin"}
    </Button></div> : null}
    </> : null}
    </>}
    {editor && canReadItems && canManageItems ? <ProjectProcurementItemEditor key={`${editor.item?.id ?? "new"}-${editor.lineKey ?? "recovery"}`}
      projectId={projectId} projectName={projectName} item={editor.item} source={editor.source}
      parentLabel={editor.parentLabel} assignmentOptions={editor.source ? undefined : assignmentOptions}
      currentEstimate={editor.estimate} sourceStale={editorSourceStale}
      onClose={() => setEditor(null)} returnFocusRef={itemReturnFocusRef} fallbackFocusRef={itemFallbackFocusRef}
      onSaved={(saved) => {
        setEditor(null);
        setQuoted(null);
        setNotice(`${saved.itemName} ${editor.item ? "updated" : "added"} in this project.`);
        void refresh();
      }} /> : null}
    {removing && (!projectSourceMismatch || (removing.recovery && canUseRecoveryFailure)) && canReadItems && canManageItems ? <Dialog title={`Remove ${removing.itemName}?`} eyebrow="Procurement item"
      description="This removes the item from active procurement and releases its uncommitted vendor allocation. Submitted orders retain their history and can prevent removal."
      role="alertdialog" busy={removeItem.isPending} onClose={() => setRemoving(null)}
      returnFocusRef={itemReturnFocusRef} fallbackFocusRef={itemFallbackFocusRef}>
      <Field id={`purchase-order-remove-${removing.id}`} label="Reason" required>
        {(field) => <Textarea {...field} maxLength={1000} value={removeReason} disabled={removeItem.isPending || removalBlocked}
          onChange={(event) => setRemoveReason(event.target.value)} />}
      </Field>
      {removeItem.isError ? <InlineMessage tone="error">{procurementError(removeItem.error, "The item could not be removed. Refresh and try again.")}</InlineMessage> : null}
      <div className="modal__actions"><Button variant="quiet" disabled={removeItem.isPending} onClick={() => setRemoving(null)}>Cancel</Button>
        <Button variant="destructive" busy={removeItem.isPending} disabled={removeReason.trim().length < 3 || removeItem.isPending || removalBlocked || removeItem.error instanceof ApiError && removeItem.error.status === 409}
          onClick={() => removeItem.mutate({ target: removing, reason: removeReason.trim() })}>Remove item</Button></div>
    </Dialog> : null}
  </div>;
}
