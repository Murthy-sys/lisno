import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createKnowledgeMainLine, listKnowledgeBaskets, listKnowledgeSubBaskets } from "./knowledgeApi";
import { ADD_MAIN_BASKET, CreateKnowledgeBasketFields } from "./CreateKnowledgeBasketFields";
import { ADD_SUB_BASKET, CreateKnowledgeSubBasketFields } from "./CreateKnowledgeSubBasketFields";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { refreshKnowledgeSubBasketCatalog } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { reconcileRelatedItemCreation, requiresRelatedItemReconciliation, type RelatedItemCreationInput, type RelatedItemReconciliation } from "./knowledgeRelatedItemCreation";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeSubBasket } from "./knowledgeTypes";

const CREATE_SUB_BASKET_WITH_ITEM = "create-sub-basket-with-item";

export function CreateKnowledgeItemDialog({ onClose, onCreated, onRefreshError, onBasketCreated, context, itemType = "main_line", initialBasketId = "", initialSubBasketId = "", initialSubBasketName = "", initialName = "", excludeMainLineId, canCreateBasket = false, canCreateSubBasket = canCreateBasket }: {
  readonly itemType?: "main_line" | "temporary";
  readonly context?: "related-item" | "sub-basket" | "sub-item";
  readonly initialBasketId?: string;
  readonly initialSubBasketId?: string;
  readonly initialSubBasketName?: string;
  readonly initialName?: string;
  readonly excludeMainLineId?: string;
  readonly canCreateBasket?: boolean;
  readonly canCreateSubBasket?: boolean;
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
  const [subBasketId, setSubBasketId] = useState(initialSubBasketId || (createsSubBasketTarget ? CREATE_SUB_BASKET_WITH_ITEM : ""));
  const [subBasketName, setSubBasketName] = useState(initialSubBasketName);
  const [name, setName] = useState(initialName);
  const [recovery, setRecovery] = useState<RelatedItemReconciliation | { kind: "idle" | "checking" | "failed" }>({ kind: "idle" });
  const [confirmedItem, setConfirmedItem] = useState<KnowledgeItemDetail | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [refreshBasketId, setRefreshBasketId] = useState(initialBasketId);
  const [usingExisting, setUsingExisting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const [addingBasket, setAddingBasket] = useState(false);
  const [addingSubBasket, setAddingSubBasket] = useState(false);
  const [basketBusy, setBasketBusy] = useState(false);
  const [createdBasket, setCreatedBasket] = useState<KnowledgeBasket | null>(null);
  const [createdSubBasket, setCreatedSubBasket] = useState<KnowledgeSubBasket | null>(null);
  const [basketNotice, setBasketNotice] = useState("");
  const submissionLocked = useRef(false);
  const basketSelectRef = useRef<HTMLSelectElement>(null);
  const subBasketSelectRef = useRef<HTMLSelectElement>(null);
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
  const subBaskets = useQuery({
    queryKey: [...knowledgeQueryKeys.subBasketLists(basketId), "creation-catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeSubBaskets(basketId, page), "Sub-Basket"),
    enabled: Boolean(basketId)
  });
  const listedSubBaskets = subBaskets.data?.items.filter((group) => group.basketId === basketId) ?? [];
  const availableSubBaskets = createdSubBasket?.basketId === basketId && !listedSubBaskets.some(({ id }) => id === createdSubBasket.id)
    ? [...listedSubBaskets, createdSubBasket] : listedSubBaskets;
  useEffect(() => {
    if (createdBasket && baskets.data?.items.some(({ id }) => id === createdBasket.id)) setCreatedBasket(null);
  }, [baskets.data, createdBasket]);
  useEffect(() => {
    if (createdSubBasket && subBaskets.data?.items.some(({ id }) => id === createdSubBasket.id)) setCreatedSubBasket(null);
  }, [subBaskets.data, createdSubBasket]);
  const combinedSubBasket = subBasketId === CREATE_SUB_BASKET_WITH_ITEM;
  const requiresSubBasket = !temporary || createsSubBasketTarget || subItem;
  const validSubBasket = combinedSubBasket ? Boolean(subBasketName.trim())
    : subBasketId ? availableSubBaskets.some(({ id }) => id === subBasketId) : !requiresSubBasket;
  const valid = Boolean(!baskets.isError && activeBaskets.some((basket) => basket.id === basketId)
    && subBaskets.isSuccess && validSubBasket && name.trim());

  async function checkCreation(input: RelatedItemCreationInput) {
    setRecovery({ kind: "checking" });
    try {
      setRecovery(await reconcileRelatedItemCreation(input));
    } catch {
      setRecovery({ kind: "failed" });
    }
  }

  function reportRefreshWarning(message: string, targetBasketId = basketId) {
    if (mounted.current) {
      setRefreshWarning(message);
      setRefreshBasketId(targetBasketId);
    }
    // A successful selection normally closes this dialog before refresh finishes.
    // The initiating row guards its own lifetime when receiving this warning.
    onRefreshError?.(message);
  }

  async function deliverSavedItem(item: KnowledgeItemDetail) {
    try {
      const input = lastAttempt.current;
      if (!input || item.basketId !== input.basketId || item.mainLineId === excludeMainLineId
        || normalizeBasketName(item.mainLineName) !== normalizeBasketName(input.name)
        || (item.itemType ?? "main_line") !== input.itemType
        || (input.subBasketId ? item.subBasketId !== input.subBasketId
          : input.subBasketName ? normalizeBasketName(item.subBasketName ?? "") !== normalizeBasketName(input.subBasketName)
          : Boolean(item.subBasketId))) {
        throw new Error("The saved item did not return under the selected classification.");
      }
      if (subItem && input.basketId !== initialBasketId) await onCreated(item.mainLineId, item, input);
      else if (related) await onCreated(item.mainLineId, item);
      else await onCreated(item.mainLineId);
      if (mounted.current) setSelectionFailed(false);
    } catch {
      if (mounted.current) setSelectionFailed(true);
      reportRefreshWarning("The item is saved in the catalog, but could not be selected. Retry selecting the saved item; do not create it again.");
    }
  }

  async function refreshCatalog(item?: KnowledgeItemDetail, targetBasketId = item?.basketId ?? basketId) {
    if (mounted.current) setRefreshing(true);
    try {
      await Promise.all([
        refreshKnowledgeSubBasketCatalog(queryClient, targetBasketId),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }, { throwOnError: true })
      ]);
      if (mounted.current) setRefreshWarning(null);
    } catch {
      reportRefreshWarning(item
        ? `The ${related ? "related " : ""}item is saved, but some catalog lists could not refresh. Retry the catalog refresh before making further changes.`
        : "The basket is saved, but some catalog lists could not refresh. Retry the catalog refresh before making further changes.", targetBasketId);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }

  async function acceptRelatedItem(item: KnowledgeItemDetail) {
    queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), item);
    if (mounted.current) {
      // A saved mutation remains saved even if selection or later reads fail.
      setConfirmedItem(item);
      await deliverSavedItem(item);
    }
    await refreshCatalog(item);
  }

  const createItem = useMutation({
    mutationFn: (input: RelatedItemCreationInput) => createKnowledgeMainLine(input.basketId, {
      name: input.name,
      ...(input.subBasketId ? { subBasketId: input.subBasketId } : input.subBasketName ? { subBasketName: input.subBasketName } : {}),
      ...(input.itemType === "temporary" ? { itemType: "temporary" } : {})
    }),
    onSuccess: acceptRelatedItem,
    onError: async (error, input) => {
      if (requiresRelatedItemReconciliation(error)) await checkCreation(input);
    },
    onSettled: () => { submissionLocked.current = false; }
  });
  const busy = createItem.isPending || basketBusy || recovery.kind === "checking" || usingExisting || refreshing;
  const unresolved = recovery.kind === "failed";
  const locked = busy || unresolved || Boolean(confirmedItem);
  const canCreate = !busy && !addingBasket && !addingSubBasket && !confirmedItem && (recovery.kind === "idle" || recovery.kind === "absent");
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

  async function retrySelection() {
    if (!confirmedItem || busy || submissionLocked.current) return;
    submissionLocked.current = true;
    setUsingExisting(true);
    try {
      await deliverSavedItem(confirmedItem);
    } finally {
      submissionLocked.current = false;
      setUsingExisting(false);
    }
  }

  function selectBasket(nextId: string) {
    setBasketId(nextId);
    setBasketNotice("");
    setAddingSubBasket(false);
    setCreatedSubBasket(null);
    setSubBasketId(subItem && nextId === initialBasketId ? initialSubBasketId : createsSubBasketTarget ? CREATE_SUB_BASKET_WITH_ITEM : "");
    setSubBasketName(subItem && nextId === initialBasketId ? initialSubBasketName : "");
    clearFailure();
  }

  function closeBasketCreation() {
    setAddingBasket(false);
    globalThis.setTimeout(() => basketSelectRef.current?.focus(), 0);
  }

  function closeSubBasketCreation() {
    setAddingSubBasket(false);
    globalThis.setTimeout(() => subBasketSelectRef.current?.focus(), 0);
  }

  return (
    <ContextPanel title={title} eyebrow="Estimation configuration" onClose={onClose} busy={busy && !confirmedItem}
      width="medium"
      className="knowledge-context-panel"
      dirty={!subItem && !confirmedItem && (basketId !== initialBasketId || subBasketId !== (initialSubBasketId || (createsSubBasketTarget ? CREATE_SUB_BASKET_WITH_ITEM : "")) || subBasketName !== initialSubBasketName || name !== initialName || selectedItemType !== itemType || addingBasket || addingSubBasket)}
      footer={({ requestClose }) => (
        <div className="knowledge-dialog-actions">
          <Button type="button" variant={confirmedItem ? "quiet" : "destructive-outline"} disabled={busy && !confirmedItem} onClick={requestClose}>{confirmedItem ? "Close" : "Cancel"}</Button>
          <Button type="submit" form={formId} busy={busy} disabled={!canCreate || !valid}>{title}</Button>
        </div>
      )}>
      <form id={formId} className="knowledge-dialog-form" onSubmit={(event) => {
        event.preventDefault();
        if (!submissionLocked.current && canCreate && valid) {
          submissionLocked.current = true;
          const input: RelatedItemCreationInput = {
            basketId, name: name.trim(), itemType: selectedItemType, excludeMainLineId,
            ...(combinedSubBasket ? { subBasketName: subBasketName.trim() } : subBasketId ? { subBasketId } : {})
          };
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
          {recovery.kind === "checking" ? <p role="status">Checking whether this item is already in the catalog…</p> : null}
          {recovery.kind === "failed" ? <div id="item-creation-error"><InlineMessage tone="error" role="alert">Could not confirm whether the item was added. Check the catalog again before another attempt. <Button type="button" variant="quiet" onClick={() => { if (lastAttempt.current) void checkCreation(lastAttempt.current); }}>Check catalog again</Button></InlineMessage></div> : null}
          {recovery.kind === "conflict" ? <div id="item-creation-error"><InlineMessage tone="error" role="alert">{recovery.message}</InlineMessage></div> : null}
          {recovery.kind === "absent" ? <InlineMessage tone="info" role="status">No matching item was found after checking the catalog. You can try adding it again.</InlineMessage> : null}
          {recovery.kind === "match" && !confirmedItem ? <InlineMessage tone="info" role="status">“{recovery.item.mainLineName}” already exists with the selected Main Basket, Sub-Basket and item type. Select it explicitly to continue. <Button type="button" variant="quiet" disabled={busy} onClick={() => void useExisting()}>Use existing item</Button></InlineMessage> : null}
          {confirmedItem ? <InlineMessage tone="success" role="status">“{confirmedItem.mainLineName}” is saved in the catalog.{related ? " Save the rule separately to keep this relationship." : ""}</InlineMessage> : null}
          {refreshWarning ? <InlineMessage tone="warning" role="alert">{refreshWarning} <Button type="button" variant="quiet" disabled={busy} onClick={() => void refreshCatalog(confirmedItem ?? undefined, refreshBasketId)}>Retry catalog refresh</Button></InlineMessage> : null}
          {selectionFailed && confirmedItem ? <InlineMessage tone="warning" role="alert">The catalog item is saved, but selection is incomplete. <Button type="button" variant="quiet" disabled={busy} onClick={() => void retrySelection()}>Use saved item</Button></InlineMessage> : null}
          {(inlineBasketCreation || canCreateSubBasket) && <p>Main Baskets and Sub-Baskets saved separately remain in Configuration if you cancel or item creation fails.</p>}
          {basketNotice ? <InlineMessage tone="success" role="status">{basketNotice}</InlineMessage> : null}
          {baskets.isPending ? <p role="status">Loading Main Baskets…</p> : null}
          {baskets.isError ? <InlineMessage tone="error" role="alert">Main Baskets could not be loaded. <Button type="button" variant="quiet" onClick={() => void baskets.refetch()}>Retry Main Baskets</Button></InlineMessage> : null}
          {baskets.isSuccess && activeBaskets.length === 0 ? <InlineMessage tone="info">{inlineBasketCreation
            ? "No Main Baskets are available. Choose Add Main Basket in the dropdown to continue."
            : related ? "Create a Main Basket from Configuration before adding a related item."
              : "Create a Main Basket from Configuration before adding a Main Line."}</InlineMessage> : null}
          <Field id="item-basket" label="Main basket" required error={fieldErrors?.basketId} describedBy={errorDescription}>
            {(props) => <Select {...props} ref={basketSelectRef} value={basketId} disabled={locked || addingBasket || addingSubBasket || (subItem && !canCreateBasket) || !baskets.data || baskets.isError} onChange={(event) => {
              if (event.target.value === ADD_MAIN_BASKET) { setAddingBasket(true); setBasketNotice(""); }
              else selectBasket(event.target.value);
            }}>
              <option value="">Select a basket</option>
              {activeBaskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
              {inlineBasketCreation && <option value={ADD_MAIN_BASKET}>Add Main Basket</option>}
            </Select>}
          </Field>
          {inlineBasketCreation && addingBasket ? <CreateKnowledgeBasketFields onBusyChange={setBasketBusy} onRefreshError={reportRefreshWarning}
            onCancel={closeBasketCreation} onCreated={(basket, notice) => {
              setCreatedBasket(basket);
              onBasketCreated?.(basket);
              selectBasket(basket.id);
              setBasketNotice(notice);
              closeBasketCreation();
            }} /> : null}
          {basketId && subBaskets.isPending ? <p role="status">Loading Sub-Baskets…</p> : null}
          {basketId && subBaskets.isError ? <InlineMessage tone="error" role="alert">Sub-Baskets could not be loaded. <Button type="button" variant="quiet" onClick={() => void subBaskets.refetch()}>Retry Sub-Baskets</Button></InlineMessage> : null}
          {basketId && subBaskets.isSuccess && availableSubBaskets.length === 0 ? <p>No Sub-Baskets are available in this Main Basket.</p> : null}
          {subBaskets.isSuccess && subBasketId && !combinedSubBasket && !validSubBasket ? <InlineMessage tone="warning" role="alert">The selected Sub-Basket is no longer available. Choose an available Sub-Basket or another Main Basket before adding this item.</InlineMessage> : null}
          <Field id="item-sub-basket" label="Sub basket" required={requiresSubBasket} error={fieldErrors?.subBasketId} describedBy={errorDescription}>
            {(props) => <Select {...props} ref={subBasketSelectRef} value={subBasketId} disabled={locked || addingBasket || addingSubBasket || keepsSubItemParent || !basketId || !subBaskets.isSuccess} onChange={(event) => {
              if (event.target.value === ADD_SUB_BASKET) { setAddingSubBasket(true); setBasketNotice(""); }
              else { setSubBasketId(event.target.value); clearFailure(); }
            }}>
              <option value="">{requiresSubBasket ? "Select a Sub-Basket" : "Directly under Main Basket"}</option>
              {availableSubBaskets.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              {createsSubBasketTarget && <option value={CREATE_SUB_BASKET_WITH_ITEM}>Create Sub-Basket with this item</option>}
              {canCreateSubBasket && <option value={ADD_SUB_BASKET}>Add Sub-Basket</option>}
            </Select>}
          </Field>
          {combinedSubBasket && !addingSubBasket && <>
            <Field id="item-new-sub-basket" label="New Sub-Basket name" required error={fieldErrors?.subBasketName} describedBy={errorDescription}>
              {(props) => <Input {...props} maxLength={240} value={subBasketName} disabled={locked || addingBasket || addingSubBasket} onChange={(event) => { setSubBasketName(event.target.value); clearFailure(); }} />}
            </Field>
            <p>This Sub-Basket is saved together with the temporary item. Both changes are cancelled if that save fails.</p>
          </>}
          {addingSubBasket && canCreateSubBasket ? <CreateKnowledgeSubBasketFields key={basketId} basketId={basketId} initialName={subBasketName} onBusyChange={setBasketBusy}
            onCancel={closeSubBasketCreation} onCreated={(group, notice) => {
              setCreatedSubBasket(group);
              setSubBasketId(group.id);
              setBasketNotice(notice);
              clearFailure();
              closeSubBasketCreation();
            }} onRefreshError={reportRefreshWarning} /> : null}
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
