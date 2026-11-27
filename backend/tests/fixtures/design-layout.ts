import { emptyDesignWorkflowState } from "../../src/domain/design-workflow-state.js";
import { executionChoiceOption, type ExecutionChoiceOptionId } from "../../src/contracts/project-execution-choice.js";
import type { DesignLayoutType } from "../../src/contracts/design-layout-requirements.js";
import type { PlanDocumentLineage } from "../../src/domain/estimate-plan-document.js";
import type { DesignLayoutChoiceContext } from "../../src/services/design-layout-requirements.service.js";

export const LAYOUT_AT = "2026-11-27T10:00:00.000Z";
export function layoutChoiceFixture(projectId = "layout-project", optionId: ExecutionChoiceOptionId = "option_1") {
  const option = executionChoiceOption(optionId);
  const record = { optionId, definitionVersion: 1 as const, phaseIds: option.phases.map(phase => phase.id), selectedAt: LAYOUT_AT,
    selectedById: `${projectId}-client`, historyEventId: `${projectId}-choice`, keyCollectionStageId: `${projectId}-keys` };
  const state = { ...emptyDesignWorkflowState(projectId), version: 1, executionChoice: record };
  state.history = [{ id: record.historyEventId, stageId: record.keyCollectionStageId, actorId: record.selectedById, actorRole: "client", onBehalfOfClient: false,
    at: LAYOUT_AT, action: "execution_path_select", proof: null, mediaFiles: [], note: "", data: { ...record, acknowledgedIrreversible: true } }];
  const context: DesignLayoutChoiceContext = { status: "selected", choice: { optionId, optionLabel: option.label, definitionVersion: 1, phases: option.phases, selectedAt: LAYOUT_AT }, record, reason: null };
  return { state, context, record };
}

export function layoutLineageFixture(types: Array<DesignLayoutType | null> = ["layout_2d", "layout_3d"]): PlanDocumentLineage {
  const { record } = layoutChoiceFixture();
  return { estimateId: "layout-estimate", uploads: types.map((type, index) => ({ _id: `layout-upload-${index}`, estimateId: "layout-estimate", leadId: "layout-lead", purpose: "ordinary", mimeType: "application/pdf",
    sizeBytes: 100 + index, originalFilename: `layout-${index}.pdf`, storedFileReference: `source-${index}`, uploadedAt: LAYOUT_AT, uploaderId: "sales", extractionStatus: "estimator_review",
    ...(type ? { layoutType: type, layoutClassification: { classifiedAt: LAYOUT_AT, classifiedById: "designer", choiceHistoryEventId: record.historyEventId, choiceDefinitionVersion: 1 } } : {}) })),
    pages: types.map((_, index) => ({ _id: `layout-page-${index}`, uploadId: `layout-upload-${index}`, pageNumber: 1, width: 100, height: 80, normalizedFileReference: `page-${index}` })),
    drawings: types.map((_, index) => ({ _id: `layout-drawing-${index}`, estimateId: "layout-estimate", uploadId: `layout-upload-${index}`, sourcePageId: `layout-page-${index}`, active: true, verified: true, detectedTitle: "Room", displayTitle: "Room", source: "ocr", mappingStatus: "estimator_assigned", roomId: "room", scopeSectionId: "FC", catalogueId: "FC.MAIN" })),
    revisions: types.map((_, index) => ({ _id: `layout-revision-${index}`, drawingId: `layout-drawing-${index}`, revisionNumber: 1, sourcePageId: `layout-page-${index}`, crop: { x: 0, y: 0, width: 100, height: 80 }, croppedFileReference: `crop-${index}`, reviewStatus: "draft", label: "Room", mappingStatus: "estimator_assigned", roomId: "room", scopeSectionId: "FC", catalogueId: "FC.MAIN" })) };
}
