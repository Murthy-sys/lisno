import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import type { CropRect, DesignSection, DesignSourcePage } from "../../api/types";
import { CropEditor, cropIsValid } from "./CropEditor";
import { ProtectedImage } from "./ProtectedImage";

interface SectionEditorProps {
  section: DesignSection;
  page: DesignSourcePage;
  onSave: (input: { label: string; crop: CropRect }) => Promise<DesignSection>;
  onRemove: () => Promise<void>;
  onConflictRefresh: () => Promise<unknown>;
  onDraftState: (state: { dirty: boolean; valid: boolean }) => void;
  locked?: boolean;
}

export function SectionEditor({
  section,
  page,
  onSave,
  onRemove,
  onConflictRefresh,
  onDraftState,
  locked = false
}: SectionEditorProps) {
  const [label, setLabel] = useState(section.label);
  const [crop, setCrop] = useState(section.revision.crop);
  const [error, setError] = useState<unknown>(null);

  const editable = !locked && (
    section.revision.reviewStatus === "draft" ||
    section.revision.reviewStatus === "rejected"
  );
  const dirty = label !== section.label ||
    JSON.stringify(crop) !== JSON.stringify(section.revision.crop);
  const valid = Boolean(label.trim()) && cropIsValid(crop, page);

  useEffect(() => {
    onDraftState({ dirty, valid });
  }, [dirty, valid, onDraftState]);

  useEffect(() => {
    if (!dirty) {
      setLabel(section.label);
      setCrop(section.revision.crop);
    }
  }, [section.id, section.revision.revisionNumber, section.label, section.revision.crop, dirty]);

  const save = async () => {
    setError(null);
    try {
      const updated = await onSave({ label, crop });
      setLabel(updated.label);
      setCrop(updated.revision.crop);
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <article className="design-section-editor">
      <header>
        <div>
          <label>
            <span>Section label</span>
            <input
              aria-label="Section label"
              value={label}
              disabled={!editable}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <p>Revision {section.revision.revisionNumber} · {section.revision.reviewStatus}</p>
        </div>
        {section.ocrConfidence !== null && section.ocrConfidence < 0.7 ? (
          <p className="confidence-warning" role="status">
            Low OCR confidence ({Math.round(section.ocrConfidence * 100)}%). Verify this label and crop.
          </p>
        ) : null}
      </header>

      {section.revision.rejectionComment ? (
        <p className="client-comment"><strong>Client comment:</strong> {section.revision.rejectionComment}</p>
      ) : null}

      {editable ? <CropEditor label={label || section.label} crop={crop} page={page} onChange={setCrop} /> : (
        <p className="locked-section">{locked ? "This submission is read-only." : "Approved sections are locked."}</p>
      )}
      <figure className="crop-preview">
        <ProtectedImage
          source={section.revision.imageReference}
          alt={`${section.label} crop preview`}
          dataRevision={section.revision.revisionNumber}
        />
        <figcaption>Saved crop preview</figcaption>
      </figure>

      {error ? (
        <div className="section-save-error" role="alert">
          {error instanceof ApiError && error.status === 409
            ? "This section changed on the server. Your draft is still here."
            : "Your changes were not saved. Your draft is still here."}
          {error instanceof ApiError && error.status === 409 ? (
            <button type="button" onClick={() => void onConflictRefresh()}>
              Refresh server version
            </button>
          ) : null}
        </div>
      ) : null}

      {editable ? <div className="design-section-editor__actions">
        <button type="button" className="button button--primary" disabled={!valid || !dirty} onClick={() => void save()}>
          Save {label || "section"}
        </button>
        <button type="button" className="button button--secondary" onClick={() => void onRemove()}>
          Remove {label || "section"}
        </button>
      </div> : null}
    </article>
  );
}
