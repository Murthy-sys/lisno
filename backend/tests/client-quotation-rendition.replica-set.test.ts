import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "node:url";
import { sha256Hex, type EstimateClientReviewSnapshot } from "../src/domain/estimate-client-review.js";
import { createEstimateProposal } from "../src/domain/estimate-proposal.js";
import { ClientQuotationRenditionModel } from "../src/models/ClientQuotationRendition.js";
import { createClientQuotationProjectionService } from "../src/services/client-quotation-projection.service.js";
import { createClientQuotationRenditionService } from "../src/services/client-quotation-rendition.service.js";
import { createEstimatePdfService } from "../src/services/estimate-pdf.service.js";
import type { EstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const source: EstimateClientReviewSnapshot = {
  clientName: "Synthetic Client", projectName: "Synthetic project", location: "Test city", propertyType: "Apartment",
  lineItems: [
    { id: "visible", catalogueId: "FC01", roomName: "Living room", specification: "Visible fixture work", unit: "sqft", rate: 100, quantity: 10, included: true, amount: 1_000 },
    { id: "hidden", clientVisible: false, catalogueId: "FC01", roomName: "PRIVATE ROOM", specification: "PRIVATE HIDDEN MATERIAL", unit: "sqft", rate: 200, quantity: 10, included: true, amount: 2_000 }
  ], subtotal: 3_000, gst: 540, total: 3_540, subtotalPaise: 300_000, gstPaise: 54_000, totalPaise: 354_000
};
const round = { _id: "round-a", estimateId: "estimate-a", estimateVersion: 4, recipientEmail: "synthetic@example.test", estimateSnapshot: source };
let mongo: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { mongo = await startMongoReplicaSet(); await ClientQuotationRenditionModel.syncIndexes(); }, 60_000);
beforeEach(async () => { await mongo.clear(); });
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await mongo?.stop(); });

function harness() {
  const files = new Map<string, Buffer>();
  const storage: EstimateClientReviewStorage = {
    savePdfSnapshot: vi.fn(async input => {
      const reference = `rendition-${files.size + 1}`; files.set(reference, input.bytes);
      return { storageReference: reference, filename: input.filename, mimeType: "application/pdf", byteSize: input.bytes.byteLength, sha256: sha256Hex(input.bytes) };
    }),
    read: vi.fn(async reference => { const bytes = files.get(reference); if (!bytes) throw new Error("Missing object"); return bytes; }),
    deleteQuietly: vi.fn(async reference => { files.delete(reference); }),
    saveProof: vi.fn()
  };
  const projection = createClientQuotationProjectionService();
  const pdf = { generate: vi.fn(async input => ({ filename: "safe-quotation.pdf", bytes: Buffer.from(JSON.stringify(input)) })) };
  return { files, storage, pdf, projection, renditions: createClientQuotationRenditionService({ projection, pdf, storage }) };
}

describe("immutable client quotation renditions", () => {
  it("renders and caches frozen proposal terms without changing historical artifacts or applying current defaults", async () => {
    const h = harness();
    const legacy = await h.renditions.readForRound(round);
    const captured = createEstimateProposal({ issuedAt: new Date("2026-08-24T18:45:00Z"), projectNumber: "Lisno000063", estimateId: round.estimateId });
    const proposal = { ...captured, terms: { ...captured.terms, designWorkingDays: 34 } };
    const newRound = { ...round, _id: "round-b", estimateVersion: 5, estimateSnapshot: { ...source, proposal } };
    const original = structuredClone(newRound);
    const [first, second] = await Promise.all([h.renditions.readForRound(newRound), h.renditions.readForRound(newRound)]);
    expect(first.bytes.equals(second.bytes)).toBe(true);
    const rendered = JSON.parse(first.bytes.toString());
    expect(rendered.proposal).toEqual(proposal);
    expect(rendered.proposal.terms.designWorkingDays).toBe(34);
    expect(rendered.proposal.issuedAt).toBe("2026-08-24T18:45:00.000Z");
    expect(rendered.totalPaise).toBe(354_000);
    expect(first.bytes.toString()).not.toContain("PRIVATE");
    expect(JSON.parse(legacy.bytes.toString())).not.toHaveProperty("proposal");
    expect((await h.renditions.readForRound(round)).bytes).toEqual(legacy.bytes);
    expect(await ClientQuotationRenditionModel.countDocuments()).toBe(2);
    expect(h.files.size).toBe(2);
    expect(newRound).toEqual(original);
  });

  it("rejects malformed proposal metadata before generating or persisting a rendition", async () => {
    const h = harness();
    await expect(h.renditions.readForRound({ ...round, estimateSnapshot: { ...source, proposal: { templateVersion: "unknown" } as never } }))
      .rejects.toMatchObject({ code: "QUOTATION_SOURCE_UNAVAILABLE" });
    expect(h.pdf.generate).not.toHaveBeenCalled();
    expect(h.storage.savePdfSnapshot).not.toHaveBeenCalled();
    expect(await ClientQuotationRenditionModel.countDocuments()).toBe(0);
  });

  it("stores a separately identified safe artifact, caches it, and preserves the original snapshot and total", async () => {
    const h = harness(); const original = structuredClone(round);
    const first = await h.renditions.readForRound(round);
    const second = await h.renditions.readForRound(round);
    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(h.pdf.generate).toHaveBeenCalledTimes(1);
    expect(first.bytes.toString()).not.toContain("PRIVATE");
    expect(first.bytes.toString()).toContain('"totalPaise":354000');
    const saved = await ClientQuotationRenditionModel.findOne().select("+storageReference").lean();
    expect(saved).toMatchObject({ reviewRoundId: round._id, estimateVersion: 4, approvedTotalPaise: 354_000,
      sourceDigest: sha256Hex(JSON.stringify(source)) });
    expect(round).toEqual(original);
  });
  it("deduplicates concurrent generation and removes only losing blobs", async () => {
    const h = harness();
    const results = await Promise.all([h.renditions.readForRound(round), h.renditions.readForRound(round), h.renditions.readForRound(round)]);
    expect(await ClientQuotationRenditionModel.countDocuments()).toBe(1);
    expect(h.files.size).toBe(1);
    expect(results.every(row => row.bytes.equals(results[0].bytes))).toBe(true);
    expect(h.storage.deleteQuietly).toHaveBeenCalledTimes(h.pdf.generate.mock.calls.length - 1);
  });
  it("cleans the blob when metadata persistence fails", async () => {
    const h = harness(); vi.spyOn(ClientQuotationRenditionModel, "create").mockRejectedValueOnce(new Error("Persistence failed"));
    await expect(h.renditions.readForRound(round)).rejects.toThrow("Persistence failed");
    expect(h.files.size).toBe(0);
    expect(h.storage.deleteQuietly).toHaveBeenCalledOnce();
    expect(await ClientQuotationRenditionModel.countDocuments()).toBe(0);
  });
  it.each(["missing", "corrupt"])("fails closed for %s stored data without regenerating or returning an original", async condition => {
    const h = harness(); await h.renditions.readForRound(round);
    const saved = await ClientQuotationRenditionModel.findOne().select("+storageReference").lean();
    if (condition === "missing") h.files.delete(saved!.storageReference);
    else h.files.set(saved!.storageReference, Buffer.from("corrupt"));
    await expect(h.renditions.readForRound(round)).rejects.toMatchObject({ code: "QUOTATION_RENDITION_UNAVAILABLE" });
    expect(h.pdf.generate).toHaveBeenCalledTimes(1);
  });
  it("refuses a rendition when visibility changes while its bytes are being produced", async () => {
    const h = harness(); const realProject = h.projection.project.bind(h.projection); let calls = 0;
    vi.spyOn(h.projection, "project").mockImplementation(async value => {
      const projected = await realProject(value);
      return { ...projected, visibilityDigest: sha256Hex(`visibility-${calls++}`) };
    });
    await expect(h.renditions.readForRound(round)).rejects.toMatchObject({ code: "QUOTATION_VISIBILITY_CHANGED" });
  });
  it("does not reuse metadata with a mismatched approved source digest", async () => {
    const h = harness();
    await h.renditions.readForRound(round);
    await ClientQuotationRenditionModel.collection.updateOne({ reviewRoundId: round._id }, { $set: { sourceDigest: sha256Hex("wrong source") } });
    await expect(h.renditions.readForRound(round)).rejects.toMatchObject({ code: "QUOTATION_RENDITION_UNAVAILABLE" });
    expect(h.pdf.generate).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("renders a real client PDF (proposal=%s) with hidden text absent and the complete approved total", async (hasProposal) => {
    const h = harness(); const pdf = createEstimatePdfService({ now: () => new Date("2026-10-30T12:00:00Z") });
    const proposal = createEstimateProposal({ issuedAt: new Date("2026-08-24T10:00:00Z"), projectNumber: "Lisno000063", estimateId: round.estimateId });
    const documentRound = hasProposal ? { ...round, estimateSnapshot: { ...source, proposal } } : round;
    const rendered = await createClientQuotationRenditionService({ ...h, pdf }).readForRound(documentRound);
    const document = await getDocument({ data: new Uint8Array(rendered.bytes), useSystemFonts: true,
      standardFontDataUrl: fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)) }).promise;
    try {
      let text = "";
      for (let page = 1; page <= document.numPages; page += 1) {
        const content = await (await document.getPage(page)).getTextContent();
        text += content.items.map(item => "str" in item ? item.str : "").join(" ");
      }
      expect(text).toContain("Visible fixture work");
      expect(text).not.toContain("PRIVATE");
      expect(text).toContain("3,540");
      if (hasProposal) {
        expect(text).toContain("Lisno000063");
        expect(document.numPages).toBeGreaterThan(1);
      }
    } finally { await document.destroy(); }
  });
  it("renders an all-hidden quotation without fabricating a zero total", async () => {
    const h = harness();
    const hidden = { ...round, estimateSnapshot: { ...source, lineItems: source.lineItems.map(row => ({ ...row, clientVisible: false })) } };
    const document = await h.renditions.readForRound(hidden);
    const input = JSON.parse(document.bytes.toString());
    expect(input.lineItems).toEqual([]);
    expect(input.totalPaise).toBe(354_000);
  });
});
