import { executionChoiceOption, type ExecutionChoiceOptionId, type ExecutionChoiceRecord, type ExecutionChoiceSelection } from "./project-execution-choice.js";

/** File classification is independent of ordinary/replacement upload purpose. */
export const DESIGN_LAYOUT_TYPES = ["layout_2d", "layout_3d"] as const;
export type DesignLayoutType = typeof DESIGN_LAYOUT_TYPES[number];
export const DESIGN_LAYOUT_LABELS: Readonly<Record<DesignLayoutType, string>> = Object.freeze({ layout_2d: "2D layout", layout_3d: "3D layout" });

export function isDesignLayoutType(value: unknown): value is DesignLayoutType {
  return value === "layout_2d" || value === "layout_3d";
}

export function requiredDesignLayoutTypes(optionId: ExecutionChoiceOptionId): DesignLayoutType[] {
  return executionChoiceOption(optionId).phases.map(phase => phase.id).filter(isDesignLayoutType);
}

/** Persisted once on the original upload; inherited by replacement lineage. */
export interface DesignLayoutClassification {
  classifiedAt: string;
  classifiedById: string;
  choiceHistoryEventId: string;
  choiceDefinitionVersion: 1;
}

export interface DesignLayoutCoverage {
  layoutType: DesignLayoutType;
  /** Current non-deleted uploads of this type, including extraction in progress. */
  uploadIds: string[];
  /** Distinct original uploads contributing qualifying current drawing content. */
  qualifyingUploadIds: string[];
  /** Ready describes layout content only; existing mapping/PDF/submission checks still apply. */
  state: "missing" | "processing" | "review_pending" | "ready";
}

export interface DesignLayoutRequirements {
  status: "not_applicable" | "waiting_for_choice" | "unavailable" | "selected";
  choice: ExecutionChoiceSelection | null;
  designPlanVersion: number;
  allowedTypes: DesignLayoutType[];
  requiredTypes: DesignLayoutType[];
  coverage: DesignLayoutCoverage[];
  unclassifiedUploadIds: string[];
  missingTypes: DesignLayoutType[];
  /** Coverage is not complete drawing/PDF readiness and never bypasses existing gates. */
  coverageComplete: boolean;
  blockingReasons: string[];
  /** Changes when current layout/lineage/choice evidence changes. */
  revisionKey: string;
}

export interface ClassifyDesignLayoutCommand {
  layoutType: DesignLayoutType;
  expectedDesignPlanVersion: number;
  idempotencyKey: string;
}

/** Internal immutable evidence on a newly submitted post-approval review round. */
export interface DesignLayoutReviewSnapshot {
  version: 1;
  choice: ExecutionChoiceRecord;
  requiredTypes: DesignLayoutType[];
  layouts: Array<{
    layoutType: DesignLayoutType;
    sourceUploadId: string;
    drawingIds: string[];
    revisionIds: string[];
    documentId: string;
    manifestHash: string;
  }>;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0) && new Set(value).size === value.length;
}
function layoutTypes(value: unknown): value is DesignLayoutType[] {
  return strings(value) && value.every(isDesignLayoutType);
}
function same(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Shared defensive validation; malformed applicable data must never enable an action. */
export function isDesignLayoutRequirements(value: unknown): value is DesignLayoutRequirements {
  if (!object(value) || !["not_applicable", "waiting_for_choice", "unavailable", "selected"].includes(String(value.status)) ||
    !Number.isSafeInteger(value.designPlanVersion) || Number(value.designPlanVersion) < 0 ||
    !layoutTypes(value.allowedTypes) || !layoutTypes(value.requiredTypes) || !layoutTypes(value.missingTypes) ||
    !strings(value.unclassifiedUploadIds) || !strings(value.blockingReasons) || typeof value.coverageComplete !== "boolean" ||
    typeof value.revisionKey !== "string" || !value.revisionKey || !Array.isArray(value.coverage)) return false;
  if (value.status !== "selected") {
    return value.choice === null && !value.allowedTypes.length && !value.requiredTypes.length && !value.coverage.length &&
      !value.missingTypes.length && (value.status === "not_applicable" || !value.coverageComplete);
  }
  const choice = value.choice;
  if (!object(choice) || (choice.optionId !== "option_1" && choice.optionId !== "option_2") || choice.definitionVersion !== 1 ||
    typeof choice.selectedAt !== "string" || !Number.isFinite(Date.parse(choice.selectedAt))) return false;
  const option = executionChoiceOption(choice.optionId);
  const expected = requiredDesignLayoutTypes(choice.optionId);
  if (choice.optionLabel !== option.label || !Array.isArray(choice.phases) || choice.phases.length !== option.phases.length ||
    !choice.phases.every((phase, index) => object(phase) && phase.id === option.phases[index]!.id && phase.label === option.phases[index]!.label) ||
    !same(value.allowedTypes, expected) || !same(value.requiredTypes, expected) || value.coverage.length !== expected.length) return false;
  const roots = new Set<string>();
  for (let index = 0; index < expected.length; index += 1) {
    const coverage = value.coverage[index];
    if (!object(coverage) || coverage.layoutType !== expected[index] || !strings(coverage.uploadIds) || !strings(coverage.qualifyingUploadIds) ||
      !coverage.qualifyingUploadIds.every(id => (coverage.uploadIds as string[]).includes(id)) ||
      !["missing", "processing", "review_pending", "ready"].includes(String(coverage.state))) return false;
    for (const id of coverage.uploadIds) {
      if (roots.has(id)) return false;
      roots.add(id);
    }
  }
  const missing = value.coverage.filter(item => !(item as DesignLayoutCoverage).qualifyingUploadIds.length).map(item => (item as DesignLayoutCoverage).layoutType);
  return same(value.missingTypes, missing) && (!value.coverageComplete || (!missing.length && !value.unclassifiedUploadIds.length && !value.blockingReasons.length));
}
