import { screen, waitFor, within } from "@testing-library/react";
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

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  method = "";
  url = "";
  sentBody: XMLHttpRequestBodyInit | Document | null = null;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(): void {}
  send(body: XMLHttpRequestBodyInit | Document | null): void {
    this.sentBody = body;
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EstimateDesignUploads", () => {
  it("shows the selected design file and keeps its upload progress visible until the request settles", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/estimates/estimate-1/design-uploads")) {
        return response({ uploads: [], pages: [], drawings: [], revisions: [] });
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);

    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    const file = new File(["%PDF-1.7"], "kitchen-plan.pdf", { type: "application/pdf" });

    await user.upload(await screen.findByLabelText("Design plan file"), file);

    expect(screen.getByText("kitchen-plan.pdf")).toBeVisible();
    expect(screen.getByText("8 B")).toBeVisible();
    expect(screen.getByText("Choose file")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Upload design plan" }));
    const xhr = FakeXMLHttpRequest.instances[0]!;
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 4 } as ProgressEvent);

    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Uploading design plan" })).toHaveAttribute("aria-valuenow", "75"));

    xhr.status = 201;
    xhr.responseText = JSON.stringify({ data: { id: "upload-1" } });
    xhr.onload?.();

    await waitFor(() => expect(screen.queryByRole("progressbar", { name: "Uploading design plan" })).not.toBeInTheDocument());
  });

  it("identifies a retried extraction while preserving the extraction failure message", async () => {
    const failedUpload = { id: "upload-failed", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "failed.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "processing_failed", failureCode: "OCR_FAILED", failureMessage: "Could not read plan", canRetry: true };
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/estimate-design-uploads/upload-failed/retry")) return new Promise<Response>(() => {});
      if (url.endsWith("/estimates/estimate-1/design-uploads")) return Promise.resolve(response({ uploads: [failedUpload], pages: [], drawings: [], revisions: [] }));
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    await user.click(await screen.findByRole("button", { name: "Retry extraction" }));

    expect(screen.getByRole("button", { name: "Retrying extraction…" })).toBeDisabled();
    expect(screen.getByText("Could not read plan")).toBeVisible();
  });

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
      if (url.endsWith("/estimates/estimate-1/design-uploads")) {
        const status = states[Math.min(getCount++, states.length - 1)]!;
        return response({ uploads: [{ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: status, failureCode: null, failureMessage: null }], pages: [], drawings: [], revisions: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    const file = new File(["%PDF-1.7"], "plan.pdf", { type: "application/pdf" });
    await user.upload(await screen.findByLabelText("Design plan file"), file);
    await user.click(screen.getByRole("button", { name: "Upload design plan" }));
    const post = FakeXMLHttpRequest.instances[0]!;
    post.status = 201;
    post.responseText = JSON.stringify({ data: { id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "queued", failureCode: null, failureMessage: null } });
    post.onload?.();

    expect(await screen.findByText("Ready for estimator review", {}, { timeout: 8_000 })).toBeVisible();
    expect(post.method).toBe("POST");
    expect(post.sentBody).toBeInstanceOf(FormData);
    const terminalRequests = getCount;
    await new Promise((resolve) => window.setTimeout(resolve, 1_200));
    expect(getCount).toBe(terminalRequests);
  }, 10_000);

  it("retries a failed extraction through the retry endpoint and enters the queued polling state", async () => {
    const failedUpload = { id: "upload-failed", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "failed.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "processing_failed", failureCode: "OCR_FAILED", failureMessage: "Could not read plan", canRetry: true };
    let queued = false;
    let resolveRetry: (value: Response) => void;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/estimate-design-uploads/upload-failed/retry")) {
        return new Promise<Response>((resolve) => { resolveRetry = resolve; });
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) {
        return Promise.resolve(response({ uploads: [{ ...failedUpload, extractionStatus: queued ? "queued" : "processing_failed" }], pages: [], drawings: [], revisions: [] }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    await user.click(await screen.findByRole("button", { name: "Retry extraction" }));
    expect(screen.getByRole("button", { name: "Retrying extraction…" })).toBeDisabled();
    queued = true;
    resolveRetry!(response({ ...failedUpload, extractionStatus: "queued", failureCode: null, failureMessage: null }));

    expect(await screen.findByText("Queued")).toBeVisible();
    const retry = requests.find((request) => request.url.endsWith("/estimate-design-uploads/upload-failed/retry"))!;
    expect(retry.init?.method).toBe("POST");
    expect(retry.init?.body).toBeUndefined();
  });

  it("offers Retry only for failed uploads whose exact work can still be reserved", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/estimates/estimate-1/design-uploads")) {
        return response({
        uploads: [
          {
            id: "upload-retryable",
            estimateId: "estimate-1",
            leadId: "lead-1",
            originalFilename: "retryable.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12,
            uploaderId: "user-1",
            uploadedAt: "2026-07-30T00:00:00.000Z",
            extractionStatus: "processing_failed",
            failureCode: "OCR_FAILED",
            failureMessage: "OCR failed.",
            canRetry: true
          },
          {
            id: "upload-stale",
            estimateId: "estimate-1",
            leadId: "lead-1",
            originalFilename: "stale-replacement.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12,
            uploaderId: "user-1",
            uploadedAt: "2026-07-30T00:00:01.000Z",
            extractionStatus: "processing_failed",
            failureCode: "OCR_FAILED",
            failureMessage: "OCR failed.",
            canRetry: false
          }
        ],
        pages: [],
        drawings: [],
        revisions: []
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderWithQuery(<EstimateDesignUploads
      estimateId="estimate-1"
      rooms={[{ id: "room-living", label: "Living Room" }]}
      scopes={[{ id: "FC", label: "False Ceiling" }]}
    />);

    expect(await screen.findByText("retryable.pdf")).toBeVisible();
    expect(screen.getByText("stale-replacement.pdf")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Retry extraction" })).toHaveLength(1);
  });

  it("creates a missing drawing from a stable source page, mapping, and bounded crop", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (
        url.endsWith("/estimate-design-source-pages/page-1/image") &&
        init?.method !== "POST"
      ) {
        return new Response(new Blob(["image"], { type: "image/png" }));
      }
      if (
        url.endsWith("/estimate-design-source-pages/page-1/drawings") &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(String(init.body));
        return response({
          id: "drawing-manual",
          uploadId: "upload-1",
          sourcePageId: "page-1",
          estimateId: "estimate-1",
          active: true,
          verified: true,
          roomId: body.roomId,
          scopeSectionId: body.scopeSectionId,
          detectedTitle: body.displayTitle,
          displayTitle: body.displayTitle,
          source: "manual",
          roomConfidence: null,
          scopeConfidence: null,
          ocrConfidence: null,
          roomEvidence: [],
          scopeEvidence: [],
          revision: {
            ...revisions[0],
            id: "revision-manual",
            drawingId: "drawing-manual",
            crop: body.crop
          }
        }, 201);
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) {
        return response({
          uploads: [{
            id: "upload-1",
            estimateId: "estimate-1",
            leadId: "lead-1",
            originalFilename: "plan.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12,
            uploaderId: "user-1",
            uploadedAt: "2026-07-30T00:00:00.000Z",
            extractionStatus: "estimator_review",
            failureCode: null,
            failureMessage: null,
            canRetry: false
          }],
          pages: [page],
          drawings: [],
          revisions: []
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = userEvent.setup();
    renderWithQuery(
      <EstimateDesignUploads
        estimateId="estimate-1"
        rooms={rooms}
        scopes={scopes}
      />
    );

    await user.click(await screen.findByRole("button", {
      name: "Add missing drawing"
    }));
    const dialog = screen.getByRole("dialog", { name: "Add missing drawing" });
    await user.type(within(dialog).getByLabelText("Drawing title"), "Living wardrobe");
    await user.selectOptions(within(dialog).getByLabelText("Room"), "room-living");
    await user.selectOptions(within(dialog).getByLabelText("Scope section"), "FC");
    const save = within(dialog).getByRole("button", { name: "Add drawing" });

    await user.clear(within(dialog).getByLabelText("Crop width"));
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Crop width"), "300");
    await user.clear(within(dialog).getByLabelText("Crop height"));
    await user.type(within(dialog).getByLabelText("Crop height"), "200");
    await user.clear(within(dialog).getByLabelText("Crop x coordinate"));
    await user.type(within(dialog).getByLabelText("Crop x coordinate"), "10");
    await user.clear(within(dialog).getByLabelText("Crop y coordinate"));
    await user.type(within(dialog).getByLabelText("Crop y coordinate"), "15");
    await user.click(save);

    const post = await vi.waitFor(() => {
      const found = requests.find((entry) =>
        entry.url.endsWith("/estimate-design-source-pages/page-1/drawings") &&
        entry.init?.method === "POST"
      );
      expect(found).toBeDefined();
      return found!;
    });
    expect(JSON.parse(String(post.init?.body))).toEqual({
      displayTitle: "Living wardrobe",
      roomId: "room-living",
      scopeSectionId: "FC",
      crop: { x: 10, y: 15, width: 300, height: 200 }
    });
  });

  it("verifies a drawing, sends its complete mapping, and submits the refreshed workspace", async () => {
    const unverified = { ...drawings[0], id: "drawing-review", displayTitle: "Living review", verified: false };
    const reviewRevision = { ...revisions[0], id: "revision-review", drawingId: unverified.id, label: unverified.displayTitle };
    let verified = false;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/estimate-design-revisions/revision-review/image")) return new Response(new Blob(["image"], { type: "image/png" }));
      if (url.endsWith("/estimate-design-drawings/drawing-review") && init?.method === "PATCH") {
        verified = true;
        return response({ ...unverified, verified: true, revision: { ...reviewRevision, revisionNumber: 2 } });
      }
      if (url.endsWith("/estimates/estimate-1/design-drawings/submit")) {
        return response({ submittedCount: 1 });
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) {
        return response({
          uploads: [{ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "estimator_review", failureCode: null, failureMessage: null }],
          pages: [page], drawings: [{ ...unverified, verified }], revisions: [{ ...reviewRevision, revisionNumber: verified ? 2 : 1 }]
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    await user.click(await screen.findByRole("button", { name: "More actions for Living review" }));
    await user.click(screen.getByRole("menuitem", { name: "Verify drawing" }));
    expect(screen.getByRole("checkbox", { name: "Mark mapping verified" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Verify drawing" }));

    const patch = await vi.waitFor(() => {
      const request = requests.find((entry) => entry.init?.method === "PATCH");
      expect(request).toBeDefined();
      return request!;
    });
    expect(patch.url).toContain("/estimate-design-drawings/drawing-review");
    expect(JSON.parse(String(patch.init?.body))).toEqual({
      version: 1, displayTitle: "Living review", roomId: "room-living", scopeSectionId: "FC",
      crop: { x: 0, y: 0, width: 400, height: 300 }, verified: true
    });
    expect(await screen.findByText("All drawings are verified.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Submit drawings to client" }));
    const submit = await vi.waitFor(() => {
      const request = requests.find((entry) => entry.url.endsWith("/estimates/estimate-1/design-drawings/submit"));
      expect(request).toBeDefined();
      return request!;
    });
    expect(submit.init?.method).toBe("POST");
    expect(submit.init?.body).toBeUndefined();
  });

  it("removes an unverified draft through the versioned delete endpoint and refreshes the drawing list", async () => {
    const removable = { ...drawings[0], id: "drawing-remove", displayTitle: "Remove me", verified: false };
    const removableRevision = { ...revisions[0], id: "revision-remove", drawingId: removable.id };
    let removed = false;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/estimate-design-revisions/revision-remove/image")) return new Response(new Blob(["image"], { type: "image/png" }));
      if (url.endsWith("/estimate-design-drawings/drawing-remove") && init?.method === "DELETE") {
        removed = true;
        return response({ id: removable.id, active: false });
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) return response({
        uploads: [{ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "estimator_review", failureCode: null, failureMessage: null }],
        pages: [page], drawings: removed ? [] : [removable], revisions: removed ? [] : [removableRevision]
      });
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    await user.click(await screen.findByRole("button", { name: "More actions for Remove me" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove drawing" }));
    const remove = await vi.waitFor(() => {
      const request = requests.find((entry) => entry.init?.method === "DELETE");
      expect(request).toBeDefined();
      return request!;
    });
    expect(remove.url).toContain("/estimate-design-drawings/drawing-remove");
    expect(JSON.parse(String(remove.init?.body))).toEqual({ version: 1 });
    await vi.waitFor(() => expect(screen.queryByRole("article", { name: "Remove me drawing" })).not.toBeInTheDocument());
  });

  it("keeps retry and removal controls usable and explains failed actions", async () => {
    const removable = { ...drawings[0], id: "drawing-error", displayTitle: "Error drawing", verified: false };
    const removableRevision = { ...revisions[0], id: "revision-error", drawingId: removable.id };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/estimate-design-revisions/revision-error/image")) return new Response(new Blob(["image"], { type: "image/png" }));
      if (url.endsWith("/estimate-design-uploads/upload-error/retry") || (url.endsWith("/estimate-design-drawings/drawing-error") && init?.method === "DELETE")) {
        return Response.json({ error: { code: "ACTION_FAILED", message: "Try again" } }, { status: 500 });
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) return response({
        uploads: [{ id: "upload-error", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "error.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "processing_failed", failureCode: "OCR_FAILED", failureMessage: "Could not read plan", canRetry: true }],
        pages: [page], drawings: [removable], revisions: [removableRevision]
      });
      throw new Error(`Unexpected request: ${url}`);
    });

    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    await user.click(await screen.findByRole("button", { name: "Retry extraction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The extraction could not be retried.");
    expect(screen.getByRole("button", { name: "Retry extraction" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "More actions for Error drawing" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove drawing" }));
    expect(await screen.findByText("The drawing could not be removed. Refresh and try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "More actions for Error drawing" })).toBeEnabled();
  });

  async function replaceThroughUi(queued: boolean) {
    const replacementDrawing = { ...drawings[0], id: queued ? "drawing-queued" : "drawing-immediate", displayTitle: queued ? "Queued replacement" : "Immediate replacement" };
    const replacementRevision = { ...revisions[0], id: queued ? "revision-queued" : "revision-immediate", drawingId: replacementDrawing.id, reviewStatus: "changes_requested" as const };
    const replacementUpload = { id: "replacement-upload", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "changed.pdf", mimeType: "application/pdf", sizeBytes: 14, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "queued" as const, failureCode: null, failureMessage: null };
    let replaced = false;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes("/estimate-design-revisions/") && url.endsWith("/image")) return new Response(new Blob(["image"], { type: "image/png" }));
      if (url.endsWith(`/estimate-design-drawings/${replacementDrawing.id}/replacement`)) {
        replaced = true;
        return response(queued ? { queued: true, upload: replacementUpload } : { ...replacementDrawing, displayTitle: "Replacement complete", revision: { ...replacementRevision, revisionNumber: 2, reviewStatus: "draft" } });
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) return response({
        uploads: queued && replaced ? [replacementUpload] : [{ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "estimator_review", failureCode: null, failureMessage: null }],
        pages: [page], drawings: [{ ...replacementDrawing, displayTitle: !queued && replaced ? "Replacement complete" : replacementDrawing.displayTitle }], revisions: [{ ...replacementRevision, revisionNumber: !queued && replaced ? 2 : 1, reviewStatus: !queued && replaced ? "draft" : "changes_requested" }]
      });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />);
    await user.click(await screen.findByRole("button", { name: `More actions for ${replacementDrawing.displayTitle}` }));
    await user.click(screen.getByRole("menuitem", { name: "Upload replacement" }));
    const file = new File(["replacement"], "changed.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Replacement drawing file"), file);
    await user.click(screen.getByRole("button", { name: "Upload replacement" }));
    const post = await vi.waitFor(() => {
      const request = requests.find((entry) => entry.url.endsWith(`/estimate-design-drawings/${replacementDrawing.id}/replacement`));
      expect(request).toBeDefined();
      return request!;
    });
    expect(post.init?.method).toBe("POST");
    expect(post.init?.body).toBeInstanceOf(FormData);
    const form = post.init?.body as FormData;
    expect(form.get("version")).toBe("1");
    expect((form.get("file") as File).name).toBe("changed.pdf");
    return { queued, replacementDrawing };
  }

  it("updates the rendered drawing after an immediate replacement response", async () => {
    await replaceThroughUi(false);
    expect(await screen.findByRole("status")).toHaveTextContent("Replacement drawing created.");
    expect(await screen.findByText("Replacement complete")).toBeVisible();
  });

  it("shows the queued replacement notice and enters the queued polling branch", async () => {
    await replaceThroughUi(true);
    expect(await screen.findByRole("status")).toHaveTextContent("Replacement queued for extraction.");
    expect(await screen.findByText("Queued")).toBeVisible();
  });

  it("shows immutable client feedback and preserves history through a section-specific replacement retry", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:estimator-marked-preview")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const marked = {
      schemaVersion: 1 as const,
      imageWidth: 800,
      imageHeight: 600,
      elements: [{
        id: "client-note",
        type: "text" as const,
        x: 0.25,
        y: 0.4,
        text: "Shift the light point",
        color: "#ef4444",
        strokeWidth: 2
      }]
    };
    const replacementDrawing = {
      ...drawings[0],
      id: "drawing-client-change",
      displayTitle: "Living lighting detail"
    };
    const oldRevision = {
      ...revisions[0],
      id: "revision-client-change",
      drawingId: replacementDrawing.id,
      label: replacementDrawing.displayTitle,
      reviewStatus: "changes_requested" as const,
      changeSummary: "Move the light point toward the window.",
      annotations: marked
    };
    const newRevision = {
      ...oldRevision,
      id: "revision-client-change-2",
      revisionNumber: 2,
      reviewStatus: "draft" as const,
      changeSummary: null,
      annotations: null,
      replacesRevisionId: oldRevision.id
    };
    let attempts = 0;
    let replaced = false;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes("/estimate-design-revisions/") && url.endsWith("/image")) {
        return new Response(new Blob(["image"], { type: "image/png" }));
      }
      if (
        url.endsWith(`/estimate-design-drawings/${replacementDrawing.id}/replacement`) &&
        init?.method === "POST"
      ) {
        attempts += 1;
        if (attempts === 1) {
          return Response.json({
            error: { code: "FILE_STORAGE_ERROR", message: "Temporary storage failure." }
          }, { status: 503 });
        }
        replaced = true;
        return response({
          ...replacementDrawing,
          verified: false,
          revision: newRevision
        }, 201);
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) {
        return response({
          uploads: [{
            id: "upload-1",
            estimateId: "estimate-1",
            leadId: "lead-1",
            originalFilename: "plan.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12,
            uploaderId: "user-1",
            uploadedAt: "2026-07-30T00:00:00.000Z",
            extractionStatus: replaced ? "estimator_review" : "changes_requested",
            failureCode: null,
            failureMessage: null
          }],
          pages: [page],
          drawings: [{ ...replacementDrawing, verified: !replaced }],
          revisions: replaced ? [oldRevision, newRevision] : [oldRevision]
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    renderWithQuery(
      <EstimateDesignUploads estimateId="estimate-1" rooms={rooms} scopes={scopes} />
    );
    const row = await screen.findByRole("article", {
      name: "Living lighting detail drawing"
    });
    expect(within(row).getByText("Move the light point toward the window.")).toBeVisible();
    await user.click(within(row).getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(document.querySelector("svg image")).toHaveAttribute(
        "href",
        "blob:estimator-marked-preview"
      )
    );
    expect(screen.getByText("Shift the light point")).toBeVisible();
    expect(screen.queryByRole("toolbar", { name: "Annotation tools" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog", {
      name: "Living lighting detail preview"
    })).getByRole("button", {
      name: "Close Living lighting detail preview"
    }));

    await user.click(within(row).getByRole("button", {
      name: "More actions for Living lighting detail"
    }));
    await user.click(screen.getByRole("menuitem", { name: "Upload replacement" }));
    const fileInput = screen.getByLabelText<HTMLInputElement>("Replacement drawing file");
    const file = new File(["replacement"], "changed.png", { type: "image/png" });
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: "Upload replacement" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The replacement was not uploaded."
    );
    expect(fileInput.files?.[0]?.name).toBe("changed.png");
    expect(within(row).getByText("Changes requested")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Upload replacement" }));
    const replacementPosts = requests.filter((entry) =>
      entry.url.endsWith(
        `/estimate-design-drawings/${replacementDrawing.id}/replacement`
      )
    );
    expect(replacementPosts).toHaveLength(2);
    for (const request of replacementPosts) {
      const body = request.init?.body as FormData;
      expect(body.get("version")).toBe("1");
      expect((body.get("file") as File).name).toBe("changed.png");
    }

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Revision 2 awaits verification."
    );
    const replacementRow = await screen.findByRole("article", {
      name: "Living lighting detail drawing"
    });
    expect(replacementRow).toHaveFocus();
    expect(within(replacementRow).getByText("Needs review")).toBeVisible();
    await user.click(within(replacementRow).getByRole("button", {
      name: "More actions for Living lighting detail"
    }));
    await user.click(screen.getByRole("menuitem", { name: "History" }));
    const history = screen.getByRole("dialog", { name: "Drawing history" });
    expect(within(history).getByText(/Revision 2 · draft/)).toBeVisible();
    expect(within(history).getByText(/Revision 1 · changes requested/)).toBeVisible();
    expect(within(history).getByText("Move the light point toward the window.")).toBeVisible();
  });
});
