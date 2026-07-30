import { useState } from "react";

import type { AnnotationDocumentV1 } from "../../api/types";
import { Dialog } from "../ui/Dialog";
import { AnnotationOverlay, ImageAnnotationEditor } from "./ImageAnnotationEditor";
import { ProtectedImage } from "./ProtectedImage";
import type { ViewTransform } from "./annotationGeometry";

export interface EstimateDrawingPreviewDialogProps {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  annotations: AnnotationDocumentV1;
  canAnnotate: boolean;
  onClose: () => void;
  onSaveDraft?: (document: AnnotationDocumentV1) => void | Promise<void>;
  onSubmitChangeRequest?: (
    document: AnnotationDocumentV1,
    summary: string
  ) => void | Promise<void>;
}

const DEFAULT_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

function fingerprint(document: AnnotationDocumentV1) {
  return JSON.stringify(document);
}

export function EstimateDrawingPreviewDialog({
  title,
  imageUrl,
  imageWidth,
  imageHeight,
  annotations,
  canAnnotate,
  onClose,
  onSaveDraft,
  onSubmitChangeRequest
}: EstimateDrawingPreviewDialogProps) {
  const [imageSource, setImageSource] = useState<string>();
  const [document, setDocument] = useState(annotations);
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(annotations));
  const [summary, setSummary] = useState("");
  const [viewTransform, setViewTransform] = useState(DEFAULT_VIEW);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState<"save" | "submit">();
  const [error, setError] = useState("");
  const annotationsDirty = fingerprint(document) !== savedFingerprint;
  const dirty = annotationsDirty || summary.trim().length > 0;

  function requestClose() {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  function zoomBy(amount: number) {
    setViewTransform((current) => ({
      ...current,
      zoom: Math.max(1, Math.min(4, Math.round((current.zoom + amount) * 100) / 100))
    }));
  }

  function panBy(x: number, y: number) {
    setViewTransform((current) => ({
      ...current,
      panX: Math.max(-0.5, Math.min(0.5, current.panX + x)),
      panY: Math.max(-0.5, Math.min(0.5, current.panY + y))
    }));
  }

  async function saveDraft() {
    if (!onSaveDraft) return;
    setBusy("save");
    setError("");
    try {
      await onSaveDraft(document);
      setSavedFingerprint(fingerprint(document));
    } catch {
      setError("The annotation draft could not be saved. Try again.");
    } finally {
      setBusy(undefined);
    }
  }

  async function submitChangeRequest() {
    if (
      !onSubmitChangeRequest ||
      !summary.trim() ||
      document.elements.length === 0
    ) return;
    setBusy("submit");
    setError("");
    try {
      await onSubmitChangeRequest(document, summary.trim());
      setSavedFingerprint(fingerprint(document));
      setSummary("");
    } catch {
      setError("The change request could not be submitted. Try again.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Dialog
      title={`${title} preview`}
      eyebrow={canAnnotate ? "Drawing review" : "Drawing preview"}
      description={canAnnotate ? "Mark the drawing or add a text note before requesting changes." : "Client markings are shown as a read-only overlay."}
      onClose={requestClose}
      busy={busy !== undefined}
    >
      <div className="estimate-drawing-preview-dialog">
        <ProtectedImage
          source={imageUrl}
          alt={`${title} protected drawing`}
          className={imageSource ? "estimate-drawing-preview-dialog__loader estimate-drawing-preview-dialog__loader--ready" : "estimate-drawing-preview-dialog__loader"}
          onSourceChange={setImageSource}
        />
        <div className="estimate-drawing-preview-dialog__layout">
          <div className="estimate-drawing-preview-dialog__canvas">
            {imageSource ? (
              canAnnotate ? (
                <ImageAnnotationEditor
                  imageSource={imageSource}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                  value={document}
                  readOnly={false}
                  onChange={setDocument}
                  viewTransform={viewTransform}
                />
              ) : (
                <AnnotationOverlay
                  imageSource={imageSource}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                  value={document}
                  viewTransform={viewTransform}
                />
              )
            ) : (
              <p role="status">Loading protected drawing…</p>
            )}
          </div>
          <aside className="estimate-drawing-preview-dialog__controls" aria-label="Drawing view controls">
            <div className="estimate-drawing-preview-dialog__view-toolbar" role="toolbar" aria-label="Zoom and pan">
              <button type="button" onClick={() => zoomBy(0.25)} disabled={viewTransform.zoom >= 4}>Zoom in</button>
              <button type="button" onClick={() => zoomBy(-0.25)} disabled={viewTransform.zoom <= 1}>Zoom out</button>
              <button type="button" onClick={() => panBy(-0.05, 0)}>Pan left</button>
              <button type="button" onClick={() => panBy(0.05, 0)}>Pan right</button>
              <button type="button" onClick={() => panBy(0, -0.05)}>Pan up</button>
              <button type="button" onClick={() => panBy(0, 0.05)}>Pan down</button>
              <button type="button" onClick={() => setViewTransform(DEFAULT_VIEW)}>Reset view</button>
            </div>
            <output aria-live="polite">{Math.round(viewTransform.zoom * 100)}% zoom</output>
            {canAnnotate ? (
              <div className="estimate-drawing-preview-dialog__review-actions">
                <label>
                  Change summary
                  <textarea
                    maxLength={1_000}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder="Describe what should change"
                  />
                </label>
                {error ? <p role="alert">{error}</p> : null}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void saveDraft()}
                  disabled={!onSaveDraft || busy !== undefined || !annotationsDirty}
                >
                  {busy === "save" ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void submitChangeRequest()}
                  disabled={!onSubmitChangeRequest || busy !== undefined || !summary.trim() || document.elements.length === 0}
                >
                  {busy === "submit" ? "Submitting…" : "Submit change request"}
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
      {confirmClose ? (
        <div
          className="annotation-close-confirmation"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="annotation-close-title"
          aria-describedby="annotation-close-description"
        >
          <h3 id="annotation-close-title">Discard unsaved annotations?</h3>
          <p id="annotation-close-description">Your unsaved markings and change summary will be lost.</p>
          <div>
            <button type="button" autoFocus onClick={() => setConfirmClose(false)}>Keep editing</button>
            <button type="button" onClick={onClose}>Discard changes</button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
