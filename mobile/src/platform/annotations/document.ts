import { z } from "zod";

/** The persisted annotation contract shared by estimate plan pages and drawing revisions. */
export interface AnnotationPointV1 {
  readonly x: number;
  readonly y: number;
}

interface AnnotationBaseV1 {
  readonly id: string;
  readonly color: string;
  readonly strokeWidth: number;
}

export type AnnotationElementV1 =
  | (AnnotationBaseV1 & { readonly type: "rectangle"; readonly x: number; readonly y: number; readonly width: number; readonly height: number })
  | (AnnotationBaseV1 & { readonly type: "ellipse"; readonly x: number; readonly y: number; readonly width: number; readonly height: number })
  | (AnnotationBaseV1 & { readonly type: "arrow"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number })
  | (AnnotationBaseV1 & { readonly type: "freehand"; readonly points: readonly AnnotationPointV1[] })
  | (AnnotationBaseV1 & { readonly type: "text"; readonly x: number; readonly y: number; readonly text: string });

export interface AnnotationDocumentV1 {
  readonly schemaVersion: 1;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly elements: readonly AnnotationElementV1[];
}

const normalized = z.number().finite().min(0).max(1);
const base = {
  id: z.string().min(1).max(128),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  strokeWidth: z.number().finite().min(1).max(24)
};
const shape = (type: "rectangle" | "ellipse") => z.object({
  ...base, type: z.literal(type), x: normalized, y: normalized,
  width: normalized.gt(0), height: normalized.gt(0)
}).strict();

export const annotationElementSchema = z.discriminatedUnion("type", [
  shape("rectangle"), shape("ellipse"),
  z.object({ ...base, type: z.literal("arrow"), x1: normalized, y1: normalized, x2: normalized, y2: normalized }).strict(),
  z.object({ ...base, type: z.literal("freehand"), points: z.array(z.object({ x: normalized, y: normalized }).strict()).min(2).max(5_000) }).strict(),
  z.object({
    ...base, type: z.literal("text"), x: normalized, y: normalized,
    text: z.string().min(1).max(500).refine((text) => text.trim().length > 0)
  }).strict()
]);

export const MAX_ANNOTATION_ELEMENTS = 200;
export const MAX_ANNOTATION_POINTS = 5_000;
export const MAX_ANNOTATION_DOCUMENT_BYTES = 256 * 1024;

/** Counts the UTF-8 bytes that the backend's Buffer.byteLength will count. */
export function annotationDocumentByteLength(document: AnnotationDocumentV1): number {
  let bytes = 0;
  for (const character of JSON.stringify(document)) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export const annotationDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  imageWidth: z.number().int().positive().max(100_000),
  imageHeight: z.number().int().positive().max(100_000),
  elements: z.array(annotationElementSchema).max(MAX_ANNOTATION_ELEMENTS)
}).strict().superRefine((document, context) => {
  let pointCount = 0;
  document.elements.forEach((element, index) => {
    if (element.type === "freehand") pointCount += element.points.length;
    if (element.type === "rectangle" || element.type === "ellipse") {
      if (element.x + element.width > 1) context.addIssue({
        code: "custom", path: ["elements", index, "width"], message: "The annotation must remain within the image."
      });
      if (element.y + element.height > 1) context.addIssue({
        code: "custom", path: ["elements", index, "height"], message: "The annotation must remain within the image."
      });
    }
  });
  if (pointCount > MAX_ANNOTATION_POINTS) context.addIssue({
    code: "custom", path: ["elements"], message: "Use at most 5,000 freehand points."
  });
  if (annotationDocumentByteLength(document) > MAX_ANNOTATION_DOCUMENT_BYTES) context.addIssue({
    code: "custom", message: "Annotation payload must not exceed 256 KiB."
  });
});

export function emptyAnnotationDocument(imageWidth: number, imageHeight: number): AnnotationDocumentV1 {
  const document: AnnotationDocumentV1 = { schemaVersion: 1, imageWidth, imageHeight, elements: [] };
  return annotationDocumentSchema.parse(document);
}

export function validateAnnotationDocument(
  document: AnnotationDocumentV1,
  imageWidth?: number,
  imageHeight?: number
): { readonly valid: true } | { readonly valid: false; readonly message: string } {
  const result = annotationDocumentSchema.safeParse(document);
  if (!result.success) return { valid: false, message: result.error.issues[0]?.message ?? "Invalid annotation document." };
  if ((imageWidth !== undefined && document.imageWidth !== imageWidth) ||
      (imageHeight !== undefined && document.imageHeight !== imageHeight)) {
    return { valid: false, message: "Annotations do not match this image's dimensions." };
  }
  return { valid: true };
}
