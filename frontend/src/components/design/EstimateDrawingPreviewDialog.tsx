import { useState, type ReactNode } from "react";

import type { AnnotationDocumentV1 } from "../../api/types";
import { Dialog } from "../ui/Dialog";
import { AnnotationOverlay, ImageAnnotationEditor } from "./ImageAnnotationEditor";
import { ProtectedImage } from "./ProtectedImage";
import {
  isAnnotationDocumentWithinByteLimit,
  type ViewTransform
} from "./annotationGeometry";
import { MapViewport } from "./MapViewport";

export interface EstimateDrawingPreviewDialogProps {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  annotations: AnnotationDocumentV1;
  canAnnotate: boolean;
  navigation?: ReactNode;
  onClose: () => void;
  onSaveDraft?: (document: AnnotationDocumentV1) => void | Promise<void>;
  onSubmitChangeRequest?: (
    document: AnnotationDocumentV1,
    summary: string
  ) => void | Promise<void>;
}

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
  navigation,
  onClose,
  onSaveDraft,
  onSubmitChangeRequest
}: EstimateDrawingPreviewDialogProps) {
  const [imageSource, setImageSource] = useState<string>();
  const [document, setDocument] = useState(annotations);
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(annotations));
  const [summary, setSummary] = useState("");
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

  async function saveDraft() {
    if (!onSaveDraft) return;
    if (!isAnnotationDocumentWithinByteLimit(document)) {
      setError("Annotations exceed the 256 KiB limit. Remove or shorten markings before saving.");
      return;
    }
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
    if (!isAnnotationDocumentWithinByteLimit(document)) {
      setError("Annotations exceed the 256 KiB limit. Remove or shorten markings before submitting.");
      return;
    }
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
    <>
      <Dialog
        title={`${title} preview`}
        eyebrow={canAnnotate ? "Drawing review" : "Drawing preview"}
        description={canAnnotate ? "Mark the drawing or add a text note before requesting changes." : "Client markings are shown as a read-only overlay."}
        onClose={requestClose}
        busy={busy !== undefined}
        contentInert={confirmClose}
      >
        <div className="estimate-drawing-preview-dialog">
        <ProtectedImage
          source={imageUrl}
          alt={`${title} protected drawing`}
          className={imageSource ? "estimate-drawing-preview-dialog__loader estimate-drawing-preview-dialog__loader--ready" : "estimate-drawing-preview-dialog__loader"}
          onSourceChange={setImageSource}
        />
      <div className="estimate-drawing-preview-dialog__layout">
          {navigation ? <div className="estimate-drawing-preview-dialog__navigation">{navigation}</div> : null}
          <div className="estimate-drawing-preview-dialog__canvas">
            {imageSource ? (
              <MapViewport ariaLabel={`${title} map view`}>
                {(mapView) => {
                  const viewTransform: ViewTransform = {
                    zoom: mapView.scale,
                    panX: mapView.translateX / Math.max(1, imageWidth),
                    panY: mapView.translateY / Math.max(1, imageHeight)
                  };
                  return canAnnotate ? (
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
                  );
                }}
              </MapViewport>
            ) : (
              <p role="status">Loading protected drawing…</p>
            )}
          </div>
          <aside className="estimate-drawing-preview-dialog__controls" aria-label="Drawing view controls">
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
                  className="button button--secondary"
                  onClick={() => void saveDraft()}
                  disabled={!onSaveDraft || busy !== undefined || !annotationsDirty}
                >
                  {busy === "save" ? "Saving…" : "Save as draft"}
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
      </Dialog>
      {confirmClose ? (
        <Dialog
          title="Discard unsaved annotations?"
          eyebrow="Unsaved drawing review"
          description="Your unsaved markings and change summary will be lost."
          role="alertdialog"
          onClose={() => setConfirmClose(false)}
          showCloseButton={false}
        >
          <div className="annotation-close-confirmation">
            <button
              type="button"
              data-dialog-initial-focus
              onClick={() => setConfirmClose(false)}
            >
              Keep editing
            </button>
            <button type="button" onClick={onClose}>Discard changes</button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
