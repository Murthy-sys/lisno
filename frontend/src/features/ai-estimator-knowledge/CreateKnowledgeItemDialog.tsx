import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createKnowledgeMainLine, listKnowledgeBaskets } from "./knowledgeApi";
import { ADD_MAIN_BASKET, CreateKnowledgeBasketFields } from "./CreateKnowledgeBasketFields";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { reconcileRelatedItemCreation, requiresRelatedItemReconciliation, type RelatedItemCreationInput, type RelatedItemReconciliation } from "./knowledgeRelatedItemCreation";
import type { KnowledgeBasket, KnowledgeItemDetail } from "./knowledgeTypes";

export function CreateKnowledgeItemDialog({ onClose, onCreated, onRefreshError, onBasketCreated, context, itemType = "main_line", initialBasketId = "", initialSubBasketId = "", initialSubBasketName = "", initialName = "", excludeMainLineId, canCreateBasket = false }: {
  readonly itemType?: "main_line" | "temporary";
  readonly context?: "related-item" | "sub-basket" | "sub-item";
  readonly initialBasketId?: string;
  readonly initialSubBasketId?: string;
  readonly initialSubBasketName?: string;
  readonly initialName?: string;
  readonly excludeMainLineId?: string;
  readonly canCreateBasket?: boolean;
  readonly onClose: () => void;
  readonly onCreated: (mainLineId: string, detail?: KnowledgeItemDetail, creationInput?: RelatedItemCreationInput) => Promise<void>;
  readonly onBasketCreated?: (basket: KnowledgeBasket) => void;
  readonly onRefreshError?: (message: string) => void;
}) {
  const formId = useId();
  const queryClient = useQueryClient();
  const subItem = context === "sub-item";
  const [selectedItemType, setSelectedItemType] = useState(itemType);
  const temporary = selectedItemType === "temporary";
  const related = context === "related-item" || context === "sub-basket" || subItem;
  const createsSubBasketTarget = context === "sub-basket";
  const [basketId, setBasketId] = useState(initialBasketId);
  const [subBasketName, setSubBasketName] = useState(initialSubBasketName);
  const [name, setName] = useState(initialName);
  const [recovery, setRecovery] = useState<RelatedItemReconciliation | { kind: "idle" | "checking" | "failed" }>({ kind: "idle" });
  const [confirmedItem, setConfirmedItem] = useState<KnowledgeItemDetail | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [usingExisting, setUsingExisting] = useState(false);
  const [addingBasket, setAddingBasket] = useState(false);
  const [basketBusy, setBasketBusy] = useState(false);
  const [createdBasket, setCreatedBasket] = useState<KnowledgeBasket | null>(null);
  const [basketNotice, setBasketNotice] = useState("");
  const submissionLocked = useRef(false);
  const basketSelectRef = useRef<HTMLSelectElement>(null);
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
  const listedBaskets = baskets.data?.items.filter((basket) => basket.status === "active") ?? [];
  const activeBaskets = createdBasket && !listedBaskets.some(({ id }) => id === createdBasket.id)
    ? [...listedBaskets, createdBasket]
    : listedBaskets;
  const inlineBasketCreation = canCreateBasket;
  const keepsSubItemParent = subItem && basketId === initialBasketId;
  const valid = Boolean(!baskets.isError && activeBaskets.some((basket) => basket.id === basketId)
    && (keepsSubItemParent ? initialSubBasketId && subBasketName.trim() : (temporary && !createsSubBasketTarget && !subItem) || subBasketName.trim()) && name.trim());

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
        const input = lastAttempt.current;
        if (subItem && (!input || !item.subBasketId || item.basketId !== input.basketId
          || (input.subBasketId ? item.subBasketId !== input.subBasketId
            : normalizeBasketName(item.subBasketName ?? "") !== normalizeBasketName(input.subBasketName ?? "")))) {
          throw new Error("The saved item did not return under the selected Sub-Basket.");
        }
        if (subItem && input && input.basketId !== initialBasketId) await onCreated(item.mainLineId, item, input);
        else await onCreated(item.mainLineId, item);
      } catch {
        reportRefreshWarning("The related item is saved in the catalog, but could not be selected. Close this dialog and select it from the related items.");
      }
    }
    const refreshed = await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.mainLineLists(item.basketId) }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.subBasketLists(item.basketId) }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpact(item.basketId) }, { throwOnError: true }),
      queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() }, { throwOnError: true })
    ]);
    if (refreshed.some((result) => result.status === "rejected")) {
      reportRefreshWarning("The related item is saved, but some catalog lists could not refresh. Retry the catalog refresh before making further changes.");
    }
  }

  const createItem = useMutation({
    mutationFn: (input: RelatedItemCreationInput) => createKnowledgeMainLine(input.basketId, {
      name: input.name,
      ...(input.subBasketId ? { subBasketId: input.subBasketId } : input.subBasketName ? { subBasketName: input.subBasketName } : {}),
      ...(input.itemType === "temporary" ? { itemType: "temporary" } : {})
    }),
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
  const busy = createItem.isPending || basketBusy || recovery.kind === "checking" || usingExisting;
  const unresolved = recovery.kind === "failed";
  const locked = busy || unresolved || Boolean(confirmedItem);
  const canCreate = !busy && !addingBasket && !confirmedItem && (recovery.kind === "idle" || recovery.kind === "absent");
  const fieldErrors = createItem.error instanceof ApiError ? createItem.error.fields : undefined;
  const showCreateError = createItem.error && recovery.kind === "idle";
  const hasRecoveryError = recovery.kind === "conflict" || recovery.kind === "failed";
  const errorDescription = showCreateError || hasRecoveryError ? "item-creation-error" : undefined;
  const title = createsSubBasketTarget ? "Add Sub-Basket" : subItem ? "Add sub-item" : related ? "Add related item" : temporary ? "Add temporary item" : "Add estimation item";

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

  function selectBasket(nextId: string) {
    setBasketId(nextId);
    setBasketNotice("");
    if (subItem) setSubBasketName(nextId === initialBasketId ? initialSubBasketName : "");
    else if (temporary) setSubBasketName("");
    clearFailure();
  }

  function closeBasketCreation() {
    setAddingBasket(false);
    globalThis.setTimeout(() => basketSelectRef.current?.focus(), 0);
  }

  return (
    <ContextPanel title={title} eyebrow="Estimation configuration" onClose={onClose} busy={busy && !confirmedItem}
      width="medium"
      className="knowledge-context-panel"
      dirty={!subItem && !confirmedItem && (basketId !== initialBasketId || subBasketName !== initialSubBasketName || name !== initialName || selectedItemType !== itemType || addingBasket)}
      footer={({ requestClose }) => (
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="quiet" disabled={busy && !confirmedItem} onClick={requestClose}>{confirmedItem ? "Close" : "Cancel"}</Button>
          <Button type="submit" form={formId} busy={busy} disabled={!canCreate || !valid}>{title}</Button>
        </div>
      )}>
      <form id={formId} className="knowledge-dialog-form" onSubmit={(event) => {
        event.preventDefault();
        if (!submissionLocked.current && canCreate && valid) {
          submissionLocked.current = true;
          const input: RelatedItemCreationInput = keepsSubItemParent
            ? { basketId, subBasketId: initialSubBasketId, name: name.trim(), itemType: selectedItemType, excludeMainLineId }
            : { basketId, subBasketName: subBasketName.trim(), name: name.trim(), itemType: selectedItemType, excludeMainLineId };
          lastAttempt.current = input;
          createItem.mutate(input);
        }
      }}>
        <div className="knowledge-dialog-body">
          {temporary && <p>This item will be listed under its Main Basket with Overview, Mode and Quality Parameters.</p>}
          {createsSubBasketTarget
            ? <p>Add a temporary item such as Lights. The estimator can choose the exact item later. The Sub-Basket and temporary item are saved in Configuration; save the rule separately.</p>
            : subItem ? <p>Add a catalog or temporary item under the selected Sub-Basket. Choosing another Main Basket updates the rule to the new Sub-Basket after the item is saved.</p>
            : related && <p>Adding an item saves a reusable draft in the catalog. Save the rule separately to keep this relationship.</p>}
          {showCreateError ? <div id="item-creation-error"><InlineMessage tone="error" role="alert">{createItem.error?.message}</InlineMessage></div> : null}
          {recovery.kind === "checking" ? <p role="status">Checking whether this related item is already in the catalog…</p> : null}
          {recovery.kind === "failed" ? <div id="item-creation-error"><InlineMessage tone="error" role="alert">Could not confirm whether the item was added. Check the catalog again before another attempt. <Button type="button" variant="quiet" onClick={() => { if (lastAttempt.current) void checkCreation(lastAttempt.current); }}>Check catalog again</Button></InlineMessage></div> : null}
          {recovery.kind === "conflict" ? <div id="item-creation-error"><InlineMessage tone="error" role="alert">{recovery.message}</InlineMessage></div> : null}
          {recovery.kind === "absent" ? <InlineMessage tone="info" role="status">No matching related item was found after checking the catalog. You can try adding it again.</InlineMessage> : null}
          {recovery.kind === "match" && !confirmedItem ? <InlineMessage tone="info" role="status">“{recovery.item.mainLineName}” already exists in this Main Basket and Sub Basket. Select it explicitly to use it in this rule. <Button type="button" variant="quiet" disabled={busy} onClick={() => void useExisting()}>Use existing item</Button></InlineMessage> : null}
          {confirmedItem ? <InlineMessage tone="success" role="status">“{confirmedItem.mainLineName}” is saved in the catalog. Save the rule separately to keep this relationship.</InlineMessage> : null}
          {refreshWarning ? <InlineMessage tone="warning" role="alert">{refreshWarning}</InlineMessage> : null}
          {basketNotice ? <InlineMessage tone="success" role="status">{basketNotice}</InlineMessage> : null}
          {baskets.isPending ? <p role="status">Loading Main Baskets…</p> : null}
          {baskets.isError ? <InlineMessage tone="error" role="alert">Main Baskets could not be loaded. <Button type="button" variant="quiet" onClick={() => void baskets.refetch()}>Retry Main Baskets</Button></InlineMessage> : null}
          {baskets.isSuccess && activeBaskets.length === 0 ? <InlineMessage tone="info">{inlineBasketCreation
            ? "No Main Baskets are available. Choose Add Main Basket in the dropdown to continue."
            : related ? "Create a Main Basket from Configuration before adding a related item."
              : "Create a Main Basket from Configuration before adding a Main Line."}</InlineMessage> : null}
          <Field id="item-basket" label="Main basket" required error={fieldErrors?.basketId} describedBy={errorDescription}>
            {(props) => <Select {...props} ref={basketSelectRef} value={basketId} disabled={locked || addingBasket || (subItem && !canCreateBasket) || !baskets.data || baskets.isError} onChange={(event) => {
              if (event.target.value === ADD_MAIN_BASKET) { setAddingBasket(true); setBasketNotice(""); }
              else selectBasket(event.target.value);
            }}>
              <option value="">Select a basket</option>
              {activeBaskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
              {inlineBasketCreation && <option value={ADD_MAIN_BASKET}>Add Main Basket</option>}
            </Select>}
          </Field>
          {inlineBasketCreation && addingBasket ? <CreateKnowledgeBasketFields onBusyChange={setBasketBusy}
            onCancel={closeBasketCreation} onCreated={(basket, notice) => {
              setCreatedBasket(basket);
              onBasketCreated?.(basket);
              selectBasket(basket.id);
              setBasketNotice(notice);
              closeBasketCreation();
            }} /> : null}
          <Field id="item-sub-basket" label="Sub basket" required={!temporary || createsSubBasketTarget || subItem} error={fieldErrors?.subBasketName} describedBy={errorDescription}>
            {(props) => <Input {...props} maxLength={240} value={subBasketName} disabled={locked || keepsSubItemParent} onChange={(event) => { setSubBasketName(event.target.value); clearFailure(); }} />}
          </Field>
          {subItem && <Field id="item-type" label="Sub-item type" required>
            {(props) => <Select {...props} value={selectedItemType} disabled={locked} onChange={(event) => { setSelectedItemType(event.target.value as "main_line" | "temporary"); clearFailure(); }}>
              <option value="main_line">Catalog item</option><option value="temporary">Temporary item</option>
            </Select>}
          </Field>}
          <Field id="item-name" label={createsSubBasketTarget ? "Temporary item name" : subItem ? "Sub-item name" : related ? "Related item name" : temporary ? "Temporary item name" : "Main Line name"} required error={fieldErrors?.name} describedBy={errorDescription}>
            {(props) => <Input {...props} maxLength={240} value={name} disabled={locked} onChange={(event) => { setName(event.target.value); clearFailure(); }} />}
          </Field>
        </div>

      </form>
    </ContextPanel>
  );
}

function normalizeBasketName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}
