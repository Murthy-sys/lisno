import { useEffect, useState } from "react";
import { EstimateRecommendations, type EstimateRecommendationItem, type EstimateRecommendationsPopup } from "../estimates/EstimateRecommendations";
import { recommendationLines, type RoomRecommendationView, type RecommendedLineTarget } from "./roomRecommendations";

export type RecommendationReadState = "loading" | "ready" | "error" | "forbidden" | "stale";

interface EstimatorRecommendationsProps {
  roomName: string;
  contextKey: string;
  sourceCount: number;
  state: RecommendationReadState;
  view: RoomRecommendationView | null;
  editable: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  onSelect: (target: RecommendedLineTarget) => boolean | void;
  onRemove: (target: RecommendedLineTarget) => boolean | void;
  popup?: EstimateRecommendationsPopup;
  selectionFeedback?: { contextKey: string };
  completion?: { contextKey: string; selectedTargetIds: ReadonlySet<string> };
}

/** Staff adapter: shared presentation never owns draft scope or recommendation origins. */
export function EstimatorRecommendations({ roomName, contextKey, sourceCount, state, view, editable,
  onRetry, onRefresh, onSelect, onRemove, popup, selectionFeedback, completion }: EstimatorRecommendationsProps) {
  const [offset, setOffset] = useState(0);
  const [pageTarget, setPageTarget] = useState<{ contextKey: string; id: string } | null>(null);
  const paginationContext = selectionFeedback?.contextKey ?? contextKey;
  useEffect(() => { setOffset(0); setPageTarget(null); }, [paginationContext]);
  const decisions = view?.decisions.filter(decision => decision.requirement === "must") ?? [];
  const lines = recommendationLines(decisions);
  const unavailableDecisions = decisions.filter(decision => !decision.available || decision.unavailableChildCount > 0 ||
    decision.kind === "sub_basket" && !decision.children.length);
  const items: EstimateRecommendationItem[] = [
    ...lines.map(line => ({ id: line.key, name: line.name,
      ...(selectionFeedback ? { context: [line.basketName, line.subBasketName].filter(Boolean).join(" / ") } : {}),
      sourceNames: [...new Set(line.reasons.filter(reason => reason.requirement === "must").map(reason => reason.sourceName))],
      selected: line.selected })),
    ...unavailableDecisions.map(decision => ({ id: `unavailable:${decision.key}`, name: decision.name,
      sourceNames: [...new Set(decision.reasons.filter(reason => reason.requirement === "must").map(reason => reason.sourceName))],
      selected: false, disabled: true,
      message: decision.unavailableReason === "room_incompatible"
        ? decision.kind === "main_line" ? "This required item is not configured for this room." : "Some required items in this Sub Basket are not configured for this room."
        : decision.unavailableReason === "price_not_configured"
        ? "Configured price unavailable. Complete pricing before adding this recommendation."
        : decision.unavailableChildCount > 0
          ? `${decision.unavailableChildCount} required ${decision.unavailableChildCount === 1 ? "item needs" : "items need"} pricing or Configuration before adding.`
          : "Current pricing or Configuration is unavailable. Review it before adding this recommendation." }))
  ];
  const targetIndex = selectionFeedback && pageTarget?.contextKey === selectionFeedback.contextKey
    ? items.findIndex(item => item.id === pageTarget.id) : -1;
  const pageOffset = targetIndex >= 0 ? Math.floor(targetIndex / 20) * 20
    : Math.min(offset, Math.max(0, Math.ceil(items.length / 20) - 1) * 20);
  const unavailable = unavailableDecisions.length > 0;
  const message = state === "ready" && unavailable ? "Some non-negotiable recommendations are unavailable in current Configuration. Refresh to check availability."
    : state === "ready" && view?.historicalSources.length ? "Saved recommendation sources need review against current Configuration." : undefined;
  const changeSelection = (id: string, apply: (target: RecommendedLineTarget) => boolean | void) => {
    const line = lines.find(item => item.key === id);
    if (!line) return false;
    const accepted = apply(line.target);
    if (accepted !== false && selectionFeedback) setPageTarget({ contextKey: selectionFeedback.contextKey, id });
    return accepted;
  };
  if (!sourceCount && !popup) return null;
  return <EstimateRecommendations roomName={roomName} contextKey={contextKey}
    popup={popup} selectionFeedback={selectionFeedback}
    completion={popup && completion ? { ...completion, remainingCount: items.filter(item => !item.selected).length,
      blocked: state !== "ready" || sourceCount > 0 && !view || Boolean(view?.stale) || unavailable || Boolean(view?.historicalSources.length) } : undefined}
    items={(sourceCount ? items : []).slice(pageOffset, pageOffset + 20)}
    total={sourceCount ? items.length : 0} offset={pageOffset}
    onOffsetChange={next => { setPageTarget(null); setOffset(next); }} state={popup && completion ? state : sourceCount ? state : "ready"} disabled={!editable}
    message={sourceCount ? message : undefined} onRetry={state === "stale" || state === "ready" && Boolean(message) ? onRefresh : onRetry}
    onAdd={id => changeSelection(id, onSelect)} onRemove={id => changeSelection(id, onRemove)} />;
}
