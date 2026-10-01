import { useEffect, useId, useRef, useState } from "react";

import { Field, Input } from "../../components/ui/Field";
import type { DesignStageOperational, FurnitureEstimateItem, FurnitureEstimateRoom, FurnitureUomOption } from "./projectWorkflowApi";
import { FurnitureUomField } from "./FurnitureUomField";
import "./furnitureDimensionsEditor.css";

type DimensionDraft = { estimateItemId: string; uomId: string } & (
  | { measurementType: "dimensions"; length: string; width: string }
  | { measurementType: "count"; quantity: string }
);
export type FurnitureDimensionsDraft = Record<string, DimensionDraft[]>;
type Room = NonNullable<DesignStageOperational["rooms"]>[number];
type EditorRoom = Pick<Room, "id" | "name" | "dimensions"> & { estimateItems: FurnitureEstimateItem[]; estimateDimensions?: FurnitureEstimateRoom["estimateDimensions"] };
export type FurnitureDraftField = "quantity" | "length" | "width" | "uomId";
export type FurnitureDraftIssueTarget = { roomId: string; estimateItemId: string; field: FurnitureDraftField };
export type FurnitureDraftReveal = FurnitureDraftIssueTarget & { requestId: number };

export function formatApprovedRoomSize(dimensions?: FurnitureEstimateRoom["estimateDimensions"]): string | undefined {
  if (!dimensions || !Number.isFinite(dimensions.lengthFt) || dimensions.lengthFt <= 0 || !Number.isFinite(dimensions.widthFt) || dimensions.widthFt <= 0) return undefined;
  const format = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 20 });
  return `${format(dimensions.lengthFt)} × ${format(dimensions.widthFt)} ft`;
}

export function createFurnitureDimensionsDraft(rooms: Pick<Room, "id" | "dimensions">[], estimateRooms: FurnitureEstimateRoom[]): FurnitureDimensionsDraft {
  return Object.fromEntries(rooms.map((room) => [room.id, (estimateRooms.find((source) => source.id === room.id)?.estimateItems ?? []).map((item) => {
    const previous = room.dimensions?.items.find((saved) => saved.estimateItemId === item.id);
    if (item.measurementType === "count") {
      const count = previous?.measurementType === "count" ? previous : undefined;
      return { estimateItemId: item.id, measurementType: "count" as const, quantity: count ? String(count.quantity) : "", uomId: count?.uomId ?? "" };
    }
    const dimensions = previous?.measurementType !== "count" ? previous : undefined;
    return {
      estimateItemId: item.id, measurementType: "dimensions" as const,
      length: dimensions ? String(dimensions.length) : "",
      width: dimensions ? String(dimensions.width) : "",
      uomId: dimensions?.uomId ?? ""
    };
  })]));
}

export function parseFurnitureDimensionsDraft(roomIds: string[], draft: FurnitureDimensionsDraft, estimateRooms: FurnitureEstimateRoom[], uoms: FurnitureUomOption[]) {
  const rooms = roomIds.map((roomId) => ({ roomId, items: (draft[roomId] ?? []).map((item) => item.measurementType === "count"
    ? { estimateItemId: item.estimateItemId, measurementType: "count" as const, quantity: Number(item.quantity), uomId: item.uomId }
    : { estimateItemId: item.estimateItemId, length: Number(item.length), width: Number(item.width), uomId: item.uomId }) }));
  if (rooms.some((room) => {
    const expected = estimateRooms.find((source) => source.id === room.roomId)?.estimateItems ?? [];
    return !expected.length || room.items.length !== expected.length || new Set(room.items.map((item) => item.estimateItemId)).size !== expected.length
      || room.items.some((item) => !expected.some((source) => source.id === item.estimateItemId && (source.measurementType === "count") === (item.measurementType === "count")));
  })) return { error: "Selected estimate items are unavailable or have changed. Reopen this action after the approved estimate is checked." } as const;
  // Check the entered text too: converting a large fractional value to Number can round it into a safe integer.
  for (const roomId of roomIds) for (const item of draft[roomId] ?? []) {
    if (item.measurementType !== "count") continue;
    if (!/^\d+(?:\.0+)?$/.test(item.quantity.trim()) || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
      return { error: "Enter a positive whole number of points for every point item in each selected room.", invalidField: { roomId, estimateItemId: item.estimateItemId, field: "quantity" as const } } as const;
    }
  }
  for (const roomId of roomIds) for (const item of draft[roomId] ?? []) {
    if (item.measurementType !== "dimensions") continue;
    for (const field of ["length", "width"] as const) {
      const value = Number(item[field]);
      if (!Number.isFinite(value) || value <= 0) {
        return { error: "Enter positive length and width for every item requiring dimensions in each selected room.", invalidField: { roomId, estimateItemId: item.estimateItemId, field } } as const;
      }
    }
  }
  for (const roomId of roomIds) for (const item of draft[roomId] ?? []) {
    if (!uoms.some((uom) => uom.id === item.uomId)) {
      return { error: "Select an active configured UOM for every estimate item. You can add a missing UOM here.", invalidField: { roomId, estimateItemId: item.estimateItemId, field: "uomId" as const } } as const;
    }
  }
  return { rooms } as const;
}

export function FurnitureDimensionsEditor({ projectId, rooms, draft, onChange, uoms, uomsLoading, uomsError, onRetryUoms, onUomBusyChange, disabled, validationTarget, validationError }: {
  projectId: string; rooms: EditorRoom[]; draft: FurnitureDimensionsDraft; onChange: (draft: FurnitureDimensionsDraft) => void;
  uoms: FurnitureUomOption[]; uomsLoading: boolean; uomsError?: string; onRetryUoms: () => void; onUomBusyChange: (busy: boolean) => void; disabled?: boolean;
  validationTarget?: FurnitureDraftReveal; validationError?: string;
}) {
  const id = useId();
  const busyFields = useRef(new Set<string>());
  const knownRoomIds = useRef(rooms.map((room) => room.id));
  const firstUsefulRoom = () => rooms.find((room) => room.estimateItems.length) ?? rooms[0];
  const [openRoomIds, setOpenRoomIds] = useState<string[]>(() => firstUsefulRoom()?.id ? [firstUsefulRoom()!.id] : []);
  const [openItems, setOpenItems] = useState<Record<string, string[]>>(() => {
    const room = firstUsefulRoom();
    return room?.estimateItems[0] ? { [room.id]: [room.estimateItems[0].id] } : {};
  });
  useEffect(() => {
    const added = rooms.filter((room) => !knownRoomIds.current.includes(room.id));
    knownRoomIds.current = rooms.map((room) => room.id);
    if (!added.length) return;
    setOpenRoomIds((current) => [...current, ...added.map((room) => room.id).filter((roomId) => !current.includes(roomId))]);
    setOpenItems((current) => Object.fromEntries([...Object.entries(current), ...added.filter((room) => room.estimateItems[0]).map((room) => [room.id, [room.estimateItems[0]!.id]])]));
  }, [rooms]);
  useEffect(() => {
    if (!validationTarget) return;
    setOpenRoomIds((current) => current.includes(validationTarget.roomId) ? current : [...current, validationTarget.roomId]);
    setOpenItems((current) => ({ ...current, [validationTarget.roomId]: current[validationTarget.roomId]?.includes(validationTarget.estimateItemId) ? current[validationTarget.roomId]! : [...(current[validationTarget.roomId] ?? []), validationTarget.estimateItemId] }));
  }, [validationTarget]);
  useEffect(() => {
    if (!validationTarget || !openRoomIds.includes(validationTarget.roomId) || !openItems[validationTarget.roomId]?.includes(validationTarget.estimateItemId)) return;
    const room = rooms.find((candidate) => candidate.id === validationTarget.roomId);
    const index = room?.estimateItems.findIndex((candidate) => candidate.id === validationTarget.estimateItemId) ?? -1;
    if (index < 0) return;
    const fieldId = `${id}-${validationTarget.roomId}-${index}-${validationTarget.field === "uomId" ? "unit" : validationTarget.field}`;
    const field = document.getElementById(fieldId);
    field?.focus();
    field?.scrollIntoView?.({ block: "center", behavior: "auto" });
  }, [id, rooms, openRoomIds, openItems, validationTarget]);
  const updateBusy = (key: string, busy: boolean) => {
    if (busy) busyFields.current.add(key); else busyFields.current.delete(key);
    onUomBusyChange(busyFields.current.size > 0);
  };
  const update = (roomId: string, estimateItemId: string, changes: { length?: string; width?: string; quantity?: string; uomId?: string }) => onChange({
    ...draft, [roomId]: (draft[roomId] ?? []).map((item) => item.estimateItemId === estimateItemId ? { ...item, ...changes } : item)
  });
  return <div className="furniture-dimensions-editor">
    {rooms.length ? <p className="furniture-dimensions-editor__intro">Selected items and room sizes come from the approved estimate. Enter actual site measurements below.</p> : null}
    {rooms.map((room) => {
      const roomOpen = openRoomIds.includes(room.id);
      const approvedSize = formatApprovedRoomSize(room.estimateDimensions);
      const roomPanelId = `${id}-${room.id}-items`;
      return <fieldset className="furniture-dimensions-editor__room" key={room.id}>
      <legend className="sr-only">{room.name} dimensions</legend>
      <button type="button" className="furniture-dimensions-editor__room-toggle" aria-expanded={roomOpen} aria-controls={roomPanelId} onClick={() => {
        setOpenRoomIds((current) => roomOpen ? current.filter((candidate) => candidate !== room.id) : [...current, room.id]);
        if (!roomOpen && room.estimateItems[0]) setOpenItems((current) => current[room.id] === undefined ? { ...current, [room.id]: [room.estimateItems[0]!.id] } : current);
      }}>
        <span className="furniture-dimensions-editor__room-summary"><strong>{room.name}</strong><span>{room.estimateItems.length} selected {room.estimateItems.length === 1 ? "item" : "items"}</span></span>
        <span className="furniture-dimensions-editor__room-reference">{approvedSize ? <>Approved estimate room size <strong>{approvedSize}</strong></> : "Approved estimate room size unavailable"}</span>
        <span className="furniture-dimensions-editor__disclosure" aria-hidden="true" />
      </button>
      <div id={roomPanelId} className="furniture-dimensions-editor__room-content" hidden={!roomOpen}>
      {room.dimensions?.returnReason ? <p className="furniture-dimensions-editor__feedback"><strong>Client requested changes:</strong> {room.dimensions.returnReason}</p> : null}
      {room.dimensions?.items.some((item) => !item.estimateItemId) ? <p className="furniture-dimensions-editor__legacy-note">Previous measurements were not linked to estimate items. Enter the measurements for the selected items below. The earlier submission stays in the history.</p> : null}
      {!room.estimateItems.length ? <p className="furniture-dimensions-editor__empty" role="status">No selected estimate items are available for {room.name}. Ask the project team to check the approved estimate before submitting this room.</p> : null}
      {room.estimateItems.map((source, index) => {
        const item = draft[room.id]?.find((candidate) => candidate.estimateItemId === source.id);
        if (!item) return null;
        const previous = room.dimensions?.items.find((saved) => saved.estimateItemId === source.id);
        const incompatiblePrevious = previous && (previous.measurementType === "count") !== (source.measurementType === "count");
        const itemOpen = openItems[room.id]?.includes(source.id) ?? false;
        const itemPanelId = `${id}-${room.id}-${index}-fields`;
        const itemError = validationTarget?.roomId === room.id && validationTarget.estimateItemId === source.id ? validationError : undefined;
        return <fieldset className={`furniture-dimensions-editor__item${item.measurementType === "count" ? " furniture-dimensions-editor__item--count" : ""}`} key={source.id}>
          <legend className="sr-only">{source.name} measurements</legend>
          <button type="button" className="furniture-dimensions-editor__item-toggle" aria-expanded={itemOpen} aria-controls={itemPanelId} onClick={() => setOpenItems((current) => ({ ...current, [room.id]: itemOpen ? (current[room.id] ?? []).filter((candidate) => candidate !== source.id) : [...(current[room.id] ?? []), source.id] }))}>
            <span className="furniture-dimensions-editor__item-summary"><strong>{source.name}</strong>{source.specification && source.specification !== source.name ? <span>{source.specification}</span> : null}</span>
            <span className="furniture-dimensions-editor__quantity">Estimate <strong>{source.quantity.toLocaleString("en-IN")} {source.uom}</strong></span>
            <span className="furniture-dimensions-editor__disclosure" aria-hidden="true" />
          </button>
          <div id={itemPanelId} className="furniture-dimensions-editor__item-content" hidden={!itemOpen}>
          <p className="furniture-dimensions-editor__actual-label">Actual site measurements</p>
          {incompatiblePrevious ? <p className="furniture-dimensions-editor__legacy-note">{item.measurementType === "count" ? "Earlier dimensional values do not represent a point count. Enter the actual number of points and select its UOM." : "The earlier point count does not represent dimensions. Enter the actual length and width and select their UOM."} The earlier submission stays in the history.</p> : null}
          {item.measurementType === "count"
            ? <Field id={`${id}-${room.id}-${index}-quantity`} label="Number of points" required error={validationTarget?.field === "quantity" ? itemError : undefined}>{(props) => <Input {...props} type="number" inputMode="numeric" min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={item.quantity} onChange={(event) => update(room.id, source.id, { quantity: event.target.value })} />}</Field>
            : (["length", "width"] as const).map((dimension) => <Field key={dimension} id={`${id}-${room.id}-${index}-${dimension}`} label={dimension[0]!.toUpperCase() + dimension.slice(1)} required error={validationTarget?.field === dimension ? itemError : undefined}>{(props) => <Input {...props} type="number" inputMode="decimal" min="0" step="any" value={item[dimension]} onChange={(event) => update(room.id, source.id, { [dimension]: event.target.value })} />}</Field>)}
          <FurnitureUomField id={`${id}-${room.id}-${index}-unit`} projectId={projectId} value={item.uomId}
            previousUnit={previous && !incompatiblePrevious ? { code: previous.unit, name: previous.uomName } : undefined}
            options={uoms} loading={uomsLoading} error={uomsError} validationError={validationTarget?.field === "uomId" ? itemError : undefined} disabled={disabled}
            onChange={(uomId) => update(room.id, source.id, { uomId })} onRetry={onRetryUoms} onBusyChange={(busy) => updateBusy(`${room.id}:${source.id}`, busy)} />
          </div>
        </fieldset>;
      })}
      </div>
    </fieldset>;
    })}
  </div>;
}
