import { useState } from "react";

import type { AnnotationDocumentV1, EstimatePlanChangeRequest, EstimatePlanPage } from "../../api/types";
import {
  EstimateDrawingPreviewDialog,
  type SharedChangeRequestComment
} from "../../components/design/EstimateDrawingPreviewDialog";
import { Dialog } from "../../components/ui/Dialog";

type TargetPreview = {
  pageRevisionNumber: number;
  targets: Array<{ drawingId: string; title: string; reason: "anchor_inside" | "area_overlap" }>;
  snapshotToken: string;
};

export function ClientPlanPageReview({
  page,
  sharedAnnotations = [],
  sharedComments = [],
  editableRequest,
  pages = [page],
  onSelectPage,
  canReview,
  onClose,
  saveDraft,
  previewTargets,
  submitRequest,
  updateRequest
}: {
  page: EstimatePlanPage;
  sharedAnnotations?: AnnotationDocumentV1["elements"];
  sharedComments?: SharedChangeRequestComment[];
  editableRequest?: EstimatePlanChangeRequest;
  pages?: EstimatePlanPage[];
  onSelectPage?: (page: EstimatePlanPage) => void;
  canReview: boolean;
  onClose: () => void;
  saveDraft: (annotations: AnnotationDocumentV1) => Promise<unknown>;
  previewTargets: (annotations: AnnotationDocumentV1) => Promise<TargetPreview>;
  submitRequest: (input: { version: number; summary: string; annotations: AnnotationDocumentV1; targetDrawingIds: string[]; snapshotToken: string; idempotencyKey: string }) => Promise<unknown>;
  updateRequest?: (input: { requestId: string; version: number; summary: string; annotations: AnnotationDocumentV1 }) => Promise<unknown>;
}) {
  const initial: AnnotationDocumentV1 = editableRequest?.annotations ?? page.annotationDraft?.annotations ?? { schemaVersion: 1, imageWidth: page.width, imageHeight: page.height, elements: [] };
  const [pending, setPending] = useState<{ document: AnnotationDocumentV1; summary: string; preview: TargetPreview; selected: string[] }>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  return (
    <>
      <EstimateDrawingPreviewDialog
        title={`Design page ${page.pageNumber}`}
        imageUrl={page.currentImageUrl}
        imageWidth={page.width}
        imageHeight={page.height}
        annotations={initial}
        sharedAnnotations={sharedAnnotations}
        sharedComments={sharedComments}
        editableRequest={editableRequest ? { id: editableRequest.id, version: editableRequest.version, summary: editableRequest.summary } : undefined}
        canAnnotate={canReview && page.status !== "approved"}
        navigation={<nav className="client-plan-page-navigation" aria-label="Uploaded plan pages">
          {pages.slice().sort((left, right) => left.pageNumber - right.pageNumber).map((candidate) => <button type="button" className="button button--secondary" aria-current={candidate.id === page.id ? "page" : undefined} onClick={() => onSelectPage?.(candidate)} key={candidate.id}>Page {candidate.pageNumber}</button>)}
        </nav>}
        onClose={onClose}
        onSaveDraft={async (document) => { await saveDraft(document); }}
        onSubmitChangeRequest={async (document, summary) => {
          const preview = await previewTargets(document);
          setPending({ document, summary, preview, selected: preview.targets.map((target) => target.drawingId) });
        }}
        onUpdateChangeRequest={editableRequest && updateRequest
          ? async (requestId, version, document, summary) => {
              await updateRequest({ requestId, version, summary, annotations: document });
            }
          : undefined}
      />
      {pending ? (
        <Dialog
          title="Confirm affected drawings"
          eyebrow="Request changes"
          description={pending.preview.targets.length ? "Confirm every extracted drawing affected by these markings." : "No extracted drawing overlaps these markings. This will be sent as page-level feedback."}
          onClose={() => setPending(undefined)}
          busy={submitting}
        >
          <div className="client-plan-targets">
            {pending.preview.targets.map((target) => (
              <label key={target.drawingId}>
                <input
                  type="checkbox"
                  checked={pending.selected.includes(target.drawingId)}
                  onChange={(event) => setPending({ ...pending, selected: event.target.checked ? [...pending.selected, target.drawingId] : pending.selected.filter((id) => id !== target.drawingId) })}
                />
                {target.title}
              </label>
            ))}
            {!pending.preview.targets.length ? <p>No drawing overlap detected. Staff will map or resolve this page feedback.</p> : null}
            {error ? <p role="alert">{error}</p> : null}
            <button
              type="button"
              className="button button--primary"
              disabled={submitting || (pending.preview.targets.length > 0 && pending.selected.length === 0)}
              onClick={async () => {
                setSubmitting(true); setError("");
                try {
                  await submitRequest({ version: pending.preview.pageRevisionNumber, summary: pending.summary, annotations: pending.document, targetDrawingIds: pending.selected, snapshotToken: pending.preview.snapshotToken, idempotencyKey: crypto.randomUUID() });
                  setPending(undefined); onClose();
                } catch { setError("The request changed or could not be submitted. Refresh and try again."); }
                finally { setSubmitting(false); }
              }}
            >Request changes</button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
