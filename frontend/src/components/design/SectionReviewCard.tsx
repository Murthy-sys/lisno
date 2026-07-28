import type { DesignSectionReviewItem } from "../../api/types";
import { ProtectedImage } from "./ProtectedImage";

export function SectionReviewCard({
  section,
  mode,
  busy = false,
  onApprove,
  onReject
}: {
  section: DesignSectionReviewItem;
  mode: "client" | "read-only";
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const revision = section.revision;
  const decided = revision.reviewStatus !== "submitted";
  return (
    <article className="section-review-card" aria-label={`${section.label} review`} aria-busy={busy}>
      <header>
        <div>
          <h3>{section.label}</h3>
          <p>Design version {section.versionNumber} · Section revision {revision.revisionNumber}</p>
        </div>
        <span className={`status-badge status-badge--${revision.reviewStatus}`}>
          {statusLabel(revision.reviewStatus)}
        </span>
      </header>
      <figure className="section-review-card__preview">
        <ProtectedImage
          source={revision.imageReference}
          alt={`${section.label}, revision ${revision.revisionNumber}`}
          dataRevision={revision.revisionNumber}
        />
      </figure>
      <details>
        <summary>View source page</summary>
        <figure className="section-review-card__source-page">
          <ProtectedImage
            source={section.sourcePageUrl}
            alt={`Source page for ${section.label}`}
          />
        </figure>
      </details>
      {revision.rejectionComment ? <p className="client-comment"><strong>Client comment:</strong> {revision.rejectionComment}</p> : null}
      <section className="section-review-history-panel" aria-label={`Revision history for ${section.label}`}>
        <h4>Revision history ({section.history.length})</h4>
        <ol className="section-review-history">
          {section.history.slice().reverse().map((item) => (
            <li key={item.id}>
              <strong>Revision {item.revisionNumber} · {statusLabel(item.reviewStatus)}</strong>
              {item.rejectionComment ? <span>{item.rejectionComment}</span> : null}
            </li>
          ))}
        </ol>
      </section>
      {mode === "client" && !decided ? (
        <div className="section-review-card__actions">
          <button type="button" disabled={busy} onClick={onApprove} aria-label={`Approve ${section.label}`}>Approve</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={onReject} aria-label={`Reject ${section.label}`}>Request changes</button>
        </div>
      ) : null}
    </article>
  );
}

function statusLabel(status: DesignSectionReviewItem["revision"]["reviewStatus"]) {
  if (status === "submitted") return "Awaiting review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
