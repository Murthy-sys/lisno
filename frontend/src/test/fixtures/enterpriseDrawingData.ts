// Synthetic drawing records adapted from existing client/designer regression fixtures.
import type { DesignExtraction, DesignSectionReviewData, EstimateDesignWorkspace, EstimateDesignClientWorkspace, EstimatePlanClientWorkspace, ClientDesignVersion } from "../../api/types";
import type { DesignWorkflowView, DesignWorkflowStage } from "../../features/workflow/projectWorkflowApi";

export const revision = {
  id: "revision-2",
  sectionId: "section-1",
  revisionNumber: 2,
  sourcePageId: "page-1",
  crop: { x: 10, y: 20, width: 600, height: 400 },
  label: "Front elevation",
  reviewStatus: "submitted" as const,
  submittedAt: "2026-07-27T10:00:00.000Z",
  reviewerId: null,
  reviewedAt: null,
  rejectionComment: null,
  createdAt: "2026-07-27T09:00:00.000Z",
  imageReference: "/api/v1/design-section-revisions/revision-2/image"
};

export const secondRevision = {
  ...revision,
  id: "revision-3",
  sectionId: "section-2",
  sourcePageId: "page-2",
  label: "Site plan",
  imageReference: "/api/v1/design-section-revisions/revision-3/image"
};

export const review: DesignSectionReviewData = {
  projectId: "project-1",
  progress: { approved: 0, rejected: 0, awaitingReview: 2, total: 2 },
  sections: [{
    id: "section-1",
    designVersionId: "version-1",
    sourcePageId: "page-1",
    label: "Front elevation",
    active: true,
    source: "ocr" as const,
    ocrConfidence: .93,
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    revision,
    versionNumber: 3,
    sourcePageUrl: "/api/v1/design-source-pages/page-1/image",
    history: [
      { ...revision, id: "revision-1", revisionNumber: 1, reviewStatus: "rejected" as const, rejectionComment: "Show the roof line.", reviewedAt: "2026-07-26T10:00:00.000Z" },
      revision
    ]
  }, {
    id: "section-2",
    designVersionId: "version-2",
    sourcePageId: "page-2",
    label: "Site plan",
    active: true,
    source: "ocr" as const,
    ocrConfidence: .91,
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    revision: secondRevision,
    versionNumber: 4,
    sourcePageUrl: "/api/v1/design-source-pages/page-2/image",
    history: [secondRevision]
  }]
};

export function extractedWorkspace(estimateId: string, title = "Living Room Electrical Plan"):
EstimateDesignWorkspace {
  return {
    uploads: [{
      id: `upload-${estimateId}`,
      estimateId,
      leadId: "lead-1",
      originalFilename: "client-design.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      uploaderId: "designer-1",
      uploadedAt: "2026-08-26T08:00:00.000Z",
      extractionStatus: "estimator_review",
      failureCode: null,
      failureMessage: null,
      canRetry: false,
      canDelete: false,
      purpose: "ordinary",
      requestReplacement: null
    }],
    pages: [{
      id: `page-${estimateId}`,
      uploadId: `upload-${estimateId}`,
      pageNumber: 1,
      width: 1200,
      height: 800
    }],
    drawings: [{
      id: `drawing-${estimateId}`,
      uploadId: `upload-${estimateId}`,
      sourcePageId: `page-${estimateId}`,
      estimateId,
      active: true,
      verified: false,
      roomId: "room-living",
      scopeSectionId: "EL",
      catalogueId: "EL01",
      mappingStatus: "auto_mapped",
      detectedTitle: title,
      displayTitle: title,
      source: "ocr",
      roomConfidence: 0.95,
      scopeConfidence: 0.96,
      ocrConfidence: 0.94,
      roomEvidence: [],
      scopeEvidence: []
    }],
    revisions: [{
      id: `revision-${estimateId}`,
      drawingId: `drawing-${estimateId}`,
      revisionNumber: 1,
      sourcePageId: `page-${estimateId}`,
      crop: { x: 0, y: 0, width: 1200, height: 800 },
      roomId: "room-living",
      scopeSectionId: "EL",
      catalogueId: "EL01",
      mappingStatus: "auto_mapped",
      label: title,
      reviewStatus: "draft",
      submittedAt: null,
      reviewerId: null,
      reviewedAt: null,
      changeSummary: null,
      annotationLayerId: null,
      annotations: { schemaVersion: 1, imageWidth: 1200, imageHeight: 800, elements: [{ id: "qa-ceiling-outline", type: "rectangle", x: 0.15, y: 0.22, width: 0.25, height: 0.2, color: "#d44837", strokeWidth: 3 }, { id: "qa-ceiling-note", type: "text", x: 0.18, y: 0.46, text: "Review ceiling alignment", color: "#d44837", strokeWidth: 2 }] },
      replacementUploadId: null,
      replacesRevisionId: null
    }]
  };
}

export const approvedDocument: ClientDesignVersion = {
  id: "qa-approved-document", projectId: "project-villa", floorId: "floor-ground", stageId: "stage-plan", taskId: null,
  versionNumber: 3, originalFilename: "Aurora approved plan.pdf", mimeType: "application/pdf", sizeBytes: 1250,
  uploadedAt: "2026-09-10T09:00:00.000Z", approvalStatus: "approved", approvedAt: "2026-09-11T09:00:00.000Z",
  clientVisible: true, extractionStatus: "approved", createdAt: "2026-09-10T09:00:00.000Z", updatedAt: "2026-09-11T09:00:00.000Z"
};

export const approvedExtraction: DesignExtraction = {
  extractionStatus: "approved",
  pages: [{
    id: "page-1", designVersionId: approvedDocument.id, pageNumber: 1, width: 1200, height: 800,
    imageUrl: "/api/v1/design-source-pages/page-1/image", createdAt: approvedDocument.createdAt
  }],
  sections: [{
    ...review.sections[0], designVersionId: approvedDocument.id,
    revision: { ...revision, reviewStatus: "approved", reviewerId: "client-1", reviewedAt: approvedDocument.approvedAt }
  }]
};

export function clientDrawingWorkspace(estimateId: string): EstimateDesignClientWorkspace {
  const source = extractedWorkspace(estimateId);
  return { ...source, drawings: source.drawings.map((drawing) => ({ ...drawing, verified: true })), revisions: source.revisions.map((item) => ({ ...item, reviewStatus: "submitted", submittedAt: "2026-09-12T09:00:00.000Z", annotationDraft: null })), readiness: { ready: false, total: 1, approved: 0, awaitingReview: 1, changesRequested: 0 } };
}

export function clientPlanWorkspace(estimateId: string): EstimatePlanClientWorkspace {
  const page = { id: `page-${estimateId}`, uploadId: `upload-${estimateId}`, pageNumber: 1, width: 1200, height: 800, currentRevisionId: `manifest-${estimateId}`, status: "awaiting_review" as const, thumbnailUrl: `/client/estimate-plan-pages/page-${estimateId}/thumbnail`, currentImageUrl: `/client/estimate-plan-pages/page-${estimateId}/current-image`, annotationDraft: null };
  return { uploads: [{ id: page.uploadId, originalFilename: "Aurora space plan.pdf", mimeType: "application/pdf", pageCount: 1, pages: [page] }], pages: [page], openRequests: [] };
}

export function drawingWorkflow(projectId: string, uploadStage: boolean): DesignWorkflowView {
  const now = "2026-09-13T09:00:00.000Z";
  const stage: DesignWorkflowStage = {
    id: `${projectId}:client_kickoff`, name: "Client Kick off", type: "client_kickoff", order: 1, dependencyStageIds: [],
    status: "in_progress", progress: 25, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: { status: "in_progress", version: 2, availableActions: [], blockingReasons: [], facts: [{ label: "Document", value: "Submitted for client review" }], history: [],
      submittedDocument: { eventId: "qa-internal-document", filename: "Aurora internal kickoff.pdf", mimeType: "application/pdf", uploadedAt: now },
      timing: { state: "not_applicable", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 }
    }
  };
  const stages = uploadStage ? [
    { ...stage, status: "completed" as const, progress: 100, operational: { ...stage.operational!, status: "completed" as const } },
    { ...stage, id: `${projectId}:space_planning_tentative_look_feel`, name: "Designer Uploading Space planning with Tentative look and Feel", type: "space_planning_tentative_look_feel" as const, order: 2, dependencyStageIds: [stage.id], operational: { ...stage.operational!, submittedDocument: undefined } }
  ] : [stage];
  return { projectId, projectName: "Aurora Villa", serverNow: now, initialPayment: { confirmedAt: now, canConfirm: false, version: 1, status: "received" }, floors: [], projectStages: stages };
}

const drawingBody = `<rect width="1200" height="800" fill="#f9f7f0"/><g fill="none" stroke="#273e47" stroke-width="8"><rect x="110" y="110" width="980" height="550"/><path d="M650 110V660M110 390H650M875 110V420H650"/><path d="M110 630H260M1090 150V310" stroke="#248c94" stroke-width="12"/></g><g fill="none" stroke="#667a80" stroke-width="3"><rect x="175" y="175" width="310" height="110" rx="12"/><rect x="240" y="305" width="180" height="50" rx="8"/><rect x="740" y="490" width="230" height="90"/><path d="M650 440a75 75 0 0 1 75 75M650 440v75h75"/><path d="M300 660a80 80 0 0 1 80-80M300 660v-80h80"/></g><g font-family="sans-serif" fill="#273e47"><text x="110" y="60" font-size="26" font-weight="700">AURORA VILLA · SYNTHETIC REVIEW PLAN</text><text x="290" y="160" font-size="21">LIVING ROOM</text><text x="290" y="520" font-size="21">ENTRANCE / DINING</text><text x="685" y="250" font-size="20">KITCHEN</text><text x="903" y="250" font-size="20">UTILITY</text><text x="735" y="620" font-size="20">BEDROOM</text><text x="110" y="720" font-size="18">Dimension reference: 12.0 m × 8.0 m · drawing fixture only</text><text x="110" y="760" font-size="16">Stable original page: 1200 × 800 px. All content is synthetic.</text></g><g stroke="#99aaa9" stroke-width="1.5" fill="none"><path d="M110 85H1090M110 73V98M1090 73V98M75 110V660M62 110H88M62 660H88"/></g>`;
export function syntheticDrawingResponse(crop = { x: 0, y: 0, width: 1200, height: 800 }) {
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="synthetic-plan-title" width="${crop.width}" height="${crop.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}"><title id="synthetic-plan-title">Aurora Villa synthetic review plan</title>${drawingBody}</svg>`, { headers: { "Content-Type": "image/svg+xml", "Content-Disposition": 'inline; filename="synthetic-plan.svg"' } });
}

/** Small valid vector PDF; no browser, filesystem or remote document dependency. */
export function syntheticDocumentResponse() {
  const stream = "0.96 0.97 0.98 rg 0 0 600 800 re f\n0.12 0.2 0.27 RG 4 w 60 210 480 400 re S\n300 210 m 300 610 l S\n60 400 m 300 400 l S\nBT /F1 22 Tf 60 720 Td (AURORA VILLA) Tj 0 -32 Td /F1 13 Tf (Synthetic approved plan and internal kickoff record) Tj 0 -32 Td (For interface geometry testing only) Tj ET\nBT /F1 16 Tf 110 500 Td (LIVING ROOM) Tj 235 0 Td (BEDROOM) Tj -235 -205 Td (KITCHEN) Tj ET\nBT /F1 11 Tf 60 130 Td (Approved synthetic version 3 - 11 September 2026) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Aurora synthetic plan.pdf"' } });
}
