import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { EstimateSetupFields } from "../estimates/EstimateSetupFields";
import { EstimateSetupBaskets } from "../estimates/EstimateSetupBaskets";
import { MainBasketSelectionCard } from "../leads/MainBasketSelectionCard";
import { getEstimateRoomDefinitions, getRoomIcon, mergeSelectedRoomDefinitions, parseBedroomCount, requiresBedroomCount } from "../leads/estimateRoomOptions";
import { propertyTypes } from "../leads/propertyTypes";
import type { RoomOption } from "../leads/RoomsMultiSelectDropdown";
import type { QuotationConfigureOperation, QuotationDetail, QuotationSetup, QuotationSetupCatalogue } from "./quotationApi";

export interface ClientQuotationSetupProps {
  detail: QuotationDetail;
  catalogue?: QuotationSetupCatalogue;
  value: QuotationConfigureOperation | null;
  disabled: boolean;
  busy: boolean;
  loading?: boolean;
  refreshing?: boolean;
  catalogueError?: string | null;
  recoveryActions?: ReactNode;
  onRefresh: () => void;
  onChange: (value: QuotationConfigureOperation) => void;
  onSave: (continueToItems: boolean) => void;
  onCancel: () => void;
}

function operationFromSetup(setup: QuotationSetup): QuotationConfigureOperation {
  return {
    kind: "configure", sourceToken: setup.sourceToken, propertyType: setup.propertyType, bedroomCount: setup.bedroomCount,
    rooms: setup.rooms.map(({ id, typeId, label, length, width }) => ({ id, typeId, label, length, width })),
    selectedMainBasketIds: [...setup.selectedMainBasketIds]
  };
}

type Removal = { next: QuotationConfigureOperation; roomIds: string[]; basketIds: string[]; labels: string[]; visibleItemCount: number };
const removalBlockedMessage = "This selection needs team review before it can be removed. Your changes are kept.";

/** Controlled draft adapter: the workspace owns mutations, version recovery and navigation guards. */
export function ClientQuotationSetup({
  detail, catalogue, value, disabled, busy, loading = false, refreshing = false,
  catalogueError, recoveryActions, onRefresh, onChange, onSave, onCancel
}: ClientQuotationSetupProps) {
  const catalogueMatches = Boolean(catalogue && catalogue.projectId === detail.projectId && catalogue.estimateId === detail.estimateId && catalogue.estimateVersion === detail.estimateVersion);
  const saved = catalogueMatches ? catalogue!.setup : detail.setup;
  const draft = value ?? (saved ? operationFromSetup(saved) : null);
  const [bedroomInput, setBedroomInput] = useState(() => draft?.bedroomCount?.toString() ?? "");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [removal, setRemoval] = useState<Removal | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const removalTriggerRef = useRef<HTMLElement | null>(null);
  const cancelRemovalRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (value === null) setBedroomInput(saved?.bedroomCount?.toString() ?? "");
  }, [value, saved?.bedroomCount]);

  const stale = Boolean(catalogue && (!catalogueMatches || value && value.sourceToken !== catalogue.setup.sourceToken));
  const controlsDisabled = disabled || busy || loading || refreshing || Boolean(catalogueError) || !detail.setup || !catalogueMatches || stale || !saved?.canConfigure || !detail.editingAllowed;
  const variableBedroomCount = requiresBedroomCount(draft?.propertyType ?? "");
  const bedroomCountRequired = variableBedroomCount && parseBedroomCount(bedroomInput) === null;
  const propertyValid = Boolean(draft?.propertyType && (propertyTypes.some((type) => type === draft.propertyType) || draft.propertyType === saved?.propertyType));
  const dimensionsInvalid = Boolean(draft?.rooms.some((room) => [room.length, room.width].some((dimension) => dimension !== null && (!Number.isFinite(dimension) || dimension <= 0 || dimension > 1000000))));

  const commit = (next: QuotationConfigureOperation) => {
    if (controlsDisabled) return;
    setNotice("");
    onChange(next);
  };
  const requestRemoval = (next: QuotationConfigureOperation, roomIds: string[], basketIds: string[]) => {
    if (controlsDisabled || !draft) return;
    const blocked = roomIds.some((id) => saved?.rooms.find((room) => room.id === id)?.canRemove === false) ||
      basketIds.some((id) => catalogue?.baskets.find((basket) => basket.id === id)?.canRemove !== true);
    if (blocked) { setNotice(removalBlockedMessage); return; }
    const affectedLines = detail.lines.filter((line) => line.included && (roomIds.includes(line.roomId) || Boolean(line.mainBasketId && basketIds.includes(line.mainBasketId))));
    if (!roomIds.length && !affectedLines.length) { commit(next); return; }
    removalTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const labels = [
      ...roomIds.map((id) => draft.rooms.find((room) => room.id === id)?.label).filter((label): label is string => Boolean(label)),
      ...basketIds.map((id) => catalogue?.baskets.find((basket) => basket.id === id)?.name).filter((label): label is string => Boolean(label))
    ];
    setRemoval({ next, roomIds, basketIds, labels, visibleItemCount: affectedLines.length });
  };

  const rooms = draft?.rooms ?? [];
  const roomTypeCounts = new Map<string, number>();
  rooms.forEach((room) => { if (room.typeId) roomTypeCounts.set(room.typeId, (roomTypeCounts.get(room.typeId) ?? 0) + 1); });
  const roomKey = (room: typeof rooms[number]) => room.typeId && roomTypeCounts.get(room.typeId) === 1 ? `type:${room.typeId}` : `saved:${room.id}`;
  const definitions = getEstimateRoomDefinitions(draft?.propertyType ?? "", draft?.bedroomCount ?? null);
  const availableTypes = new Set(definitions.map((room) => room.typeId));
  const mergedDefinitions = mergeSelectedRoomDefinitions(definitions, rooms.filter((room): room is typeof room & { typeId: string } => Boolean(room.typeId)));
  const roomOptions: RoomOption[] = [
    ...mergedDefinitions.filter((room) => (roomTypeCounts.get(room.typeId) ?? 0) < 2).map((room) => ({ id: `type:${room.typeId}`, label: room.label, group: room.group, icon: getRoomIcon(room.typeId) })),
    ...rooms.filter((room) => !room.typeId || (roomTypeCounts.get(room.typeId) ?? 0) > 1).map((room) => ({ id: `saved:${room.id}`, label: room.label, group: "Previously selected" as const, icon: getRoomIcon(room.typeId ?? "") }))
  ];
  const changeRooms = (keys: string[]) => {
    if (!draft || controlsDisabled) return;
    const retained = rooms.filter((room) => keys.includes(roomKey(room)));
    const additions = definitions.filter((definition) => keys.includes(`type:${definition.typeId}`) && !rooms.some((room) => room.typeId === definition.typeId))
      .map((definition) => ({ id: `${definition.typeId}-${crypto.randomUUID()}`, typeId: definition.typeId, label: definition.label, length: null, width: null }));
    const next = { ...draft, rooms: [...retained, ...additions] };
    const removedIds = rooms.filter((room) => !keys.includes(roomKey(room))).map((room) => room.id);
    if (removedIds.length) requestRemoval(next, removedIds, []);
    else commit(next);
  };
  const toggleBasket = (id: string) => {
    if (!draft || controlsDisabled) return;
    const selected = draft.selectedMainBasketIds.includes(id);
    if (!selected && !catalogue?.baskets.find((basket) => basket.id === id)?.canSelect) return;
    const next = { ...draft, selectedMainBasketIds: selected ? draft.selectedMainBasketIds.filter((current) => current !== id) : [...draft.selectedMainBasketIds, id] };
    if (selected) requestRemoval(next, [], [id]);
    else commit(next);
  };

  const searchTerm = search.trim().toLocaleLowerCase();
  const visibleBaskets = catalogue?.baskets.filter((basket) => `${basket.name} ${basket.subBaskets.map((sub) => sub.name).join(" ")}`.toLocaleLowerCase().includes(searchTerm)) ?? [];
  const selectedBasketCount = draft?.selectedMainBasketIds.length ?? 0;
  const hasEligibleBasket = catalogue?.baskets.some((basket) => basket.canSelect && draft?.selectedMainBasketIds.includes(basket.id)) ?? false;
  const valid = propertyValid && !bedroomCountRequired && !dimensionsInvalid;
  const canContinue = rooms.length > 0 && hasEligibleBasket;

  return <div ref={rootRef} className="client-quotation__setup" tabIndex={-1}>
    {!detail.setup || !draft ? <p className="estimate-notice" role="status">Saved estimate setup is unavailable. Refresh to load compatible setup information.</p> : <>
      <EstimateSetupFields propertyType={draft.propertyType} onPropertyTypeChange={(propertyType) => {
        const bedroomCount = requiresBedroomCount(propertyType) ? draft.bedroomCount : null;
        setBedroomInput(bedroomCount?.toString() ?? "");
        commit({ ...draft, propertyType, bedroomCount });
      }} bedroomCountInput={bedroomInput} onBedroomCountChange={(input) => {
        setBedroomInput(input);
        commit({ ...draft, bedroomCount: parseBedroomCount(input) });
      }} variableBedroomCount={variableBedroomCount} bedroomCountRequired={bedroomCountRequired} editable={detail.editingAllowed && Boolean(saved?.canConfigure)} disabled={controlsDisabled}
        roomOptions={roomOptions} selectedRoomTypeIds={rooms.map(roomKey)} onRoomsChange={changeRooms}
        retainedRooms={rooms.some((room) => !room.typeId || !availableTypes.has(room.typeId) || (roomTypeCounts.get(room.typeId) ?? 0) > 1)}
        rooms={rooms.map((room) => ({ ...room, icon: getRoomIcon(room.typeId ?? "") }))}
        onDimensionChange={(id, change) => commit({ ...draft, rooms: rooms.map((room) => room.id === id ? { ...room, ...change } : room) })}
        onRemoveRoom={(id) => requestRemoval({ ...draft, rooms: rooms.filter((room) => room.id !== id) }, [id], [])} />
      {!propertyValid ? <p role="status" className="estimate-bedroom-count__error">Select a property type before saving setup.</p> : null}
      {dimensionsInvalid ? <p role="alert" className="estimate-bedroom-count__error">Room dimensions must be positive numbers up to 1,000,000 ft, or left blank.</p> : null}
    </>}
    <EstimateSetupBaskets search={search} searchRef={searchRef} onSearchChange={setSearch} onClearSearch={() => { setSearch(""); searchRef.current?.focus(); }} onRefresh={onRefresh} refreshing={loading || refreshing}
      status={<>
        {loading ? <p role="status">Loading configured baskets…</p> : refreshing ? <p role="status">Refreshing available items…</p> : null}
        {catalogueError ? <div className="configured-estimate-chooser__state" role="alert"><p>{catalogueError}</p><button type="button" className="button button--secondary" disabled={loading || refreshing} onClick={onRefresh}>Retry setup</button></div> : null}
        {stale ? <p className="estimate-notice" role="alert">The saved setup or available items have changed. Your edits are kept. Reload the latest setup before saving.</p> : null}
        {!loading && !refreshing && !catalogue && !catalogueError ? <p role="status">Setup choices are unavailable. Refresh to try again.</p> : null}
        {catalogueMatches && !catalogueError && !catalogue?.baskets.length ? <p className="configured-estimate-chooser__state">No Main Baskets are currently available for your estimate.</p> : null}
        {catalogueMatches && draft?.selectedMainBasketIds.some((id) => !catalogue?.baskets.some((basket) => basket.id === id)) ? <p className="estimate-notice" role="status">Some selected baskets are unavailable. Your team needs to review them.</p> : null}
        {catalogueMatches && catalogue?.baskets.length ? <p className="configured-estimate-chooser__note">Basket details show only items available to you.</p> : null}
      </>}>
      {catalogueMatches ? <div className="configured-estimate-chooser__list">{visibleBaskets.map((basket) => <MainBasketSelectionCard key={basket.id} summary={basket}
        selected={Boolean(draft?.selectedMainBasketIds.includes(basket.id))} disabled={controlsDisabled || !basket.canSelect && !draft?.selectedMainBasketIds.includes(basket.id)} onToggle={() => toggleBasket(basket.id)} />)}</div> : null}
      {catalogueMatches && searchTerm && Boolean(catalogue?.baskets.length) && !visibleBaskets.length ? <p className="configured-estimate-chooser__state" role="status">No baskets match your search.</p> : null}
    </EstimateSetupBaskets>
    {notice ? <p className="estimate-notice" role="alert">{notice}</p> : null}
    <footer className="estimate-workspace__footer client-quotation__footer client-quotation__setup-footer">
      <div className="client-quotation__footer-copy"><p>{selectedBasketCount} Main {selectedBasketCount === 1 ? "Basket" : "Baskets"} selected</p>
        {draft && !canContinue ? <p className="client-quotation__hint">Select a room and an available Main Basket to continue to items.</p> : null}
        {value ? <p className="client-quotation__hint">Setup changes are not saved yet.</p> : null}
      </div>
      <div className="client-quotation__actions">
        {recoveryActions ?? <>
        <button type="button" className="button button--secondary" disabled={busy} onClick={onCancel}>{value ? "Discard setup changes and return" : "Return to saved items"}</button>
        {draft && detail.setup ? <button type="button" className="button button--primary" disabled={controlsDisabled || !valid || !value && !canContinue}
          onClick={() => onSave(canContinue)}>{busy ? "Saving…" : value ? canContinue ? "Save and continue to items" : "Save setup changes" : "Continue to items"}</button> : null}
        </>}
      </div>
    </footer>
    {removal ? <Dialog title={removal.roomIds.length ? "Remove selected rooms?" : "Remove selected Main Baskets?"} eyebrow="Estimate selection" role="alertdialog"
      description="This updates your estimate when you save. Review all affected visible items before continuing." onClose={() => setRemoval(null)} returnFocusRef={removalTriggerRef} fallbackFocusRef={rootRef} initialFocusRef={cancelRemovalRef}>
      <div className="ui-dialog__body"><p>{removal.labels.join(", ")}</p><p>{removal.visibleItemCount} saved visible {removal.visibleItemCount === 1 ? "item is" : "items are"} in this selection, including items hidden by search or collapsed sections.</p></div>
      <div className="ui-dialog__actions"><button ref={cancelRemovalRef} type="button" className="button button--secondary" onClick={() => setRemoval(null)}>Keep selection</button><button type="button" className="button button--primary" disabled={controlsDisabled} onClick={() => {
        const blocked = removal.roomIds.some((id) => saved?.rooms.find((room) => room.id === id)?.canRemove === false) || removal.basketIds.some((id) => catalogue?.baskets.find((basket) => basket.id === id)?.canRemove !== true);
        if (blocked) setNotice(removalBlockedMessage);
        else commit(removal.next);
        setRemoval(null);
      }}>Remove from estimate</button></div>
    </Dialog> : null}
  </div>;
}
