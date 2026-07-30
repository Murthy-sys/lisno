import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type {
  AnnotationDocumentV1,
  EstimateDesignClientRevision,
  EstimateDesignClientWorkspace,
  EstimateDesignDrawing,
  EstimateDesignSourcePage
} from "../../api/types";
import { EstimateDrawingPreviewDialog } from "../../components/design/EstimateDrawingPreviewDialog";
import { ProtectedImage } from "../../components/design/ProtectedImage";
import {
  decideClientDrawing,
  estimateDesignKeys,
  estimateDesignRevisionImageUrl,
  saveClientDrawingAnnotationDraft
} from "../leads/estimateDesignApi";

export interface ClientEstimateDrawingOption {
  id: string;
  label: string;
}

interface ClientEstimateDrawingsProps {
  estimateId: string;
  rooms: ClientEstimateDrawingOption[];
  scopes: ClientEstimateDrawingOption[];
  workspace: EstimateDesignClientWorkspace | undefined;
  isPending: boolean;
  isError: boolean;
  canReview: boolean;
}

function latestRevisions(revisions: EstimateDesignClientRevision[]) {
  const latest = new Map<string, EstimateDesignClientRevision>();
  for (const revision of revisions) {
    const current = latest.get(revision.drawingId);
    if (!current || current.revisionNumber < revision.revisionNumber) {
      latest.set(revision.drawingId, revision);
    }
  }
  return latest;
}

function reviewStatusLabel(status: EstimateDesignClientRevision["reviewStatus"]) {
  if (status === "submitted") return "Awaiting client review";
  if (status === "approved") return "Approved";
  if (status === "changes_requested") return "Changes requested";
  return "Draft";
}

export function clientDrawingReadinessId(estimateId: string) {
  return `client-estimate-${estimateId}-drawing-readiness`;
}

export function drawingReadinessText(
  readiness: EstimateDesignClientWorkspace["readiness"]
) {
  if (readiness.ready) {
    return readiness.total
      ? `${readiness.approved} of ${readiness.total} drawings approved.`
      : "No drawings require approval.";
  }
  const unresolved = Math.max(0, readiness.total - readiness.approved);
  const reasons = [
    readiness.awaitingReview
      ? `${readiness.awaitingReview} awaiting review`
      : "",
    readiness.changesRequested
      ? `${readiness.changesRequested} changes requested`
      : ""
  ].filter(Boolean);
  return `${unresolved} drawing${unresolved === 1 ? "" : "s"} unresolved${
    reasons.length ? `: ${reasons.join(", ")}` : ""
  }.`;
}

export function ClientEstimateDrawings({
  estimateId,
  rooms,
  scopes,
  workspace,
  isPending,
  isError,
  canReview
}: ClientEstimateDrawingsProps) {
  const latest = useMemo(
    () => latestRevisions(workspace?.revisions ?? []),
    [workspace?.revisions]
  );
  const groups = useMemo(() => {
    const drawings = new Map<string, EstimateDesignDrawing[]>();
    for (const drawing of workspace?.drawings ?? []) {
      if (!drawing.active || !latest.has(drawing.id)) continue;
      const key = `${drawing.roomId ?? ""}\u0000${drawing.scopeSectionId ?? ""}`;
      drawings.set(key, [...(drawings.get(key) ?? []), drawing]);
    }
    return rooms.flatMap((room) =>
      scopes.map((scope) => ({
        room,
        scope,
        drawings: drawings.get(`${room.id}\u0000${scope.id}`) ?? []
      }))
    ).filter((group) => group.drawings.length > 0);
  }, [latest, rooms, scopes, workspace?.drawings]);

  if (isPending) {
    return (
      <p id={clientDrawingReadinessId(estimateId)} role="status">
        Loading drawings and approval readiness…
      </p>
    );
  }
  if (isError) {
    return (
      <p id={clientDrawingReadinessId(estimateId)} role="alert">
        The estimate drawings and approval readiness could not be loaded. Refresh and try again.
      </p>
    );
  }
  if (!workspace) return null;

  return (
    <section className="client-estimate-drawings" aria-labelledby={`client-estimate-${estimateId}-drawings-title`}>
      <header>
        <div>
          <p className="eyebrow">Design drawing review</p>
          <h4 id={`client-estimate-${estimateId}-drawings-title`}>Review drawings</h4>
        </div>
        <p id={clientDrawingReadinessId(estimateId)}>
          {drawingReadinessText(workspace.readiness)}
        </p>
      </header>
      {groups.length ? groups.map((group) => (
        <section
          className="client-estimate-drawings__group"
          aria-label={`${group.room.label}, ${group.scope.label} drawings`}
          key={`${group.room.id}:${group.scope.id}`}
        >
          <h5>{group.room.label} <span aria-hidden="true">→</span> {group.scope.label}</h5>
          {group.drawings.map((drawing) => {
            const revision = latest.get(drawing.id)!;
            const page = workspace.pages.find((item) => item.id === revision.sourcePageId);
            return (
              <ClientDrawingRow
                canReview={canReview}
                drawing={drawing}
                estimateId={estimateId}
                key={drawing.id}
                page={page}
                revision={revision}
              />
            );
          })}
        </section>
      )) : <p className="inline-empty">No drawings have been submitted for this estimate.</p>}
    </section>
  );
}

function ClientDrawingRow({
  estimateId,
  drawing,
  revision,
  page,
  canReview
}: {
  estimateId: string;
  drawing: EstimateDesignDrawing;
  revision: EstimateDesignClientRevision;
  page: EstimateDesignSourcePage | undefined;
  canReview: boolean;
}) {
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const saveDraft = useMutation({
    mutationFn: (annotations: AnnotationDocumentV1) =>
      saveClientDrawingAnnotationDraft(
        revision.id,
        revision.annotationDraft?.version ?? 0,
        annotations
      ),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: estimateDesignKeys.clientWorkspace(estimateId)
    })
  });
  const decision = useMutation({
    mutationFn: (
      input:
        | { version: number; decision: "approve" }
        | {
            version: number;
            decision: "request_changes";
            summary: string;
            annotations: AnnotationDocumentV1;
          }
    ) => decideClientDrawing(revision.id, input),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: estimateDesignKeys.clientWorkspace(estimateId)
    })
  });
  const canAnnotate = canReview && revision.reviewStatus === "submitted";
  const storedAnnotations = revision.annotationDraft?.annotations ??
    revision.annotations;
  const annotations: AnnotationDocumentV1 = storedAnnotations
    ? {
        ...storedAnnotations,
        imageWidth: revision.crop.width,
        imageHeight: revision.crop.height
      }
    : {
      schemaVersion: 1,
      imageWidth: revision.crop.width,
      imageHeight: revision.crop.height,
      elements: []
    };
  const previewLabel = revision.reviewStatus === "changes_requested"
    ? `Review changes for ${drawing.displayTitle}`
    : `Preview ${drawing.displayTitle}`;

  return (
    <>
      <article
        className="client-estimate-drawing"
        aria-label={`${drawing.displayTitle} drawing`}
      >
        <ProtectedImage
          source={estimateDesignRevisionImageUrl(revision.id)}
          alt={`${drawing.displayTitle} thumbnail`}
          className="client-estimate-drawing__thumbnail"
        />
        <div className="client-estimate-drawing__metadata">
          <strong>{drawing.displayTitle}</strong>
          {revision.changeSummary ? <small>{revision.changeSummary}</small> : null}
        </div>
        <span className={`client-estimate-drawing__status client-estimate-drawing__status--${revision.reviewStatus}`}>
          {reviewStatusLabel(revision.reviewStatus)}
        </span>
        <button
          type="button"
          className="secondary-button"
          aria-label={previewLabel}
          onClick={() => setPreviewOpen(true)}
        >
          {revision.reviewStatus === "changes_requested" ? "Review changes" : "Preview"}
        </button>
        {canAnnotate ? (
          <button
            type="button"
            className="button button--primary"
            aria-label={`${decision.isPending ? "Approving" : "Approve"} ${drawing.displayTitle}`}
            disabled={decision.isPending}
            onClick={() => decision.mutate({
              version: revision.revisionNumber,
              decision: "approve"
            })}
          >
            {decision.isPending ? "Approving…" : "Approve"}
          </button>
        ) : null}
        {decision.isError ? (
          <p role="alert" className="client-estimate-drawing__error">
            The drawing decision could not be saved. Refresh and try again.
          </p>
        ) : null}
      </article>
      {previewOpen ? (
        <EstimateDrawingPreviewDialog
          title={drawing.displayTitle}
          imageUrl={estimateDesignRevisionImageUrl(revision.id)}
          imageWidth={annotations.imageWidth}
          imageHeight={annotations.imageHeight}
          annotations={annotations}
          canAnnotate={canAnnotate}
          onClose={() => setPreviewOpen(false)}
          onSaveDraft={canAnnotate
            ? async (document) => {
                await saveDraft.mutateAsync(document);
              }
            : undefined}
          onSubmitChangeRequest={canAnnotate
            ? async (document, summary) => {
                await decision.mutateAsync({
                  version: revision.revisionNumber,
                  decision: "request_changes",
                  summary,
                  annotations: document
                });
                setPreviewOpen(false);
              }
            : undefined}
        />
      ) : null}
    </>
  );
}
