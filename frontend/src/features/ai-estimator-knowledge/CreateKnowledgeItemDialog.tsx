import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createKnowledgeMainLine, listKnowledgeBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { reconcileRelatedItemCreation, requiresRelatedItemReconciliation, type RelatedItemCreationInput, type RelatedItemReconciliation } from "./knowledgeRelatedItemCreation";
import type { KnowledgeItemDetail } from "./knowledgeTypes";

export function CreateKnowledgeItemDialog({ onClose, onCreated, onRefreshError, context, itemType = "main_line", initialBasketId = "", initialSubBasketName = "", initialName = "", excludeMainLineId }: {
  readonly itemType?: "main_line" | "temporary";
  readonly context?: "related-item";
  readonly initialBasketId?: string;
  readonly initialSubBasketName?: string;
  readonly initialName?: string;
  readonly excludeMainLineId?: string;
  readonly onClose: () => void;
  readonly onCreated: (mainLineId: string, detail?: KnowledgeItemDetail) => Promise<void>;
  readonly onRefreshError?: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const temporary = itemType === "temporary";
  const related = context === "related-item";
  const [basketId, setBasketId] = useState(initialBasketId);
  const [subBasketName, setSubBasketName] = useState(initialSubBasketName);
  const [name, setName] = useState(initialName);
  const [recovery, setRecovery] = useState<RelatedItemReconciliation | { kind: "idle" | "checking" | "failed" }>({ kind: "idle" });
  const [confirmedItem, setConfirmedItem] = useState<KnowledgeItemDetail | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [usingExisting, setUsingExisting] = useState(false);
  const submissionLocked = useRef(false);
  const lastAttempt = useRef<RelatedItemCreationInput | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const baskets = useQuery({
    queryKey: [...knowledgeQueryKeys.basketLists(), "creation-catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets({ ...page, status: "active" }), "Main Basket")
  });
  const activeBaskets = baskets.data?.items.filter((basket) => basket.status === "active") ?? [];
  const valid = Boolean(!baskets.isError && activeBaskets.some((basket) => basket.id === basketId) && (temporary || subBasketName.trim()) && name.trim());

  async function checkCreation(input: RelatedItemCreationInput) {
    setRecovery({ kind: "checking" });
    try {
      setRecovery(await reconcileRelatedItemCreation(input));
    } catch {
      setRecovery({ kind: "failed" });
    }
  }

  function reportRefreshWarning(message: string) {
    if (mounted.current) setRefreshWarning(message);
    // A successful selection normally closes this dialog before refresh finishes.
    // The initiating row guards its own lifetime when receiving this warning.
    onRefreshError?.(message);
  }

  async function acceptRelatedItem(item: KnowledgeItemDetail) {
    // This detail is authoritative even while relationship-list refresh is pending.
    queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), item);
    if (mounted.current) {
      setConfirmedItem(item);
      try {
        await onCreated(item.mainLineId, item);
      } catch {
        reportRefreshWarning("The related item is saved in the catalog, but could not be selected. Close this dialog and select it from the related items.");
      }
    }
    const refreshed = await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists(item.basketId) }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketLists(item.basketId) }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpact(item.basketId) }, { throwOnError: true })
    ]);
    if (refreshed.some((result) => result.status === "rejected")) {
      reportRefreshWarning("The related item is saved, but some catalog lists could not refresh. Retry the catalog refresh before making further changes.");
    }
  }

  const createItem = useMutation({
    mutationFn: (input: RelatedItemCreationInput) => createKnowledgeMainLine(input.basketId, { name: input.name, ...(input.subBasketName ? { subBasketName: input.subBasketName } : {}), ...(input.itemType === "temporary" ? { itemType: "temporary" } : {}) }),
    onSuccess: async (item) => {
      if (related) {
        await acceptRelatedItem(item);
        return;
      }
      queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), item);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists(basketId) }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketLists(basketId) }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpact(basketId) })
      ]);
      await onCreated(item.mainLineId);
    },
    onError: async (error, input) => {
      if (related && requiresRelatedItemReconciliation(error)) await checkCreation(input);
    },
    onSettled: () => { submissionLocked.current = false; }
  });
  const busy = createItem.isPending || recovery.kind === "checking" || usingExisting;
  const unresolved = recovery.kind === "failed";
  const locked = busy || unresolved || Boolean(confirmedItem);
  const canCreate = !busy && !confirmedItem && (recovery.kind === "idle" || recovery.kind === "absent");
  const fieldErrors = createItem.error instanceof ApiError ? createItem.error.fields : undefined;
  const showCreateError = createItem.error && recovery.kind === "idle";
  const hasRecoveryError = recovery.kind === "conflict" || recovery.kind === "failed";
  const errorDescription = showCreateError || hasRecoveryError ? "item-creation-error" : undefined;
  const title = related ? "Add related item" : temporary ? "Add temporary item" : "Add estimation item";

  function clearFailure() {
    createItem.reset();
    setRecovery({ kind: "idle" });
  }

  async function useExisting() {
    if (submissionLocked.current || busy || recovery.kind !== "match" || !lastAttempt.current) return;
    submissionLocked.current = true;
    setUsingExisting(true);
    try {
      // Recheck on explicit selection, in case availability changed while the dialog was open.
      const result = await reconcileRelatedItemCreation(lastAttempt.current);
      setRecovery(result);
      if (result.kind === "match" && result.item.mainLineId === recovery.item.mainLineId) await acceptRelatedItem(result.item);
    } catch {
      setRecovery({ kind: "failed" });
    } finally {
      submissionLocked.current = false;
      setUsingExisting(false);
    }
  }

  return (
    <Dialog title={title} eyebrow="Estimation configuration" onClose={onClose} busy={busy && !confirmedItem}>
      <form className="knowledge-dialog-form" onSubmit={(event) => {
        event.preventDefault();
        if (!submissionLocked.current && canCreate && valid) {
          submissionLocked.current = true;
          const input = { basketId, subBasketName: subBasketName.trim(), name: name.trim(), itemType, excludeMainLineId };
          lastAttempt.current = input;
          createItem.mutate(input);
        }
      }}>
        <div className="knowledge-dialog-body">
          {temporary && <p>This item will be listed under its Main Basket with Overview, Mode and Quality Parameters.</p>}
          {related && <p>Adding an item saves a reusable draft in the catalog. Save the rule separately to keep this relationship.</p>}
          {showCreateError ? <div id="item-creation-error"><InlineMessage tone="error" role="alert">{createItem.error?.message}</InlineMessage></div> : null}
          {recovery.kind === "checking" ? <p role="status">Checking whether this related item is already in the catalog…</p> : null}
          {recovery.kind === "failed" ? <div id="item-creation-error"><InlineMessage tone="error" role="alert">Could not confirm whether the item was added. Check the catalog again before another attempt. <Button type="button" variant="quiet" onClick={() => { if (lastAttempt.current) void checkCreation(lastAttempt.current); }}>Check catalog again</Button></InlineMessage></div> : null}
          {recovery.kind === "conflict" ? <div id="item-creation-error"><InlineMessage tone="error" role="alert">{recovery.message}</InlineMessage></div> : null}
          {recovery.kind === "absent" ? <InlineMessage tone="info" role="status">No matching related item was found after checking the catalog. You can try adding it again.</InlineMessage> : null}
          {recovery.kind === "match" && !confirmedItem ? <InlineMessage tone="info" role="status">“{recovery.item.mainLineName}” already exists in this Main Basket and Sub Basket. Select it explicitly to use it in this rule. <Button type="button" variant="quiet" disabled={busy} onClick={() => void useExisting()}>Use existing item</Button></InlineMessage> : null}
          {confirmedItem ? <InlineMessage tone="success" role="status">“{confirmedItem.mainLineName}” is saved in the catalog. Save the rule separately to keep this relationship.</InlineMessage> : null}
          {refreshWarning ? <InlineMessage tone="warning" role="alert">{refreshWarning}</InlineMessage> : null}
          {baskets.isPending ? <p role="status">Loading Main Baskets…</p> : null}
          {baskets.isError ? <InlineMessage tone="error" role="alert">Main Baskets could not be loaded. <Button type="button" variant="quiet" onClick={() => void baskets.refetch()}>Retry Main Baskets</Button></InlineMessage> : null}
          {baskets.isSuccess && activeBaskets.length === 0 ? <InlineMessage tone="info">{related ? "Create a Main Basket from Configuration before adding a related item." : "Create a Main Basket from Configuration before adding a Main Line."}</InlineMessage> : null}
          <Field id="item-basket" label="Main basket" required error={fieldErrors?.basketId} describedBy={errorDescription}>
            {(props) => <Select {...props} value={basketId} disabled={locked || !baskets.data || baskets.isError} onChange={(event) => { setBasketId(event.target.value); if (temporary) setSubBasketName(""); clearFailure(); }}>
              <option value="">Select a basket</option>
              {activeBaskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
            </Select>}
          </Field>
          <Field id="item-sub-basket" label="Sub basket" required={!temporary} error={fieldErrors?.subBasketName} describedBy={errorDescription}>
            {(props) => <Input {...props} maxLength={240} value={subBasketName} disabled={locked} onChange={(event) => { setSubBasketName(event.target.value); clearFailure(); }} />}
          </Field>
          <Field id="item-name" label={related ? "Related item name" : temporary ? "Temporary item name" : "Main Line name"} required error={fieldErrors?.name} describedBy={errorDescription}>
            {(props) => <Input {...props} maxLength={240} value={name} disabled={locked} onChange={(event) => { setName(event.target.value); clearFailure(); }} />}
          </Field>
        </div>
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="quiet" disabled={busy && !confirmedItem} onClick={onClose}>{confirmedItem ? "Close" : "Cancel"}</Button>
          <Button type="submit" busy={busy} disabled={!canCreate || !valid}>{title}</Button>
        </div>
      </form>
    </Dialog>
  );
}
