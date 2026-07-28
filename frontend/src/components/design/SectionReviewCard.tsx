import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { DesignSectionReviewItem } from "../../api/types";
import { Dialog } from "../ui/Dialog";
import { ProtectedImage } from "./ProtectedImage";

export function SectionReviewCard({
  section,
  mode,
  busy = false,
  position,
  total,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  onApprove,
  onReject
}: {
  section: DesignSectionReviewItem;
  mode: "client" | "read-only";
  busy?: boolean;
  position: number;
  total: number;
  previousLabel?: string;
  nextLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const revision = section.revision;
  const decided = revision.reviewStatus !== "submitted";
  const [previewSourceState, setPreviewSourceState] = useState<{
    sectionId: string;
    source?: string;
  }>();
  const [previewOpenSectionId, setPreviewOpenSectionId] = useState<string>();
  const previewSource =
    previewSourceState?.sectionId === section.id
      ? previewSourceState.source
      : undefined;
  const previewOpen = previewOpenSectionId === section.id;
  useEffect(() => {
    setPreviewOpenSectionId(undefined);
    setPreviewSourceState(undefined);
  }, [section.id]);
  return (
    <article className="section-review-card" aria-label={`${section.label} review`} aria-busy={busy}>
      <header>
        <h3>{section.label}</h3>
      </header>
      <div className="section-review-card__body">
        <button
          type="button"
          className="section-review-card__image-trigger"
          aria-label={`Preview ${section.label}`}
          disabled={!previewSource}
          onClick={() => setPreviewOpenSectionId(section.id)}
        >
          <ProtectedImage
            source={revision.imageReference}
            alt={`${section.label}, revision ${revision.revisionNumber}`}
            className="section-review-card__image"
            dataRevision={revision.revisionNumber}
            onSourceChange={(source) => setPreviewSourceState({
              sectionId: section.id,
              source
            })}
          />
          <span className="section-review-card__zoom-affordance">Zoom image</span>
        </button>
        <div className="section-review-card__details">
          <div className="section-review-card__metadata">
            <p>Design version {section.versionNumber} · Section revision {revision.revisionNumber}</p>
            <span className={`status-badge status-badge--${revision.reviewStatus}`}>
              {statusLabel(revision.reviewStatus)}
            </span>
          </div>
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
              <button type="button" className="button button--success" disabled={busy} onClick={onApprove} aria-label={`Approve ${section.label}`}>Approve</button>
              <button type="button" className="button button--danger" disabled={busy} onClick={onReject} aria-label={`Request changes for ${section.label}`}>Request changes</button>
            </div>
          ) : null}
        </div>
      </div>
      <footer className="section-review-card__navigation" aria-label="Plan navigation">
        <button type="button" className="secondary-button" aria-label={previousLabel ? `Previous plan: ${previousLabel}` : "Previous plan"} disabled={busy || !previousLabel} onClick={onPrevious}>Previous</button>
        <span>Plan {position} of {total}</span>
        <button type="button" className="secondary-button" aria-label={nextLabel ? `Next plan: ${nextLabel}` : "Next plan"} disabled={busy || !nextLabel} onClick={onNext}>Next</button>
      </footer>
      {previewOpen && previewSource ? (
        <Dialog
          title={`${section.label} preview`}
          eyebrow="Section preview"
          onClose={() => setPreviewOpenSectionId(undefined)}
        >
          <div className="section-review-card__modal">
            <img
              className="section-review-card__modal-image"
              src={previewSource}
              alt={`Full preview of ${section.label}`}
            />
            <div className="section-review-card__modal-actions">
              <button
                type="button"
                className="button button--close"
                onClick={() => setPreviewOpenSectionId(undefined)}
              >
                <X aria-hidden="true" size={18} />
                Close preview
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </article>
  );
}

function statusLabel(status: DesignSectionReviewItem["revision"]["reviewStatus"]) {
  if (status === "submitted") return "Awaiting review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
