import { useId, useRef } from "react";

import { Field, Input } from "../../components/ui/Field";
import type { DesignStageOperational, FurnitureEstimateItem, FurnitureEstimateRoom, FurnitureUomOption } from "./projectWorkflowApi";
import { FurnitureUomField } from "./FurnitureUomField";
import "./furnitureDimensionsEditor.css";

type DimensionDraft = { estimateItemId: string; uomId: string } & (
  | { measurementType: "dimensions"; length: string; width: string; height: string }
  | { measurementType: "count"; quantity: string }
);
export type FurnitureDimensionsDraft = Record<string, DimensionDraft[]>;
type Room = NonNullable<DesignStageOperational["rooms"]>[number];
type EditorRoom = Pick<Room, "id" | "name" | "dimensions"> & { estimateItems: FurnitureEstimateItem[] };

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
      height: dimensions ? String(dimensions.height) : "",
      uomId: dimensions?.uomId ?? ""
    };
  })]));
}

export function parseFurnitureDimensionsDraft(roomIds: string[], draft: FurnitureDimensionsDraft, estimateRooms: FurnitureEstimateRoom[], uoms: FurnitureUomOption[]) {
  const rooms = roomIds.map((roomId) => ({ roomId, items: (draft[roomId] ?? []).map((item) => item.measurementType === "count"
    ? { estimateItemId: item.estimateItemId, measurementType: "count" as const, quantity: Number(item.quantity), uomId: item.uomId }
    : { estimateItemId: item.estimateItemId, length: Number(item.length), width: Number(item.width), height: Number(item.height), uomId: item.uomId }) }));
  if (rooms.some((room) => {
    const expected = estimateRooms.find((source) => source.id === room.roomId)?.estimateItems ?? [];
    return !expected.length || room.items.length !== expected.length || new Set(room.items.map((item) => item.estimateItemId)).size !== expected.length
      || room.items.some((item) => !expected.some((source) => source.id === item.estimateItemId && (source.measurementType === "count") === (item.measurementType === "count")));
  })) return { error: "Selected estimate items are unavailable or have changed. Reopen this action after the approved estimate is checked." } as const;
  // Check the entered text too: converting a large fractional value to Number can round it into a safe integer.
  const hasFractionalCount = roomIds.some((roomId) => (draft[roomId] ?? []).some((item) => item.measurementType === "count" && !/^\d+(?:\.0+)?$/.test(item.quantity.trim())));
  if (hasFractionalCount || rooms.some((room) => room.items.some((item) => item.measurementType === "count" && (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)))) {
    return { error: "Enter a positive whole number of points for every point item in each selected room." } as const;
  }
  if (rooms.some((room) => room.items.some((item) => item.measurementType !== "count" && [item.length, item.width, item.height].some((value) => !Number.isFinite(value) || value <= 0)))) {
    return { error: "Enter positive length, width and height for every item requiring dimensions in each selected room." } as const;
  }
  if (rooms.some((room) => room.items.some((item) => !uoms.some((uom) => uom.id === item.uomId)))) {
    return { error: "Select an active configured UOM for every estimate item. You can add a missing UOM here." } as const;
  }
  return { rooms } as const;
}

export function FurnitureDimensionsEditor({ projectId, rooms, draft, onChange, uoms, uomsLoading, uomsError, onRetryUoms, onUomBusyChange, disabled }: {
  projectId: string; rooms: EditorRoom[]; draft: FurnitureDimensionsDraft; onChange: (draft: FurnitureDimensionsDraft) => void;
  uoms: FurnitureUomOption[]; uomsLoading: boolean; uomsError?: string; onRetryUoms: () => void; onUomBusyChange: (busy: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  const busyFields = useRef(new Set<string>());
  const updateBusy = (key: string, busy: boolean) => {
    if (busy) busyFields.current.add(key); else busyFields.current.delete(key);
    onUomBusyChange(busyFields.current.size > 0);
  };
  const update = (roomId: string, estimateItemId: string, changes: { length?: string; width?: string; height?: string; quantity?: string; uomId?: string }) => onChange({
    ...draft, [roomId]: (draft[roomId] ?? []).map((item) => item.estimateItemId === estimateItemId ? { ...item, ...changes } : item)
  });
  return <div className="furniture-dimensions-editor">
    {rooms.length ? <p>Items come from the approved estimate. Enter their actual measurements; quantities below are for reference.</p> : null}
    {rooms.map((room) => <fieldset className="furniture-dimensions-editor__room" key={room.id}>
      <legend>{room.name} {room.estimateItems.some((item) => item.measurementType === "count") ? "measurements" : "dimensions"}</legend>
      {room.dimensions?.returnReason ? <p className="furniture-dimensions-editor__feedback"><strong>Client requested changes:</strong> {room.dimensions.returnReason}</p> : null}
      {room.dimensions?.items.some((item) => !item.estimateItemId) ? <p className="furniture-dimensions-editor__legacy-note">Previous measurements were not linked to estimate items. Enter the measurements for the selected items below. The earlier submission stays in the history.</p> : null}
      {!room.estimateItems.length ? <p className="furniture-dimensions-editor__empty" role="status">No selected estimate items are available for {room.name}. Ask the project team to check the approved estimate before submitting this room.</p> : null}
      {room.estimateItems.map((source, index) => {
        const item = draft[room.id]?.find((candidate) => candidate.estimateItemId === source.id);
        if (!item) return null;
        const previous = room.dimensions?.items.find((saved) => saved.estimateItemId === source.id);
        const incompatiblePrevious = previous && (previous.measurementType === "count") !== (source.measurementType === "count");
        return <fieldset className={`furniture-dimensions-editor__item${item.measurementType === "count" ? " furniture-dimensions-editor__item--count" : ""}`} key={source.id}>
          <legend className="sr-only">{source.name} measurements</legend>
          <div className="furniture-dimensions-editor__item-header"><strong>{source.name}</strong><span>Estimate: {source.quantity.toLocaleString("en-IN")} {source.uom}</span></div>
          {source.specification && source.specification !== source.name ? <p className="furniture-dimensions-editor__specification">{source.specification}</p> : null}
          {incompatiblePrevious ? <p className="furniture-dimensions-editor__legacy-note">{item.measurementType === "count" ? "Earlier length, width and height values do not represent a point count. Enter the actual number of points and select its UOM." : "The earlier point count does not represent dimensions. Enter the actual length, width and height and select their UOM."} The earlier submission stays in the history.</p> : null}
          {item.measurementType === "count"
            ? <Field id={`${id}-${room.id}-${index}-quantity`} label="Number of points" required>{(props) => <Input {...props} type="number" inputMode="numeric" min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={item.quantity} onChange={(event) => update(room.id, source.id, { quantity: event.target.value })} />}</Field>
            : (["length", "width", "height"] as const).map((dimension) => <Field key={dimension} id={`${id}-${room.id}-${index}-${dimension}`} label={dimension[0]!.toUpperCase() + dimension.slice(1)} required>{(props) => <Input {...props} type="number" inputMode="decimal" min="0" step="any" value={item[dimension]} onChange={(event) => update(room.id, source.id, { [dimension]: event.target.value })} />}</Field>)}
          <FurnitureUomField id={`${id}-${room.id}-${index}-unit`} projectId={projectId} value={item.uomId}
            previousUnit={previous && !incompatiblePrevious ? { code: previous.unit, name: previous.uomName } : undefined}
            options={uoms} loading={uomsLoading} error={uomsError} disabled={disabled}
            onChange={(uomId) => update(room.id, source.id, { uomId })} onRetry={onRetryUoms} onBusyChange={(busy) => updateBusy(`${room.id}:${source.id}`, busy)} />
        </fieldset>;
      })}
    </fieldset>)}
  </div>;
}
