import type { DesignStageOperational, FurnitureEstimateItem, FurnitureEstimateRoom, FurnitureUomOption } from "./workflowTypes";

export type DimensionDraft = { estimateItemId: string; uomId: string } & (
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

