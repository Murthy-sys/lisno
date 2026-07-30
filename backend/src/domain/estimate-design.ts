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
