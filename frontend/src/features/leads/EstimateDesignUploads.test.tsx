import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { EstimateDesignUploads } from "./EstimateDesignUploads";

const rooms = [
  { id: "room-living", label: "Living Room" },
  { id: "room-bedroom", label: "Bedroom" }
];
const scopes = [
  { id: "FC", label: "False Ceiling" },
  { id: "EL", label: "Electrical" }
];
const page = { id: "page-1", uploadId: "upload-1", pageNumber: 1, width: 800, height: 600 };
const revisions = [
  {
    id: "revision-1", drawingId: "drawing-living", revisionNumber: 1,
    sourcePageId: "page-1", crop: { x: 0, y: 0, width: 400, height: 300 },
    roomId: "room-living", scopeSectionId: "FC", label: "Living ceiling", reviewStatus: "draft",
    submittedAt: null, reviewerId: null, reviewedAt: null, changeSummary: null,
    annotationLayerId: null, annotations: null, replacementUploadId: null, replacesRevisionId: null
  },
  {
    id: "revision-2", drawingId: "drawing-duplicate", revisionNumber: 1,
    sourcePageId: "page-1", crop: { x: 400, y: 0, width: 400, height: 300 },
    roomId: "room-living", scopeSectionId: "FC", label: "Living detail", reviewStatus: "draft",
    submittedAt: null, reviewerId: null, reviewedAt: null, changeSummary: null,
    annotationLayerId: null, annotations: null, replacementUploadId: null, replacesRevisionId: null
  },
  {
    id: "revision-3", drawingId: "drawing-ambiguous", revisionNumber: 1,
    sourcePageId: "page-1", crop: { x: 0, y: 300, width: 400, height: 300 },
    roomId: "", scopeSectionId: "EL", label: "Bedroom electrical", reviewStatus: "draft",
    submittedAt: null, reviewerId: null, reviewedAt: null, changeSummary: null,
    annotationLayerId: null, annotations: null, replacementUploadId: null, replacesRevisionId: null
  }
];
const drawings = [
  {
    id: "drawing-living", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1",
    active: true, verified: true, roomId: "room-living", scopeSectionId: "FC",
    detectedTitle: "Living ceiling", displayTitle: "Living ceiling", source: "ocr",
    roomConfidence: 0.98, scopeConfidence: 0.98, ocrConfidence: 0.98,
    roomEvidence: [{ value: "living" }], scopeEvidence: [{ value: "ceiling" }]
  },
  {
    id: "drawing-duplicate", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1",
    active: true, verified: true, roomId: "room-living", scopeSectionId: "FC",
    detectedTitle: "Living detail", displayTitle: "Living detail", source: "ocr",
    roomConfidence: 0.97, scopeConfidence: 0.94, ocrConfidence: 0.96,
    roomEvidence: [{ value: "living" }], scopeEvidence: [{ value: "ceiling" }]
  },
  {
    id: "drawing-ambiguous", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1",
    active: true, verified: true, roomId: "room-retired", scopeSectionId: "EL",
    detectedTitle: "Bedroom electrical", displayTitle: "Bedroom electrical", source: "ocr",
    roomConfidence: 0.4, scopeConfidence: 0.96, ocrConfidence: 0.89,
    roomEvidence: [], scopeEvidence: [{ value: "electrical" }]
  }
];
const response = (data: unknown, status = 200) => Response.json({ data }, { status });

afterEach(() => vi.useRealTimers());

describe("EstimateDesignUploads", () => {
  it("keeps duplicate drawings in their stable room and scope group and leaves ambiguous drawings visible for placement", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/estimates/estimate-1/design-uploads")) {
        return response({
          uploads: [{ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "estimator_review", failureCode: null, failureMessage: null }],
          pages: [page], drawings, revisions
        });
      }
      if (url.includes("/estimate-design-revisions/")) return new Response(new Blob(["image"], { type: "image/png" }));
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);

    const placement = await screen.findByRole("region", { name: "Needs placement" });
    expect(within(placement).getByText("Bedroom electrical")).toBeVisible();
    const scope = screen.getByRole("region", { name: "Living Room, False Ceiling drawings" });
    expect(within(scope).getByText("Living ceiling")).toBeVisible();
    expect(within(scope).getByText("Living detail")).toBeVisible();
    expect(within(scope).getAllByRole("button", { name: /Preview/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Submit drawings to client" })).toBeDisabled();
    expect(within(scope).getByRole("img", { name: "Living ceiling thumbnail" })).toHaveClass("estimate-drawing-row__thumbnail");

    const livingMenu = within(scope).getByRole("button", { name: "More actions for Living ceiling" });
    livingMenu.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu", { name: "Living ceiling actions" })).toBeVisible();
    expect(within(scope).getByRole("button", { name: "More actions for Living detail" })).toHaveAttribute("aria-expanded", "false");

    const ambiguousMenu = within(placement).getByRole("button", { name: "More actions for Bedroom electrical" });
    await user.click(ambiguousMenu);
    await user.click(screen.getByRole("menuitem", { name: "Correct mapping or crop" }));
    await user.selectOptions(screen.getByLabelText("Room"), "room-bedroom");
    await user.clear(screen.getByLabelText("Crop x"));
    await user.type(screen.getByLabelText("Crop x"), "800");
    await user.click(screen.getByRole("button", { name: "Save drawing" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Crop boundaries must remain inside the source page.");
  });

  it("uploads through multipart, polls while queued or processing, and stops once review is ready", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const states = ["queued", "processing", "estimator_review"] as const;
    let getCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/estimates/estimate-1/design-uploads") && init?.method === "POST") {
        return response({ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "queued", failureCode: null, failureMessage: null }, 201);
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) {
        const status = states[Math.min(getCount++, states.length - 1)]!;
        return response({ uploads: [{ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: status, failureCode: null, failureMessage: null }], pages: [], drawings: [], revisions: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    const file = new File(["%PDF-1.7"], "plan.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Design plan file"), file);
    await user.click(screen.getByRole("button", { name: "Upload design plan" }));

    expect(await screen.findByText("Ready for estimator review", {}, { timeout: 8_000 })).toBeVisible();
    const post = requests.find((request) => request.init?.method === "POST")!;
    expect(post.init?.body).toBeInstanceOf(FormData);
    expect(new Headers(post.init?.headers).has("Content-Type")).toBe(false);
    const terminalRequests = getCount;
    await new Promise((resolve) => window.setTimeout(resolve, 1_200));
    expect(getCount).toBe(terminalRequests);
  }, 10_000);
});
