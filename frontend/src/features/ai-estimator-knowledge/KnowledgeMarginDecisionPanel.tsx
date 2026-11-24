import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  MarginCandidate, MarginChange, MarginCommitInput, MarginCommitResult, MarginDefault, MarginImpact, MarginMatrix, MarginPreview, MarginPreviewInput
} from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { KNOWLEDGE_MODE_TIERS, KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { commitKnowledgeMarginDecision, previewKnowledgeMarginDecision } from "./knowledgeApi";
import { componentLabel, defaultLabel, draftChanges, entryKeys, fieldId, fieldValue, modeLabel, pairLabel, rangeText, scopeFields, scopeKey, scopeLabel, sharedTierDefaults, type DraftValues } from "./knowledgeMarginFields";

export interface MarginComparison {
  title: string;
  busy: boolean;
  action: ReactNode;
  content: ReactNode;
}

interface Props {
  tier: KnowledgeModeTier;
  onTier: (tier: KnowledgeModeTier) => void;
  comparison?: MarginComparison;
  onCompare: (allowRestore: boolean) => void;
  onLeaveComparison: () => void;
  matrix: MarginMatrix;
  name: string;
  view: "edit" | "exceptions";
  current: boolean;
  loading: boolean;
  readOnly: boolean;
  fallbackFocusRef: RefObject<HTMLButtonElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onReload: () => Promise<void>;
  onCommitted: (result: MarginCommitResult, sourceLineId?: string) => Promise<void>;
}

function previewMatches(impacts: MarginImpact[], requested: MarginChange[]) {
  return impacts.length === requested.length && requested.every((change) => {
    const impact = impacts.find((entry) => scopeKey(entry) === scopeKey(change));
    return impact && impact.ranges.length === change.ranges.length && change.ranges.every((pair) =>
      impact.ranges.some((next) => next.key === pair.key && next.minimumBps === pair.minimumBps && next.maximumBps === pair.maximumBps));
  });
}

function ChangeImpact({ impact, defaults }: { impact: MarginImpact; defaults: MarginDefault[] }) {
  const baseline = defaults.find(entry => scopeKey(entry) === scopeKey(impact));
  const currentLabel = baseline?.resolution === "suggested" ? "Prefilled margins" : "Current default";
  return <section className="knowledge-margin-impact" aria-label={scopeLabel(impact, defaults)}>
    <h3>{scopeLabel(impact, defaults)}</h3>
    <dl><div><dt>{currentLabel}</dt><dd>{baseline?.resolution === "choose" ? "Unresolved" : rangeText(impact.previous)}</dd></div>
      <div><dt>Proposed default</dt><dd>{rangeText(impact.ranges)}</dd></div></dl>
    <p>{impact.affected.length} Main {impact.affected.length === 1 ? "Line" : "Lines"} to update</p>
    {impact.affected.length > 0 && !impact.componentChanges?.length && <ul>{impact.affected.map((line) => <li key={line.mainLineId}>{line.mainLineName}</li>)}</ul>}
    {!!impact.componentChanges?.length && <ul className="knowledge-margin-component-changes" aria-label="Component margin changes">
      {impact.componentChanges.map((row) => <li key={JSON.stringify([row.mainLineId, row.component.basketId, row.component.subBasketId])}>
        <strong>{row.mainLineName} · {componentLabel(row)}</strong>
        <dl><div><dt>Current</dt><dd>{rangeText(row.previous)}</dd></div>
          <div><dt>After applying</dt><dd>{rangeText(impact.ranges)}</dd></div></dl>
      </li>)}
    </ul>}
    {!impact.componentChanges?.length && impact.competing.length > 0 && <><h4>Other saved margins this replaces</h4><ul>{impact.competing.map((line) =>
      <li key={JSON.stringify([line.mainLineId, scopeKey(line)])}>{[line.mainLineName, componentLabel(line)].filter(Boolean).join(" · ")}: {rangeText(line.ranges)}</li>)}</ul></>}
    {impact.excluded.length > 0 && <details><summary>{impact.excluded.length} excluded</summary><ul>{impact.excluded.map((line) =>
      <li key={JSON.stringify([line.mainLineId, scopeKey(line), line.reason])}>{[line.mainLineName, componentLabel(line)].filter(Boolean).join(" · ")}: {line.reason}</li>)}</ul></details>}
    {impact.blockers.length > 0 && <InlineMessage tone="warning"><strong>Resolve before applying</strong><ul>{impact.blockers.map((line) =>
      <li key={JSON.stringify([line.mainLineId, scopeKey(line), line.reason])}>{[line.mainLineName, componentLabel(line)].filter(Boolean).join(" · ")}: {line.reason}</li>)}</ul></InlineMessage>}
  </section>;
}

function SharedMarginChoices({ entry, values, onChange, readOnly }: {
  entry: MarginDefault; values: DraftValues; onChange: (values: DraftValues) => void; readOnly: boolean;
}) {
  if (entry.resolution !== "choose" || !entry.choices?.length) return null;
  return <div className="knowledge-margin-choices" role={readOnly ? "group" : "radiogroup"} aria-label="Saved margin choices">
    {entry.choices.map((choice) => {
      const text = [componentLabel(choice), rangeText(choice.ranges)].filter(Boolean).join(" · ");
      if (readOnly) return <p key={text}>{text}</p>;
      const choiceValues: DraftValues = {};
      for (const pair of choice.ranges) {
        choiceValues[fieldId(entry, pair.key, "minimumBps")] = String(pair.minimumBps / 100);
        choiceValues[fieldId(entry, pair.key, "maximumBps")] = String(pair.maximumBps / 100);
      }
      return <label key={text}>
        <input type="radio" name={`margin-choice-${entry.tier}`}
          checked={Object.entries(choiceValues).every(([id, value]) => values[id] === value)}
          onChange={() => onChange({ ...values, ...choiceValues })} />
        <span>{text}</span>
      </label>;
    })}
  </div>;
}

function Editor({ tier, defaults, values, onChange, locked, readOnly }: {
  tier: KnowledgeModeTier; readOnly: boolean;
  defaults: MarginDefault[]; values: DraftValues; onChange: (values: DraftValues) => void; locked: boolean;
}) {
  return <>
    {sharedTierDefaults(defaults, tier)?.map((entry) =>
      <fieldset className="knowledge-margin-fieldset" key={scopeKey(entry)} disabled={locked}>
        <legend>{modeLabel[entry.mode]}</legend>
        <p className="knowledge-margin-provenance">{defaultLabel(entry)}</p>
        <SharedMarginChoices entry={entry} values={values} onChange={onChange} readOnly={readOnly} />
        {readOnly ? (entry.ranges.length > 0 && <p>{rangeText(entry.ranges)}</p>) : entryKeys(entry).map((key) => <div className="knowledge-margin-fields" key={key}>
          {(["minimumBps", "maximumBps"] as const).map((bound) => {
            const text = [pairLabel[key], bound === "minimumBps" ? "Minimum" : entry.mode === "in_house" ? "Starting" : "Maximum"].filter(Boolean).join(" ");
            const id = fieldId(entry, key, bound);
            return <label key={bound}>{text} (%)<Input type="number" inputMode="decimal"
              aria-label={`${scopeLabel(entry, defaults)} ${text} (%)`}
              min={entry.mode === "pmc" ? 10 : 0} max={entry.mode === "pmc" ? 20 : entry.mode === "in_house" ? 99.99 : 95}
              step={entry.mode === "sub_vendor" ? 5 : 0.01} value={fieldValue(entry, key, bound, values)}
              onChange={(event) => onChange({ ...values, [id]: event.target.value })} /></label>;
          })}
        </div>)}
      </fieldset>)}
  </>;
}

function Exceptions({ matrix, candidate, onSelect, locked }: {
  matrix: MarginMatrix; candidate?: MarginCandidate; onSelect: (entry: MarginCandidate) => void; locked: boolean;
}) {
  if (matrix.exceptions.length === 0) return <p>No saved margin edits are waiting for approval.</p>;
  return <fieldset className="knowledge-margin-exceptions" disabled={locked}>
    <legend>Select the saved margin to review</legend>
    {matrix.exceptions.map((entry) => {
      const baseline = matrix.defaults.find((row) => row.tier === entry.tier && row.mode === entry.mode);
      const title = `${entry.mainLineName} · ${scopeLabel(entry, matrix.defaults)}`;
      return <div className="knowledge-margin-candidate" key={JSON.stringify([entry.mainLineId, scopeKey(entry)])}>
        <strong>{title}</strong>
        {entry.requiresDefault || baseline?.resolution === "choose"
          ? <p>Choose a shared default to compare these margins.</p>
          : <p>{baseline ? defaultLabel(baseline) : "Sub-Basket default"}: {rangeText(baseline?.ranges ?? [])}</p>}
        {(entry.proposals ?? [entry]).map((proposal) => {
          const detail = [componentLabel(proposal), rangeText(proposal.ranges)].filter(Boolean).join(" · ");
          return <label key={scopeKey(proposal)}>
            <input type="radio" name="margin-candidate" checked={candidate === proposal}
              aria-label={`${title} · ${detail}`} onChange={() => onSelect(proposal)} />
            <span>{detail}</span>
          </label>;
        })}
      </div>;
    })}
  </fieldset>;
}

export function KnowledgeMarginDecisionPanel({ matrix, name, view, tier, onTier, comparison, onCompare, onLeaveComparison, current, loading, readOnly, triggerRef, fallbackFocusRef, onClose, onReload, onCommitted }: Props) {
  const [values, setValues] = useState<DraftValues>({});
  const [candidate, selectCandidate] = useState<MarginCandidate>();
  const [review, setReview] = useState<{ input: MarginCommitInput; preview: MarginPreview }>();
  const lock = useRef(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const wasReviewing = useRef(false);
  useEffect(() => {
    if (review) reviewHeadingRef.current?.focus();
    else if (wasReviewing.current) previewButtonRef.current?.focus();
    wasReviewing.current = Boolean(review);
  }, [review]);
  const { changes, error } = draftChanges(matrix.defaults, values);
  const prefilled = !changes.length && !error && matrix.defaults.find((entry) =>
    entry.tier === tier && entry.mode === "in_house" && entry.canApplyPrefilled && entry.ranges.length > 0);
  const edit = changes.length ? changes : prefilled ? [{ ...scopeFields(prefilled), ranges: prefilled.ranges }] : [];
  const decision = view === "edit" && edit.length ? { kind: "edit" as const, changes: edit }
    : view === "exceptions" && candidate ? { kind: "approve" as const, candidate: { ...scopeFields(candidate), mainLineId: candidate.mainLineId } } : null;
  const preview = useMutation({
    mutationFn: async (input: MarginPreviewInput) => {
      const result = await previewKnowledgeMarginDecision(matrix.basketId, matrix.subBasketId, input);
      const requested = input.decision.kind === "edit" ? input.decision.changes : candidate
        ? [{ tier: candidate.tier, mode: candidate.mode, ranges: candidate.ranges }] : [];
      if (result.basketId !== matrix.basketId || result.subBasketId !== matrix.subBasketId || !result.reviewToken || !previewMatches(result.impacts, requested)) {
        throw new Error("Could not verify the margin preview.");
      }
      return { input: { ...input, operationId: crypto.randomUUID(), reviewToken: result.reviewToken }, preview: result };
    },
    onSuccess: setReview,
    onSettled: () => { lock.current = false; }
  });
  const commit = useMutation({
    mutationFn: async (input: MarginCommitInput) => {
      const result = await commitKnowledgeMarginDecision(matrix.basketId, matrix.subBasketId, input);
      if (result.basketId !== matrix.basketId || result.subBasketId !== matrix.subBasketId || result.operationId !== input.operationId) {
        throw new Error("Could not verify the saved operation. Refresh the margins.");
      }
      return result;
    },
    onSuccess: (result, input) => onCommitted(result, input.decision.kind === "approve" ? input.decision.candidate.mainLineId : undefined),
    onSettled: () => { lock.current = false; }
  });
  const busy = preview.isPending || commit.isPending || Boolean(comparison?.busy);
  const retryable = commit.error instanceof TypeError || (commit.error instanceof ApiError && commit.error.status >= 500);
  const stale = !current || Boolean((commit.error && !retryable) || preview.error);
  const disabled = busy || loading || stale || readOnly;
  const hasBlockers = review?.preview.impacts.some((impact) => impact.blockers.length > 0);

  const tierLabel = KNOWLEDGE_MODE_TIER_LABELS[tier];
  const tierIssues = matrix.issues.filter(issue => issue.tier === tier);
  const dirty = Boolean(changes.length || error);
  const compareButton = useRef<HTMLButtonElement>(null);
  const backToEditor = useRef<HTMLButtonElement>(null);
  const wasComparing = useRef(false);
  const comparing = Boolean(comparison);
  useEffect(() => {
    if (comparing) backToEditor.current?.focus();
    else if (wasComparing.current) compareButton.current?.focus();
    wasComparing.current = comparing;
  }, [comparing]);
  return <ContextPanel title={comparison?.title ?? (view === "edit" ? `${tierLabel} tier margins` : "Review margin exceptions")} eyebrow={name}
    dirty={!commit.isSuccess && view === "edit" && dirty} busy={busy} onClose={onClose} width="medium"
    returnFocusRef={triggerRef} fallbackFocusRef={fallbackFocusRef} className="knowledge-context-panel knowledge-sub-margins-panel"
    footer={({ requestClose }) => <div className="knowledge-dialog-actions">
      <Button variant="secondary" disabled={busy} onClick={requestClose}>Close</Button>
      {comparison && <Button ref={backToEditor} variant="secondary" disabled={busy} onClick={onLeaveComparison}>Back to tier margins</Button>}
      {comparison?.action}
      {!comparison && review && !stale && <Button variant="secondary" disabled={busy} onClick={() => setReview(undefined)}>Back</Button>}
      {!comparison && !readOnly && !stale && (view === "edit" || matrix.exceptions.length > 0) && (review
        ? <Button busy={commit.isPending} disabled={disabled || hasBlockers} onClick={() => {
            if (lock.current || disabled || hasBlockers) return;
            lock.current = true; commit.mutate(review.input);
          }}>{view === "exceptions" && candidate ? `Approve and apply to ${KNOWLEDGE_MODE_TIER_LABELS[candidate.tier]}` : "Save and apply margins"}</Button>
        : <Button ref={previewButtonRef} busy={preview.isPending} disabled={disabled || !decision || !!error} onClick={() => {
            if (lock.current || disabled || !decision || error) return;
            lock.current = true; preview.mutate({ decision, versionToken: matrix.versionToken });
          }}>{view === "edit" && prefilled ? "Review In-house margins" : "Review impact"}</Button>)}
    </div>}>
    {comparison ? comparison.content : <div className="knowledge-sub-margins-panel__body">
      {retryable && !stale && <InlineMessage tone="warning" role="alert">The save response was unavailable. Retry this reviewed change to confirm its result.</InlineMessage>}
      {stale && <InlineMessage tone="warning" role="alert">{commit.error?.message ?? preview.error?.message ?? "These margins have changed."}
        {" "}<Button size="compact" variant="quiet" disabled={busy || loading} onClick={() => void onReload()}>Reload margins to review</Button>
      </InlineMessage>}
      {review ? <><h3 ref={reviewHeadingRef} tabIndex={-1}>Impact on {name}</h3>{review.preview.impacts.map((impact) => <ChangeImpact key={scopeKey(impact)} defaults={matrix.defaults} impact={impact} />)}</>
        : view === "edit" ? <>
          <div className="knowledge-sub-margins-panel__modes" role="group" aria-label="Margin tier">
            {KNOWLEDGE_MODE_TIERS.map((key) => <button type="button" key={key} aria-pressed={tier === key}
              data-dialog-initial-focus={tier === key || undefined} disabled={busy}
              onClick={() => onTier(key)}>{KNOWLEDGE_MODE_TIER_LABELS[key]}</button>)}
          </div>
          <Editor tier={tier} defaults={matrix.defaults} values={values} onChange={setValues} locked={disabled} readOnly={readOnly} />
          {error && <InlineMessage tone="warning" role="status">{error}</InlineMessage>}
          {tierIssues.length > 0 && <details className="knowledge-margin-issues">
            <summary>Needs configuration ({tierIssues.length})</summary>
            <ul>{tierIssues.map((issue, i) => <li key={JSON.stringify([issue.mainLineId, scopeKey(issue), i])}>
              {issue.mainLineName} · {scopeLabel(issue, matrix.defaults)}: {issue.reason}</li>)}</ul>
          </details>}
          <Button ref={compareButton} variant="secondary" disabled={busy || stale || loading} onClick={() => onCompare(!dirty)}>
            Compare saved Main Line margins
          </Button>
        </>
          : <Exceptions matrix={matrix} candidate={candidate} onSelect={selectCandidate} locked={busy || stale} />}
    </div>}
  </ContextPanel>;
}
