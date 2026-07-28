import { useState } from "react";
import { X } from "lucide-react";

import type { DesignSectionReviewItem } from "../../api/types";
import { Dialog } from "../ui/Dialog";
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
  const [previewSource, setPreviewSource] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
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
      <button
        type="button"
        className="section-review-card__thumbnail"
        aria-label={`Preview ${section.label}`}
        disabled={!previewSource}
        onClick={() => setPreviewOpen(true)}
      >
        <ProtectedImage
          source={revision.imageReference}
          alt={`${section.label}, revision ${revision.revisionNumber}`}
          className="section-review-card__thumbnail-image"
          dataRevision={revision.revisionNumber}
          onSourceChange={setPreviewSource}
        />
      </button>
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
          <button type="button" className="button button--danger" disabled={busy} onClick={onReject} aria-label={`Reject ${section.label}`}>Request changes</button>
        </div>
      ) : null}
      {previewOpen && previewSource ? (
        <Dialog
          title={`${section.label} preview`}
          eyebrow="Section preview"
          onClose={() => setPreviewOpen(false)}
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
                onClick={() => setPreviewOpen(false)}
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
