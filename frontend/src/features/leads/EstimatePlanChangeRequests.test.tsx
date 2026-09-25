import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../test/server";
import * as api from "./estimateDesignApi";
import { EstimatePlanChangeRequests } from "./EstimatePlanChangeRequests";

function replacementUpload(overrides: Partial<Awaited<ReturnType<typeof api.getEstimateDesignWorkspace>>["uploads"][number]> = {}) {
  return {
    id: "request-upload-1",
    estimateId: "estimate-1",
    leadId: "lead-1",
    originalFilename: "revised-full-plan.pdf",
    mimeType: "application/pdf" as const,
    sizeBytes: 2048,
    uploaderId: "designer-1",
    uploadedAt: "2026-09-21T10:00:00.000Z",
    extractionStatus: "queued" as const,
    failureCode: null,
    failureMessage: null,
    canRetry: false,
    canDelete: false,
    purpose: "plan_request_replacement" as const,
    requestReplacement: {
      requestId: "request-1",
      requestVersion: 2,
      sourcePageId: "page-1",
      targetCount: 1,
      matches: [{ drawingId: "drawing-a", requestedRevisionId: "revision-a", detectedTitle: "False Ceiling", resultRevisionId: null, matchReason: null, pageNumber: null }],
      ignoredPageNumbers: [],
      ignoredPageCount: 0
    },
    ...overrides
  };
}

beforeEach(() => {
  server.use(http.get("/api/v1/estimate-plan-pages/page-1/current-image", () => new HttpResponse(null, { status: 404 })));
  vi.spyOn(api, "getEstimatePlanChangeRequests").mockResolvedValue([{ id: "request-1", estimateId: "estimate-1", uploadId: "upload-1", sourcePageId: "page-1", clientId: "client-1", version: 2, summary: "Lower the ceiling", status: "open", unassigned: false, targetCount: 1, targets: [{ drawingId: "drawing-a", status: "open" }], createdAt: "2026-08-03T10:00:00.000Z" }]);
  vi.spyOn(api, "getEstimatePlanChangeRequest").mockResolvedValue({ id: "request-1", sourcePageId: "page-1", version: 2, summary: "Lower the ceiling", annotations: { schemaVersion: 1, imageWidth: 1000, imageHeight: 800, elements: [] }, targets: [{ drawingId: "drawing-a", requestedRevisionId: "revision-a", status: "open", resolvedByRevisionId: null }], unassigned: false, status: "open", resolutionNote: null, currentImageUrl: "/estimate-plan-pages/page-1/current-image", drawingTargets: [{ drawingId: "drawing-a", title: "False Ceiling", latestRevisionId: "revision-a", latestRevisionNumber: 3, status: "open" }], drawingCandidates: [] } as never);
  vi.spyOn(api, "getEstimateDesignWorkspace").mockResolvedValue({ uploads: [], pages: [], drawings: [], revisions: [] });
  vi.spyOn(api, "uploadEstimatePlanRequestReplacement").mockResolvedValue(replacementUpload());
  vi.spyOn(api, "retryEstimateDesignUpload").mockResolvedValue(replacementUpload());
  vi.spyOn(api, "replaceEstimateDrawing").mockResolvedValue({} as never);
});

describe("EstimatePlanChangeRequests", () => {
  it("preserves another drawing's open feedback when one target was withdrawn", async () => {
    server.use(http.get("/api/v1/estimate-plan-pages/page-1/current-image", () => new HttpResponse(null, { status: 404 })));
    const detail = await api.getEstimatePlanChangeRequest("request-1");
    vi.mocked(api.getEstimatePlanChangeRequest).mockResolvedValue({
      ...detail,
      drawingTargets: [
        { ...detail.drawingTargets[0]!, status: "withdrawn" },
        { drawingId: "drawing-b", title: "Lighting", latestRevisionId: "revision-b", latestRevisionNumber: 1, status: "open" }
      ]
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimatePlanChangeRequests estimateId="estimate-1" /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Lower the ceiling/ }));
    const withdrawn = await screen.findByRole("region", { name: "False Ceiling target" });
    expect(within(withdrawn).getByText("This drawing was deleted. Its feedback is retained for reference.")).toBeVisible();
    expect(within(withdrawn).queryByRole("button")).not.toBeInTheDocument();
    const openTarget = screen.getByRole("region", { name: "Lighting target" });
    await userEvent.click(within(openTarget).getByText("Replace only this drawing"));
    expect(within(openTarget).getByLabelText("Replacement for Lighting")).toBeVisible();
    expect(within(openTarget).getByRole("button", { name: "Upload only Lighting" })).toBeVisible();
  });

  it("shows a withdrawn request without replacement or mapping actions", async () => {
    const detail = await api.getEstimatePlanChangeRequest("request-1");
    vi.mocked(api.getEstimatePlanChangeRequest).mockResolvedValue({ ...detail, status: "withdrawn", unassigned: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimatePlanChangeRequests estimateId="estimate-1" /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Lower the ceiling/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("This change request was withdrawn because its design upload was deleted.");
    expect(screen.queryByLabelText("Replacement for False Ceiling")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link selected drawings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve page-only feedback" })).not.toBeInTheDocument();
    expect(screen.queryByAltText("Current full design page")).not.toBeInTheDocument();
  });

  it("uploads one revised file against the request version with a stable idempotency key", async () => {
    let finishUpload!: (upload: Awaited<ReturnType<typeof api.uploadEstimatePlanRequestReplacement>>) => void;
    vi.mocked(api.uploadEstimatePlanRequestReplacement).mockImplementation((_requestId, input) => {
      input.onProgress?.(64);
      return new Promise((resolve) => { finishUpload = resolve; });
    });
    server.use(
      http.get("/api/v1/estimate-plan-pages/page-1/current-image", () =>
        new HttpResponse(new Blob(["current design page"], { type: "image/png" }), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimatePlanChangeRequests estimateId="estimate-1" /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Lower the ceiling/ }));
    expect(await screen.findByText("False Ceiling")).toBeVisible();
    const file = new File(["replacement"], "revised-plan.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("Revised file for this request"), file);
    await userEvent.click(screen.getByRole("button", { name: "Upload requested page revisions" }));
    expect(api.uploadEstimatePlanRequestReplacement).toHaveBeenCalledWith("request-1", expect.objectContaining({
      version: 2,
      file,
      idempotencyKey: expect.any(String),
      onProgress: expect.any(Function)
    }));
    expect(screen.getByRole("progressbar", { name: "Uploading revised request file" })).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByRole("button", { name: "Upload requested page revisions" })).toHaveAttribute("aria-busy", "true");
    await act(async () => { finishUpload(replacementUpload()); });
    expect(await screen.findByText("OCR is matching the requested pages. Unrelated pages will not be added.")).toBeVisible();
  });

  it("keeps the per-drawing replacement behind an explicit fallback", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimatePlanChangeRequests estimateId="estimate-1" /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Lower the ceiling/ }));
    const target = await screen.findByRole("region", { name: "False Ceiling target" });
    expect(within(target).getByText("Replace only this drawing")).toBeVisible();
    expect(within(target).getByLabelText("Replacement for False Ceiling")).not.toBeVisible();

    await userEvent.click(within(target).getByText("Replace only this drawing"));
    const file = new File(["replacement"], "ceiling.png", { type: "image/png" });
    await userEvent.upload(within(target).getByLabelText("Replacement for False Ceiling"), file);
    await userEvent.click(within(target).getByRole("button", { name: "Upload only False Ceiling" }));
    expect(api.replaceEstimateDrawing).toHaveBeenCalledWith("drawing-a", 3, file);
  });

  it("reports matched targets and pages ignored from a full revised PDF", async () => {
    vi.mocked(api.getEstimateDesignWorkspace).mockResolvedValue({
      uploads: [replacementUpload({
        extractionStatus: "estimator_review",
        requestReplacement: {
          requestId: "request-1",
          requestVersion: 2,
          sourcePageId: "page-1",
          targetCount: 1,
          matches: [{ drawingId: "drawing-a", requestedRevisionId: "revision-a", detectedTitle: "FALSE CEILING PLAN", resultRevisionId: "revision-b", matchReason: "normalized_title", pageNumber: 2 }],
          ignoredPageNumbers: [1, 3],
          ignoredPageCount: 2
        }
      })],
      pages: [], drawings: [], revisions: []
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimatePlanChangeRequests estimateId="estimate-1" /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Lower the ceiling/ }));

    expect(await screen.findByText("1 of 1 requested drawing matched")).toBeVisible();
    expect(screen.getByText("FALSE CEILING PLAN")).toBeVisible();
    expect(screen.getByText("Matched by drawing title · PDF page 2")).toBeVisible();
    expect(screen.getByText(/Ignored 2 unrelated pages \(1, 3\).*No new design pages were added/)).toBeVisible();
  });

  it("shows a retry action when request-scoped extraction fails", async () => {
    const failed = replacementUpload({ extractionStatus: "processing_failed", canRetry: true, failureCode: "AMBIGUOUS_MATCH", failureMessage: "Two pages have the same requested title." });
    vi.mocked(api.getEstimateDesignWorkspace).mockResolvedValue({ uploads: [failed], pages: [], drawings: [], revisions: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimatePlanChangeRequests estimateId="estimate-1" /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Lower the ceiling/ }));

    expect(await screen.findByText("Two pages have the same requested title.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry requested-page extraction" }));
    expect(api.retryEstimateDesignUpload).toHaveBeenCalled();
    expect(vi.mocked(api.retryEstimateDesignUpload).mock.calls[0]?.[0]).toBe("request-upload-1");
  });

  it("derives the estimate workspace from the selected queue item when the composer omits estimateId", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EstimatePlanChangeRequests /></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: /Lower the ceiling/ }));

    await screen.findByRole("heading", { name: "Upload the revised file" });
    expect(api.getEstimateDesignWorkspace).toHaveBeenCalledWith("estimate-1");
  });
});
