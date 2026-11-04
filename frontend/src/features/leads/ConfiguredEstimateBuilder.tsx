import { EstimateComponentPricingStatus, EstimateSubBasketAmounts } from "./EstimateComponentBreakdown";
import { EstimateDimensionsFields } from "./EstimateDimensionsFields";
import { KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
import { useRef, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { useConfiguredEstimateViewState, type ConfiguredEstimateViewState } from "./useConfiguredEstimateViewState";
import type { LucideIcon } from "lucide-react";

import type { EstimationCatalogue } from "./estimationCatalogueApi";
import type { EstimateClassification } from "./leadsApi";
import { configuredAttributedAmountPaise, configuredUsesComponentPricing, configuredDimensionsIssue, configuredLineAmountPaise, configuredLinePreviewAmountPaise, configuredModeBaseRate, configuredTierUnavailableReason, configuredQuantityUnits, estimatePricingModeLabels, parseSellingRate, type ConfiguredLineDraft } from "./configuredEstimate";
import { EstimateInHouseComponents } from "./EstimateInHouseComponents";
import { EstimatorRecommendations, type RecommendationReadState } from "./EstimatorRecommendations";
import type { RoomRecommendationView, RecommendedLineTarget } from "./roomRecommendations";
import { EstimateBuilderShell, type EstimateShellBasket } from "../estimates/EstimateBuilderShell";
import { EstimateLineActions, EstimateLineChoice, EstimateLineLayout, EstimateLineTierOptions } from "../estimates/EstimateLineRow";

interface Room {
  id: string;
  typeId: string;
  label: string;
  sqft: number;
}

const itemCount = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

export function ConfiguredEstimateBuilder({
  rooms, activeRoomId, onSelectRoom, catalogue, selectedMainBasketIds, mainBasketClassifications, lines,
  onUpdateLine, onRefreshAvailableItems, refreshingAvailableItems, roomTotal, moneyPaise, editable,
  recommendationSourceCount = 0, recommendationState = "ready", recommendationView = null,
  recommendationDialogOpen = false, automaticDismissal = false, skippedRecommendationKeys,
  onOpenRecommendations = () => {}, onCloseRecommendations = () => {},
  onRetryRecommendations = () => {}, onSelectRecommendedLine = () => false, onSkipRecommendedLine,
  navigation, viewState, onViewStateChange, onRemoveSubBasket
}: {
  rooms: readonly Room[];
  activeRoomId: string;
  onSelectRoom: (id: string) => void;
  catalogue: EstimationCatalogue;
  selectedMainBasketIds: ReadonlySet<string>;
  mainBasketClassifications?: ReadonlyMap<string, EstimateClassification>;
  lines: readonly ConfiguredLineDraft[];
  onRemoveSubBasket?: (scope: { roomId: string; mainBasketId: string; subBasketId: string }) => void;
  onUpdateLine: (key: string, change: Partial<ConfiguredLineDraft>) => void;
  onRefreshAvailableItems: () => void;
  refreshingAvailableItems: boolean;
  roomTotal: (roomId: string) => number;
  roomIcons: Record<string, LucideIcon>;
  moneyPaise: (value: number) => string;
  editable: boolean;
  recommendationSourceCount?: number;
  recommendationState?: RecommendationReadState;
  recommendationView?: RoomRecommendationView | null;
  recommendationDialogOpen?: boolean;
  automaticDismissal?: boolean;
  skippedRecommendationKeys?: ReadonlySet<string>;
  onOpenRecommendations?: () => void;
  onCloseRecommendations?: () => void;
  onRetryRecommendations?: () => void;
  onSelectRecommendedLine?: (target: RecommendedLineTarget) => boolean | void;
  onSkipRecommendedLine?: (target: RecommendedLineTarget) => boolean | void;
  navigation?: ReactNode;
  viewState?: ConfiguredEstimateViewState;
  onViewStateChange?: Dispatch<SetStateAction<ConfiguredEstimateViewState>>;
}) {
  const { state, setState, search, setSearch, basketFilter, setBasketFilter, railView,
    setCollapsedBasketIds, setCollapsedSubBasketIds } = useConfiguredEstimateViewState(viewState, onViewStateChange);
  const recommendationFallbackFocusRef = useRef<HTMLInputElement>(null);
  const selectedCount = lines.filter(line => line.included).length;
  const visibleRooms = railView === "selected" ? rooms.filter(room => lines.some(line => line.roomId === room.id && line.included)) : rooms;
  const activeRoom = visibleRooms.find(room => room.id === activeRoomId) ?? visibleRooms[0];
  const roomLines = lines.filter(line => line.roomId === activeRoom?.id && (railView !== "selected" || line.included));
  const visibleBaskets = catalogue.items.filter(basket => selectedMainBasketIds.has(basket.id) &&
    (railView !== "selected" || roomLines.some(line => line.mainBasketId === basket.id && !line.sourceMissing)));
  const visibleBasketFilter = visibleBaskets.some(basket => basket.id === basketFilter) ? basketFilter : "all";
  const query = search.trim().toLocaleLowerCase();
  const matches = (line: ConfiguredLineDraft) => !query || [line.mainLineName, line.mainBasketName, line.subBasketName, line.uomName]
    .some(value => value?.toLocaleLowerCase().includes(query));
  const attributedSubtotalLabel = (basketId: string, subBasketId?: string | null) => {
    const amount = configuredAttributedAmountPaise(roomLines, basketId, subBasketId);
    return amount === null ? "Incomplete" : moneyPaise(amount);
  };
  const roomAmountLabel = (roomId: string) => lines.some(line => line.roomId === roomId && configuredLineAmountPaise(line) === null)
    ? "Incomplete" : moneyPaise(roomTotal(roomId));
  const catalogueGroups: EstimateShellBasket[] = (activeRoom ? visibleBaskets : [])
    .filter(basket => visibleBasketFilter === "all" || visibleBasketFilter === basket.id)
    .map(basket => {
      const directLines = roomLines.filter(line => line.mainBasketId === basket.id && line.itemType === "temporary" && line.subBasketId === null && !line.sourceMissing);
      const subBaskets = basket.subBaskets.map(subBasket => ({
        id: subBasket.id, name: subBasket.name,
        lines: roomLines.filter(line => line.mainBasketId === basket.id && line.subBasketId === subBasket.id && !line.sourceMissing)
      }));
      const hasAvailableItems = directLines.length > 0 || subBaskets.some(subBasket => subBasket.lines.length > 0);
      return { id: basket.id, name: basket.name,
        count: directLines.length + subBaskets.reduce((sum, subBasket) => sum + subBasket.lines.length, 0),
        subtotalLabel: attributedSubtotalLabel(basket.id),
        directSubtotalLabel: attributedSubtotalLabel(basket.id, null),
        directLines: directLines.filter(matches).map(line => ({ id: line.key })),
        subBaskets: (hasAvailableItems ? subBaskets.filter(subBasket => subBasket.lines.length > 0) : subBaskets)
          .map(subBasket => ({ id: subBasket.id, name: subBasket.name, count: subBasket.lines.length,
            subtotalLabel: attributedSubtotalLabel(basket.id, subBasket.id),
            lines: subBasket.lines.filter(matches).map(line => ({ id: line.key })),
            ...(onRemoveSubBasket && activeRoom ? { removal: {
              label: `Remove ${subBasket.name} Sub Basket from ${activeRoom.label}`,
              disabled: !editable || !lines.some(line => line.roomId === activeRoom.id && line.mainBasketId === basket.id && line.subBasketId === subBasket.id && line.included),
              onRemove: () => onRemoveSubBasket({ roomId: activeRoom.id, mainBasketId: basket.id, subBasketId: subBasket.id })
            } } : {})
          })).filter(subBasket => !query || subBasket.lines.length > 0)
      };
    }).filter(basket => !query || basket.directLines.length > 0 || basket.subBaskets.length > 0);
  const unselected = roomLines.filter(line => line.persistedId && !selectedMainBasketIds.has(line.mainBasketId));
  const unavailableSaved = roomLines.filter(line => line.persistedId && line.sourceMissing && selectedMainBasketIds.has(line.mainBasketId));
  const unavailableNew = roomLines.filter(line => !line.persistedId && line.sourceMissing && selectedMainBasketIds.has(line.mainBasketId));
  const selectRecommendedLine = (target: RecommendedLineTarget) => {
    const accepted = onSelectRecommendedLine(target);
    if (accepted === false) return false;
    setSearch(""); setBasketFilter("all");
    setCollapsedBasketIds(current => { const next = new Set(current); next.delete(target.basketId); return next; });
    if (target.subBasketId) setCollapsedSubBasketIds(current => {
      const next = new Set(current); next.delete(`${target.basketId}:${target.subBasketId}`); return next;
    });
    return accepted;
  };
  const byId = new Map(lines.map(line => [line.key, line]));
  const renderLine = (id: string) => {
    const line = byId.get(id);
    return line ? <ConfiguredLineRow line={line} inheritedClassification={mainBasketClassifications?.get(line.mainBasketId)} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} /> : null;
  };
  return <EstimateBuilderShell
    rooms={rooms.map(room => ({ id: room.id, label: room.label, detail: `${room.sqft} sqft · ${roomAmountLabel(room.id)}`,
      hasSelectedItems: lines.some(line => line.roomId === room.id && line.included) }))}
    activeRoomId={activeRoomId} onSelectRoom={onSelectRoom} selectedCount={selectedCount}
    baskets={visibleBaskets.map(basket => ({ id: basket.id, name: basket.name,
      detail: `${itemCount(roomLines.filter(line => line.mainBasketId === basket.id && !line.sourceMissing).length)} · ${attributedSubtotalLabel(basket.id)}` }))}
    groups={catalogueGroups} renderLine={renderLine}
    viewState={state} onViewStateChange={setState}
    onRefresh={onRefreshAvailableItems} refreshing={refreshingAvailableItems}
    navigation={navigation} searchInputRef={recommendationFallbackFocusRef}
    extraJumpTargets={[
      ...(unselected.length ? [{ id: "unselected-items", label: "Unselected saved items" }] : []),
      ...(unavailableSaved.length ? [{ id: "saved-items", label: "Saved items" }] : []),
      ...(unavailableNew.length ? [{ id: "unavailable-selections", label: "Unavailable selections" }] : [])
    ]}
    beforeGroups={<>
      {activeRoom ? <EstimatorRecommendations
        roomName={activeRoom.label} sourceCount={activeRoom.id === activeRoomId ? recommendationSourceCount : 0}
        state={recommendationState} view={recommendationView} editable={editable}
        open={recommendationDialogOpen} automaticDismissal={automaticDismissal}
        skippedKeys={skippedRecommendationKeys} onSkip={onSkipRecommendedLine}
        onOpen={onOpenRecommendations} onClose={onCloseRecommendations}
        fallbackFocusRef={recommendationFallbackFocusRef}
        onRetry={onRetryRecommendations} onRefresh={onRefreshAvailableItems} onSelect={selectRecommendedLine}
      /> : null}
      <EstimateSubBasketAmounts lines={roomLines} />
    </>}
    renderEmptyBasket={() => <div className="configured-estimate-basket__empty">
      <p>No available items in this Main Basket. Item availability depends on the information needed for estimating, including a valid UOM. Refresh to check for changes. You can still save this basket in a draft.</p>
      <button type="button" className="button button--secondary" disabled={refreshingAvailableItems} onClick={onRefreshAvailableItems}>Refresh available items</button>
    </div>}
    afterGroups={<>
        {unselected.length ? <section
          className="configured-estimate-basket"
          aria-label="Saved items from unselected Main Baskets"
          data-estimate-jump-target="unselected-items"
        >
          <header><h2>Unselected saved items</h2><span>Recheck the Main Basket to edit or include these items.</span></header>
          {unselected.map((line) => <div className="configured-estimate-saved-line" key={line.key}>
            <p>{line.subBasketName ? `${line.mainBasketName} / ${line.subBasketName}` : line.mainBasketName}</p>
            <ConfiguredLineRow line={line} editable={false} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
          </div>)}
        </section> : null}
        {unavailableSaved.length ? <section
          className="configured-estimate-basket"
          aria-label="Saved items unavailable in current Configuration"
          data-estimate-jump-target="saved-items"
        >
          <header><h2>Saved items</h2><span>Unavailable in current Configuration</span></header>
          {unavailableSaved.map((line) => <div className="configured-estimate-saved-line" key={line.key}>
            <p>{line.subBasketName ? `${line.mainBasketName} / ${line.subBasketName}` : line.mainBasketName}</p>
            <ConfiguredLineRow line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
          </div>)}
        </section> : null}
        {unavailableNew.length ? <section
          className="configured-estimate-basket"
          aria-label="Unavailable new selections"
          data-estimate-jump-target="unavailable-selections"
        >
          <header><h2>Unavailable selections</h2><span>Refresh available items or uncheck these new lines before saving.</span></header>
          {unavailableNew.map((line) => <div className="configured-estimate-saved-line" key={line.key}>
            <p>{line.subBasketName ? `${line.mainBasketName} / ${line.subBasketName}` : line.mainBasketName}</p>
            <ConfiguredLineRow line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
          </div>)}
        </section> : null}
    </>}
    emptyMessage={!catalogueGroups.length && !unselected.length && !unavailableSaved.length && !unavailableNew.length
      ? railView === "selected" && !activeRoom ? "No selected items yet. Choose By Section to add items."
        : !selectedMainBasketIds.size ? "Select a Main Basket to see its available items."
        : !activeRoom ? "Select a room to see its available items."
        : query ? `No items match “${search.trim()}”.` : "No items in this section."
      : undefined}
  />;
}

function ConfiguredLineRow({ line, inheritedClassification = "standard", editable, onUpdateLine, moneyPaise }: {
  line: ConfiguredLineDraft;
  inheritedClassification?: EstimateClassification;
  editable: boolean;
  onUpdateLine: (key: string, change: Partial<ConfiguredLineDraft>) => void;
  moneyPaise: (value: number) => string;
}) {
  const componentCalculated = configuredUsesComponentPricing(line);
  const rate = parseSellingRate(line.rateInput);
  const amount = configuredLinePreviewAmountPaise(line);
  const amountTooLarge = !componentCalculated && !line.uomNeedsQuantityReview && !configuredDimensionsIssue(line) && amount === null && rate.kind === "value"
    && configuredQuantityUnits(line.quantity, line.uomDecimalScale, true) !== null;
  const quantityInvalid = configuredQuantityUnits(line.quantity, line.uomDecimalScale, line.included) === null;
  const rateRequired = !componentCalculated && line.included && rate.kind === "blank";
  const rateInvalid = !componentCalculated && rate.kind === "invalid";
  const label = `${line.mainBasketName}${line.subBasketName ? `, ${line.subBasketName}` : ""}, ${line.mainLineName} in ${line.roomName}`;
  const sourceStatus = line.persistedId ? line.sourceItemStatus : line.itemStatus;
  const inputId = `rate-${encodeURIComponent(line.key)}`;
  const classification = line.classification ?? inheritedClassification;
  const referenceMode = line.pricingMode ?? (classification !== "special" ? "sub_vendor" : undefined);
  const baseRate = referenceMode ? configuredModeBaseRate(line, referenceMode) : null;
  const step = 10 ** -line.uomDecimalScale;
  const changeQuantity = (direction: -1 | 1) => {
    const units = Math.round((Number.isFinite(line.quantity) ? line.quantity : 0) / step);
    const minimum = line.included ? 1 : 0;
    onUpdateLine(line.key, { quantity: Math.max(minimum, units + direction * 10 ** line.uomDecimalScale) * step });
  };
  return <EstimateLineLayout included={line.included}
    choice={<EstimateLineChoice name={line.mainLineName} unit={line.uomName} included={line.included} disabled={!editable}
      onToggle={included => onUpdateLine(line.key, { included })}>
      {line.estimateNotes?.map((note, index) => <small key={index}>{note}</small>)}
      {sourceStatus === "draft" || sourceStatus === "inactive" ? <small className="configured-estimate-line__source">{sourceStatus === "draft" ? "Draft" : "Inactive"} source</small> : null}
    </EstimateLineChoice>}
    fields={<>
      {line.dimensionsMandatory ? <div className="configured-estimate-line__quantity configured-estimate-line__quantity--calculated"><span>Quantity ({line.uomName})</span><output aria-label={`Quantity (${line.uomName}) for ${label}`}>{Number.isFinite(line.quantity) && !configuredDimensionsIssue(line) ? line.quantity : "Pending"}</output></div> : <label className="configured-estimate-line__quantity"><span>Quantity ({line.uomName})</span><span className="configured-estimate-line__stepper"><button type="button" aria-label={`Decrease quantity for ${label}`} disabled={!editable || !Number.isFinite(line.quantity) || line.quantity <= (line.included ? step : 0)} onClick={() => changeQuantity(-1)}>−</button><input type="number" min={line.included ? step : 0} step={step} value={Number.isFinite(line.quantity) ? line.quantity : ""} disabled={!editable} aria-label={`Quantity (${line.uomName}) for ${label}`} aria-invalid={quantityInvalid || amountTooLarge} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : undefined} onChange={(event) => onUpdateLine(line.key, { quantity: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /><button type="button" aria-label={`Increase quantity for ${label}`} disabled={!editable} onClick={() => changeQuantity(1)}>+</button></span></label>}
      <label className="configured-estimate-line__rate" htmlFor={inputId}><span aria-hidden="true">Price (₹/{line.uomName})</span><span className="sr-only">Selling rate (₹/{line.uomName}) for {label}</span><input id={inputId} type="text" inputMode="decimal" value={componentCalculated ? "" : line.rateInput} placeholder={componentCalculated ? "Manual override" : undefined} disabled={!editable} aria-label={`Selling rate (₹/${line.uomName}) for ${label}`} aria-invalid={rateInvalid || rateRequired || amountTooLarge} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : rateInvalid || rateRequired ? `${inputId}-message` : undefined} onChange={(event) => onUpdateLine(line.key, { rateInput: event.target.value })} />{componentCalculated ? <small className="configured-estimate-line__component-rate">Calculated from components. Enter a rate to override.</small> : line.rateSource === "manual" ? <small className="configured-estimate-line__component-rate">Manual price</small> : null}</label>
      <div className="configured-estimate-line__amount"><span>Amount{line.included ? "" : " · Not included"}</span><output aria-label={line.included ? `Amount for ${label}` : `Preview amount for ${label}, not included in totals`} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : undefined}>{amountTooLarge ? "Too large" : amount === null ? "Pending" : moneyPaise(amount)}</output></div>
      <EstimateLineActions name={line.mainLineName} disabled={!editable} included={line.included}
        onToggle={() => onUpdateLine(line.key, { included: !line.included })}
        onResetQuantity={line.dimensionsMandatory ? undefined : () => onUpdateLine(line.key, { quantity: 1 })} />
    </>}>
    {line.dimensionsMandatory ? <EstimateDimensionsFields label={label} dimensions={line.dimensions} rule={line.dimensionRule} quantityUnit={line.uomName} disabled={!editable}
      needsReview={line.dimensionsNeedReview} onChange={dimensions => onUpdateLine(line.key, { dimensions })}
      onConfirm={() => onUpdateLine(line.key, { dimensionsNeedReview: false, uomNeedsQuantityReview: false, previousUomName: undefined })} /> : null}
    {line.included ? <div className="configured-estimate-line__options">
      {editable ? <EstimateLineTierOptions label={label} groupName={`line-tier-${line.key}`} value={line.modeTier ?? "signature"}
        options={KNOWLEDGE_MODE_TIERS.map(modeTier => ({ value: modeTier, label: KNOWLEDGE_MODE_TIER_LABELS[modeTier],
          disabledReason: configuredTierUnavailableReason(line, modeTier, referenceMode) }))}
        onChange={modeTier => onUpdateLine(line.key, { modeTier })} /> : <p className="configured-estimate-line__classification-readonly">Configuration tier: <strong>{KNOWLEDGE_MODE_TIER_LABELS[line.modeTier ?? "signature"]}</strong></p>}
      {editable ? <fieldset className="estimate-classification configured-estimate-line__classification" aria-label={`Item type for ${label}`}>
        <legend>Item type</legend>
        {(["standard", "special"] as const).map((value) => <label key={value}><input type="radio" name={`line-classification-${line.key}`} value={value} checked={classification === value} aria-label={`${value === "standard" ? "Standard" : "Special"} item type for ${label}`} onChange={() => onUpdateLine(line.key, { classification: value })} /><span>{value === "standard" ? "Standard" : "Special"}</span></label>)}
      </fieldset> : <p className="configured-estimate-line__classification-readonly">Item type: <strong>{classification === "special" ? "Special" : "Standard"}</strong></p>}
      <div className="configured-estimate-line__pricing">
        {editable && classification === "special" ? <fieldset className="estimate-classification configured-estimate-line__modes" aria-label={`Pricing mode for ${label}`}>
          <legend>Pricing mode</legend>
          {(["pmc", "sub_vendor", "in_house"] as const).map((mode) => <label key={mode}><input type="radio" name={`line-pricing-mode-${line.key}`} value={mode} checked={line.pricingMode === mode} aria-label={`${estimatePricingModeLabels[mode]} pricing mode for ${label}`} onChange={() => onUpdateLine(line.key, { pricingMode: mode })} /><span>{estimatePricingModeLabels[mode]}</span></label>)}
        </fieldset> : <p>Pricing mode: <strong>{line.pricingMode ? estimatePricingModeLabels[line.pricingMode] : editable && referenceMode ? "Sub-Vendor (current base reference)" : "Not recorded"}</strong></p>}
        {editable ? <p className="configured-estimate-line__base" id={`${inputId}-base`}>
          {!referenceMode ? "Choose pricing mode" : baseRate === null ? "Base price not configured" : `Base price: ${moneyPaise(baseRate)} / ${line.uomName}`}
        </p> : null}
      </div>
      {editable && line.pricingMode === "in_house" && line.inHouseComponents !== undefined && line.rateSource === "manual" ? <button type="button" className="button button--secondary" onClick={() => onUpdateLine(line.key, { rateSource: "configuration" })}>Use component calculation for {line.mainLineName}</button> : null}
      <EstimateInHouseComponents line={line} editable={editable} onChange={(selectedInHouseComponentIds) => onUpdateLine(line.key, { selectedInHouseComponentIds })} />
    </div> : null}
    <EstimateComponentPricingStatus line={line} editable={editable} />
    {rateRequired || rateInvalid ? <p id={`${inputId}-message`} className="configured-estimate-line__message">{rateRequired ? "Rate required" : "Enter a non-negative rate with up to two decimal places."}</p> : null}
    {quantityInvalid && !line.dimensionsMandatory ? <p className="configured-estimate-line__message">Quantity must match {line.uomName} precision.</p> : null}
    {amountTooLarge ? <p id={`${inputId}-amount-overflow`} className="configured-estimate-line__message">Amount too large for this quantity and price.</p> : null}
    {line.uomNeedsQuantityReview && !line.sourceMissing && !line.dimensionsMandatory ? <p className="configured-estimate-line__message" role="alert">Unit changed{line.previousUomName ? ` from ${line.previousUomName}` : ""} to {line.uomName}. Re-enter the quantity for this unit.</p> : null}
  </EstimateLineLayout>;
}
