import type { EstimateRevisionNavigationProps } from "./estimateRevisionComponents";
import { estimateRevisionLabel } from "./estimateRevisionsApi";
import { revisionDate, revisionStatus } from "./estimateRevisionPresentation";
import "./estimateRevisions.css";

export function EstimateRevisionNavigation({ items, selectedRevisionId, onSelectRevision, onSelectCurrent,
  loading = false, error, onRetry, hasMore = false, loadingMore = false, onLoadMore,
  disabled = false }: EstimateRevisionNavigationProps) {
  if (!items.length) return null;
  const selected = items.find(revision => revision.id === selectedRevisionId);
  const selectionLabel = selectedRevisionId === null ? "Current estimate" : selected ? estimateRevisionLabel(selected) : "Saved revision";
  return <nav aria-label="Estimate revisions" className="estimate-revision-nav">
    <details className="estimate-revision-nav__disclosure">
      <summary tabIndex={0}><span>Revisions ({items.length}{hasMore ? "+" : ""})</span><small>{selectionLabel}</small></summary>
      <div className="estimate-revision-nav__body">
        <button type="button" className="estimate-revision-nav__entry" aria-current={selectedRevisionId === null ? "true" : undefined}
          disabled={disabled} onClick={onSelectCurrent}><strong>Current estimate</strong></button>
        {loading ? <p role="status">Refreshing revisions…</p> : null}
        {error ? <div className="estimate-revision-nav__error" role="alert"><p>{error}</p>
          {onRetry ? <button type="button" disabled={disabled || loading} onClick={onRetry}>Retry revisions</button> : null}</div> : null}
        <ol>{items.map(revision => <li key={revision.id}>
          <button type="button" className="estimate-revision-nav__entry" aria-current={selectedRevisionId === revision.id ? "true" : undefined}
            disabled={disabled} onClick={() => onSelectRevision(revision.id)}>
            <strong>{estimateRevisionLabel(revision)}</strong>
            <small><time dateTime={revision.submittedAt}>{revisionDate(revision.submittedAt)}</time><span>{revisionStatus[revision.status]}</span></small>
          </button>
        </li>)}</ol>
        {hasMore && onLoadMore ? <button type="button" className="estimate-revision-nav__more" disabled={disabled || loadingMore || loading} onClick={onLoadMore}>
          {loadingMore ? "Loading more revisions…" : "Load more revisions"}
        </button> : null}
      </div>
    </details>
  </nav>;
}
