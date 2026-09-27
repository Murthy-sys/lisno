import {
  annotationDocumentByteLength, annotationDocumentSchema, emptyAnnotationDocument,
  validateAnnotationDocument, type AnnotationDocumentV1, type AnnotationElementV1
} from "./document";

const base = { id: "mark", color: "#B42318", strokeWidth: 4 };
const point = { x: 0.123456789, y: 0.987654321 };

function withElements(elements: readonly AnnotationElementV1[]): AnnotationDocumentV1 {
  return { schemaVersion: 1, imageWidth: 2000, imageHeight: 1000, elements };
}

describe("annotation document V1", () => {
  it("creates a page-sized empty document and keeps dimensions exact", () => {
    expect(emptyAnnotationDocument(2000, 1000)).toEqual(withElements([]));
    expect(validateAnnotationDocument(withElements([]), 2000, 999)).toEqual({
      valid: false, message: "Annotations do not match this image's dimensions."
    });
  });

  it("counts UTF-8 bytes like the backend for multibyte text", () => {
    const document = withElements([{ ...base, type: "text", x: 0.5, y: 0.5, text: "Fix 🧱" }]);
    expect(annotationDocumentByteLength(document)).toBe(Buffer.byteLength(JSON.stringify(document), "utf8"));
    expect(validateAnnotationDocument(document).valid).toBe(true);
  });

  it("rejects shapes past the edge and non-visible text", () => {
    const overflow = withElements([{ ...base, type: "rectangle", x: 0.9, y: 0.2, width: 0.2, height: 0.1 }]);
    expect(annotationDocumentSchema.safeParse(overflow).success).toBe(false);
    const blank = withElements([{ ...base, type: "text", x: 0.5, y: 0.5, text: " \n " }]);
    expect(annotationDocumentSchema.safeParse(blank).success).toBe(false);
  });

  it("rejects more than 200 marks", () => {
    const elements = Array.from({ length: 201 }, (_, index) => ({
      ...base, id: `mark-${index}`, type: "text" as const, x: 0.5, y: 0.5, text: "Note"
    }));
    expect(annotationDocumentSchema.safeParse(withElements(elements)).success).toBe(false);
  });

  it("rejects more than 5,000 aggregate freehand points", () => {
    const elements: AnnotationElementV1[] = [
      { ...base, id: "a", type: "freehand", points: Array.from({ length: 2501 }, () => point) },
      { ...base, id: "b", type: "freehand", points: Array.from({ length: 2500 }, () => point) }
    ];
    const result = annotationDocumentSchema.safeParse(withElements(elements));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("5,000"))).toBe(true);
  });

  it("rejects JSON payloads larger than 256 KiB", () => {
    const points = Array.from({ length: 5000 }, (_, index) => ({
      x: (index % 999) / 999,
      y: ((index * 17) % 997) / 997
    }));
    const elements: AnnotationElementV1[] = [
      { ...base, id: "path", type: "freehand", points },
      ...Array.from({ length: 199 }, (_, index) => ({
        ...base, id: `note-${index}`, type: "text" as const, x: 0.5, y: 0.5, text: "a".repeat(500)
      }))
    ];
    const document = withElements(elements);
    expect(annotationDocumentByteLength(document)).toBeGreaterThan(256 * 1024);
    const result = annotationDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("256 KiB"))).toBe(true);
  });
});
