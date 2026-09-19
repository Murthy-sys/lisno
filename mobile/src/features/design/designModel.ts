export interface CropInput {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function parseCropInput(values: {
  readonly x: string;
  readonly y: string;
  readonly width: string;
  readonly height: string;
}): CropInput | null {
  const crop = {
    x: Number(values.x),
    y: Number(values.y),
    width: Number(values.width),
    height: Number(values.height)
  };
  return Number.isInteger(crop.x) && crop.x >= 0 &&
    Number.isInteger(crop.y) && crop.y >= 0 &&
    Number.isInteger(crop.width) && crop.width > 0 &&
    Number.isInteger(crop.height) && crop.height > 0
    ? crop
    : null;
}

export function extractionLabel(status: unknown): string {
  if (typeof status !== "string") return "Extraction not started";
  const labels: Readonly<Record<string, string>> = {
    queued: "Queued for extraction",
    processing: "Extraction in progress",
    designer_review: "Ready for Designer review",
    submitted: "Submitted to the Client",
    changes_requested: "Changes requested",
    approved: "Approved",
    processing_failed: "Extraction failed"
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function isEditableExtraction(status: unknown): boolean {
  return status === "designer_review" || status === "processing_failed" || status === "changes_requested";
}
