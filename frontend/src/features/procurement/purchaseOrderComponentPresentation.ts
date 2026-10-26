import type { PurchaseOrderComponentIdentity } from "./purchaseOrderApi";

type ComponentScope = PurchaseOrderComponentIdentity & { scope: string };
export interface PurchaseOrderComponentNames {
  mainBasketId: string | null;
  mainBasketName: string | null;
  subBasketId: string | null;
  subBasketName: string | null;
}

export function purchaseOrderComponentKey(row: ComponentScope): string {
  return JSON.stringify([row.componentId ?? null, row.scope]);
}

/** Use names only when their catalog identity matches the captured component. */
export function purchaseOrderComponentLabel(row: ComponentScope, rows: readonly ComponentScope[], legacyLabel: string, names?: PurchaseOrderComponentNames): string {
  if (!row.componentId) return legacyLabel;
  const componentIds = [...new Set(rows.flatMap(entry => entry.componentId ? [entry.componentId] : []))];
  const ordinal = componentIds.indexOf(row.componentId) + 1;
  const matchingBasket = names?.mainBasketId === row.componentBasketId && names?.mainBasketName?.trim();
  const matchingGroup = matchingBasket && names?.subBasketId === row.componentSubBasketId
    ? row.componentSubBasketId === null ? "Existing In-house settings" : names?.subBasketName?.trim() : null;
  const name = matchingGroup ? `${names?.mainBasketName} / ${matchingGroup}` : `Component ${ordinal}`;
  const cost = row.scope === "labor" || row.scope === "in_house_labor" ? "Labour"
    : row.scope === "material" || row.scope === "in_house_material" ? "Material" : legacyLabel;
  return `${name} · ${cost}`;
}
