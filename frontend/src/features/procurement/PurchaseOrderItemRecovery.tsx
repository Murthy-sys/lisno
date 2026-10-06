import { useState, type SyntheticEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import type { ProjectProcurementItem } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { PROCUREMENT_ITEMS_PAGE_SIZE, getProjectProcurementItems, projectProcurementKeys } from "./projectProcurementApi";
import { procurementError } from "./procurementPresentation";
import type { PurchaseOrderPreparation } from "./purchaseOrderApi";
import "./purchaseOrderItemRecovery.css";

function actionable(line: PurchaseOrderPreparation["estimateLines"][number]) {
  return line.included && typeof line.amountPaise === "number" && line.amountPaise > 0;
}

function hasPositiveApprovedValue(line: PurchaseOrderPreparation["estimateLines"][number]) {
  return typeof line.amountPaise === "number" && line.amountPaise > 0;
}

export function canReviewRecoveryAssignment(item: ProjectProcurementItem, preparation: PurchaseOrderPreparation) {
  const source = item.estimateSource;
  if (!source) return true;
  if (source.estimateId !== preparation.estimateSource.estimateId ||
    source.estimateVersion !== preparation.estimateSource.estimateVersion ||
    source.estimateReviewRoundId !== preparation.estimateSource.estimateReviewRoundId) return false;
  const previous = preparation.estimateLines.find((line) => line.key === source.sourceLineItemKey);
  // The backend snapshot retains included lines with a recorded amount, then
  // checks that the previous value is no longer actionable.
  return Boolean(previous && previous.included && previous.amountPaise !== null && !hasPositiveApprovedValue(previous));
}

function recoveryDescription(item: ProjectProcurementItem, preparation: PurchaseOrderPreparation | undefined,
  currentEstimate: { estimateId: string; estimateVersion: number } | undefined) {
  const source = item.estimateSource;
  if (!source) return "No approved estimate line is assigned.";
  if (!preparation) {
    if (currentEstimate && (source.estimateId !== currentEstimate.estimateId || source.estimateVersion !== currentEstimate.estimateVersion)) {
      return `Linked to older approved estimate version ${source.estimateVersion}. Direct reassignment is unavailable. If order history permits, remove it with a reason, then create a new item under the current approved line after preparation reloads.`;
    }
    return "Purchase line preparation is unavailable. Direct reassignment is paused. Review this saved item's source and protected order history before removal.";
  }
  if (source.estimateId !== preparation.estimateSource.estimateId ||
    source.estimateVersion !== preparation.estimateSource.estimateVersion ||
    source.estimateReviewRoundId !== preparation.estimateSource.estimateReviewRoundId) {
    return `Linked to an older approved estimate or review round (version ${source.estimateVersion}). Direct reassignment is unavailable. If this item has no protected order history, remove it with a reason and create a new item under the current approved line.`;
  }
  const previous = preparation.estimateLines.find((line) => line.key === source.sourceLineItemKey);
  if (!previous) return "The previous approved line is unavailable. Direct reassignment is unavailable. Remove this item with a reason and create a new item under the current approved line if its history permits removal.";
  if (!previous.included || previous.amountPaise === null) return "The previous line is excluded or has no recorded approved amount. Direct reassignment is unavailable. If order history permits, remove it with a reason and create a new item under the current approved line.";
  if (hasPositiveApprovedValue(previous)) return "The previous line still has a positive approved value. Direct reassignment is unavailable; refresh the estimate before changing this item.";
  return "The previous line has no positive approved value. Review an eligible line for reassignment. Existing order history may still prevent the change.";
}

export function PurchaseOrderItemRecovery({ projectId, preparation, currentEstimate, canReadItems, canManageItems, disabled, onEdit, onRemove }: {
  projectId: string;
  preparation?: PurchaseOrderPreparation;
  currentEstimate?: { estimateId: string; estimateVersion: number };
  canReadItems: boolean;
  canManageItems: boolean;
  disabled: boolean;
  onEdit: (item: ProjectProcurementItem, trigger: HTMLButtonElement) => void;
  onRemove: (item: ProjectProcurementItem, trigger: HTMLButtonElement) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: projectProcurementKeys.list(projectId, "", offset, { unassigned: true }),
    queryFn: ({ signal }) => getProjectProcurementItems(projectId, "", offset, signal, { unassigned: true }),
    enabled: canReadItems && expanded,
    staleTime: 30_000
  });
  if (!canReadItems) return null;
  const eligibleLineCount = preparation?.estimateLines.filter(actionable).length ?? 0;
  const open = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    setExpanded(next);
    if (!next) setOffset(0);
  };
  return <details className="purchase-order-recovery" open={expanded} onToggle={open}>
    <summary><span>Items needing assignment review</span><small>{query.data ? `${query.data.total} item${query.data.total === 1 ? "" : "s"}` : "Check saved items outside current purchase lines"}</small></summary>
    {expanded ? <div className="purchase-order-recovery__body">
      <p>{preparation ? "Saved items outside eligible approved lines stay visible here. Review their source before ordering."
        : "Purchase line preparation is blocked by an item source conflict. Review saved items here; ordering remains paused until the conflict is resolved."}</p>
      {query.isPending ? <PageState state="loading" message="Loading items needing assignment…" /> : null}
      {query.isError ? <InlineMessage tone="error" action={<Button variant="secondary" size="compact" onClick={() => void query.refetch()}>Retry items</Button>}>
        {procurementError(query.error, "Items needing assignment could not be loaded.")}
      </InlineMessage> : null}
      {query.data?.items.length ? <ul className="purchase-order-recovery__items">{query.data.items.map((item) => {
        const canReview = Boolean(preparation && canReviewRecoveryAssignment(item, preparation) && eligibleLineCount > 0);
        return <li key={item.id}>
          <div><strong>{item.itemName}</strong><span>{item.brand} · {item.uom.code}</span><p>{recoveryDescription(item, preparation, currentEstimate)}</p></div>
          {canManageItems ? <div className="purchase-order-recovery__actions">
            {canReview ? <Button size="compact" variant="secondary" disabled={disabled || query.isFetching || query.isError}
              onClick={(event) => onEdit(item, event.currentTarget)}>Review assignment</Button> : null}
            <Button size="compact" variant="quiet" disabled={disabled || query.isFetching || query.isError}
              onClick={(event) => onRemove(item, event.currentTarget)}>Remove item</Button>
          </div> : null}
        </li>;
      })}</ul> : query.data && !query.isError ? <p>No saved items need assignment review.</p> : null}
      {query.data && (query.data.total > PROCUREMENT_ITEMS_PAGE_SIZE || offset > 0) ? <nav className="purchase-order-recovery__pagination" aria-label="Items needing assignment pages">
        <span>{offset + 1}–{offset + query.data.items.length} of {query.data.total}</span>
        <div><Button size="compact" variant="secondary" disabled={offset === 0 || query.isFetching} onClick={() => setOffset((value) => Math.max(0, value - PROCUREMENT_ITEMS_PAGE_SIZE))}>Previous</Button>
          <Button size="compact" variant="secondary" disabled={offset + PROCUREMENT_ITEMS_PAGE_SIZE >= query.data.total || query.isFetching} onClick={() => setOffset((value) => value + PROCUREMENT_ITEMS_PAGE_SIZE)}>Next</Button></div>
      </nav> : null}
    </div> : null}
  </details>;
}
