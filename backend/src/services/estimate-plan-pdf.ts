import {
  PDFDocument, type PDFPage, concatTransformationMatrix, popGraphicsState,
  pushGraphicsState, rgb
} from "pdf-lib";
import sharp from "sharp";
import type { PlanDocumentManifest, PlanDocumentRect, PlanDocumentSource } from "../contracts/estimate-plan-document.js";
import { validatePlanDocumentPage } from "../domain/estimate-plan-document.js";
import { ApiError } from "../middleware/errors.js";
import type { Storage } from "../storage/storage.js";

type Matrix = [number, number, number, number, number, number];
const maxAssetBytes = 100 * 1024 * 1024;
const maxTotalBytes = 256 * 1024 * 1024;
const maxPixels = 40_000_000;

function invalid(message: string): never {
  throw new ApiError(409, "PLAN_DOCUMENT_GEOMETRY_INVALID", message);
}

function dimensions(page: PDFPage, width: number, height: number) {
  const crop = page.getCropBox();
  const media = page.getMediaBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation) ||
      ![crop.x, crop.y, crop.width, crop.height, width, height].every(Number.isFinite) ||
      crop.width <= 0 || crop.height <= 0 || width <= 0 || height <= 0 || width * height > maxPixels ||
      crop.x < media.x || crop.y < media.y || crop.x + crop.width > media.x + media.width || crop.y + crop.height > media.y + media.height) {
    invalid("The PDF page has unsupported bounds or orientation. Re-export the plan with valid page boxes.");
  }
  const displayWidth = rotation % 180 === 0 ? crop.width : crop.height;
  const displayHeight = rotation % 180 === 0 ? crop.height : crop.width;
  const tolerance = Math.min(0.03, Math.max(0.01, 2 / Math.min(width, height)));
  if (Math.abs((width / height) / (displayWidth / displayHeight) - 1) > tolerance) {
    invalid("The PDF page dimensions do not match its extracted preview. Re-upload the plan before preparing it.");
  }
  return { crop, rotation, scaleX: displayWidth / width, scaleY: displayHeight / height };
}

/** Local upright bottom-left coordinates -> the original PDF page user space. */
function placementMatrix(crop: PlanDocumentRect, rotation: number, rect: PlanDocumentRect): Matrix {
  const { x, y, width, height } = rect;
  if (rotation === 0) return [1, 0, 0, 1, crop.x + x, crop.y + crop.height - y - height];
  if (rotation === 90) return [0, 1, -1, 0, crop.x + y + height, crop.y + x];
  if (rotation === 180) return [-1, 0, 0, -1, crop.x + crop.width - x, crop.y + y + height];
  return [0, -1, 1, 0, crop.x + crop.width - y - height, crop.y + crop.height - x];
}

function boundingBox(matrix: Matrix, width: number, height: number) {
  const [a, b, c, d, e, f] = matrix;
  const points = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => [a * x! + c * y! + e, b * x! + d * y! + f]);
  return { left: Math.min(...points.map((point) => point[0]!)), right: Math.max(...points.map((point) => point[0]!)), bottom: Math.min(...points.map((point) => point[1]!)), top: Math.max(...points.map((point) => point[1]!)) };
}

function push(page: PDFPage, matrix: Matrix) { page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix)); }
function pop(page: PDFPage) { page.pushOperators(popGraphicsState()); }

function requireFlattenedAnnotations(page: PDFPage) {
  if ((page.node.Annots()?.size() ?? 0) > 0) {
    throw new ApiError(409, "PLAN_DOCUMENT_PDF_ANNOTATIONS_UNSUPPORTED", "A source PDF contains editable annotations. Export it with annotations flattened and upload it again before replacing this region.");
  }
}

export async function renderPlanDocumentPdf(manifest: PlanDocumentManifest, storage: Pick<Storage, "read">): Promise<Buffer> {
  if (manifest.schemaVersion !== 1 || manifest.rendererVersion !== 1 || manifest.pages.length < 1 || manifest.pages.length > 50) {
    invalid("The plan document has no complete supported page manifest. Finish extracting or re-upload the original plan.");
  }
  const pageIds = new Set<string>();
  for (const [index, page] of manifest.pages.entries()) {
    if (page.pageNumber !== index + 1 || pageIds.has(page.sourcePageId)) invalid("The original plan page order is incomplete or ambiguous. Re-upload the original plan.");
    pageIds.add(page.sourcePageId);
    if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width * page.height > maxPixels) invalid("A plan preview exceeds the supported image dimensions.");
    validatePlanDocumentPage(page);
  }
  let totalBytes = 0;
  const byteCache = new Map<string, Buffer>();
  async function read(reference: string) {
    const cached = byteCache.get(reference);
    if (cached) return cached;
    let bytes: Buffer;
    try { bytes = await storage.read(reference); } catch {
      throw new ApiError(409, "PLAN_DOCUMENT_ASSET_MISSING", "A source drawing is unavailable. Re-upload the affected file and prepare the plan again.");
    }
    totalBytes += bytes.length;
    if (!bytes.length || bytes.length > maxAssetBytes || totalBytes > maxTotalBytes) {
      throw new ApiError(413, "PLAN_DOCUMENT_ASSET_TOO_LARGE", "The plan source files exceed the supported preparation size.");
    }
    byteCache.set(reference, bytes);
    return bytes;
  }
  const pdfCache = new Map<string, PDFDocument>();
  async function loadPdf(reference: string) {
    const cached = pdfCache.get(reference);
    if (cached) return cached;
    try {
      const document = await PDFDocument.load(await read(reference), { updateMetadata: false, throwOnInvalidObject: true });
      if (document.isEncrypted || document.getPageCount() < 1 || document.getPageCount() > 50) invalid("The source PDF is encrypted or exceeds the supported page count.");
      pdfCache.set(reference, document);
      return document;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(409, "PLAN_DOCUMENT_PDF_INVALID", "A source PDF could not be read. Re-export and upload a valid unencrypted PDF.");
    }
  }
  async function imageSource(source: Pick<PlanDocumentSource, "reference" | "width" | "height" | "crop">) {
    try {
      const bytes = await read(source.reference);
      const image = sharp(bytes, { limitInputPixels: maxPixels }).rotate();
      const metadata = await image.metadata();
      const rotated = metadata.orientation && metadata.orientation >= 5 && metadata.orientation <= 8;
      const width = rotated ? metadata.height : metadata.width;
      const height = rotated ? metadata.width : metadata.height;
      if (width !== source.width || height !== source.height || !Object.values(source.crop).every(Number.isInteger)) invalid("The image dimensions do not match the stored drawing crop. Re-upload the revised drawing.");
      return await image.extract({ left: source.crop.x, top: source.crop.y, width: source.crop.width, height: source.crop.height }).png().toBuffer();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(409, "PLAN_DOCUMENT_IMAGE_INVALID", "A drawing image could not be read. Re-upload the affected image.");
    }
  }

  let document: PDFDocument;
  if (manifest.originalMimeType === "application/pdf") {
    document = await loadPdf(manifest.originalFileReference);
    if (document.getPageCount() !== manifest.pages.length) invalid("The extracted pages do not match the original PDF page count. Re-upload the original plan.");
    for (const [index, page] of manifest.pages.entries()) dimensions(document.getPage(index), page.width, page.height);
    if (manifest.pages.every((page) => page.patches.every((patch) => !patch.contentChanged))) return Buffer.from(await read(manifest.originalFileReference));
  } else {
    document = await PDFDocument.create();
    document.setCreationDate(new Date(0));
    document.setModificationDate(new Date(0));
    for (const page of manifest.pages) {
      const image = await document.embedPng(await imageSource({ reference: page.basePageReference, width: page.width, height: page.height, crop: { x: 0, y: 0, width: page.width, height: page.height } }));
      // Image originals have no physical drawing scale; retain their pixel proportions.
      document.addPage([page.width, page.height]).drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    }
  }

  for (const [index, pageManifest] of manifest.pages.entries()) {
    const page = document.getPage(index);
    const destinationGeometry = dimensions(page, pageManifest.width, pageManifest.height);
    if (pageManifest.patches.some((patch) => patch.contentChanged)) requireFlattenedAnnotations(page);
    for (const patch of pageManifest.patches) {
      if (!patch.contentChanged) continue;
      const destination = { x: patch.destination.x * destinationGeometry.scaleX, y: patch.destination.y * destinationGeometry.scaleY, width: patch.destination.width * destinationGeometry.scaleX, height: patch.destination.height * destinationGeometry.scaleY };
      push(page, placementMatrix(destinationGeometry.crop, destinationGeometry.rotation, destination));
      // Opaque coverage removes obsolete linework even beneath transparent source pixels.
      page.drawRectangle({ x: 0, y: 0, width: destination.width, height: destination.height, color: rgb(1, 1, 1), borderWidth: 0 });
      const source = patch.source;
      if (source.kind === "image") {
        const embedded = await document.embedPng(await imageSource(source));
        const scale = Math.min(destination.width / embedded.width, destination.height / embedded.height);
        page.drawImage(embedded, { x: (destination.width - embedded.width * scale) / 2, y: (destination.height - embedded.height * scale) / 2, width: embedded.width * scale, height: embedded.height * scale });
      } else {
        const sourcePdf = await loadPdf(source.reference);
        if (!Number.isInteger(source.pageNumber) || source.pageNumber < 1 || source.pageNumber > sourcePdf.getPageCount()) invalid("The revised drawing references a missing PDF page. Re-upload that revision.");
        const sourcePage = sourcePdf.getPage(source.pageNumber - 1);
        requireFlattenedAnnotations(sourcePage);
        const geometry = dimensions(sourcePage, source.width, source.height);
        const sourceCrop = { x: source.crop.x * geometry.scaleX, y: source.crop.y * geometry.scaleY, width: source.crop.width * geometry.scaleX, height: source.crop.height * geometry.scaleY };
        const box = boundingBox(placementMatrix(geometry.crop, geometry.rotation, sourceCrop), sourceCrop.width, sourceCrop.height);
        const embedded = await document.embedPage(sourcePage, box);
        const scale = Math.min(destination.width / sourceCrop.width, destination.height / sourceCrop.height);
        push(page, [scale, 0, 0, scale, (destination.width - sourceCrop.width * scale) / 2, (destination.height - sourceCrop.height * scale) / 2]);
        const upright: Matrix = geometry.rotation === 0 ? [1, 0, 0, 1, 0, 0]
          : geometry.rotation === 90 ? [0, -1, 1, 0, 0, embedded.width]
            : geometry.rotation === 180 ? [-1, 0, 0, -1, embedded.width, embedded.height]
              : [0, 1, -1, 0, embedded.height, 0];
        push(page, upright);
        page.drawPage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
        pop(page); pop(page);
      }
      pop(page);
    }
  }
  const bytes = Buffer.from(await document.save({ useObjectStreams: true }));
  if (bytes.length > maxAssetBytes) throw new ApiError(413, "PLAN_DOCUMENT_ASSET_TOO_LARGE", "The updated PDF exceeds the supported document size.");
  return bytes;
}
