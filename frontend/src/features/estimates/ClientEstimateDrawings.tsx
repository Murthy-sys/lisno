import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type {
  AnnotationDocumentV1,
  EstimateDesignClientRevision,
  EstimateDesignClientWorkspace,
  EstimateDesignDrawing,
  EstimatePlanClientWorkspace,
  EstimatePlanPage
} from "../../api/types";
import {
  EstimateDrawingPreviewDialog,
  type SharedChangeRequestComment
} from "../../components/design/EstimateDrawingPreviewDialog";
import { ProtectedImage } from "../../components/design/ProtectedImage";
import { projectAnnotationToCrop, projectAnnotationToPage } from "../../components/design/planGeometry";
import {
  decideClientDrawing,
  estimateDesignKeys,
  estimateDesignRevisionImageUrl,
  previewClientPlanTargets,
  saveClientDrawingAnnotationDraft,
  submitClientPlanChangeRequest
} from "../leads/estimateDesignApi";

export interface ClientEstimateDrawingOption {
  id: string;
  label: string;
}

type ClientDrawingGroup =
  | {
      kind: "mapped";
      room: ClientEstimateDrawingOption;
      scope: ClientEstimateDrawingOption;
      drawings: EstimateDesignDrawing[];
    }
  | {
      kind: "misc";
      drawings: EstimateDesignDrawing[];
    };

interface ClientEstimateDrawingsProps {
  estimateId: string;
  rooms: ClientEstimateDrawingOption[];
  scopes: ClientEstimateDrawingOption[];
  workspace: EstimateDesignClientWorkspace | undefined;
  isPending: boolean;
  isError: boolean;
  canReview: boolean;
  planWorkspace?: EstimatePlanClientWorkspace;
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

function canonicalPlacement(
  revision: EstimateDesignClientRevision,
  revisions: EstimateDesignClientRevision[],
  planWorkspace?: EstimatePlanClientWorkspace
) {
  let current: EstimateDesignClientRevision | undefined = revision;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const page = planWorkspace?.pages.find((item) => item.id === current!.sourcePageId);
    if (page) return { page, crop: current.crop };
    current = current.replacesRevisionId
      ? revisions.find((item) => item.id === current!.replacesRevisionId)
      : undefined;
  }
  return undefined;
}

export function projectDrawingAnnotationsToPage(
  page: EstimatePlanPage,
  drawingWorkspace: EstimateDesignClientWorkspace,
  planWorkspace: EstimatePlanClientWorkspace
) {
  const projected: AnnotationDocumentV1["elements"] = [];
  const requestedRevisionIds = new Set<string>();
  for (const request of planWorkspace.openRequests.filter((item) => item.sourcePageId === page.id)) {
    for (const target of request.targets) requestedRevisionIds.add(target.requestedRevisionId);
    for (const element of request.annotations.elements) {
      projected.push({ ...element, id: `request:${request.id}:${element.id}` });
    }
  }
  const latest = latestRevisions(drawingWorkspace.revisions);
  for (const drawing of drawingWorkspace.drawings) {
    if (!drawing.active) continue;
    const revision = latest.get(drawing.id);
    if (!revision || requestedRevisionIds.has(revision.id)) continue;
    const placement = canonicalPlacement(revision, drawingWorkspace.revisions, planWorkspace);
    if (!placement || placement.page.id !== page.id) continue;
    const annotations = revision.annotationDraft?.annotations ?? revision.annotations;
    if (!annotations) continue;
    for (const element of annotations.elements) {
      projected.push({
        ...projectAnnotationToPage(element, placement.crop, page),
        id: `drawing:${revision.id}:${element.id}`
      });
    }
  }
  return projected;
}

export function projectDrawingCommentsToPage(
  page: EstimatePlanPage,
  drawingWorkspace: EstimateDesignClientWorkspace,
  planWorkspace: EstimatePlanClientWorkspace
) {
  const comments = new Map<string, SharedChangeRequestComment>();
  const requestedRevisionIds = new Set<string>();
  for (const request of planWorkspace.openRequests.filter((item) => item.sourcePageId === page.id)) {
    for (const target of request.targets) requestedRevisionIds.add(target.requestedRevisionId);
    const summary = request.summary.trim();
    if (summary) comments.set(request.id, { id: request.id, summary, status: request.status, source: "plan" });
  }
  const latest = latestRevisions(drawingWorkspace.revisions);
  for (const drawing of drawingWorkspace.drawings) {
    if (!drawing.active) continue;
    const revision = latest.get(drawing.id);
    if (!revision || requestedRevisionIds.has(revision.id)) continue;
    const placement = canonicalPlacement(revision, drawingWorkspace.revisions, planWorkspace);
    const summary = revision.changeSummary?.trim();
    if (!placement || placement.page.id !== page.id || !summary) continue;
    const id = `drawing:${revision.id}`;
    comments.set(id, { id, summary, status: revision.reviewStatus, source: "drawing" });
  }
  return [...comments.values()];
}

export function projectPlanCommentsToDrawing(
  drawingId: string,
  planWorkspace?: EstimatePlanClientWorkspace
) {
  if (!planWorkspace) return [];
  const comments = new Map<string, SharedChangeRequestComment>();
  for (const request of planWorkspace.openRequests) {
    if (!request.targets.some((target) => target.drawingId === drawingId)) continue;
    const summary = request.summary.trim();
    if (summary) comments.set(request.id, { id: request.id, summary, status: request.status, source: "plan" });
  }
  return [...comments.values()];
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
  canReview,
  planWorkspace
}: ClientEstimateDrawingsProps) {
  const latest = useMemo(
    () => latestRevisions(workspace?.revisions ?? []),
    [workspace?.revisions]
  );
  const groups = useMemo<ClientDrawingGroup[]>(() => {
    const mapped = new Map<string, EstimateDesignDrawing[]>();
    const misc: EstimateDesignDrawing[] = [];
    for (const drawing of workspace?.drawings ?? []) {
      if (!drawing.active || !latest.has(drawing.id)) continue;
      if (
        drawing.mappingStatus === "misc" ||
        drawing.roomId === null ||
        drawing.scopeSectionId === null ||
        drawing.catalogueId === null
      ) {
        misc.push(drawing);
        continue;
      }
      const key = `${drawing.roomId}\u0000${drawing.scopeSectionId}`;
      mapped.set(key, [...(mapped.get(key) ?? []), drawing]);
    }
    const resolved = rooms.flatMap((room) =>
      scopes.flatMap((scope) => {
        const drawings = mapped.get(`${room.id}\u0000${scope.id}`) ?? [];
        return drawings.length
          ? [{ kind: "mapped" as const, room, scope, drawings }]
          : [];
      })
    );
    return misc.length
      ? [...resolved, { kind: "misc" as const, drawings: misc }]
      : resolved;
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

  const renderDrawing = (drawing: EstimateDesignDrawing) => {
    const revision = latest.get(drawing.id)!;
    const placement = canonicalPlacement(revision, workspace.revisions, planWorkspace);
    return (
      <ClientDrawingRow
        canReview={canReview}
        drawing={drawing}
        estimateId={estimateId}
        key={drawing.id}
        planPage={placement?.page}
        projectionCrop={placement?.crop ?? revision.crop}
        revision={revision}
        sharedAnnotations={sharedPlanAnnotations(drawing.id, revision, workspace, planWorkspace)}
        sharedComments={projectPlanCommentsToDrawing(drawing.id, planWorkspace)}
      />
    );
  };

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
      {groups.length ? groups.map((group) => group.kind === "mapped" ? (
        <section
          className="client-estimate-drawings__group"
          aria-label={`${group.room.label}, ${group.scope.label} drawings`}
          key={`${group.room.id}:${group.scope.id}`}
        >
          <h5>{group.room.label} <span aria-hidden="true">→</span> {group.scope.label}</h5>
          {group.drawings.map(renderDrawing)}
        </section>
      ) : (
        <section
          className="client-estimate-drawings__group client-estimate-drawings__group--misc"
          aria-label="Miscellaneous drawings"
          key="misc"
        >
          <h5>Miscellaneous</h5>
          <p>
            {group.drawings.length === 1
              ? "This drawing was submitted without an estimate-item assignment."
              : "These drawings were submitted without an estimate-item assignment."}
          </p>
          {group.drawings.map(renderDrawing)}
        </section>
      )) : <p className="inline-empty">No drawings have been submitted for this estimate.</p>}
    </section>
  );
}

function ClientDrawingRow({
  estimateId,
  drawing,
  revision,
  planPage,
  projectionCrop,
  canReview,
  sharedAnnotations,
  sharedComments
}: {
  estimateId: string;
  drawing: EstimateDesignDrawing;
  revision: EstimateDesignClientRevision;
  planPage: EstimatePlanClientWorkspace["pages"][number] | undefined;
  projectionCrop: EstimateDesignClientRevision["crop"];
  canReview: boolean;
  sharedAnnotations: AnnotationDocumentV1["elements"];
  sharedComments: SharedChangeRequestComment[];
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
  const planRequest = useMutation({
    mutationFn: async ({ document, summary }: { document: AnnotationDocumentV1; summary: string }) => {
      if (!planPage) throw new Error("The source plan page is unavailable.");
      const pageAnnotations: AnnotationDocumentV1 = {
        schemaVersion: 1,
        imageWidth: planPage.width,
        imageHeight: planPage.height,
        elements: document.elements.map((element) =>
          projectAnnotationToPage(element, projectionCrop, planPage)
        )
      };
      const preview = await previewClientPlanTargets(planPage.id, pageAnnotations);
      if (!preview.targets.some((target) => target.drawingId === drawing.id)) {
        throw new Error("The annotation no longer overlaps this drawing. Refresh and try again.");
      }
      return submitClientPlanChangeRequest(planPage.id, {
        version: preview.pageRevisionNumber,
        summary,
        annotations: pageAnnotations,
        targetDrawingIds: [drawing.id],
        snapshotToken: preview.snapshotToken,
        idempotencyKey: crypto.randomUUID()
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientWorkspace(estimateId) }),
        queryClient.invalidateQueries({ queryKey: estimateDesignKeys.clientPlanWorkspace(estimateId) })
      ]);
    }
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
          className="button button--secondary"
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
        {decision.isError || planRequest.isError ? (
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
          sharedAnnotations={sharedAnnotations}
          sharedComments={sharedComments}
          canAnnotate={canAnnotate}
          onClose={() => setPreviewOpen(false)}
          onSaveDraft={canAnnotate
            ? async (document) => {
                await saveDraft.mutateAsync(document);
              }
            : undefined}
          onSubmitChangeRequest={canAnnotate
            ? async (document, summary) => {
                if (planPage) {
                  await planRequest.mutateAsync({ document, summary });
                } else {
                  await decision.mutateAsync({
                    version: revision.revisionNumber,
                    decision: "request_changes",
                    summary,
                    annotations: document
                  });
                }
                setPreviewOpen(false);
              }
            : undefined}
        />
      ) : null}
    </>
  );
}

function sharedPlanAnnotations(
  drawingId: string,
  currentRevision: EstimateDesignClientRevision,
  drawingWorkspace: EstimateDesignClientWorkspace,
  planWorkspace?: EstimatePlanClientWorkspace
) {
  if (!planWorkspace) return [];
  const projected: AnnotationDocumentV1["elements"] = [];
  for (const request of planWorkspace.openRequests) {
    const target = request.targets.find((item) => item.drawingId === drawingId);
    if (!target) continue;
    const sourceRevision = drawingWorkspace.revisions.find((item) => item.id === target.requestedRevisionId) ?? currentRevision;
    const page = planWorkspace.pages.find((item) => item.id === request.sourcePageId);
    if (!page) continue;
    for (const element of request.annotations.elements) {
      const result = projectAnnotationToCrop(element, sourceRevision.crop, { width: page.width, height: page.height });
      if (result) projected.push({ ...result, id: `${request.id}:${result.id}` });
    }
  }
  return projected;
}
