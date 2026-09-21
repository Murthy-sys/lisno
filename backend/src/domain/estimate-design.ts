import { z } from "zod";

export const estimateDesignExtractionStatuses = [
  "queued",
  "processing",
  "estimator_review",
  "processing_failed",
  "submitted",
  "changes_requested",
  "approved"
] as const;

export type EstimateDesignExtractionStatus =
  (typeof estimateDesignExtractionStatuses)[number];

export const estimateDesignUploadPurposes = [
  "ordinary",
  "drawing_replacement",
  "plan_request_replacement"
] as const;

export type EstimateDesignUploadPurpose =
  (typeof estimateDesignUploadPurposes)[number];

export type PlanRequestReplacementMappingSnapshot = {
  roomId: string | null;
  scopeSectionId: string | null;
  catalogueId: string | null;
};

export type PlanRequestReplacementTargetSnapshot = {
  drawingId: string;
  requestedRevisionId: string;
  detectedTitle: string;
  normalizedTitle: string;
  mapping: PlanRequestReplacementMappingSnapshot;
};

export type PlanRequestReplacementCandidate = {
  pageNumber: number;
  detectedTitle: string;
  normalizedTitle: string;
  mapping: PlanRequestReplacementMappingSnapshot;
};

export type PlanRequestReplacementMatch = {
  target: PlanRequestReplacementTargetSnapshot;
  candidate: PlanRequestReplacementCandidate;
  reason: "normalized_title" | "mapping_tuple";
};

export class PlanRequestReplacementMatchError extends Error {
  constructor(
    readonly code:
      | "PLAN_REPLACEMENT_TARGET_MISSING"
      | "PLAN_REPLACEMENT_MATCH_AMBIGUOUS",
    message: string
  ) {
    super(message);
    this.name = "PlanRequestReplacementMatchError";
  }
}

export function deriveEstimateDesignUploadPurpose(upload: {
  purpose?: unknown;
  replacementDrawingId?: unknown;
  replacesRevisionId?: unknown;
}): EstimateDesignUploadPurpose {
  if (estimateDesignUploadPurposes.includes(upload.purpose as EstimateDesignUploadPurpose)) {
    return upload.purpose as EstimateDesignUploadPurpose;
  }
  return upload.replacementDrawingId || upload.replacesRevisionId
    ? "drawing_replacement"
    : "ordinary";
}

export function normalizeEstimateDesignTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function matchPlanRequestReplacementPages(
  targets: readonly PlanRequestReplacementTargetSnapshot[],
  candidates: readonly PlanRequestReplacementCandidate[]
): { matches: PlanRequestReplacementMatch[]; ignoredPageNumbers: number[] } {
  const remainingTargets = new Map(targets.map((target) => [target.drawingId, target]));
  const remainingCandidates = new Map(candidates.map((candidate) => [candidate.pageNumber, candidate]));
  if (remainingTargets.size !== targets.length || remainingCandidates.size !== candidates.length) {
    throw new PlanRequestReplacementMatchError(
      "PLAN_REPLACEMENT_MATCH_AMBIGUOUS",
      "Replacement targets and OCR page numbers must be unique."
    );
  }
  const matches: PlanRequestReplacementMatch[] = [];

  const titleTargetCount = countBy(targets, (target) => target.normalizedTitle);
  const titleCandidateCount = countBy(candidates, (candidate) => candidate.normalizedTitle);
  for (const target of [...targets].sort((left, right) => left.drawingId.localeCompare(right.drawingId))) {
    if (!target.normalizedTitle || titleTargetCount.get(target.normalizedTitle) !== 1) continue;
    if (titleCandidateCount.get(target.normalizedTitle) !== 1) continue;
    const candidate = candidates.find((value) => value.normalizedTitle === target.normalizedTitle)!;
    if (!remainingCandidates.has(candidate.pageNumber)) continue;
    matches.push({ target, candidate, reason: "normalized_title" });
    remainingTargets.delete(target.drawingId);
    remainingCandidates.delete(candidate.pageNumber);
  }

  const completeTuple = (mapping: PlanRequestReplacementMappingSnapshot) =>
    Boolean(mapping.roomId && mapping.scopeSectionId && mapping.catalogueId);
  const tupleKey = (mapping: PlanRequestReplacementMappingSnapshot) =>
    `${mapping.roomId}\u0000${mapping.scopeSectionId}\u0000${mapping.catalogueId}`;
  const fallbackTargets = [...remainingTargets.values()].filter((target) => completeTuple(target.mapping));
  const fallbackCandidates = [...remainingCandidates.values()].filter((candidate) => completeTuple(candidate.mapping));
  const targetTupleCount = countBy(fallbackTargets, (target) => tupleKey(target.mapping));
  const candidateTupleCount = countBy(fallbackCandidates, (candidate) => tupleKey(candidate.mapping));
  for (const target of fallbackTargets.sort((left, right) => left.drawingId.localeCompare(right.drawingId))) {
    const key = tupleKey(target.mapping);
    if (targetTupleCount.get(key) !== 1 || candidateTupleCount.get(key) !== 1) continue;
    const candidate = fallbackCandidates.find((value) => tupleKey(value.mapping) === key)!;
    if (!remainingCandidates.has(candidate.pageNumber)) continue;
    matches.push({ target, candidate, reason: "mapping_tuple" });
    remainingTargets.delete(target.drawingId);
    remainingCandidates.delete(candidate.pageNumber);
  }

  if (remainingTargets.size > 0) {
    const remaining = [...remainingTargets.values()];
    const hasAmbiguity = remaining.some((target) =>
      (target.normalizedTitle && (titleTargetCount.get(target.normalizedTitle) ?? 0) > 1) ||
      (target.normalizedTitle && (titleCandidateCount.get(target.normalizedTitle) ?? 0) > 1) ||
      (completeTuple(target.mapping) && (
        (targetTupleCount.get(tupleKey(target.mapping)) ?? 0) > 1 ||
        (candidateTupleCount.get(tupleKey(target.mapping)) ?? 0) > 1
      ))
    );
    throw new PlanRequestReplacementMatchError(
      hasAmbiguity
        ? "PLAN_REPLACEMENT_MATCH_AMBIGUOUS"
        : "PLAN_REPLACEMENT_TARGET_MISSING",
      hasAmbiguity
        ? "The revised file contains duplicate or ambiguous requested pages."
        : "The revised file does not contain every requested page."
    );
  }

  return {
    matches: matches.sort((left, right) => left.target.drawingId.localeCompare(right.target.drawingId)),
    ignoredPageNumbers: [...remainingCandidates.keys()].sort((left, right) => left - right)
  };
}

function countBy<T>(values: readonly T[], key: (value: T) => string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const candidate = key(value);
    if (!candidate) continue;
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  return counts;
}

export const estimateDesignReviewStatuses = [
  "draft",
  "submitted",
  "approved",
  "changes_requested"
] as const;

const normalizedCoordinate = z.number().finite().min(0).max(1);
const annotationBase = {
  id: z.string().min(1).max(128),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  strokeWidth: z.number().finite().min(1).max(24)
};
const boundedShape = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...annotationBase, ...shape }).strict();

export const annotationElementSchema = z.discriminatedUnion("type", [
  boundedShape({
    type: z.literal("ellipse"),
    x: normalizedCoordinate,
    y: normalizedCoordinate,
    width: normalizedCoordinate.gt(0),
    height: normalizedCoordinate.gt(0)
  }),
  boundedShape({
    type: z.literal("rectangle"),
    x: normalizedCoordinate,
    y: normalizedCoordinate,
    width: normalizedCoordinate.gt(0),
    height: normalizedCoordinate.gt(0)
  }),
  z.object({
    ...annotationBase,
    type: z.literal("arrow"),
    x1: normalizedCoordinate,
    y1: normalizedCoordinate,
    x2: normalizedCoordinate,
    y2: normalizedCoordinate
  }).strict(),
  z.object({
    ...annotationBase,
    type: z.literal("freehand"),
    points: z.array(z.object({
      x: normalizedCoordinate,
      y: normalizedCoordinate
    }).strict()).min(2).max(5_000)
  }).strict(),
  z.object({
    ...annotationBase,
    type: z.literal("text"),
    x: normalizedCoordinate,
    y: normalizedCoordinate,
    text: z.string().min(1).max(500).refine((value) => value.trim().length > 0, {
      message: "Text notes must contain visible text."
    })
  }).strict()
]);

export const annotationDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    imageWidth: z.number().int().positive().max(100_000),
    imageHeight: z.number().int().positive().max(100_000),
    elements: z.array(annotationElementSchema).max(200)
  })
  .strict()
  .superRefine((value, context) => {
    value.elements.forEach((element, index) => {
      if (
        (element.type === "ellipse" || element.type === "rectangle") &&
        element.x + element.width > 1
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["elements", index, "width"],
          message: "The annotation must remain within the image."
        });
      }
      if (
        (element.type === "ellipse" || element.type === "rectangle") &&
        element.y + element.height > 1
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["elements", index, "height"],
          message: "The annotation must remain within the image."
        });
      }
    });
    const pointCount = value.elements.reduce(
      (count, element) => count + (element.type === "freehand" ? element.points.length : 0),
      0
    );
    if (pointCount > 5_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["elements"], message: "Use at most 5,000 freehand points." });
    }
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 256 * 1024) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Annotation payload must not exceed 256 KiB." });
    }
  });

export type AnnotationDocumentV1 = z.infer<typeof annotationDocumentSchema>;

export function isEstimateDesignEditable(status: string) {
  return status === "draft" || status === "designer_changes_requested" || status === "client_changes_requested";
}
