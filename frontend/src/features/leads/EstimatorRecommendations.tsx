import { useEffect, useState } from "react";
import { EstimateRecommendations } from "../estimates/EstimateRecommendations";
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
}

/** Staff adapter: shared presentation never owns draft scope or recommendation origins. */
export function EstimatorRecommendations({ roomName, contextKey, sourceCount, state, view, editable,
  onRetry, onRefresh, onSelect, onRemove }: EstimatorRecommendationsProps) {
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [contextKey]);
  const decisions = view?.decisions.filter(decision => decision.requirement === "must") ?? [];
  const lines = recommendationLines(decisions);
  const pageOffset = Math.min(offset, Math.max(0, Math.ceil(lines.length / 20) - 1) * 20);
  const unavailable = decisions.some(decision => !decision.available || decision.unavailableChildCount > 0);
  const message = state === "ready" && unavailable ? "Some non-negotiable recommendations are unavailable in current Configuration. Refresh to check availability."
    : state === "ready" && view?.historicalSources.length ? "Saved recommendation sources need review against current Configuration." : undefined;
  if (!sourceCount) return null;
  return <EstimateRecommendations roomName={roomName} contextKey={contextKey}
    items={lines.slice(pageOffset, pageOffset + 20).map(line => ({ id: line.key, name: line.name,
      sourceNames: [...new Set(line.reasons.filter(reason => reason.requirement === "must").map(reason => reason.sourceName))],
      selected: line.selected }))}
    total={lines.length} offset={pageOffset} onOffsetChange={setOffset} state={state} disabled={!editable}
    message={message} onRetry={state === "stale" || state === "ready" && unavailable ? onRefresh : onRetry}
    onAdd={id => { const line = lines.find(item => item.key === id); return line ? onSelect(line.target) : false; }}
    onRemove={id => { const line = lines.find(item => item.key === id); return line ? onRemove(line.target) : false; }} />;
}
