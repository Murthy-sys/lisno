import { useQueries, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { CreateKnowledgeBasketFields } from "../ai-estimator-knowledge/CreateKnowledgeBasketFields";
import { CreateKnowledgeSubBasketFields } from "../ai-estimator-knowledge/CreateKnowledgeSubBasketFields";
import { listKnowledgeBaskets, listKnowledgeSubBaskets } from "../ai-estimator-knowledge/knowledgeApi";
import { collectAllKnowledgeMasterPages } from "../ai-estimator-knowledge/knowledgeMasterPagination";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeBasket, KnowledgeSubBasket, ProcurementVendorSummary } from "../ai-estimator-knowledge/knowledgeTypes";
import { VENDOR_BASKET_SELECTION_LIMITS } from "./vendorProfileDraft";

type Adding = { kind: "main" } | { kind: "sub"; parentId: string } | null;

export function VendorBasketFields({ mainBasketIds, subBasketIds, original, errors, canCreate, disabled, readOnly = false, onChange, onBusyChange, onDraftChange, onCatalogBlockedChange }: {
  mainBasketIds: string[]; subBasketIds: string[]; original?: ProcurementVendorSummary; errors: Record<string, string>;
  canCreate: boolean; disabled: boolean; readOnly?: boolean; onChange: (main: string[], sub: string[]) => void;
  onBusyChange: (busy: boolean) => void; onDraftChange: (dirty: boolean) => void; onCatalogBlockedChange: (blocked: boolean) => void;
}) {
  const id = useId();
  const [adding, setAdding] = useState<Adding>(null);
  const [createParentId, setCreateParentId] = useState("");
  const [addedMains, setAddedMains] = useState<KnowledgeBasket[]>([]);
  const [addedSubs, setAddedSubs] = useState<KnowledgeSubBasket[]>([]);
  const [notice, setNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [openPicker, setOpenPicker] = useState<"main" | "sub" | null>(null);
  const mainPicker = useRef<HTMLDivElement>(null);
  const subPicker = useRef<HTMLDivElement>(null);
  const mainTrigger = useRef<HTMLButtonElement>(null);
  const subTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { onDraftChange(Boolean(adding)); return () => onDraftChange(false); }, [adding, onDraftChange]);
  useEffect(() => {
    if (!openPicker) return;
    function dismissOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!mainPicker.current?.contains(target) && !subPicker.current?.contains(target)) setOpenPicker(null);
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [openPicker]);

  const baskets = useQuery({ queryKey: [...knowledgeQueryKeys.basketLists(), "vendor-active-catalog"], queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets({ ...page, status: "active" }), "Main Basket") });
  const mainOptions = [...(baskets.data?.items ?? [])];
  for (const basket of addedMains) if (!mainOptions.some((option) => option.id === basket.id)) mainOptions.push(basket);
  const activeMainIds = mainBasketIds.filter((basketId) => mainOptions.some((basket) => basket.id === basketId));
  const subQueries = useQueries({ queries: activeMainIds.map((basketId) => ({
    queryKey: [...knowledgeQueryKeys.subBasketLists(basketId), "vendor-catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeSubBaskets(basketId, page), "Sub Basket")
  })) });
  const catalogBlocked = baskets.isPending || baskets.isError || subQueries.some((query) => query.isPending || query.isError) || Boolean(refreshError);
  useEffect(() => { onCatalogBlockedChange(catalogBlocked); return () => onCatalogBlockedChange(false); }, [catalogBlocked, onCatalogBlockedChange]);

  const savedMains = original?.mainBaskets?.length ? original.mainBaskets : original?.mainBasket ? [original.mainBasket] : [];
  const savedSubs = original?.subBaskets?.length ? original.subBaskets : original?.subBasket && original.mainBasket
    ? [{ ...original.subBasket, basketId: original.mainBasket.id }] : [];
  const allSubs = [...subQueries.flatMap((query) => query.data?.items ?? []), ...addedSubs];
  const subParent = new Map<string, string | null>([...savedSubs, ...allSubs].map((sub) => [sub.id, sub.basketId]));
  const savedMainName = (basketId: string) => savedMains.find((basket) => basket.id === basketId)?.name ?? null;
  const mainName = (basketId: string) => mainOptions.find((basket) => basket.id === basketId)?.name ?? savedMainName(basketId) ?? `Unavailable Main Basket (${basketId})`;
  const selectedUnavailableMains = mainBasketIds.filter((basketId) => !mainOptions.some((basket) => basket.id === basketId));
  const shownMains = [...mainOptions, ...selectedUnavailableMains.map((basketId) => ({ id: basketId, name: mainName(basketId) }))];
  const selectedActiveMains = activeMainIds.map((basketId) => ({ id: basketId, name: mainName(basketId) }));
  const targetParentId = selectedActiveMains.length === 1 ? selectedActiveMains[0].id : selectedActiveMains.some((basket) => basket.id === createParentId) ? createParentId : "";
  const hasCatalogError = baskets.isError || subQueries.some((query) => query.isError) || Boolean(refreshError);
  const emitChange = (main: string[], sub: string[]) => onChange([...main].sort(), [...sub].sort());
  const mainSelection = mainBasketIds.map(mainName).join(", ");
  const selectedSubs = subBasketIds.map((subId) => {
    const sub = allSubs.find((option) => option.id === subId) ?? savedSubs.find((option) => option.id === subId);
    return { name: sub?.name ?? `Unavailable Sub Basket (${subId})`, parentId: subParent.get(subId) };
  });
  const subNameCounts = new Map<string, number>();
  for (const sub of selectedSubs) subNameCounts.set(sub.name, (subNameCounts.get(sub.name) ?? 0) + 1);
  const subSelection = selectedSubs.map(({ name, parentId }) => `${name}${(subNameCounts.get(name) ?? 0) > 1 && parentId ? ` (${mainName(parentId)})` : ""}`).join(", ");
  function handlePickerBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenPicker(null);
  }
  function handlePickerKeyDown(event: KeyboardEvent<HTMLDivElement>, picker: "main" | "sub") {
    if (event.key !== "Escape" || openPicker !== picker) return;
    event.preventDefault(); event.stopPropagation(); setOpenPicker(null);
    (picker === "main" ? mainTrigger : subTrigger).current?.focus();
  }
  function focusPickerChoice(picker: "main" | "sub") {
    requestAnimationFrame(() => {
      const panel = (picker === "main" ? mainPicker : subPicker).current?.querySelector<HTMLElement>('[role="dialog"]');
      const choice = panel?.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:disabled)');
      (choice ?? panel)?.focus();
    });
  }
  function openWithKeyboard(picker: "main" | "sub") {
    setOpenPicker(picker);
    focusPickerChoice(picker);
  }
  function togglePicker(picker: "main" | "sub", keyboard: boolean) {
    const opening = openPicker !== picker;
    setOpenPicker(opening ? picker : null);
    if (opening && keyboard) focusPickerChoice(picker);
  }

  function toggleMain(basketId: string, checked: boolean) {
    const main = checked ? [...mainBasketIds, basketId] : mainBasketIds.filter((id) => id !== basketId);
    const sub = checked ? subBasketIds : subBasketIds.filter((id) => subParent.get(id) !== basketId);
    if (!checked) {
      const removed = subBasketIds.length - sub.length;
      setNotice(removed ? `${mainName(basketId)} removed. ${removed} selected ${removed === 1 ? "Sub Basket was" : "Sub Baskets were"} also removed from this draft.` : `${mainName(basketId)} removed from this draft.`);
    } else setNotice("");
    emitChange(main, sub);
  }
  function toggleSub(subBasketId: string, checked: boolean) {
    emitChange(mainBasketIds, checked ? [...subBasketIds, subBasketId] : subBasketIds.filter((id) => id !== subBasketId));
    setNotice("");
  }
  async function retryCatalog() {
    const results = await Promise.all([baskets.refetch(), ...subQueries.map((query) => query.refetch())]);
    if (results.every((result) => !result.isError)) setRefreshError("");
  }
  const unavailableSubIds = subBasketIds.filter((subId) => !subParent.has(subId) || subParent.get(subId) === null || !mainBasketIds.includes(subParent.get(subId)!));

  return <div className="vendor-profile__basket-rows">
    <div className="vendor-profile__basket-row">
      <div className="vendor-profile__basket-picker" ref={mainPicker} onBlur={handlePickerBlur} onKeyDown={(event) => handlePickerKeyDown(event, "main")}>
      <fieldset className="vendor-profile__basket-group">
        <legend>Main Baskets <span className="ui-field__required" aria-hidden="true">*</span></legend>
        <p id={`${id}-main-hint`} className="ui-field__hint">Shared with Configuration. Choose all categories this vendor supplies.</p>
        <button ref={mainTrigger} type="button" className="vendor-profile__basket-trigger" aria-label={`Main Baskets, ${mainBasketIds.length} selected${mainSelection ? `: ${mainSelection}` : ""}`} aria-haspopup="dialog" aria-expanded={openPicker === "main"} aria-controls={openPicker === "main" ? `${id}-main-options` : undefined} aria-invalid={errors.mainBasketIds ? true : undefined} aria-describedby={[`${id}-main-hint`, errors.mainBasketIds ? `${id}-main-error` : ""].filter(Boolean).join(" ")} disabled={disabled || adding !== null} onClick={(event) => togglePicker("main", event.detail === 0)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); openWithKeyboard("main"); } }}>
          <span className="vendor-profile__basket-trigger-selection" title={mainSelection}>{mainSelection || "Select Main Baskets"}</span><span className="vendor-profile__basket-trigger-count">{mainBasketIds.length} selected</span><span className="vendor-profile__basket-trigger-caret" aria-hidden="true" />
        </button>
        {openPicker === "main" ? <div className="vendor-profile__basket-panel" id={`${id}-main-options`} role="dialog" aria-label="Main Basket choices" tabIndex={-1}><div className="vendor-profile__basket-options">
          {shownMains.map((basket) => {
            const checked = mainBasketIds.includes(basket.id);
            const unavailable = !mainOptions.some((option) => option.id === basket.id);
            return <label key={basket.id} className="vendor-profile__basket-option">
              <Checkbox aria-label={basket.name} aria-describedby={unavailable ? `${id}-main-${basket.id}-status` : undefined} checked={checked} disabled={disabled || readOnly || adding !== null || baskets.isPending || baskets.isError || (unavailable && !checked) || (!checked && mainBasketIds.length >= VENDOR_BASKET_SELECTION_LIMITS.main)} onChange={(event) => toggleMain(basket.id, event.target.checked)} />
              <span>{basket.name}{unavailable ? <small id={`${id}-main-${basket.id}-status`}>Unavailable for new selections</small> : null}</span>
            </label>;
          })}
          {baskets.isPending ? <p role="status">Loading Main Baskets…</p> : null}
          {!baskets.isPending && !baskets.isError && !shownMains.length ? <p>No active Main Baskets are available.</p> : null}
        </div></div> : null}
        {errors.mainBasketIds ? <p className="ui-field__error" id={`${id}-main-error`}>{errors.mainBasketIds}</p> : null}
      </fieldset>
      </div>
      {canCreate && !adding ? <Button variant="secondary" size="compact" disabled={disabled} onClick={() => { setOpenPicker(null); setAdding({ kind: "main" }); }} leadingIcon={<Plus aria-hidden="true" />}>Add Main Basket</Button> : null}
    </div>
    <div className="vendor-profile__basket-row">
      <div className="vendor-profile__basket-picker" ref={subPicker} onBlur={handlePickerBlur} onKeyDown={(event) => handlePickerKeyDown(event, "sub")}>
      <fieldset className="vendor-profile__basket-group">
        <legend>Sub Baskets <span className="ui-field__required" aria-hidden="true">*</span></legend>
        <p id={`${id}-sub-hint`} className="ui-field__hint">Choose one or more across the selected Main Baskets.</p>
        <button ref={subTrigger} type="button" className="vendor-profile__basket-trigger" aria-label={`Sub Baskets, ${subBasketIds.length} selected${subSelection ? `: ${subSelection}` : ""}`} aria-haspopup="dialog" aria-expanded={openPicker === "sub"} aria-controls={openPicker === "sub" ? `${id}-sub-options` : undefined} aria-invalid={errors.subBasketIds ? true : undefined} aria-describedby={[`${id}-sub-hint`, errors.subBasketIds ? `${id}-sub-error` : ""].filter(Boolean).join(" ")} disabled={disabled || adding !== null} onClick={(event) => togglePicker("sub", event.detail === 0)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); openWithKeyboard("sub"); } }}>
          <span className="vendor-profile__basket-trigger-selection" title={subSelection}>{subSelection || "Select Sub Baskets"}</span><span className="vendor-profile__basket-trigger-count">{subBasketIds.length} selected</span><span className="vendor-profile__basket-trigger-caret" aria-hidden="true" />
        </button>
        {openPicker === "sub" ? <div className="vendor-profile__basket-panel" id={`${id}-sub-options`} role="dialog" aria-label="Sub Basket choices" tabIndex={-1}><div className="vendor-profile__basket-sub-groups">
          {!mainBasketIds.length ? <p>Select a Main Basket first.</p> : mainBasketIds.map((basketId) => {
            const subQuery = subQueries[activeMainIds.indexOf(basketId)];
            const options = allSubs.filter((sub) => sub.basketId === basketId);
            const retained = subBasketIds.filter((subId) => subParent.get(subId) === basketId && !options.some((sub) => sub.id === subId));
            const rows = [...options.map((sub) => ({ id: sub.id, name: sub.name, unavailable: false })),
              ...retained.map((subId) => ({ id: subId, name: savedSubs.find((sub) => sub.id === subId)?.name ?? `Unavailable Sub Basket (${subId})`, unavailable: true }))];
            return <fieldset key={basketId} className="vendor-profile__basket-sub-group"><legend>{mainName(basketId)}</legend>
              {rows.map((sub) => <label key={sub.id} className="vendor-profile__basket-option">
                <Checkbox aria-label={`${sub.name ?? "Unavailable Sub Basket"} in ${mainName(basketId)}`} aria-describedby={sub.unavailable ? `${id}-sub-${sub.id}-status` : undefined} checked={subBasketIds.includes(sub.id)} disabled={disabled || readOnly || adding !== null || Boolean(subQuery?.isPending || subQuery?.isError) || (sub.unavailable && !subBasketIds.includes(sub.id)) || (!subBasketIds.includes(sub.id) && subBasketIds.length >= VENDOR_BASKET_SELECTION_LIMITS.sub)} onChange={(event) => toggleSub(sub.id, event.target.checked)} />
                <span>{sub.name ?? `Unavailable Sub Basket (${sub.id})`}{sub.unavailable ? <small id={`${id}-sub-${sub.id}-status`}>Unavailable for new selections</small> : null}</span>
              </label>)}
              {subQuery?.isPending ? <p role="status">Loading Sub Baskets in {mainName(basketId)}…</p> : null}
              {!subQuery?.isPending && !subQuery?.isError && !rows.length ? <p>No Sub Baskets are available in this Main Basket.</p> : null}
            </fieldset>;
          })}
          {unavailableSubIds.length ? <fieldset className="vendor-profile__basket-sub-group"><legend>Unavailable parent</legend>{unavailableSubIds.map((subId) => {
            const saved = savedSubs.find((sub) => sub.id === subId);
            return <label key={subId} className="vendor-profile__basket-option"><Checkbox aria-label={`${saved?.name ?? `Unavailable Sub Basket (${subId})`} with unavailable parent`} aria-describedby={`${id}-sub-${subId}-status`} checked disabled={disabled || readOnly || adding !== null} onChange={() => toggleSub(subId, false)} /><span>{saved?.name ?? `Unavailable Sub Basket (${subId})`}<small id={`${id}-sub-${subId}-status`}>Unavailable for new selections</small></span></label>;
          })}</fieldset> : null}
        </div></div> : null}
        {errors.subBasketIds ? <p className="ui-field__error" id={`${id}-sub-error`}>{errors.subBasketIds}</p> : null}
      </fieldset>
      </div>
      {canCreate && !adding ? <div className="vendor-profile__basket-create">
        {selectedActiveMains.length > 1 ? <Field id={`${id}-create-parent`} label="Create under Main Basket">{(props) => <Select {...props} disabled={disabled} value={targetParentId} onChange={(event) => setCreateParentId(event.target.value)}><option value="">Choose Main Basket</option>{selectedActiveMains.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</Select>}</Field> : null}
        <Button variant="secondary" size="compact" disabled={disabled || !targetParentId} onClick={() => { setOpenPicker(null); setAdding({ kind: "sub", parentId: targetParentId }); }} leadingIcon={<Plus aria-hidden="true" />}>Add Sub Basket</Button>
      </div> : null}
    </div>
    {hasCatalogError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void retryCatalog()}>Retry baskets</Button>}>{refreshError || "The shared basket list could not be loaded. Your vendor entries are preserved."}</InlineMessage> : null}
    {adding?.kind === "main" ? <CreateKnowledgeBasketFields onBusyChange={onBusyChange} onCancel={() => setAdding(null)} onRefreshError={(message) => setRefreshError(message)} onCreated={(basket, message) => { setAddedMains((current) => [...current, basket]); emitChange([...mainBasketIds, basket.id], subBasketIds); setAdding(null); setNotice(message); }} /> : null}
    {adding?.kind === "sub" ? <div className="vendor-profile__basket-inline"><p>Creating in {mainName(adding.parentId)}</p><CreateKnowledgeSubBasketFields key={adding.parentId} basketId={adding.parentId} onBusyChange={onBusyChange} onCancel={() => setAdding(null)} onRefreshError={(message) => setRefreshError(message)} onCreated={(sub, message) => { setAddedSubs((current) => [...current, sub]); emitChange(mainBasketIds, [...subBasketIds, sub.id]); setAdding(null); setNotice(message); }} /></div> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </div>;
}
