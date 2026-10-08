import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { KnowledgeLifecycleDialog } from "./KnowledgeLifecycleDialogs";
import { getKnowledgeItem, permanentlyDeleteKnowledgeMainLine } from "./knowledgeApi";
import { commitKnowledgeMainLineRemoval, syncKnowledgeMainLineDeletion } from "./knowledgeMutationSync";
import type { KnowledgeItemDetail, KnowledgeItemListItem } from "./knowledgeTypes";

export interface KnowledgeMainLineDeleteDialogProps {
  readonly target: KnowledgeItemListItem;
  readonly disabledReason?: string;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly fallbackFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onCommitted: (item: KnowledgeItemDetail) => void;
  readonly onDeleted: (name: string) => void;
}

export function KnowledgeMainLineDeleteDialog({
  target, disabledReason, returnFocusRef, fallbackFocusRef, onClose, onCommitted, onDeleted
}: KnowledgeMainLineDeleteDialogProps) {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<KnowledgeItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reason, setReason] = useState("");
  const [requiresReview, setRequiresReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");
  const [saved, setSaved] = useState<KnowledgeItemDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const loadSequence = useRef(0);
  const committed = useRef(false);
  const submissionLocked = useRef(false);
  const refreshLocked = useRef(false);

  // Keep this review local: a mounted detail observer must not recreate a deleted
  // cache entry or start a new read after the deletion receipt is committed.
  async function loadDetail(review = false) {
    if (committed.current) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    setReviewNotice("");
    try {
      const current = await getKnowledgeItem(target.mainLineId);
      if (sequence !== loadSequence.current || committed.current) return;
      setDetail(current);
      setRequiresReview(false);
      mutation.reset();
      if (review) setReviewNotice("Current Main Line details loaded. Review them before confirming deletion again.");
    } catch (error) {
      if (sequence !== loadSequence.current || committed.current) return;
      setDetail(null);
      setLoadError(error instanceof Error ? error.message : "The current Main Line could not be loaded.");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
    return () => { loadSequence.current += 1; };
  }, [target.mainLineId, target.basketId, target.subBasketId]);

  async function refreshDeleted(item: KnowledgeItemDetail) {
    if (!committed.current || refreshLocked.current) return;
    refreshLocked.current = true;
    setRefreshing(true);
    setRefreshError("");
    try {
      await syncKnowledgeMainLineDeletion(queryClient, item.mainLineId, { basketId: target.basketId, throwOnError: true });
      onDeleted(item.mainLineName);
    } catch {
      setRefreshError("The Main Line was permanently deleted, but the catalog could not refresh. Retry the refresh; deletion will not run again.");
    } finally {
      refreshLocked.current = false;
      setRefreshing(false);
    }
  }

  const mutation = useMutation({
    mutationFn: ({ item, submittedReason }: { item: KnowledgeItemDetail; submittedReason: string }) =>
      permanentlyDeleteKnowledgeMainLine(item.mainLineId, { expectedVersion: item.version, reason: submittedReason }),
    onSuccess: (_receipt, { item }) => {
      committed.current = true;
      loadSequence.current += 1;
      setSaved(item);
      commitKnowledgeMainLineRemoval(queryClient, item.mainLineId);
      onCommitted(item);
      void refreshDeleted(item);
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.code === "VERSION_CONFLICT" || [401, 403, 404, 409].includes(error.status))) {
        setRequiresReview(true);
        setReviewNotice("");
      }
    },
    onSettled: () => { submissionLocked.current = false; }
  });

  const identityMatches = detail?.mainLineId === target.mainLineId
    && detail.id === target.mainLineId
    && detail.basketId === target.basketId
    && (detail.subBasketId ?? null) === (target.subBasketId ?? null);
  const detailBlocked = !detail || loading || loadError ? undefined
    : !identityMatches
      ? "This Main Line is no longer under the reviewed Main Basket and Sub-Basket. Close this dialog and open it from its current location."
      : detail.itemType === "temporary"
        ? "This item is no longer an ordinary Main Line. Close this dialog and refresh the catalog."
        : detail.status === "active"
          ? "Deactivate this Main Line from its workspace before deleting it."
          : !detail.allowedActions.includes("archive")
            ? "This Main Line is not currently available for deletion. Close this dialog and refresh the catalog."
            : undefined;
  const busy = mutation.isPending || refreshing;
  const canSubmit = Boolean(detail && identityMatches && reason.trim() && !loading && !loadError
    && !disabledReason && !detailBlocked && !requiresReview && !busy && !saved);
  const displayed = saved ?? (identityMatches ? detail : null) ?? target;

  return <KnowledgeLifecycleDialog
    action="archive"
    reason={reason}
    onReasonChange={setReason}
    busy={busy}
    confirmDisabled={!canSubmit}
    reasonDisabled={busy || Boolean(saved)}
    returnFocusRef={returnFocusRef}
    fallbackFocusRef={fallbackFocusRef}
    onClose={onClose}
    onConfirm={() => {
      if (!canSubmit || !detail || submissionLocked.current || committed.current) return;
      submissionLocked.current = true;
      mutation.mutate({ item: detail, submittedReason: reason.trim() });
    }}
    error={!saved && mutation.error && !requiresReview ? mutation.error.message : undefined}
    content={<>
      <div className="knowledge-main-line-delete-context">
        <strong>{displayed.mainLineName}</strong>
        <p>Main Basket: {displayed.basketName}{displayed.subBasketName ? ` · Sub-Basket: ${displayed.subBasketName}` : " · Directly under Main Basket"}</p>
      </div>
      {!saved && loading ? <p role="status">Loading current Main Line…</p> : null}
      {!saved && loadError ? <InlineMessage tone="error" role="alert">
        {loadError}
        <Button variant="secondary" disabled={Boolean(disabledReason)} onClick={() => void loadDetail(requiresReview)}>Retry Main Line</Button>
      </InlineMessage> : null}
      {!saved && disabledReason ? <InlineMessage tone="error" role="alert">{disabledReason}</InlineMessage> : null}
      {!saved && detailBlocked ? <InlineMessage tone="warning" role="alert">{detailBlocked}</InlineMessage> : null}
      {!saved && requiresReview ? <InlineMessage tone="warning" title="Main Line must be reviewed again" role="alert">
        {mutation.error?.message ?? "The Main Line changed. Load its current details before confirming again."}
        <Button variant="secondary" disabled={loading || Boolean(disabledReason)} onClick={() => void loadDetail(true)}>Load current Main Line</Button>
      </InlineMessage> : null}
      {!saved && reviewNotice ? <InlineMessage tone="warning" role="status">{reviewNotice}</InlineMessage> : null}
      {saved ? <InlineMessage tone={refreshError ? "warning" : "success"} title="Main Line deleted" role="status">
        {refreshError || "The Main Line was permanently deleted. Refreshing the catalog…"}
      </InlineMessage> : null}
    </>}
    actions={saved ? <>
      <Button variant="quiet" disabled={busy} onClick={onClose}>Done</Button>
      <Button variant="secondary" busy={busy} onClick={() => void refreshDeleted(saved)}>Retry catalog refresh</Button>
    </> : undefined}
  />;
}
