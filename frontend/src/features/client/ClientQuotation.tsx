import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { calculateDimensionQuantity, type EstimateDimensions } from "../../../../shared/estimation/estimateDimensions";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { EstimateDimensionsFields, emptyEstimateDimensions } from "../leads/EstimateDimensionsFields";
import { refreshEstimateCollaboration } from "../leads/estimateCollaborationQueries";
import { useQuotationRevision } from "../leads/useQuotationRevision";
import { getQuotation, getQuotationCandidates, quotationKeys, saveQuotation, type QuotationCandidate, type QuotationDetail, type QuotationLine, type QuotationOperation } from "./quotationApi";
import "./clientQuotation.css";

interface ItemDraft {
  line: QuotationLine;
  kind: "add" | "update";
  quantity: string;
  modeTier: KnowledgeModeTier;
  components: string[];
  dimensions: EstimateDimensions;
  included: boolean;
}
interface QuotationDraft { version: number; items: Record<string, ItemDraft> }
const money = (paise: number | null) => paise == null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const draftItem = (line: QuotationLine, kind: ItemDraft["kind"] = "update"): ItemDraft => ({
  line, kind, quantity: String(line.quantity), modeTier: line.modeTier, components: line.selectedInHouseComponentIds ?? [],
  dimensions: line.dimensions ?? emptyEstimateDimensions(), included: line.included
});
const reviewCopy: Record<QuotationDetail["reviewState"], string> = {
  draft: "Your team is preparing this quotation.",
  awaiting_staff_review: "Saved changes. Your team will review and send the updated quotation for approval.",
  ready_for_approval: "Ready for your approval. Saving changes will send the revised quotation back to your team for review.",
  approved: "Estimation complete. The quotation is locked."
};

function operationFor(item: ItemDraft): QuotationOperation {
  const choice = item.line.choices.find(value => value.modeTier === item.modeTier);
  if (!item.line.source || item.included && (!choice?.available || !choice.source)) throw new Error(`Refresh the configured options for ${item.line.mainLineName}.`);
  let quantity = Number(item.quantity);
  if (item.included && item.line.dimensionsMandatory) {
    const measured = calculateDimensionQuantity(item.line.dimensionRule, item.dimensions);
    if (!measured) throw new Error(`Enter valid dimensions for ${item.line.mainLineName}.`);
    quantity = measured.quantity;
  }
  if (item.included && (!item.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0)) throw new Error(`Enter a positive quantity for ${item.line.mainLineName}.`);
  if (item.included && choice?.inHouseComponents && (!item.components.length || item.components.some(id => !choice.inHouseComponents!.some(component => component.id === id && component.available)))) {
    throw new Error(`Select available components for ${item.line.mainLineName}.`);
  }
  const source = choice?.source ?? item.line.source;
  if (!item.included && item.kind === "update") return { kind: "update", lineItemId: item.line.id, source, included: false };
  const selection = { source, quantity, modeTier: item.modeTier,
    ...(item.line.dimensionsMandatory ? { dimensions: item.dimensions } : {}),
    ...(choice?.inHouseComponents ? { selectedInHouseComponentIds: item.components } : {}) };
  return item.kind === "add" ? { kind: "add", mainLineId: item.line.mainLineId, roomId: item.line.roomId, ...selection }
    : { kind: "update", lineItemId: item.line.id, included: item.included, ...selection };
}

export function ClientQuotation({ projectId, onPendingChanges }: { projectId: string; onPendingChanges?: (pending: boolean) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: quotationKeys.detail(projectId), queryFn: () => getQuotation(projectId), retry: false });
  const revision = useQuotationRevision(projectId, true, query.data?.estimateVersion);
  const [draft, setDraft] = useState<QuotationDraft | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState("");
  const [conflict, setConflict] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  useEffect(() => () => { onPendingChanges?.(false); }, [onPendingChanges]);
  const save = useMutation({
    mutationFn: (input: { version: number; operations: QuotationOperation[] }) => saveQuotation(projectId, input.version, input.operations),
    onSuccess: async detail => {
      client.setQueryData<QuotationDetail>(quotationKeys.detail(projectId), current =>
        (current?.estimateVersion ?? -1) > (detail.estimateVersion ?? -1) ? current : detail);
      setDraft(null); setConflict(false); setValidation("");
      setNotice("Changes saved. Your team will review the revised quotation before approval.");
      await refreshEstimateCollaboration(client);
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) setConflict(true);
      await query.refetch();
    },
    onSettled: () => { inFlight.current = false; }
  });
  useEffect(() => { onPendingChanges?.(Boolean(draft) || save.isPending); }, [Boolean(draft), save.isPending, onPendingChanges]);
  const reset = async () => {
    const refreshed = await query.refetch();
    if (refreshed.isSuccess) { setDraft(null); setConflict(false); setValidation(""); save.reset(); }
  };
  if (query.isPending) return <section className="client-quotation" aria-label="Quotation"><h2>Quotation</h2><p role="status">Loading your quotation…</p></section>;
  if (query.isError || !query.data) return <section className="client-quotation" aria-label="Quotation"><h2>Quotation</h2><p role="alert">Your quotation could not be loaded. Refresh before making changes.</p><Button variant="secondary" onClick={() => void query.refetch()}>Refresh quotation</Button></section>;
  const detail = query.data;
  const stale = conflict || Boolean(draft && draft.version !== detail.estimateVersion);
  const canEdit = detail.editingAllowed && detail.estimateVersion !== null && !query.isFetching && !save.isPending && !revision.isError && !stale;
  const changedItems = Object.values(draft?.items ?? {});
  const addedItems = changedItems.filter(item => item.kind === "add");
  const change = (line: QuotationLine, update: Partial<ItemDraft>) => {
    if (!canEdit) return;
    setNotice(""); setValidation(""); save.reset();
    setDraft(previous => ({ version: previous?.version ?? detail.estimateVersion!, items: {
      ...previous?.items, [line.id]: { ...(previous?.items[line.id] ?? draftItem(line)), ...update }
    } }));
  };
  const add = (item: ItemDraft) => {
    if (!canEdit) return;
    setDraft(previous => ({ version: previous?.version ?? detail.estimateVersion!, items: { ...previous?.items, [item.line.id]: item } }));
    setAdding(false); setNotice(""); setValidation("");
  };
  const submit = () => {
    if (!draft || !canEdit || inFlight.current) return;
    try {
      const operations = changedItems.filter(item => item.kind !== "add" || item.included).map(operationFor);
      if (!operations.length) { setDraft(null); return; }
      inFlight.current = true; setValidation(""); setNotice(""); save.mutate({ version: draft.version, operations });
    } catch (error) { setValidation(error instanceof Error ? error.message : "Review your changes before saving."); }
  };
  return <section className="client-quotation" aria-labelledby={`quotation-${projectId}`} ref={sectionRef} tabIndex={-1}>
    <header className="client-quotation__header"><div><p className="eyebrow">{detail.phase === "pre" ? "Pre-design approval" : "Post-design approval"}</p><h2 id={`quotation-${projectId}`}>{detail.phase === "post" ? "Designer-revised quotation" : "Your quotation"}</h2></div>
      <dl><dt>Saved total including GST</dt><dd>{detail.isIncomplete ? "Incomplete" : money(detail.totalPaise)}</dd></dl></header>
    <p role="status">{notice || reviewCopy[detail.reviewState]}</p>
    {!detail.editingAllowed && detail.reviewState !== "approved" ? <p>{detail.editingBlockReason === "not_started" ? "Your team has not started the quotation yet." : "Editing is unavailable for the current review stage."}</p> : null}
    {revision.isError ? <p role="alert">Updates could not be checked. Your changes are preserved. <Button variant="secondary" onClick={() => void revision.refetch()}>Retry updates</Button></p> : null}
    {stale ? <div role="alert"><p>The quotation changed elsewhere. Your unsaved changes are preserved. Review them before loading the latest quotation.</p><Button variant="secondary" disabled={save.isPending || query.isFetching} onClick={() => void reset()}>Load latest quotation and discard changes</Button></div> : null}
    {save.isError ? <p role="alert">{save.error instanceof ApiError ? save.error.message : "Your changes could not be saved. Try again."}</p> : null}
    {validation ? <p role="alert">{validation}</p> : null}
    {!detail.lines.length && !addedItems.length ? <p>No items are currently available for you to edit.</p> : null}
    {[...detail.lines, ...addedItems.map(item => item.line)].map(line => {
      const item = draft?.items[line.id] ?? draftItem(line);
      return <fieldset className="client-quotation__item" key={line.id} disabled={!canEdit}>
        <legend>{line.mainLineName} <span>{line.roomName}</span></legend>
        <div className="client-quotation__item-top"><label><input type="checkbox" checked={item.included} onChange={event => change(line, { included: event.target.checked })} /> Include {line.mainLineName} in {line.roomName}</label>
          {item.kind === "update" ? <p>Saved amount <strong>{money(line.amountPaise)}</strong></p> : <p>Added to your changes</p>}</div>
        {item.included ? <ItemFields item={item} disabled={!canEdit} onChange={update => change(line, update)} /> : <p>Removed when you save.</p>}
      </fieldset>;
    })}
    <div className="client-quotation__actions">
      {detail.editingAllowed ? <Button ref={triggerRef} variant="secondary" disabled={!canEdit || !detail.rooms.length} onClick={() => setAdding(true)}>Add item</Button> : null}
      {draft ? <><Button disabled={!canEdit} busy={save.isPending} onClick={submit}>Save changes</Button><Button variant="secondary" disabled={save.isPending} onClick={() => { setDraft(null); setConflict(false); setValidation(""); save.reset(); }}>Discard changes</Button></> : null}
    </div>
    {draft ? <p className="client-quotation__hint">Rates are set by Configuration. The saved total updates after your changes are priced by the server.</p> : null}
    {adding ? <AddQuotationItem projectId={projectId} rooms={detail.rooms} existing={[...detail.lines, ...addedItems.map(item => item.line)]} disabled={!canEdit}
      onAdd={add} onClose={() => setAdding(false)} triggerRef={triggerRef} fallbackRef={sectionRef} /> : null}
  </section>;
}

function ItemFields({ item, disabled, onChange }: { item: ItemDraft; disabled: boolean; onChange: (update: Partial<ItemDraft>) => void }) {
  const line = item.line;
  const label = `${line.mainLineName} in ${line.roomName}`;
  const choice = line.choices.find(value => value.modeTier === item.modeTier);
  return <div className="client-quotation__fields">
    {line.dimensionsMandatory ? line.dimensionRule ? <EstimateDimensionsFields label={label} dimensions={item.dimensions} rule={line.dimensionRule} quantityUnit={line.uomName}
      disabled={disabled} onChange={dimensions => onChange({ dimensions })} /> : <p role="status">Dimensions are unavailable until your team reviews the configured unit.</p>
      : <label>Quantity for {label}<input type="number" inputMode="decimal" min="0" step="any" value={item.quantity} disabled={disabled} onChange={event => onChange({ quantity: event.target.value })} /><span>{line.uomName}</span></label>}
    <label>Configured option for {label}<select value={item.modeTier} disabled={disabled} onChange={event => onChange({ modeTier: event.target.value as KnowledgeModeTier, components: [] })}>
      {line.choices.map(option => <option key={option.modeTier} value={option.modeTier} disabled={!option.available || !option.source}>{KNOWLEDGE_MODE_TIER_LABELS[option.modeTier]}{option.available ? "" : " (unavailable)"}</option>)}
    </select></label>
    <p>Rate <strong>{choice?.inHouseComponents ? "Calculated from components" : money(choice?.ratePaise ?? null)}</strong>{!choice?.inHouseComponents && choice?.ratePaise != null ? ` / ${line.uomName}` : ""}</p>
    {choice?.inHouseComponents ? <fieldset className="client-quotation__components" disabled={disabled}><legend>Components for {label}</legend>{choice.inHouseComponents.map(component => <label key={component.id}>
      <input type="checkbox" checked={item.components.includes(component.id)} disabled={!component.available && !item.components.includes(component.id)} onChange={event => onChange({ components: event.target.checked ? [...item.components, component.id] : item.components.filter(id => id !== component.id) })} />{component.label}{!component.available ? " (unavailable)" : ""}
    </label>)}</fieldset> : null}
  </div>;
}

function AddQuotationItem({ projectId, rooms, existing, disabled, onAdd, onClose, triggerRef, fallbackRef }: {
  projectId: string; rooms: QuotationDetail["rooms"]; existing: QuotationLine[]; disabled: boolean;
  onAdd: (item: ItemDraft) => void; onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>; fallbackRef: React.RefObject<HTMLElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [item, setItem] = useState<ItemDraft | null>(null);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const candidates = useQuery({ queryKey: quotationKeys.items(projectId, search, offset), queryFn: () => getQuotationCandidates(projectId, search, offset), retry: false });
  const choose = (candidate: QuotationCandidate) => {
    const room = rooms.find(value => value.id === roomId);
    if (!room) return;
    setError("");
    setItem(draftItem({ id: `new-${crypto.randomUUID()}`, mainLineId: candidate.mainLineId, mainLineName: candidate.name, roomId, roomName: room.name,
      included: true, source: candidate.source, dimensionsMandatory: candidate.dimensionsMandatory, dimensionRule: candidate.dimensionRule,
      uomName: candidate.uomName, choices: candidate.choices, pricingMode: candidate.pricingMode, modeTier: candidate.modeTier,
      ratePaise: null, amountPaise: null, quantity: 1 }, "add"));
  };
  const duplicate = Boolean(item && existing.some(line => line.roomId === roomId && line.mainLineId === item.line.mainLineId));
  return <Dialog title="Add quotation item" onClose={onClose} initialFocusRef={searchRef} returnFocusRef={triggerRef} fallbackFocusRef={fallbackRef}>
    <form className="ui-dialog__form" onSubmit={event => {
      event.preventDefault(); if (!item || disabled || duplicate) return;
      try { operationFor(item); onAdd(item); } catch (reason) { setError(reason instanceof Error ? reason.message : "Review the selected item."); }
    }}><div className="ui-dialog__body client-quotation__add">
      <label>Room<select value={roomId} onChange={event => { setRoomId(event.target.value); setItem(null); setError(""); }}>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
      <label>Search items<input ref={searchRef} type="search" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></label>
      {candidates.isPending ? <p role="status">Loading items…</p> : candidates.isError ? <p role="alert">Items could not be loaded. <Button variant="secondary" onClick={() => void candidates.refetch()}>Retry items</Button></p> : <>
        <label>Item<select value={item && candidates.data.items.some(candidate => candidate.mainLineId === item.line.mainLineId) ? item.line.mainLineId : ""} onChange={event => { const candidate = candidates.data.items.find(value => value.mainLineId === event.target.value); if (candidate) choose(candidate); }}>
          <option value="">Select an item</option>{candidates.data.items.map(candidate => <option key={candidate.mainLineId} value={candidate.mainLineId}>{candidate.name}</option>)}</select></label>
        {!candidates.data.items.length ? <p>No matching items.</p> : null}
        {candidates.data.total > candidates.data.limit ? <div className="client-quotation__actions"><Button variant="secondary" disabled={offset === 0 || candidates.isFetching} onClick={() => setOffset(Math.max(0, offset - candidates.data.limit))}>Previous items</Button><Button variant="secondary" disabled={offset + candidates.data.limit >= candidates.data.total || candidates.isFetching} onClick={() => setOffset(offset + candidates.data.limit)}>Next items</Button></div> : null}
      </>}
      {item ? <ItemFields item={item} disabled={disabled} onChange={update => setItem({ ...item, ...update })} /> : null}
      {duplicate ? <p role="status">This item is already in the quotation for this room. Edit its quantity or include it there.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div><div className="ui-dialog__actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!item || disabled || duplicate || candidates.isError}>Add to changes</Button></div></form>
  </Dialog>;
}
