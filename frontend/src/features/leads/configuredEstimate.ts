import type { EstimationCatalogue, EstimationCatalogueBasket, EstimationCatalogueMainLine, EstimationCatalogueSubBasket, EstimationCatalogueTemporaryItem } from "./estimationCatalogueApi";
import type { ConfiguredEstimateLine } from "./leadsApi";

export interface ConfiguredEstimateRoom {
  id: string;
  label: string;
}

export interface ConfiguredLineDraft {
  key: string;
  persistedId?: string;
  roomId: string;
  roomName: string;
  catalogueId: string;
  mainBasketId: string;
  mainBasketName: string;
  itemType: "main_line" | "temporary";
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string;
  mainLineName: string;
  revisionId: string;
  itemStatus?: "draft" | "active" | "inactive";
  revisionStatus?: "draft" | "active";
  itemVersion?: number;
  revisionVersion?: number;
  sourceItemStatus?: "draft" | "active" | "inactive";
  sourceRevisionStatus?: "draft" | "active";
  sourceItemVersion?: number;
  sourceRevisionVersion?: number;
  uomId: string;
  uomName: string;
  uomDecimalScale: number;
  inHouseBaseRatePaise?: number | null;
  quantity: number;
  rateInput: string;
  included: boolean;
  sourceMissing: boolean;
  sourceReview?: {
    changedFields: string[];
    previousUomName: string;
    previousUomDecimalScale: number;
    currentUomName: string;
    currentUomDecimalScale: number;
  };
}

export function configuredLineKey(roomId: string, mainLineId: string): string {
  return JSON.stringify([roomId, mainLineId]);
}

export function formatRateInput(ratePaise: number | null): string {
  if (ratePaise === null) return "";
  const whole = Math.floor(ratePaise / 100);
  const fraction = ratePaise % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0").replace(/0$/u, "")}`;
}

export type ParsedRate =
  | { kind: "blank"; paise: null }
  | { kind: "invalid"; paise: null }
  | { kind: "value"; paise: number };

export function parseSellingRate(input: string): ParsedRate {
  const value = input.trim();
  if (!value) return { kind: "blank", paise: null };
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(value)) return { kind: "invalid", paise: null };
  const [rupees, fraction = ""] = value.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise)
    ? { kind: "value", paise }
    : { kind: "invalid", paise: null };
}

export function configuredLineAmountPaise(line: ConfiguredLineDraft): number | null {
  if (!line.included) return 0;
  return configuredLinePreviewAmountPaise(line);
}

export function configuredLinePreviewAmountPaise(line: ConfiguredLineDraft): number | null {
  const rate = parseSellingRate(line.rateInput);
  if (rate.kind !== "value") return null;
  const units = configuredQuantityUnits(line.quantity, line.uomDecimalScale, true);
  if (units === null) return null;
  const divisor = BigInt(10 ** line.uomDecimalScale);
  const amount = (BigInt(rate.paise) * BigInt(units) + divisor / 2n) / divisor;
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

export function configuredQuantityUnits(quantity: number, decimalScale: number, included: boolean): number | null {
  if (!Number.isFinite(quantity) || quantity < 0 || (included && quantity === 0)) return null;
  const value = String(quantity);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimalScale) return null;
  const units = Number(whole) * 10 ** decimalScale + Number(fraction.padEnd(decimalScale, "0"));
  return Number.isSafeInteger(units) ? units : null;
}

export function restoreConfiguredLine(line: ConfiguredEstimateLine): ConfiguredLineDraft {
  return {
    key: configuredLineKey(line.roomId, line.mainLineId),
    persistedId: line.id,
    roomId: line.roomId,
    roomName: line.roomName,
    catalogueId: line.catalogueId,
    mainBasketId: line.mainBasketId,
    mainBasketName: line.mainBasketName,
    itemType: line.itemType ?? "main_line",
    subBasketId: line.subBasketId,
    subBasketName: line.subBasketName,
    mainLineId: line.mainLineId,
    mainLineName: line.mainLineName,
    revisionId: line.revisionId,
    sourceItemStatus: line.sourceItemStatus,
    sourceRevisionStatus: line.sourceRevisionStatus,
    sourceItemVersion: line.sourceItemVersion,
    sourceRevisionVersion: line.sourceRevisionVersion,
    uomId: line.uomId,
    uomName: line.uomName,
    uomDecimalScale: line.uomDecimalScale,
    quantity: line.quantity,
    rateInput: formatRateInput(line.ratePaise),
    included: line.included,
    sourceMissing: true
  };
}

function newLine(
  room: ConfiguredEstimateRoom,
  basket: EstimationCatalogueBasket,
  subBasket: EstimationCatalogueSubBasket | null,
  mainLine: EstimationCatalogueMainLine | EstimationCatalogueTemporaryItem
): ConfiguredLineDraft {
  const inHouseBaseRatePaise = typeof mainLine.inHouseBaseRatePaise === "number" &&
    Number.isSafeInteger(mainLine.inHouseBaseRatePaise) && mainLine.inHouseBaseRatePaise >= 0
    ? mainLine.inHouseBaseRatePaise : null;
  return {
    key: configuredLineKey(room.id, mainLine.mainLineId),
    roomId: room.id,
    roomName: room.label,
    catalogueId: mainLine.mainLineId,
    mainBasketId: basket.id,
    mainBasketName: basket.name,
    itemType: mainLine.itemType ?? "main_line",
    subBasketId: subBasket?.id ?? null,
    subBasketName: subBasket?.name ?? null,
    mainLineId: mainLine.mainLineId,
    mainLineName: mainLine.name,
    revisionId: mainLine.revisionId,
    itemStatus: mainLine.itemStatus,
    revisionStatus: mainLine.revisionStatus,
    itemVersion: mainLine.itemVersion,
    revisionVersion: mainLine.revisionVersion,
    uomId: mainLine.uom.id,
    uomName: mainLine.uom.name,
    uomDecimalScale: mainLine.uom.decimalScale,
    inHouseBaseRatePaise,
    quantity: 1,
    rateInput: formatRateInput(inHouseBaseRatePaise),
    included: false,
    sourceMissing: false
  };
}

function sourceChanges(previous: ConfiguredLineDraft, current: ConfiguredLineDraft): string[] {
  const changes: string[] = [];
  if (previous.revisionId !== current.revisionId) changes.push("revision");
  if (previous.itemVersion !== current.itemVersion || previous.revisionVersion !== current.revisionVersion) changes.push("source version");
  if (previous.uomId !== current.uomId || previous.uomDecimalScale !== current.uomDecimalScale || previous.uomName !== current.uomName) changes.push("UOM");
  if (previous.mainBasketId !== current.mainBasketId || previous.subBasketId !== current.subBasketId) changes.push("basket location");
  if (previous.itemType !== current.itemType) changes.push("item type");
  if (previous.itemStatus !== current.itemStatus || previous.revisionStatus !== current.revisionStatus) changes.push("source status");
  if (previous.inHouseBaseRatePaise !== current.inHouseBaseRatePaise) changes.push("In-house base rate");
  return changes;
}

export function buildConfiguredLines(
  catalogue: EstimationCatalogue,
  rooms: readonly ConfiguredEstimateRoom[],
  selectedMainBasketIds: ReadonlySet<string>,
  previous: readonly ConfiguredLineDraft[]
): ConfiguredLineDraft[] {
  const prior = new Map(previous.map((line) => [line.key, line]));
  const next = rooms.flatMap((room) => catalogue.items
    .filter((basket) => selectedMainBasketIds.has(basket.id))
    .flatMap((basket) => [
      ...(basket.directTemporaryItems ?? []).map((item) => newLine(room, basket, null, item)),
      ...basket.subBaskets.flatMap((subBasket) => [
        ...subBasket.mainLines.map((item) => newLine(room, basket, subBasket, item)),
        ...(subBasket.temporaryItems ?? []).map((item) => newLine(room, basket, subBasket, item))
      ])
    ].map((fresh) => {
      const saved = prior.get(fresh.key);
      if (!saved) return fresh;
      if (saved.persistedId) return { ...saved, sourceMissing: saved.mainBasketId !== fresh.mainBasketId || saved.subBasketId !== fresh.subBasketId || saved.itemType !== fresh.itemType };
      const changes = sourceChanges(saved, fresh);
      const existingReview = saved.sourceReview;
      const previousBaseRateInput = formatRateInput(saved.inHouseBaseRatePaise ?? null);
      const rateWasEdited = saved.rateInput !== previousBaseRateInput;
      const needsReview = changes.length > 0 && (saved.included || rateWasEdited || saved.quantity !== 1 || Boolean(existingReview));
      return {
        ...fresh,
        quantity: saved.quantity,
        rateInput: rateWasEdited ? saved.rateInput : fresh.rateInput,
        included: saved.included,
        sourceReview: needsReview ? {
          changedFields: [...new Set([...(existingReview?.changedFields ?? []), ...changes])],
          previousUomName: existingReview?.previousUomName ?? saved.uomName,
          previousUomDecimalScale: existingReview?.previousUomDecimalScale ?? saved.uomDecimalScale,
          currentUomName: fresh.uomName,
          currentUomDecimalScale: fresh.uomDecimalScale
        } : existingReview
      };
    })));
  const seen = new Set(next.map((line) => line.key));
  const roomIds = new Set(rooms.map((room) => room.id));
  for (const line of previous) {
    if (!seen.has(line.key) && roomIds.has(line.roomId) && (line.persistedId || line.included ||
      line.rateInput !== formatRateInput(line.inHouseBaseRatePaise ?? null) || line.quantity !== 1)) {
      next.push({ ...line, sourceMissing: true });
    }
  }
  return next;
}
