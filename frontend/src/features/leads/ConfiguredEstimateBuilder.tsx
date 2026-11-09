import { EstimateSubBasketModes } from "../estimates/EstimateSubBasketModes";
import { EstimateSubBasketTierInfo, EstimateTierInfoButton } from "./EstimateSubBasketTierInfo";
import { useEstimateTierSuggestions, type EstimateTierSuggestionGroup, type EstimateTierSuggestionState } from "./useEstimateTierSuggestions";
import type { EstimateTierComparisonInput } from "../estimates/estimateTierComparisonApi";
import { EstimateComponentPricingStatus, EstimateSubBasketAmounts } from "./EstimateComponentBreakdown";
import { EstimateDimensionsFields } from "./EstimateDimensionsFields";
import { KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { useConfiguredEstimateViewState, type ConfiguredEstimateViewState } from "./useConfiguredEstimateViewState";
import type { LucideIcon } from "lucide-react";

import { EstimatePricingModeControl } from "../estimates/EstimatePricingModeControl";
import { EstimateItemPicker, EstimateSelectionPagination } from "../estimates/EstimateItemPicker";
import type { EstimateRecommendationsPopup } from "../estimates/EstimateRecommendations";
import type { EstimationCatalogue } from "./estimationCatalogueApi";
import type { EstimateClassification, EstimatePricingMode } from "./leadsApi";
import { configuredTierGroupKey, configuredLineInTierGroup, type ConfiguredTierGroupScope, configuredAttributedAmountPaise, configuredUsesComponentPricing, configuredDimensionsIssue, configuredInHouseSelectionIssue, configuredLineAmountPaise, configuredLinePreviewAmountPaise, configuredTierUnavailableReason, configuredQuantityUnits, parseSellingRate, type ConfiguredLineDraft } from "./configuredEstimate";
import { EstimateInHouseComponents } from "./EstimateInHouseComponents";
import { EstimatorRecommendations, type RecommendationReadState } from "./EstimatorRecommendations";
import { recommendationTargetIdentity, type RoomRecommendationView, type RecommendedLineTarget } from "./roomRecommendations";
import { EstimateBuilderShell, type EstimateShellBasket } from "../estimates/EstimateBuilderShell";
import { EstimateLineActions, EstimateLineChoice, EstimateLineLayout, EstimateLineTierNotes, EstimateLineTierOptions } from "../estimates/EstimateLineRow";
import { buildSalesEstimateCatalogue } from "./salesEstimateCatalogue";

interface Room {
  id: string;
  typeId: string;
  label: string;
  sqft: number;
}

const itemCount = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

export function ConfiguredEstimateBuilder({
  rooms, activeRoomId, onSelectRoom, catalogue, selectedMainBasketIds, mainBasketClassifications, lines,
  onUpdateLine, getTierComparison, tierSuggestionContext, onRefreshAvailableItems, refreshingAvailableItems, availableItemsState = "ready", roomTotal, moneyPaise, editable, pricingModeEditable = editable,
  recommendationSourceCount = 0, recommendationState = "ready", recommendationView = null,
  onRetryRecommendations = () => {}, onSelectRecommendedLine = () => false, onRemoveRecommendedLine = () => false, onAddLine, recommendationContextKey,
  navigation, viewState, onViewStateChange, onRemoveSubBasket, excludedReviewKeys, reviewContextKey = "current",
  itemPresentation = "selected", onUpdateAvailableLine, recommendationPopup, browseMainBasketIds, onBrowseRecommendationBasket
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
  tierSuggestionContext?: string;
  getTierComparison?: (scope: ConfiguredTierGroupScope, lines: readonly ConfiguredLineDraft[]) => {
    target: { kind: "lead" | "project"; id: string }; input: EstimateTierComparisonInput;
  } | undefined;
  onRefreshAvailableItems: () => void;
  refreshingAvailableItems: boolean;
  availableItemsState?: "ready" | "loading" | "error" | "stale";
  roomTotal: (roomId: string) => number;
  roomIcons: Record<string, LucideIcon>;
  moneyPaise: (value: number) => string;
  editable: boolean;
  pricingModeEditable?: boolean;
  recommendationSourceCount?: number;
  recommendationState?: RecommendationReadState;
  recommendationView?: RoomRecommendationView | null;
  recommendationContextKey?: string;
  onRetryRecommendations?: () => void;
  onSelectRecommendedLine?: (target: RecommendedLineTarget) => boolean | void;
  onRemoveRecommendedLine?: (target: RecommendedLineTarget) => boolean | void;
  onAddLine?: (target: RecommendedLineTarget) => boolean | void;
  navigation?: ReactNode;
  viewState?: ConfiguredEstimateViewState;
  onViewStateChange?: Dispatch<SetStateAction<ConfiguredEstimateViewState>>;
  excludedReviewKeys?: ReadonlySet<string>;
  reviewContextKey?: string;
  itemPresentation?: "selected" | "catalogue";
  browseMainBasketIds?: ReadonlySet<string>;
  onBrowseRecommendationBasket?: (basketId: string) => boolean | void;
  recommendationPopup?: Pick<EstimateRecommendationsPopup, "open" | "onOpenChange" | "footerRef">;
  onUpdateAvailableLine?: (roomId: string, target: RecommendedLineTarget, change: Partial<ConfiguredLineDraft>) => void;
}) {
  const { state, setState, search, setSearch, basketFilter, setBasketFilter,
    setCollapsedBasketIds, setCollapsedSubBasketIds } = useConfiguredEstimateViewState(viewState, onViewStateChange);
  const recommendationFallbackFocusRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const tierInfoTriggerRef = useRef<HTMLButtonElement>(null);
  const [tierInfo, setTierInfo] = useState<{ context: string; scope: ConfiguredTierGroupScope } | null>(null);
  const nonPmcModes = useRef<{ context: string; modes: Map<string, "sub_vendor" | "in_house"> }>({
    context: reviewContextKey, modes: new Map()
  });
  useLayoutEffect(() => {
    nonPmcModes.current = { context: reviewContextKey, modes: new Map() };
  }, [reviewContextKey]);
  const getPmcToggleMode = (line: ConfiguredLineDraft): EstimatePricingMode => {
    if (nonPmcModes.current.context !== reviewContextKey) {
      nonPmcModes.current = { context: reviewContextKey, modes: new Map() };
    }
    const remembered = nonPmcModes.current.modes;
    if (line.pricingMode === "pmc") return remembered.get(line.key) ?? "sub_vendor";
    if (line.pricingMode === "sub_vendor" || line.pricingMode === "in_house") remembered.set(line.key, line.pricingMode);
    else remembered.delete(line.key);
    return "pmc";
  };
  const selectedCount = lines.filter(line => line.included).length;
  const activeRoom = rooms.find(room => room.id === activeRoomId) ?? rooms[0];
  const roomLines = lines.filter(line => line.roomId === activeRoom?.id && line.included);
  const infoBasket = tierInfo ? catalogue.items.find(basket => basket.id === tierInfo.scope.mainBasketId && selectedMainBasketIds.has(basket.id)) : undefined;
  const infoSubBasket = infoBasket?.subBaskets.find(subBasket => subBasket.id === tierInfo?.scope.subBasketId);
  const infoLines = tierInfo ? lines.filter(line => configuredLineInTierGroup(line, tierInfo.scope)) : [];
  const infoOpen = Boolean(tierInfo && tierSuggestionContext && tierInfo.context === tierSuggestionContext &&
    tierInfo.scope.roomId === activeRoom?.id && infoBasket && (tierInfo.scope.subBasketId === null || infoSubBasket) && infoLines.length);
  useEffect(() => { if (tierInfo && !infoOpen) setTierInfo(null); }, [tierInfo, infoOpen]);
  const browseCatalogue = itemPresentation === "catalogue";
  const browsableBaskets = browseMainBasketIds ?? selectedMainBasketIds;
  const visibleBaskets = catalogue.items.filter(basket => selectedMainBasketIds.has(basket.id) &&
    (browseCatalogue && browsableBaskets.has(basket.id) || roomLines.some(line =>
      line.mainBasketId === basket.id && !line.sourceMissing)));
  const catalogueRows = useMemo(() => browseCatalogue && activeRoom
    ? buildSalesEstimateCatalogue({ catalogue, room: activeRoom, selectedMainBasketIds, browseMainBasketIds: browsableBaskets, lines }) : [],
  [browseCatalogue, catalogue, activeRoom, selectedMainBasketIds, browsableBaskets, lines]);
  const [retainedReview, setRetainedReview] = useState<{ context: string; keys: Set<string> }>(() => ({ context: reviewContextKey, keys: new Set() }));
  useEffect(() => { setRetainedReview({ context: reviewContextKey, keys: new Set() }); }, [reviewContextKey]);
  const inlineEditContext = JSON.stringify([reviewContextKey, activeRoom?.id, search, basketFilter]);
  const [focusedInlineLine, setFocusedInlineLine] = useState<{ context: string; key: string } | null>(null);
  const inlineReviewKey = browseCatalogue && focusedInlineLine?.context === inlineEditContext &&
    catalogueRows.some(row => row.line.key === focusedInlineLine.key) ? focusedInlineLine.key : null;
  const requiredReviewKeys = lines.filter(line => line.persistedId && !line.included && excludedReviewKeys?.has(line.key)).map(line => line.key);
  const reviewKeys = new Set([...(retainedReview.context === reviewContextKey ? retainedReview.keys : []), ...requiredReviewKeys]);
  const reviewLines = lines.filter(line => line.persistedId && !line.included && reviewKeys.has(line.key) && line.key !== inlineReviewKey);
  const displayedReviewKeys = new Set(reviewLines.map(line => line.key));
  const availableRoomLines = browseCatalogue ? catalogueRows.filter(row => !displayedReviewKeys.has(row.line.key)).map(row => row.line) : roomLines;
  const [groupOffsets, setGroupOffsets] = useState<Record<string, number>>({});
  const recommendationToReveal = useRef<{ roomId: string; target: RecommendedLineTarget } | null>(null);
  const browseFocus = useRef<{ roomId: string; basketId: string; trigger: HTMLButtonElement; fallback: HTMLButtonElement | null } | null>(null);
  useLayoutEffect(() => {
    const pending = browseFocus.current;
    if (!pending) return;
    if (pending.roomId !== activeRoom?.id || !selectedMainBasketIds.has(pending.basketId) ||
      document.activeElement !== pending.trigger && document.activeElement !== document.body) {
      browseFocus.current = null;
      return;
    }
    if (!browseCatalogue || !browsableBaskets.has(pending.basketId)) return;
    browseFocus.current = null;
    if (!pending.trigger.isConnected && pending.fallback?.isConnected && !pending.fallback.closest("[inert], [hidden]")) {
      pending.fallback.focus({ preventScroll: true });
    }
  }, [activeRoom?.id, selectedMainBasketIds, browseCatalogue, browsableBaskets]);
  useEffect(() => { setGroupOffsets({}); }, [activeRoom?.id, search, basketFilter, catalogue]);
  useEffect(() => {
    const pending = recommendationToReveal.current;
    if (!pending) return;
    if (pending.roomId !== activeRoom?.id) { recommendationToReveal.current = null; return; }
    const target = pending.target;
    const group = availableRoomLines.filter(line => line.mainBasketId === target.basketId && line.subBasketId === target.subBasketId);
    const index = group.findIndex(line => line.mainLineId === target.mainLineId && line.included);
    if (index < 0) return;
    recommendationToReveal.current = null;
    const key = `${target.basketId}:${target.subBasketId ?? "direct"}`;
    setGroupOffsets(current => ({ ...current, [key]: Math.floor(index / 20) * 20 }));
  }, [activeRoom?.id, availableRoomLines]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerBasket, setPickerBasket] = useState("all");
  const [pickerSubBasket, setPickerSubBasket] = useState("all");
  const [pickerOffset, setPickerOffset] = useState(0);
  useEffect(() => {
    setPickerOpen(false); setPickerSearch(""); setPickerBasket("all"); setPickerSubBasket("all"); setPickerOffset(0);
  }, [activeRoom?.id]);
  const pickerBaskets = catalogue.items;
  useEffect(() => {
    const basket = pickerBaskets.find(item => item.id === pickerBasket);
    if (pickerBasket !== "all" && !basket) {
      setPickerBasket("all"); setPickerSubBasket("all"); setPickerOffset(0);
    } else if (pickerSubBasket !== "all" && !basket?.subBaskets.some(item => item.id === pickerSubBasket)) {
      setPickerSubBasket("all"); setPickerOffset(0);
    }
  }, [pickerBaskets, pickerBasket, pickerSubBasket]);
  const availableTargets = useMemo(() => pickerBaskets.flatMap(basket => [
    ...(basket.directTemporaryItems ?? []).map(item => ({ item, basket, subBasket: null })),
    ...basket.subBaskets.flatMap(subBasket => [...subBasket.mainLines, ...(subBasket.temporaryItems ?? [])].map(item => ({ item, basket, subBasket })))
  ].map(({ item, basket, subBasket }) => {
    const target = { mainLineId: item.mainLineId, basketId: basket.id, subBasketId: subBasket?.id ?? null };
    return { id: recommendationTargetIdentity(target), name: item.name, context: [basket.name, subBasket?.name].filter(Boolean).join(" / "), target };
  })), [pickerBaskets]);
  const pickerQuery = pickerSearch.trim().toLocaleLowerCase();
  const pickerResults = availableTargets.filter(item =>
    (pickerBasket === "all" || item.target.basketId === pickerBasket) &&
    (pickerSubBasket === "all" || item.target.subBasketId === pickerSubBasket) &&
    (!pickerQuery || `${item.name} ${item.context}`.toLocaleLowerCase().includes(pickerQuery)));
  const pageOffset = Math.min(pickerOffset, Math.max(0, Math.ceil(pickerResults.length / 20) - 1) * 20);
  const includedTargets = new Set(roomLines.map(line => recommendationTargetIdentity({ mainLineId: line.mainLineId, basketId: line.mainBasketId, subBasketId: line.subBasketId })));
  const addItem = (id: string) => {
    if (!editable || refreshingAvailableItems || availableItemsState !== "ready" || !activeRoom) return false;
    const item = availableTargets.find(item => item.id === id);
    if (!item || includedTargets.has(id)) return false;
    const accepted = onAddLine ? onAddLine(item.target) : (() => {
      const existing = lines.find(line => line.roomId === activeRoom.id && line.mainLineId === item.target.mainLineId && !line.sourceMissing);
      if (!existing) return false;
      onUpdateLine(existing.key, { included: true }); return true;
    })();
    if (accepted === false) return false;
    setSearch(""); setBasketFilter("all");
    setCollapsedBasketIds(current => { const next = new Set(current); next.delete(item.target.basketId); return next; });
    setCollapsedSubBasketIds(current => { const next = new Set(current); next.delete(`${item.target.basketId}:${item.target.subBasketId}`); return next; });
    return true;
  };
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
  const browseCountLabel = (groupLines: readonly ConfiguredLineDraft[]) => `${groupLines.filter(line => line.included).length} selected · ${groupLines.length} available`;
  const pageGroup = (groupLines: readonly ConfiguredLineDraft[], key: string, label: string) => {
    const filtered = groupLines.filter(matches);
    const offset = Math.min(groupOffsets[key] ?? 0, Math.max(0, Math.ceil(filtered.length / 20) - 1) * 20);
    return {
      lines: (browseCatalogue ? filtered.slice(offset, offset + 20) : filtered).map(line => ({ id: line.key })),
      afterLines: browseCatalogue && filtered.length > 20 ? <EstimateSelectionPagination total={filtered.length} offset={offset}
        onChange={value => setGroupOffsets(current => ({ ...current, [key]: value }))} disabled={false} label={`${label} item pages`} /> : undefined
    };
  };
  const groupComparisonControl = (mainBasketId: string, subBasketId: string | null, name: string, inline = false) => {
    if (!activeRoom) return undefined;
    const scope = { roomId: activeRoom.id, mainBasketId, subBasketId };
    // Use the full included group, independent of search, collapsed state, or pagination.
    const included = lines.filter(line => configuredLineInTierGroup(line, scope));
    if (!included.length) return undefined;
    const comparison = getTierComparison?.(scope, included);
    return <EstimateSubBasketModes comparisonOnly inline={inline} label={`${name} in ${activeRoom.label}`} value="mode" options={[]}
      onChange={() => {}} comparison={comparison}
      detailsDisabledReason={!comparison ? "Refresh the estimate and complete quantities to compare current tier prices." : undefined} />;
  };
  const groupInfoControl = (mainBasketId: string, subBasketId: string | null, name: string) => {
    if (!activeRoom || !tierSuggestionContext || !getTierComparison) return undefined;
    const scope = { roomId: activeRoom.id, mainBasketId, subBasketId };
    if (!lines.some(line => configuredLineInTierGroup(line, scope))) return undefined;
    return <EstimateTierInfoButton label={`${name} in ${activeRoom.label}`} onClick={event => {
      tierInfoTriggerRef.current = event.currentTarget;
      setTierInfo({ context: tierSuggestionContext, scope });
    }} />;
  };
  const subBasketHeadingActions = (mainBasketId: string, subBasketId: string, name: string) => {
    const info = groupInfoControl(mainBasketId, subBasketId, name);
    const comparison = groupComparisonControl(mainBasketId, subBasketId, name, true);
    return info || comparison ? <>{info}{comparison}</> : undefined;
  };
  const catalogueGroups: EstimateShellBasket[] = (activeRoom ? visibleBaskets : [])
    .filter(basket => browseCatalogue || roomLines.some(line => line.mainBasketId === basket.id && !line.sourceMissing))
    .filter(basket => visibleBasketFilter === "all" || visibleBasketFilter === basket.id)
    .map(basket => {
      const compact = browseCatalogue && !browsableBaskets.has(basket.id);
      const directLines = availableRoomLines.filter(line => line.mainBasketId === basket.id && line.itemType === "temporary" && line.subBasketId === null && !line.sourceMissing);
      const directPage = pageGroup(directLines, `${basket.id}:direct`, `Direct ${basket.name}`);
      const basketLines = availableRoomLines.filter(line => line.mainBasketId === basket.id && !line.sourceMissing);
      const subBaskets = basket.subBaskets.map(subBasket => ({
        id: subBasket.id, name: subBasket.name,
        lines: availableRoomLines.filter(line => line.mainBasketId === basket.id && line.subBasketId === subBasket.id && !line.sourceMissing)
      }));
      return { id: basket.id, name: basket.name,
        count: directLines.length + subBaskets.reduce((sum, subBasket) => sum + subBasket.lines.length, 0),
        countLabel: compact ? `${basketLines.length} selected` : browseCatalogue ? browseCountLabel(basketLines) : undefined,
        beforeLines: compact ? <div className="configured-estimate-basket__empty">
          <p>Showing selected items in this room.</p>
          <button type="button" className="button button--secondary"
            disabled={!editable || refreshingAvailableItems || availableItemsState !== "ready" || !onBrowseRecommendationBasket}
            onBlur={event => { if (browseFocus.current?.trigger === event.currentTarget) browseFocus.current = null; }}
            onClick={event => {
              const trigger = event.currentTarget;
              browseFocus.current = activeRoom && document.activeElement === trigger ? {
                roomId: activeRoom.id, basketId: basket.id, trigger,
                fallback: trigger.closest(".configured-estimate-basket")?.querySelector<HTMLButtonElement>(".configured-estimate-basket__toggle") ?? null
              } : null;
              if (onBrowseRecommendationBasket?.(basket.id) === false) browseFocus.current = null;
            }}>Browse other items in {basket.name}</button>
        </div> : undefined,
        subtotalLabel: attributedSubtotalLabel(basket.id),
        directSubtotalLabel: attributedSubtotalLabel(basket.id, null),
        directHeaderActions: groupComparisonControl(basket.id, null, `Direct items in ${basket.name}`),
        directHeadingActions: groupInfoControl(basket.id, null, `Direct items in ${basket.name}`),
        directCountLabel: compact ? `${directLines.length} selected` : browseCatalogue ? browseCountLabel(directLines) : undefined,
        directLines: directPage.lines,
        afterDirectLines: directPage.afterLines,
        subBaskets: subBaskets.filter(subBasket => browseCatalogue && !compact || subBasket.lines.length > 0)
          .map(subBasket => ({ id: subBasket.id, name: subBasket.name, count: subBasket.lines.length,
            countLabel: compact ? `${subBasket.lines.length} selected` : browseCatalogue ? browseCountLabel(subBasket.lines) : undefined,
            emptyMessage: browseCatalogue && reviewLines.some(line => line.roomId === activeRoom?.id && line.mainBasketId === basket.id && line.subBasketId === subBasket.id)
              ? "Excluded items in this Sub Basket are shown above for review." : undefined,
            subtotalLabel: attributedSubtotalLabel(basket.id, subBasket.id),
            headingActions: subBasketHeadingActions(basket.id, subBasket.id, `${basket.name}, ${subBasket.name}`),
            ...pageGroup(subBasket.lines, `${basket.id}:${subBasket.id}`, `${basket.name}, ${subBasket.name}`),
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
    if (activeRoom) recommendationToReveal.current = { roomId: activeRoom.id, target };
    setSearch(""); setBasketFilter("all");
    setCollapsedBasketIds(current => { const next = new Set(current); next.delete(target.basketId); return next; });
    if (target.subBasketId) setCollapsedSubBasketIds(current => {
      const next = new Set(current); next.delete(`${target.basketId}:${target.subBasketId}`); return next;
    });
    return accepted;
  };
  const byId = new Map(lines.map(line => [line.key, line]));
  for (const row of catalogueRows) byId.set(row.line.key, row.line);
  const suggestionGroups: EstimateTierSuggestionGroup[] = [];
  const eligibleInfoLines = infoOpen ? infoLines.filter(line => !line.sourceMissing && !line.uomNeedsQuantityReview &&
    !configuredDimensionsIssue(line) && configuredQuantityUnits(line.quantity, line.uomDecimalScale, true) !== null &&
    Number.isSafeInteger(line.itemVersion ?? line.sourceItemVersion) && Number.isSafeInteger(line.revisionVersion ?? line.sourceRevisionVersion)) : [];
  if (infoOpen && tierInfo && getTierComparison && !refreshingAvailableItems && availableItemsState === "ready") {
    const request = eligibleInfoLines.length ? getTierComparison(tierInfo.scope, eligibleInfoLines) : undefined;
    if (request) suggestionGroups.push({ key: configuredTierGroupKey(tierInfo.scope), request,
      scopeMainLineIds: infoLines.map(line => line.mainLineId) });
  }
  const requestedInfoKeys = new Set(suggestionGroups.length ? eligibleInfoLines.map(line => line.key) : []);
  const previewById = new Map(catalogueRows.filter(row => row.isPreview).map(row => [row.line.key, row]));
  const updateVisibleLine = (key: string, change: Partial<ConfiguredLineDraft>) => {
    const preview = previewById.get(key);
    if (preview) {
      if (editable && !refreshingAvailableItems && availableItemsState === "ready") onUpdateAvailableLine?.(preview.line.roomId, preview.target, change);
      return;
    }
    if (browseCatalogue && change.included === true && (refreshingAvailableItems || availableItemsState !== "ready")) return;
    const focused = document.activeElement;
    onUpdateLine(key, change);
    if ((!browseCatalogue || !browsableBaskets.has(byId.get(key)?.mainBasketId ?? "")) && change.included === false && focused instanceof HTMLElement) window.requestAnimationFrame(() => {
      if (!focused.isConnected && document.activeElement === document.body) (pickerTriggerRef.current ?? recommendationFallbackFocusRef.current)?.focus();
    });
  };
  const renderLine = (id: string, suggestions: ReadonlyMap<string, EstimateTierSuggestionState>) => {
    const line = byId.get(id);
    if (!line) return null;
    const rowEditable = editable && (!previewById.has(id) || Boolean(onUpdateAvailableLine)) &&
      (!browseCatalogue || line.included || !refreshingAvailableItems && availableItemsState === "ready");
    const selectionBlocked = suggestions.get(configuredTierGroupKey(line))?.selectionBlocked;
    const row = <ConfiguredLineRow pricingModeEditable={pricingModeEditable} getPmcToggleMode={getPmcToggleMode} line={line} inheritedClassification={mainBasketClassifications?.get(line.mainBasketId)} editable={Boolean(rowEditable)}
      tierEditable={Boolean(rowEditable) && !refreshingAvailableItems && availableItemsState === "ready" && !selectionBlocked}
      onUpdateLine={updateVisibleLine} moneyPaise={moneyPaise} />;
    return browseCatalogue ? <div onFocusCapture={() => setFocusedInlineLine({ context: inlineEditContext, key: id })}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedInlineLine(current => current?.key === id ? null : current);
      }}>{row}</div> : row;
  };
  const recommendations = activeRoom ? <EstimatorRecommendations key={activeRoom.id}
    roomName={activeRoom.label} sourceCount={activeRoom.id === activeRoomId ? recommendationSourceCount : 0}
    state={recommendationState} view={recommendationView} editable={editable}
    contextKey={recommendationContextKey ?? activeRoom.id}
    selectionFeedback={browseCatalogue ? { contextKey: activeRoom.id } : undefined}
    completion={browseCatalogue && recommendationPopup ? {
      contextKey: JSON.stringify([tierSuggestionContext ?? reviewContextKey, activeRoom.id]), selectedTargetIds: includedTargets
    } : undefined}
    popup={recommendationPopup ? { ...recommendationPopup, toolbarRef, fallbackFocusRef: recommendationFallbackFocusRef } : undefined}
    onRemove={onRemoveRecommendedLine}
    onRetry={onRetryRecommendations} onRefresh={onRefreshAvailableItems} onSelect={selectRecommendedLine}
  /> : null;
  const renderBuilder = (suggestions: ReadonlyMap<string, EstimateTierSuggestionState>) => <><EstimateBuilderShell selectedItemsOnly
    rooms={rooms.map(room => ({ id: room.id, label: room.label, detail: `${room.sqft} sqft · ${roomAmountLabel(room.id)}`,
      hasSelectedItems: lines.some(line => line.roomId === room.id && line.included) }))}
    activeRoomId={activeRoomId} onSelectRoom={onSelectRoom} selectedCount={selectedCount}
    baskets={visibleBaskets.map(basket => ({ id: basket.id, name: basket.name,
      detail: `${browseCatalogue ? `${roomLines.filter(line => line.mainBasketId === basket.id && !line.sourceMissing).length} selected` : itemCount(roomLines.filter(line => line.mainBasketId === basket.id && !line.sourceMissing).length)} · ${attributedSubtotalLabel(basket.id)}` }))}
    groups={catalogueGroups} renderLine={id => renderLine(id, suggestions)}
    viewState={state} onViewStateChange={setState}
    onRefresh={onRefreshAvailableItems} refreshing={refreshingAvailableItems}
    navigation={navigation} searchInputRef={recommendationFallbackFocusRef}
    toolbarRef={toolbarRef} toolbarActions={recommendationPopup ? recommendations : undefined}
    extraJumpTargets={[
      ...(unselected.length ? [{ id: "unselected-items", label: "Unselected saved items" }] : []),
      ...(unavailableSaved.length ? [{ id: "saved-items", label: "Saved items" }] : []),
      ...(unavailableNew.length ? [{ id: "unavailable-selections", label: "Unavailable selections" }] : [])
    ]}
    beforeGroups={<>
      <ExcludedEstimateReview pricingModeEditable={pricingModeEditable} getPmcToggleMode={getPmcToggleMode} lines={reviewLines} requiredCount={reviewLines.filter(line => excludedReviewKeys?.has(line.key)).length} contextKey={reviewContextKey}
        editable={editable && (!browseCatalogue || !refreshingAvailableItems && availableItemsState === "ready")} onUpdateLine={(key, change) => {
          setRetainedReview(current => {
            const keys = new Set(current.context === reviewContextKey ? current.keys : []);
            if (change.included === true) keys.delete(key); else keys.add(key);
            return { context: reviewContextKey, keys };
          });
          onUpdateLine(key, change);
        }} moneyPaise={moneyPaise}
        onFinish={() => { setRetainedReview({ context: reviewContextKey, keys: new Set() }); (pickerTriggerRef.current ?? recommendationFallbackFocusRef.current)?.focus(); }} />
      {browseCatalogue && !refreshingAvailableItems && availableItemsState !== "ready" ? <div role={availableItemsState === "loading" ? "status" : "alert"}>
        <p>{availableItemsState === "loading" ? "Loading available items…" : availableItemsState === "error" ? "Available items could not be refreshed. Your selections are preserved." : "Available items are out of date. Refresh before selecting more items."}</p>
        {availableItemsState !== "loading" ? <button type="button" className="button button--secondary" onClick={onRefreshAvailableItems}>Retry available items</button> : null}
      </div> : null}
      {!browseCatalogue && activeRoom && editable ? <EstimateItemPicker roomName={activeRoom.label} open={pickerOpen} onOpenChange={setPickerOpen} triggerRef={pickerTriggerRef}
        items={pickerResults.slice(pageOffset, pageOffset + 20).map(item => {
          const saved = lines.find(line => line.roomId === activeRoom.id && line.mainLineId === item.target.mainLineId);
          const incompatible = Boolean(saved && (saved.mainBasketId !== item.target.basketId || saved.subBasketId !== item.target.subBasketId));
          return { ...item, selected: includedTargets.has(item.id), disabled: incompatible,
            message: incompatible ? "This saved item's Configuration grouping changed. Review it before adding it again." : undefined };
        })}
        total={pickerResults.length} offset={pageOffset} onOffsetChange={setPickerOffset}
        search={pickerSearch} onSearchChange={value => { setPickerSearch(value); setPickerOffset(0); }}
        baskets={pickerBaskets} basketId={pickerBasket} onBasketChange={value => { setPickerBasket(value); setPickerSubBasket("all"); setPickerOffset(0); }}
        subBasketId={pickerSubBasket} onSubBasketChange={value => { setPickerSubBasket(value); setPickerOffset(0); }}
        state={refreshingAvailableItems ? "loading" : availableItemsState} disabled={!editable || refreshingAvailableItems}
        onRetry={onRefreshAvailableItems} onAdd={addItem} /> : null}
      {recommendationPopup ? null : recommendations}
      <EstimateSubBasketAmounts lines={roomLines} />
    </>}
    renderEmptyBasket={basket => browseCatalogue && !browsableBaskets.has(basket.id)
      ? <p className="configured-estimate-basket__empty">No items selected in this room.</p>
      : <div className="configured-estimate-basket__empty">
      <p>{browseCatalogue && reviewLines.some(line => line.roomId === activeRoom?.id && line.mainBasketId === basket.id)
        ? "Excluded items in this Main Basket are shown above for review." : "No available items."}</p>
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
            <ConfiguredLineRow pricingModeEditable={pricingModeEditable} getPmcToggleMode={getPmcToggleMode} line={line} editable={false} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
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
            <ConfiguredLineRow pricingModeEditable={pricingModeEditable} getPmcToggleMode={getPmcToggleMode} line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
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
            <ConfiguredLineRow pricingModeEditable={pricingModeEditable} getPmcToggleMode={getPmcToggleMode} line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
          </div>)}
        </section> : null}
    </>}
    emptyMessage={!catalogueGroups.length && !unselected.length && !unavailableSaved.length && !unavailableNew.length
      ? !selectedMainBasketIds.size ? "Select a Main Basket to choose items."
        : !activeRoom ? "Select a room to see its available items."
        : query ? `No ${browseCatalogue ? "available" : "selected"} items match “${search.trim()}”.`
        : browseCatalogue ? "No available items in the selected Main Baskets. Refresh available items to check again." : "No items selected in this room. Use Add items to choose what is needed."
      : undefined}
  />
    {infoOpen && tierInfo ? <EstimateSubBasketTierInfo
      title={`Tier prices: ${infoBasket!.name}, ${infoSubBasket?.name ?? "Direct items"} in ${activeRoom!.label}`}
      lines={infoLines.map(line => ({ key: line.key, label: line.mainLineName, mainLineId: line.mainLineId,
        state: requestedInfoKeys.has(line.key) ? suggestions.get(configuredTierGroupKey(tierInfo.scope)) ?? { status: "loading" } : {
          status: "unavailable", message: configuredDimensionsIssue(line) ?? (line.uomNeedsQuantityReview
            ? "Review the current unit and quantity to compare prices." : "Current prices are unavailable. Refresh available items and complete the quantity.")
        } }))}
      moneyPaise={moneyPaise} onClose={() => setTierInfo(null)} returnFocusRef={tierInfoTriggerRef} fallbackFocusRef={recommendationFallbackFocusRef} /> : null}
  </>;
  return tierSuggestionContext ? <ConfiguredTierSuggestionLoader context={tierSuggestionContext} groups={suggestionGroups}>
    {renderBuilder}
  </ConfiguredTierSuggestionLoader> : renderBuilder(new Map());
}

function ConfiguredTierSuggestionLoader({ context, groups, children }: {
  context: string;
  groups: readonly EstimateTierSuggestionGroup[];
  children: (suggestions: ReadonlyMap<string, EstimateTierSuggestionState>) => ReactNode;
}) {
  return children(useEstimateTierSuggestions(context, groups));
}

/** Keep only blocking excluded rows discoverable until a complete correction is entered. */
function ExcludedEstimateReview({ lines, requiredCount, contextKey, editable, pricingModeEditable, onUpdateLine, moneyPaise, onFinish, getPmcToggleMode }: {
  pricingModeEditable: boolean;
  getPmcToggleMode: (line: ConfiguredLineDraft) => EstimatePricingMode;
  lines: readonly ConfiguredLineDraft[];
  requiredCount: number;
  contextKey: string;
  editable: boolean;
  onUpdateLine: (key: string, change: Partial<ConfiguredLineDraft>) => void;
  moneyPaise: (value: number) => string;
  onFinish: () => void;
}) {
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(0); }, [contextKey]);
  if (!lines.length) return null;
  const pageOffset = Math.min(offset, Math.max(0, Math.ceil(lines.length / 20) - 1) * 20);
  return <section className="estimate-selection" aria-label="Excluded items needing review">
    <div className="estimate-selection__heading"><h2>Excluded items needing review</h2><span>{requiredCount} to review</span></div>
    <p>These saved items stay excluded. Correct the highlighted values before saving.</p>
    {lines.slice(pageOffset, pageOffset + 20).map(line => <div key={line.key} className="configured-estimate-saved-line">
      <p>{line.roomName} · {line.mainBasketName}{line.subBasketName ? ` / ${line.subBasketName}` : ""}</p>
      {line.sourceMissing ? <p role="status">This saved item is unavailable in current Configuration. Refresh available items or review its saved basket.</p> : null}
      <ConfiguredLineRow pricingModeEditable={pricingModeEditable} getPmcToggleMode={getPmcToggleMode} line={line} editable={editable} onUpdateLine={onUpdateLine} moneyPaise={moneyPaise} />
    </div>)}
    <EstimateSelectionPagination total={lines.length} offset={pageOffset} onChange={setOffset}
      disabled={false} label="Excluded review pages" />
    <button type="button" disabled={requiredCount > 0} onClick={() => { setOffset(0); onFinish(); }}>Finish reviewing excluded items</button>
  </section>;
}

function ConfiguredLineRow({ line, inheritedClassification = "standard", editable, tierEditable = false, pricingModeEditable, onUpdateLine, moneyPaise, getPmcToggleMode }: {
  pricingModeEditable: boolean;
  getPmcToggleMode: (line: ConfiguredLineDraft) => EstimatePricingMode;
  line: ConfiguredLineDraft;
  inheritedClassification?: EstimateClassification;
  editable: boolean;
  tierEditable?: boolean;
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
  const canEditMode = editable && pricingModeEditable && !line.sourceMissing;
  const referenceMode = line.pricingMode ?? (classification !== "special" ? "sub_vendor" : undefined);
  const tierOptions = KNOWLEDGE_MODE_TIERS.map(value => ({ value, label: KNOWLEDGE_MODE_TIER_LABELS[value],
    disabledReason: line.sourceMissing ? "Current Configuration unavailable" : configuredTierUnavailableReason(line, value, referenceMode) ??
      (!pricingModeEditable && referenceMode !== line.pricingMode ? "Pricing mode cannot be changed at this estimate stage." : null) }));
  const tierAvailabilityId = `${inputId}-tier-availability`;
  const step = 10 ** -line.uomDecimalScale;
  const changeQuantity = (direction: -1 | 1) => {
    const units = Math.round((Number.isFinite(line.quantity) ? line.quantity : 0) / step);
    const minimum = line.included ? 1 : 0;
    onUpdateLine(line.key, { quantity: Math.max(minimum, units + direction * 10 ** line.uomDecimalScale) * step });
  };
  return <EstimateLineLayout included={line.included}
    choice={<EstimateLineChoice name={line.mainLineName} unit={line.uomName} included={line.included} disabled={!editable}
      accessibleLabel={`Include ${line.mainLineName} in ${line.roomName}`}
      onToggle={included => onUpdateLine(line.key, { included })} />}
    tier={line.included ? <EstimateLineTierOptions label={label} groupName={`line-tier-${line.key}`}
      value={line.rateSource === "configuration" ? line.modeTier ?? "signature" : null}
      options={tierOptions} disabled={!editable || !tierEditable || line.sourceMissing} availabilityId={tierAvailabilityId}
      onChange={modeTier => onUpdateLine(line.key, { modeTier, rateSource: "configuration" })} /> : null}
    type={line.included ? editable ? <fieldset className="estimate-classification configured-estimate-line__classification" aria-label={`Item type for ${label}`}>
      <legend>Type</legend>
      <div className="configured-estimate-line__choices">
        {(["standard", "special"] as const).map((value) => <label key={value}><input type="radio" name={`line-classification-${line.key}`} value={value} checked={classification === value} disabled={!canEditMode && value === "standard" && classification === "special" && line.pricingMode !== "sub_vendor"} aria-label={`${value === "standard" ? "Standard" : "Special"} item type for ${label}`} onChange={() => onUpdateLine(line.key, { classification: value })} /><span>{value === "standard" ? "Standard" : "Special"}</span></label>)}
      </div>
    </fieldset> : <div className="configured-estimate-line__readonly"><span>Type</span><strong>{classification === "special" ? "Special" : "Standard"}</strong></div> : null}
    pricing={line.included ? <EstimatePricingModeControl mode={line.pricingMode ?? (editable ? referenceMode : undefined)} label={label}
      groupName={`line-pricing-mode-${line.key}`} editable={canEditMode && classification === "special"}
      onTogglePmc={() => onUpdateLine(line.key, { pricingMode: getPmcToggleMode(line) })}
      onChange={pricingMode => onUpdateLine(line.key, { pricingMode })} /> : null}
    fields={<>
      {line.dimensionsMandatory ? <div className="configured-estimate-line__quantity configured-estimate-line__quantity--calculated"><span>Qty ({line.uomName})</span><output aria-label={`Quantity (${line.uomName}) for ${label}`}>{Number.isFinite(line.quantity) && !configuredDimensionsIssue(line) ? line.quantity : "Pending"}</output></div> : <label className="configured-estimate-line__quantity"><span>Qty ({line.uomName})</span><span className="configured-estimate-line__stepper"><button type="button" aria-label={`Decrease quantity for ${label}`} disabled={!editable || !Number.isFinite(line.quantity) || line.quantity <= (line.included ? step : 0)} onClick={() => changeQuantity(-1)}>−</button><input type="number" min={line.included ? step : 0} step={step} value={Number.isFinite(line.quantity) ? line.quantity : ""} disabled={!editable} aria-label={`Quantity (${line.uomName}) for ${label}`} aria-invalid={quantityInvalid || amountTooLarge} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : undefined} onChange={(event) => onUpdateLine(line.key, { quantity: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /><button type="button" aria-label={`Increase quantity for ${label}`} disabled={!editable} onClick={() => changeQuantity(1)}>+</button></span></label>}
      <label className="configured-estimate-line__rate" htmlFor={inputId}><span aria-hidden="true">Rate (₹/{line.uomName})</span><span className="sr-only">Selling rate (₹/{line.uomName}) for {label}</span><input id={inputId} type="text" inputMode="decimal" value={componentCalculated ? "" : line.rateInput} placeholder={componentCalculated ? "Override" : undefined} disabled={!editable} aria-label={`Selling rate (₹/${line.uomName}) for ${label}`} aria-invalid={rateInvalid || rateRequired || amountTooLarge} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : rateInvalid || rateRequired ? `${inputId}-message` : undefined} onChange={(event) => onUpdateLine(line.key, { rateInput: event.target.value })} /></label>
      <div className="configured-estimate-line__amount"><span className={line.included ? "sr-only" : undefined}>Amount{line.included ? "" : " · Not included"}</span><output aria-label={line.included ? `Amount for ${label}` : `Preview amount for ${label}, not included in totals`} aria-describedby={amountTooLarge ? `${inputId}-amount-overflow` : undefined}>{amountTooLarge ? "Too large" : amount === null ? "Pending" : moneyPaise(amount)}</output></div>
      <EstimateLineActions name={line.mainLineName} disabled={!editable} included={line.included}
        onToggle={() => onUpdateLine(line.key, { included: !line.included })}
        onResetQuantity={line.dimensionsMandatory ? undefined : () => onUpdateLine(line.key, { quantity: 1 })} />
    </>}>
    {line.included ? <EstimateLineTierNotes options={tierOptions} id={tierAvailabilityId} /> : null}
    {line.estimateNotes?.map((note, index) => <small key={index}>{note}</small>)}
    {sourceStatus === "draft" || sourceStatus === "inactive" ? <small className="configured-estimate-line__source">{sourceStatus === "draft" ? "Draft" : "Inactive"} source</small> : null}
    {componentCalculated ? <small className="configured-estimate-line__component-rate">Calculated rate · Enter a rate to override.</small> : line.rateSource === "manual" ? <small className="configured-estimate-line__component-rate">Manual price</small> : null}
    {line.dimensionsMandatory ? <EstimateDimensionsFields compact label={label} dimensions={line.dimensions} rule={line.dimensionRule} quantityUnit={line.uomName} disabled={!editable}
      needsReview={line.dimensionsNeedReview} onChange={dimensions => onUpdateLine(line.key, { dimensions })}
      onConfirm={() => onUpdateLine(line.key, { dimensionsNeedReview: false, uomNeedsQuantityReview: false, previousUomName: undefined })} /> : null}
    {line.included && line.pricingMode === "in_house" && line.inHouseComponents !== undefined ? <div className="configured-estimate-line__options">
      {editable && line.rateSource === "manual" ? <button type="button" className="button button--secondary estimate-component-action" aria-label={`Use component calculation for ${line.mainLineName}`} onClick={() => onUpdateLine(line.key, { rateSource: "configuration" })}>Use calculated rate</button> : null}
      <EstimateInHouseComponents line={line} editable={editable} onChange={(selectedInHouseComponentIds) => onUpdateLine(line.key, { selectedInHouseComponentIds })} />
    </div> : null}
    <EstimateComponentPricingStatus line={line} editable={editable}
      displayedIssue={editable ? configuredInHouseSelectionIssue(line) : undefined} />
    {rateRequired || rateInvalid ? <p id={`${inputId}-message`} className="configured-estimate-line__message error">{rateRequired ? "Rate required" : "Enter a non-negative rate with up to two decimal places."}</p> : null}
    {quantityInvalid && !line.dimensionsMandatory ? <p className="configured-estimate-line__message error">Quantity must match {line.uomName} precision.</p> : null}
    {amountTooLarge ? <p id={`${inputId}-amount-overflow`} className="configured-estimate-line__message error">Amount too large for this quantity and price.</p> : null}
    {line.uomNeedsQuantityReview && !line.sourceMissing && !line.dimensionsMandatory ? <p className="configured-estimate-line__message" role="alert">Unit changed{line.previousUomName ? ` from ${line.previousUomName}` : ""} to {line.uomName}. Re-enter the quantity for this unit.</p> : null}
  </EstimateLineLayout>;
}
