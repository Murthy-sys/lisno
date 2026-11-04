import { useState } from "react";
import { ESTIMATE_COMPONENT_PRICING_BASIS, readEstimateComponentPricing } from "../../../../shared/estimation/estimateComponentPricing";
import { KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimateClientReviewSnapshot } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { EstimateComponentBreakdown } from "../leads/EstimateComponentBreakdown";
import { estimateBuilderSections } from "../leads/estimateBuilderCatalogue";
import { createConfiguredEstimateViewState } from "../leads/useConfiguredEstimateViewState";
import { EstimateBuilderShell, type EstimateShellBasket } from "./EstimateBuilderShell";
import "./submittedEstimateBuilder.css";

type SnapshotLine = EstimateClientReviewSnapshot["lineItems"][number];
const legacyCatalogue = new Map<string, { name: string; basketId: string; basketName: string }>(estimateBuilderSections.flatMap(section => section.rows.map(row => [row.id,
  { name: row.description, basketId: section.id, basketName: section.label }] as const)));
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const money = (paise: number | null) => paise === null ? "Unavailable" : currency.format(paise / 100);

// Older snapshots store whole-rupee/decimal-rupee values. Convert once at this boundary.
function paise(value: number | null | undefined, legacyRupees: number | null): number | null {
  if (value !== undefined) return Number.isSafeInteger(value) && value !== null && value >= 0 ? value : null;
  if (legacyRupees === null || !Number.isFinite(legacyRupees) || legacyRupees < 0) return null;
  const converted = Math.round(legacyRupees * 100);
  return Number.isSafeInteger(converted) ? converted : null;
}

function visibleSubtotal(lines: readonly SnapshotLine[]) {
  let total = 0n;
  for (const line of lines) {
    const amount = paise(line.amountPaise, line.amount);
    if (amount === null) return "Submitted visible subtotal unavailable";
    total += BigInt(amount);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER)
    ? "Submitted visible subtotal unavailable"
    : `Submitted visible subtotal ${money(Number(total))}`;
}

function submittedRows(snapshot: EstimateClientReviewSnapshot) {
  return snapshot.lineItems.flatMap((line, index) => {
    if (!line.included || line.clientVisible === false) return [];
    const legacy = line.source !== "configuration" ? legacyCatalogue.get(line.catalogueId) : undefined;
    return [{
      id: line.id ? `line:${line.id}` : `snapshot-row:${index}`,
      line,
      roomId: JSON.stringify(line.roomId ? ["room", line.roomId] : ["unassigned"]),
      roomName: line.roomId ? line.roomName : "Other saved items",
      basketId: JSON.stringify(line.mainBasketId ? ["basket", line.mainBasketId] : legacy ? ["legacy", legacy.basketId] : ["unassigned"]),
      basketName: line.mainBasketName ?? legacy?.basketName ?? "Other saved items",
      subBasketId: line.subBasketId ? JSON.stringify(["sub-basket", line.subBasketId]) : null,
      subBasketName: line.subBasketName ?? "Saved Sub Basket",
      name: line.mainLineName ?? legacy?.name ?? line.catalogueId
    }];
  });
}

/** Frozen Client-safe snapshot presentation. This adapter never loads current Configuration. */
export function SubmittedEstimateBuilder({ snapshot, workspace = false, onRefresh, refreshing }: {
  snapshot: EstimateClientReviewSnapshot;
  workspace?: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [activeRoomId, setActiveRoomId] = useState("");
  const [viewState, setViewState] = useState(createConfiguredEstimateViewState);
  const rows = submittedRows(snapshot);
  const rooms = [...new Map(rows.map(row => [row.roomId, { id: row.roomId, label: row.roomName }])).values()];
  const currentRoomId = rooms.find(room => room.id === activeRoomId)?.id ?? rooms[0]?.id ?? "";
  const roomRows = rows.filter(row => row.roomId === currentRoomId);
  const baskets = [...new Map(roomRows.map(row => [row.basketId, { id: row.basketId, name: row.basketName }])).values()];
  const search = viewState.search.trim().toLocaleLowerCase();
  const matches = (row: typeof rows[number]) => !search || [row.name, row.basketName, row.line.subBasketName,
    row.line.roomName, row.line.specification, row.line.uomName, row.line.unit, ...(row.line.estimateNotes ?? [])]
    .some(value => value?.toLocaleLowerCase().includes(search));
  const groups: EstimateShellBasket[] = baskets
    .filter(basket => viewState.basketFilter === "all" || viewState.basketFilter === basket.id)
    .map(basket => {
      const scoped = roomRows.filter(row => row.basketId === basket.id);
      const subs = [...new Map(scoped.flatMap(row => row.subBasketId ? [[row.subBasketId, { id: row.subBasketId, name: row.subBasketName }]] as const : [])).values()];
      return { ...basket, count: scoped.length, subtotalLabel: visibleSubtotal(scoped.map(row => row.line)),
        directLines: scoped.filter(row => row.subBasketId === null && matches(row)),
        directSubtotalLabel: visibleSubtotal(scoped.filter(row => row.subBasketId === null).map(row => row.line)),
        subBaskets: subs.map(sub => {
          const lines = scoped.filter(row => row.subBasketId === sub.id);
          return { ...sub, count: lines.length, subtotalLabel: visibleSubtotal(lines.map(row => row.line)), lines: lines.filter(matches) };
        }).filter(sub => !search || sub.lines.length > 0)
      };
    }).filter(basket => !search || basket.directLines.length > 0 || basket.subBaskets.some(sub => sub.lines.length > 0));
  const renderLine = (id: string) => {
    const row = rows.find(candidate => candidate.id === id);
    if (!row) return null;
    const { line, name } = row;
    const evidence = readEstimateComponentPricing(line.componentPricing);
    const components = line.pricingBasis === ESTIMATE_COMPONENT_PRICING_BASIS && line.pricingMode === "in_house" &&
      line.rateSource === "configuration" && evidence?.totalPaise === line.amountPaise ? evidence : null;
    return <article className="submitted-estimate-line" aria-label={`${name} in ${line.roomName}`}>
      <div className="submitted-estimate-line__heading"><h4>{name}</h4><strong>{money(paise(line.amountPaise, line.amount))}</strong></div>
      <p className="submitted-estimate-line__context">{line.roomName}{line.itemType === "temporary" ? " · Temporary item" : ""}</p>
      <dl className="submitted-estimate-line__values">
        <div><dt>Quantity</dt><dd>{line.quantity} {line.uomName ?? line.unit}</dd></div>
        <div><dt>Rate</dt><dd>{components ? "Calculated from saved components" : money(paise(line.ratePaise, line.rate))}</dd></div>
        {line.modeTier ? <div><dt>Configured option</dt><dd>{KNOWLEDGE_MODE_TIER_LABELS[line.modeTier]}</dd></div> : null}
      </dl>
      {line.dimensions ? <p>Dimensions: {line.dimensions.length} × {line.dimensions.width} × {line.dimensions.height}{line.dimensionRule ? ` ${line.dimensionRule.inputUnit}` : ""} (L × W × H){line.dimensionsMandatory ? " · Quantity = L × W" : ""}</p> : null}
      {line.specification ? <p>{line.specification}</p> : null}
      {line.estimateNotes?.map((note, index) => <p key={index}>{note}</p>)}
      {components ? <EstimateComponentBreakdown pricing={components} label={name} /> : null}
      {line.pricingBasis === ESTIMATE_COMPONENT_PRICING_BASIS && !components ? <p role="status">Saved component details are unavailable.</p> : null}
    </article>;
  };
  if (!rows.length) return <div className="submitted-estimate-line">
    <p role="status">No visible item details are available in this submitted estimate.</p>
    <Button variant="secondary" disabled={refreshing} onClick={onRefresh}>Refresh submitted items</Button>
  </div>;
  return <EstimateBuilderShell rooms={rooms.map(room => ({ ...room, hasSelectedItems: true,
    detail: visibleSubtotal(rows.filter(row => row.roomId === room.id).map(row => row.line)) }))}
    activeRoomId={currentRoomId} onSelectRoom={setActiveRoomId} selectedCount={rows.length}
    baskets={baskets.map(basket => ({ ...basket, detail: visibleSubtotal(roomRows.filter(row => row.basketId === basket.id).map(row => row.line)) }))}
    groups={groups} renderLine={renderLine} viewState={viewState} onViewStateChange={setViewState}
    onRefresh={onRefresh} refreshing={refreshing} scrollMode={workspace ? "pane" : "document"}
    beforeGroups={<p className="client-quotation__hint">Submitted items are read-only. Visible subtotals exclude GST and may not include internal scope.</p>}
    emptyMessage={!groups.length ? "No submitted items match your search." : undefined} />;
}
