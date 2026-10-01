import type { EstimationCatalogue, EstimationCatalogueBasket } from "./estimationCatalogueApi";
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
  subBasketId: string;
  subBasketName: string;
  mainLineId: string;
  mainLineName: string;
  revisionId: string;
  uomId: string;
  uomName: string;
  uomDecimalScale: number;
  quantity: number;
  rateInput: string;
  included: boolean;
  sourceMissing: boolean;
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
  const rate = parseSellingRate(line.rateInput);
  if (rate.kind !== "value") return null;
  const units = configuredQuantityUnits(line.quantity, line.uomDecimalScale, line.included);
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
    subBasketId: line.subBasketId,
    subBasketName: line.subBasketName,
    mainLineId: line.mainLineId,
    mainLineName: line.mainLineName,
    revisionId: line.revisionId,
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
  subBasket: EstimationCatalogueBasket["subBaskets"][number],
  mainLine: EstimationCatalogueBasket["subBaskets"][number]["mainLines"][number]
): ConfiguredLineDraft {
  return {
    key: configuredLineKey(room.id, mainLine.mainLineId),
    roomId: room.id,
    roomName: room.label,
    catalogueId: mainLine.mainLineId,
    mainBasketId: basket.id,
    mainBasketName: basket.name,
    subBasketId: subBasket.id,
    subBasketName: subBasket.name,
    mainLineId: mainLine.mainLineId,
    mainLineName: mainLine.name,
    revisionId: mainLine.revisionId,
    uomId: mainLine.uom.id,
    uomName: mainLine.uom.name,
    uomDecimalScale: mainLine.uom.decimalScale,
    quantity: 1,
    rateInput: "",
    included: false,
    sourceMissing: false
  };
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
    .flatMap((basket) => basket.subBaskets.flatMap((subBasket) => subBasket.mainLines.map((mainLine) => {
      const fresh = newLine(room, basket, subBasket, mainLine);
      const saved = prior.get(fresh.key);
      if (!saved) return fresh;
      return saved.persistedId
        ? { ...saved, sourceMissing: false }
        : { ...fresh, quantity: saved.quantity, rateInput: saved.rateInput, included: saved.included };
    }))));
  const seen = new Set(next.map((line) => line.key));
  const roomIds = new Set(rooms.map((room) => room.id));
  for (const line of previous) {
    if (!seen.has(line.key) && roomIds.has(line.roomId) && (line.persistedId || line.included)) {
      next.push({ ...line, sourceMissing: true });
    }
  }
  return next;
}
