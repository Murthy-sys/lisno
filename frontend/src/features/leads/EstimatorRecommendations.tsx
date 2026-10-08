import { useEffect, useRef, useState, type RefObject } from "react";

import { Dialog } from "../../components/ui/Dialog";
import { recommendationLines, type RecommendationDecision, type RecommendationLine, type RecommendationReason,
  type RoomRecommendationView, type RecommendedLineTarget } from "./roomRecommendations";

export type RecommendationReadState = "loading" | "ready" | "error" | "forbidden" | "stale";

interface EstimatorRecommendationsProps {
  roomName: string;
  sourceCount: number;
  state: RecommendationReadState;
  view: RoomRecommendationView | null;
  editable: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  onSelect: (target: RecommendedLineTarget) => boolean | void;
  onSkip?: (target: RecommendedLineTarget) => boolean | void;
  skippedKeys?: ReadonlySet<string>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  automaticDismissal?: boolean;
}

const EMPTY_SKIPPED_KEYS: ReadonlySet<string> = new Set();

function hasUnavailableItems(decision: RecommendationDecision): boolean {
  return !decision.available || decision.unavailableChildCount > 0 ||
    (decision.kind === "main_line" && !decision.selected && !decision.target) ||
    (decision.kind === "sub_basket" && !decision.selected && decision.children.length === 0);
}

function relationshipMessage(line: RecommendationLine): string | null {
  const reason = sourceReason(line);
  if (!reason || !line.name.trim()) return null;
  return reason.requirement === "must"
    ? `${line.name} is needed for ${reason.sourceName}.`
    : `Consider ${line.name} for ${reason.sourceName}.`;
}

function sourceReason(line: RecommendationLine): RecommendationReason | undefined {
  return line.reasons.find((item) => item.requirement === line.requirement && item.sourceName.trim()) ??
    line.reasons.find((item) => item.sourceName.trim());
}

function itemInitial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase() || "I";
}

function additionalSourceNames(line: RecommendationLine, primary?: RecommendationReason): string[] {
  const sources = new Map<string, string>();
  for (const reason of line.reasons) {
    if (reason.sourceId !== primary?.sourceId && reason.sourceName.trim()) sources.set(reason.sourceId, reason.sourceName);
  }
  return [...sources.values()];
}

export function EstimatorRecommendations({
  roomName, sourceCount, state, view, editable, open, onOpen, onClose, onRetry, onRefresh, onSelect, fallbackFocusRef,
  onSkip, skippedKeys = EMPTY_SKIPPED_KEYS, automaticDismissal = false
}: EstimatorRecommendationsProps) {
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const detailBodyRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastReadyViewRef = useRef<{ roomName: string; view: RoomRecommendationView } | null>(null);
  const selectionFocusRef = useRef(false);
  const sawLoadingAfterSelectionRef = useRef(false);
  const refocusAfterLoadRef = useRef(false);
  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(() => new Set());
  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  if (state === "ready" && view) lastReadyViewRef.current = { roomName, view };
  const decisions = view?.decisions ?? [];
  const guidance = view?.guidance ?? [];
  const historicalSources = view?.historicalSources ?? [];
  const lines = recommendationLines(decisions);
  const isSkipped = (line: RecommendationLine) => line.requirement === "can" && skippedKeys.has(line.key);
  const pending = state === "ready" ? lines.filter((line) => !line.selected && !acceptedKeys.has(line.key) && !isSkipped(line)) : [];
  const unavailableCount = state === "ready" ? decisions.filter(hasUnavailableItems).length : 0;
  const primaryPending = pending.find((line) => line.requirement === "must") ?? pending[0];
  const detailView = state === "loading" && open && lastReadyViewRef.current?.roomName === roomName
    ? lastReadyViewRef.current.view
    : (state === "ready" || state === "loading") ? view : null;
  const detailDecisions = detailView?.decisions ?? [];
  const detailGuidance = detailView?.guidance ?? [];
  const detailHistoricalSources = detailView?.historicalSources ?? [];
  const displayedLines = recommendationLines(detailDecisions).map((line) =>
    acceptedKeys.has(line.key) ? { ...line, selected: true } : line
  );
  const detailPending = displayedLines.filter((line) => !line.selected && !isSkipped(line));
  const hasSkippedLines = displayedLines.some((line) => !line.selected && isSkipped(line));
  const hasProbableLines = displayedLines.some((line) => line.requirement === "can");
  const activeIndex = Math.max(0, detailPending.findIndex((line) => line.key === activeKey));
  const activeLine = detailPending[activeIndex];
  const activeReason = activeLine ? sourceReason(activeLine) : undefined;
  const otherSourceNames = activeLine ? additionalSourceNames(activeLine, activeReason) : [];
  const detailUnavailableCount = detailDecisions.filter(hasUnavailableItems).length;

  useEffect(() => {
    if (!open) {
      lastReadyViewRef.current = null;
      sawLoadingAfterSelectionRef.current = false;
      selectionFocusRef.current = false;
      refocusAfterLoadRef.current = false;
      setAcceptedKeys(new Set());
      setSelectionAnnouncement("");
      setActiveKey(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !acceptedKeys.size) return;
    if (state === "loading") {
      sawLoadingAfterSelectionRef.current = true;
      return;
    }
    if (state !== "ready" || !view) return;
    const confirmed = new Set(recommendationLines(decisions).filter((line) => line.selected).map((line) => line.key));
    const hadFreshResponse = sawLoadingAfterSelectionRef.current;
    const remaining = hadFreshResponse ? new Set<string>() : new Set([...acceptedKeys].filter((key) => !confirmed.has(key)));
    if (hadFreshResponse || remaining.size !== acceptedKeys.size) {
      sawLoadingAfterSelectionRef.current = false;
      setAcceptedKeys(remaining);
    }
  }, [acceptedKeys, decisions, open, state, view]);

  useEffect(() => {
    if (!open || !selectionFocusRef.current) return;
    selectionFocusRef.current = false;
    const nextSelect = detailBodyRef.current?.querySelector<HTMLButtonElement>("button[data-recommendation-select]:not([disabled])");
    (nextSelect ?? detailBodyRef.current?.querySelector<HTMLButtonElement>("button[data-recommendation-complete]") ?? closeButtonRef.current)?.focus();
  }, [acceptedKeys, activeKey, open, skippedKeys]);

  useEffect(() => {
    if (!open) return;
    if (state === "loading" && acceptedKeys.size) {
      refocusAfterLoadRef.current = true;
      detailBodyRef.current?.focus();
    } else if (state === "ready" && refocusAfterLoadRef.current && !acceptedKeys.size) {
      refocusAfterLoadRef.current = false;
      const nextSelect = detailBodyRef.current?.querySelector<HTMLButtonElement>("button[data-recommendation-select]:not([disabled])");
      (nextSelect ?? detailBodyRef.current?.querySelector<HTMLButtonElement>("button[data-recommendation-complete]") ?? closeButtonRef.current)?.focus();
    }
  }, [acceptedKeys, open, state]);

  if (!sourceCount || (state === "ready" && !open && !decisions.length && !guidance.length && !historicalSources.length)) return null;

  let summary: string;
  if (state === "loading") summary = `Checking connected items for ${roomName}.`;
  else if (state === "error") summary = "Recommendations could not be loaded.";
  else if (state === "forbidden") summary = "Recommendations are unavailable for this account.";
  else if (state === "stale") summary = "Available items changed. Refresh recommendations.";
  else if (primaryPending) summary = relationshipMessage(primaryPending) ?? "Related items to review.";
  else if (lines.length && !unavailableCount) summary = lines.some((line) => !line.selected && isSkipped(line))
    ? "All recommendations reviewed." : "All related items selected.";
  else if (unavailableCount) summary = "Related items need availability review.";
  else if (guidance.length) summary = "Guidance to review.";
  else if (historicalSources.length) summary = "Saved recommendation sources need review.";
  else summary = "No configured recommendations for the selected items.";

  const selectItem = (line: RecommendationLine) => {
    if (onSelect(line.target) !== true) return;
    const nextLine = detailPending.length > 1 ? detailPending[(activeIndex + 1) % detailPending.length] : undefined;
    setActiveKey(nextLine?.key ?? null);
    selectionFocusRef.current = true;
    setAcceptedKeys((current) => new Set(current).add(line.key));
    setSelectionAnnouncement(`${line.name} selected for ${roomName}.`);
  };

  const skipItem = (line: RecommendationLine) => {
    if (!editable || state !== "ready" || line.requirement !== "can" || isSkipped(line) || onSkip?.(line.target) !== true) return;
    const nextLine = detailPending.length > 1 ? detailPending[(activeIndex + 1) % detailPending.length] : undefined;
    setActiveKey(nextLine?.key ?? null);
    selectionFocusRef.current = true;
    setSelectionAnnouncement(`${line.name} marked not necessary for ${roomName}.`);
  };

  return <>
    <section className="estimator-recommendations" aria-label="Recommendations for this room">
      <div className="estimator-recommendations__alert-copy">
        <p className="estimator-recommendations__eyebrow">Recommendation</p>
        <h2 aria-live="polite" aria-atomic="true">{summary}</h2>
        {state === "ready" && (pending.length > 1 || unavailableCount > 0 || !editable) ? <p className="estimator-recommendations__summary">
          {pending.length > 1 ? <span>+{pending.length - 1} more recommendation{pending.length === 2 ? "" : "s"}</span> : null}
          {unavailableCount ? <span className="estimator-recommendations__unavailable-count">{unavailableCount} unavailable</span> : null}
          {!editable ? <span>Read-only estimate</span> : null}
        </p> : null}
      </div>
      <button ref={reviewButtonRef} className="estimator-recommendations__review" type="button" onClick={onOpen}
        aria-haspopup="dialog" aria-expanded={open}>Review recommendations</button>
    </section>
    {open ? <Dialog title={`Recommendations for ${roomName}`} eyebrow="Configuration guidance"
      onClose={onClose} showCloseButton={false} initialFocusRef={detailBodyRef}
      returnFocusRef={reviewButtonRef} fallbackFocusRef={fallbackFocusRef}>
      <div ref={detailBodyRef} className="estimator-recommendations__detail" role="region" aria-label="Recommendation details" tabIndex={-1}>
          <div className="estimator-recommendations__card-header">
            <span className="estimator-recommendations__marker" aria-hidden="true">+</span>
            <div className="estimator-recommendations__card-heading">
              <div className="estimator-recommendations__title-row">
                <h3>{activeLine ? "Related item recommended" : `Recommendations for ${roomName}`}</h3>
                {state === "ready" && activeLine ? <span className="estimator-recommendations__card-badge">
                  {activeLine.requirement === "must" ? "Non-Negotiable Addition" : "Probable Addition"}
                </span> : null}
              </div>
              {activeLine ? <p>{relationshipMessage(activeLine) ?? "A related item is recommended for this room."}</p> : null}
            </div>
            <button ref={closeButtonRef} className="estimator-recommendations__card-close" type="button" onClick={onClose}
              aria-label="Close recommendations">×</button>
          </div>
          {state === "loading" ? <p className="estimator-recommendations__state" role="status">Checking configured recommendations…</p> : null}
          {state === "error" ? <div className="estimator-recommendations__state" role="alert"><p>Recommendations could not be loaded. Your estimate items are unchanged.</p><button type="button" onClick={onRetry}>Retry recommendations</button></div> : null}
          {state === "forbidden" ? <p className="estimator-recommendations__state" role="alert">You do not have permission to read recommendations.</p> : null}
          {state === "stale" ? <div className="estimator-recommendations__state" role="alert"><p>Configuration changed. Refresh available items before selecting a related item.</p><button type="button" onClick={onRefresh}>Refresh available items</button></div> : null}
          {(state === "ready" || state === "loading") && activeLine ? <div className="estimator-recommendations__card-content" data-requirement={activeLine.requirement}>
            {detailPending.length > 1 ? <nav className="estimator-recommendations__navigation" aria-label="Recommended items">
              <span aria-live="polite">{activeIndex + 1} of {detailPending.length} recommended items</span>
              <div>
                <button type="button" onClick={() => setActiveKey(detailPending[(activeIndex - 1 + detailPending.length) % detailPending.length]!.key)}
                  aria-label="Previous recommendation">Previous</button>
                <button type="button" onClick={() => setActiveKey(detailPending[(activeIndex + 1) % detailPending.length]!.key)}
                  aria-label="Next recommendation">Next</button>
              </div>
            </nav> : null}
            <div className="estimator-recommendations__comparison">
              <div className="estimator-recommendations__compared-item">
                <span className="estimator-recommendations__comparison-label">Selected item</span>
                <div className="estimator-recommendations__item-identity">
                  <span className="estimator-recommendations__item-tile" aria-hidden="true">{itemInitial(activeReason?.sourceName ?? "Source name unavailable")}</span>
                  <strong>{activeReason?.sourceName ?? "Source name unavailable"}</strong>
                </div>
              </div>
              <span className="estimator-recommendations__addition-cue" aria-hidden="true">+</span>
              <div className="estimator-recommendations__compared-item estimator-recommendations__compared-item--recommended">
                <span className="estimator-recommendations__comparison-label">Recommended addition</span>
                <div className="estimator-recommendations__item-identity">
                  <span className="estimator-recommendations__item-tile" aria-hidden="true">{itemInitial(activeLine.name)}</span>
                  <strong>{activeLine.name}</strong>
                </div>
              </div>
            </div>
            {activeReason?.reason ? <p className="estimator-recommendations__reason">{activeReason.reason}</p> : null}
            {otherSourceNames.length ? <p className="estimator-recommendations__other-sources">
              Also configured for {otherSourceNames.join(", ")}.
            </p> : null}
            {!editable ? <p className="estimator-recommendations__context">This estimate is read-only. Related items are shown for review.</p> : null}
            {state === "loading" ? <p className="estimator-recommendations__context">Updating related items. Selection will be available when the check finishes.</p> : null}
            {automaticDismissal && state === "ready" && editable ? <p className="estimator-recommendations__context">
              {hasProbableLines
                ? "Use Not necessary to skip a Probable Addition. Closing with unanswered recommendations and no related item added will uncheck newly selected items that still need a response."
                : "Closing without adding a related item will uncheck any newly selected item that still needs one."}
            </p> : null}
            <div className="estimator-recommendations__card-actions">
              <button className="estimator-recommendations__not-now" type="button" onClick={onClose}>Not now</button>
              {activeLine.requirement === "can" ? <button className="estimator-recommendations__skip" type="button"
                onClick={() => skipItem(activeLine)} disabled={!editable || state !== "ready" || !onSkip}
                aria-label={`Not necessary: ${activeLine.name} for ${roomName}`}>Not necessary</button> : null}
              <button type="button" data-recommendation-select onClick={() => selectItem(activeLine)}
                disabled={!editable || state !== "ready"} aria-label={`Add ${activeLine.name} for ${roomName}`}>
                Add recommended item
              </button>
            </div>
          </div> : null}
          {(state === "ready" || state === "loading") && detailHistoricalSources.length ? <details className="estimator-recommendations__history" open={!activeLine}>
            <summary>Saved lines need review</summary>
            <p>Current advice is unavailable for these saved lines:</p>
            <ul>{detailHistoricalSources.map((source) => <li key={source.mainLineId}>{source.name}</li>)}</ul>
          </details> : null}
          {state === "ready" && !decisions.length && !guidance.length && !historicalSources.length ? <p className="estimator-recommendations__state">No configured recommendations for the selected items in this room.</p> : null}
          {state === "ready" && displayedLines.length > 0 && !activeLine ? <div className="estimator-recommendations__state estimator-recommendations__complete" role="status">
            <p>{hasSkippedLines
              ? detailUnavailableCount ? "All available recommendations reviewed." : "All recommendations reviewed."
              : detailUnavailableCount ? "All available related items selected." : "All related items selected."}</p>
            <button type="button" data-recommendation-complete onClick={onClose}>Done</button>
          </div> : null}
          {(state === "ready" || state === "loading") && detailUnavailableCount ? <p className="estimator-recommendations__state estimator-recommendations__unavailable">
            {detailUnavailableCount} related {detailUnavailableCount === 1 ? "recommendation has" : "recommendations have"} unavailable items. Refresh or review Configuration.
          </p> : null}
          {(state === "ready" || state === "loading") && detailGuidance.length ? <details className="estimator-recommendations__guidance" open={!activeLine}>
            <summary>Other guidance</summary>
            <ul>{detailGuidance.map((item) => <li key={`${item.sourceId}:${item.id}`}>
              <strong>{item.name}</strong><span>{item.sourceName}{item.reason ? ` · ${item.reason}` : ""}</span>
            </li>)}</ul>
          </details> : null}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{selectionAnnouncement}</p>
    </Dialog> : null}
  </>;
}
