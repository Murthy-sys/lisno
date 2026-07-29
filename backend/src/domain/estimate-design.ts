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

export const annotationDocumentSchema = z
  .object({
    version: z.literal(1),
    elements: z
      .array(
        z.discriminatedUnion("type", [
          z.object({
            id: z.string().min(1).max(128),
            type: z.literal("ellipse"),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            width: z.number().min(0).max(1),
            height: z.number().min(0).max(1),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            strokeWidth: z.number().min(1).max(24)
          }).strict(),
          z.object({
            id: z.string().min(1).max(128),
            type: z.literal("rectangle"),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            width: z.number().min(0).max(1),
            height: z.number().min(0).max(1),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            strokeWidth: z.number().min(1).max(24)
          }).strict(),
          z.object({
            id: z.string().min(1).max(128),
            type: z.literal("arrow"),
            x1: z.number().min(0).max(1),
            y1: z.number().min(0).max(1),
            x2: z.number().min(0).max(1),
            y2: z.number().min(0).max(1),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            strokeWidth: z.number().min(1).max(24)
          }).strict(),
          z.object({
            id: z.string().min(1).max(128),
            type: z.literal("freehand"),
            points: z.array(z.object({
              x: z.number().min(0).max(1),
              y: z.number().min(0).max(1)
            }).strict()).min(1).max(5_000),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            strokeWidth: z.number().min(1).max(24)
          }).strict(),
          z.object({
            id: z.string().min(1).max(128),
            type: z.literal("text"),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            text: z.string().trim().min(1).max(500),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            strokeWidth: z.number().min(1).max(24)
          }).strict()
        ])
      )
      .max(200)
  })
  .strict()
  .superRefine((value, context) => {
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
