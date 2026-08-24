import { screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EstimateClientReviewSummary } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { retryEstimateClientEmail } from "./leadsApi";

const response = (data: unknown) => Response.json({ data });

type DeliveryStatus = EstimateClientReviewSummary["deliveryStatus"];

interface EstimateFixture {
  id: string;
  propertyType: string;
  rooms: Array<Record<string, unknown>>;
  scopes: string[];
  lineItems: Array<{
    catalogueId: string;
    roomName: string;
    specification: string;
    unit: string;
    rate: number;
    quantity: number;
    included: boolean;
  }>;
  subtotal: number;
  gst: number;
  total: number;
  status: "draft" | "ready_for_client" | "sent_to_client";
  approvalRequired: boolean;
  clientReview: EstimateClientReviewSummary | null;
}

const deliveryCopy: Record<DeliveryStatus, string> = {
  queued: "Email queued",
  sent: "Email sent",
  failed: "Email delivery failed",
  disabled: "Email unavailable"
};

const reviewSummary = (
  deliveryStatus: DeliveryStatus,
  overrides: Partial<EstimateClientReviewSummary> = {}
): EstimateClientReviewSummary => ({
  id: "round-1",
  sendGeneration: 2,
  estimateVersion: 4,
  version: 3,
  deliveryStatus,
  deliveryAttemptCount: deliveryStatus === "disabled" ? 0 : 1,
  deliveredAt: deliveryStatus === "sent" ? "2026-08-24T15:30:00.000Z" : null,
  status: "pending",
  ...overrides
});

const estimateFixture = (
  status: EstimateFixture["status"],
  clientReview: EstimateClientReviewSummary | null = null
): EstimateFixture => ({
  id: "estimate-1",
  propertyType: "2BHK",
  rooms: [
    {
      id: "room-living",
      label: "Living Room",
      icon: "🛋️",
      typeId: "living",
      sqft: 200,
      length: null,
      width: null
    }
  ],
  scopes: ["FC"],
  lineItems: [
    {
      catalogueId: "FC01",
      roomName: "Living Room",
      specification: "Gypsum plain",
      unit: "sqft",
      rate: 95,
      quantity: 200,
      included: true
    }
  ],
  subtotal: 19000,
  gst: 3420,
  total: 22420,
  status,
  approvalRequired: false,
  clientReview
});

const leadFixture = {
  id: "lead-1",
  clientName: "Asha Shah",
  projectName: "Asha home",
  location: "Pune",
  propertyType: "2BHK"
};

const emptyDesignWorkspace = { uploads: [], pages: [], drawings: [], revisions: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface WorkspaceHarnessOptions {
  initialEstimate: EstimateFixture;
  refetchedEstimate: EstimateFixture;
  publication?: {
    endpoint: "submit" | "send";
    result: EstimateFixture;
    deferRefetch?: boolean;
  };
  retry?: {
    result?: EstimateClientReviewSummary;
    conflict?: boolean;
  };
}

function installWorkspaceHarness(options: WorkspaceHarnessOptions) {
  const pendingRefetch = deferred<Response>();
  const requests: Array<{ method: string; url: string; body: BodyInit | null | undefined }> = [];
  const counts = { estimateGets: 0, saves: 0, submits: 0, sends: 0, retries: 0 };

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ method, url, body: init?.body });

    if (url.endsWith("/leads/lead-1/estimate") && method === "GET") {
      counts.estimateGets += 1;
      if (counts.estimateGets === 1) return response(options.initialEstimate);
      if (options.publication?.deferRefetch) return pendingRefetch.promise;
      return response(options.refetchedEstimate);
    }
    if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
    if (url.endsWith("/estimates/estimate-1/design-uploads") && method === "GET") {
      return response(emptyDesignWorkspace);
    }
    if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
      counts.saves += 1;
      return response(options.initialEstimate);
    }
    if (url.endsWith("/leads/lead-1/estimate/submit") && method === "POST") {
      counts.submits += 1;
      if (options.publication?.endpoint !== "submit") {
        throw new Error("Unexpected low-value submission");
      }
      return response(options.publication.result);
    }
    if (url.endsWith("/estimates/estimate-1/send-client") && method === "POST") {
      counts.sends += 1;
      if (options.publication?.endpoint !== "send") {
        throw new Error("Unexpected high-value send");
      }
      return response(options.publication.result);
    }
    if (url.endsWith("/estimates/estimate-1/client-email/retry") && method === "POST") {
      counts.retries += 1;
      if (!options.retry) throw new Error("Unexpected email retry");
      if (options.retry.conflict) {
        return Response.json(
          { error: { code: "VERSION_CONFLICT", message: "The delivery state changed." } },
          { status: 409 }
        );
      }
      return response(options.retry.result);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });

  return {
    counts,
    requests,
    releaseRefetch() {
      pendingRefetch.resolve(response(options.refetchedEstimate));
    }
  };
}

function renderWorkspace() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
      <Routes>
        <Route
          path="/estimator-sales/leads/:leadId/estimate"
          element={<LeadEstimateWorkspace />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("LeadEstimateWorkspace", () => {
  it("posts the exact current round and version to the encoded email-retry endpoint", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const summary = reviewSummary("sent");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ url: String(input), init });
      return response(summary);
    });
    await expect(
      retryEstimateClientEmail("estimate-1", { roundId: "round-1", version: 3 })
    ).resolves.toEqual(summary);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("/api/v1/estimates/estimate-1/client-email/retry");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.body).toBe('{"roundId":"round-1","version":3}');
  });

  it.each(["queued", "sent", "failed", "disabled"] as const)(
    "uses the low-value %s publication result for notice copy and retains it after the immediate refetch",
    async (deliveryStatus) => {
      const initial = estimateFixture("draft");
      const published = estimateFixture("sent_to_client", reviewSummary(deliveryStatus));
      const harness = installWorkspaceHarness({
        initialEstimate: initial,
        refetchedEstimate: published,
        publication: { endpoint: "submit", result: published, deferRefetch: true }
      });
      const user = userEvent.setup();
      renderWorkspace();

      await screen.findByRole("heading", { name: "Upload design plans" });
      await user.click(screen.getByRole("button", { name: "Submit estimate" }));
      const notice = await screen.findByText(/Submitted.*client portal/i);
      expect(notice).toHaveAttribute("role", "status");
      expect(notice).toHaveTextContent(deliveryCopy[deliveryStatus]);
      expect(harness.counts.submits).toBe(1);
      expect(harness.counts.sends).toBe(0);
      expect(harness.counts.estimateGets).toBe(2);

      harness.releaseRefetch();
      const delivery = await screen.findByRole("region", { name: "Estimate email delivery" });
      expect(within(delivery).getByText(deliveryCopy[deliveryStatus])).toBeVisible();
      expect(harness.counts.submits).toBe(1);
      expect(harness.counts.sends).toBe(0);
    }
  );

  it.each(["queued", "sent", "failed", "disabled"] as const)(
    "uses the high-value %s send result for notice copy and retains it after the immediate refetch",
    async (deliveryStatus) => {
      const initial = estimateFixture("ready_for_client");
      const published = estimateFixture("sent_to_client", reviewSummary(deliveryStatus));
      const harness = installWorkspaceHarness({
        initialEstimate: initial,
        refetchedEstimate: published,
        publication: { endpoint: "send", result: published, deferRefetch: true }
      });
      const user = userEvent.setup();
      renderWorkspace();

      await screen.findByRole("heading", { name: "Upload design plans" });
      await user.click(screen.getByRole("button", { name: "Send to client" }));
      const notice = await screen.findByText(/client portal/i);
      expect(notice).toHaveAttribute("role", "status");
      expect(notice).toHaveTextContent(deliveryCopy[deliveryStatus]);
      expect(harness.counts.saves).toBe(0);
      expect(harness.counts.submits).toBe(0);
      expect(harness.counts.sends).toBe(1);
      expect(harness.counts.estimateGets).toBe(2);

      harness.releaseRefetch();
      const delivery = await screen.findByRole("region", { name: "Estimate email delivery" });
      expect(within(delivery).getByText(deliveryCopy[deliveryStatus])).toBeVisible();
      expect(harness.counts.submits).toBe(0);
      expect(harness.counts.sends).toBe(1);
    }
  );

  it("retries only the exact failed round, refetches its updated state, and never replays Submit or Send", async () => {
    const failed = reviewSummary("failed");
    const sent = reviewSummary("sent", { version: 4, deliveryAttemptCount: 2 });
    const harness = installWorkspaceHarness({
      initialEstimate: estimateFixture("sent_to_client", failed),
      refetchedEstimate: estimateFixture("sent_to_client", sent),
      retry: { result: sent }
    });
    const user = userEvent.setup();
    renderWorkspace();

    const delivery = await screen.findByRole("region", { name: "Estimate email delivery" });
    await user.click(within(delivery).getByRole("button", { name: "Retry email" }));

    expect(await screen.findByText("Estimate email delivery updated.")).toHaveAttribute(
      "role",
      "status"
    );
    await waitFor(() => expect(harness.counts.estimateGets).toBe(2));
    expect(
      within(screen.getByRole("region", { name: "Estimate email delivery" })).getByText(
        "Email sent"
      )
    ).toBeVisible();
    expect(harness.counts).toEqual({
      estimateGets: 2,
      saves: 0,
      submits: 0,
      sends: 0,
      retries: 1
    });
    const posts = harness.requests.filter((request) => request.method === "POST");
    expect(posts).toEqual([
      expect.objectContaining({
        url: "/api/v1/estimates/estimate-1/client-email/retry",
        body: '{"roundId":"round-1","version":3}'
      })
    ]);
  });

  it("announces a 409 as stale, refetches once, and does not replay retry, Submit, or Send", async () => {
    const failed = reviewSummary("failed");
    const queued = reviewSummary("queued", { version: 4, deliveryAttemptCount: 2 });
    const harness = installWorkspaceHarness({
      initialEstimate: estimateFixture("sent_to_client", failed),
      refetchedEstimate: estimateFixture("sent_to_client", queued),
      retry: { conflict: true }
    });
    const user = userEvent.setup();
    renderWorkspace();

    const delivery = await screen.findByRole("region", { name: "Estimate email delivery" });
    await user.click(within(delivery).getByRole("button", { name: "Retry email" }));

    expect(
      await screen.findByText("Email delivery changed. Refreshed the latest status.")
    ).toHaveAttribute("role", "alert");
    await waitFor(() => expect(harness.counts.estimateGets).toBe(2));
    expect(
      within(screen.getByRole("region", { name: "Estimate email delivery" })).getByText(
        "Email queued"
      )
    ).toBeVisible();
    expect(harness.counts).toEqual({
      estimateGets: 2,
      saves: 0,
      submits: 0,
      sends: 0,
      retries: 1
    });
    const posts = harness.requests.filter((request) => request.method === "POST");
    expect(posts).toEqual([
      expect.objectContaining({
        url: "/api/v1/estimates/estimate-1/client-email/retry",
        body: '{"roundId":"round-1","version":3}'
      })
    ]);
  });

  it("keeps assignment and manual selectors limited to saved rooms and lines until saving local edits", async () => {
    let savedIncludesLocalEdits = false;
    const room = { id: "room-living", label: "Living Room", icon: "🛋️", typeId: "living", sqft: 200, length: null, width: null };
    const savedStudy = { id: "room-study", label: "Home Office/Study", icon: "💻", typeId: "study", sqft: 120, length: null, width: null };
    const baseEstimate = () => ({
      id: "estimate-1", propertyType: "2BHK", rooms: savedIncludesLocalEdits ? [room, savedStudy] : [room], scopes: ["FC", "CA"],
      lineItems: [
        { catalogueId: "FC01", roomName: "Living Room", specification: "Gypsum plain", unit: "sqft", rate: 95, quantity: 200, included: true },
        ...(savedIncludesLocalEdits ? [{ catalogueId: "CA01", roomName: "Living Room", specification: "BWR ply + lacquer paint", unit: "lot", rate: 32000, quantity: 1, included: true }] : [])
      ], subtotal: 0, gst: 0, total: 0, status: "draft", approvalRequired: false
    });
    const miscDrawing = { id: "drawing-misc", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1", active: true, verified: true, roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", detectedTitle: "TV UNIT", displayTitle: "TV UNIT", source: "ocr", roomConfidence: null, scopeConfidence: null, ocrConfidence: null, roomEvidence: [], scopeEvidence: [] };
    const miscRevision = { id: "revision-misc", drawingId: "drawing-misc", revisionNumber: 1, sourcePageId: "page-1", crop: { x: 0, y: 0, width: 400, height: 300 }, label: "TV UNIT", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", reviewStatus: "draft", submittedAt: null, reviewerId: null, reviewedAt: null, changeSummary: null, annotationLayerId: null, annotations: null, replacementUploadId: null, replacesRevisionId: null };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) return response({ id: "lead-1", clientName: "Asha Shah", projectName: "Asha home", location: "Pune", propertyType: "2BHK" });
      if (url.endsWith("/leads/lead-1/estimate") && init?.method === "PUT") {
        savedIncludesLocalEdits = true;
        return response(baseEstimate());
      }
      if (url.endsWith("/leads/lead-1/estimate")) return response(baseEstimate());
      if (url.endsWith("/estimates/estimate-1/design-uploads")) return response({
        uploads: [{ id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", mimeType: "application/pdf", sizeBytes: 12, uploaderId: "user-1", uploadedAt: "2026-07-30T00:00:00.000Z", extractionStatus: "estimator_review", failureCode: null, failureMessage: null, canRetry: false }],
        pages: [{ id: "page-1", uploadId: "upload-1", pageNumber: 1, width: 800, height: 600 }], drawings: [miscDrawing], revisions: [miscRevision]
      });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}><Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes></MemoryRouter>);

    await screen.findByRole("heading", { name: "Upload design plans" });
    await user.click(screen.getByRole("button", { name: "⚙ Rooms" }));
    await user.click(screen.getByRole("button", { name: /Home Office\/Study/ }));
    await user.click(screen.getByRole("button", { name: "Continue to item selection →" }));
    await user.click(screen.getByRole("checkbox", { name: /CA01/ }));

    await user.click(await screen.findByRole("button", { name: "More actions for TV UNIT" }));
    await user.click(screen.getByRole("menuitem", { name: "Assign estimate item" }));
    await user.selectOptions(screen.getByLabelText("Room"), "room-living");
    expect(screen.getByRole("option", { name: /FC01/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /CA01/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Home Office/Study" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Add missing drawing" }));
    const manual = screen.getByRole("dialog", { name: "Add missing drawing" });
    await user.selectOptions(within(manual).getByLabelText("Room"), "room-living");
    expect(within(manual).queryByRole("option", { name: /CA01/ })).not.toBeInTheDocument();
    expect(within(manual).queryByRole("option", { name: "Home Office/Study" })).not.toBeInTheDocument();
    await user.click(within(manual).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    await user.click(screen.getByRole("button", { name: "Add missing drawing" }));
    const savedManual = screen.getByRole("dialog", { name: "Add missing drawing" });
    await user.selectOptions(within(savedManual).getByLabelText("Room"), "room-living");
    expect(await within(savedManual).findByRole("option", { name: /CA01/ })).toBeVisible();
    expect(within(savedManual).getByRole("option", { name: "Home Office/Study" })).toBeVisible();
    await user.click(within(savedManual).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "More actions for TV UNIT" }));
    await user.click(screen.getByRole("menuitem", { name: "Assign estimate item" }));
    await user.selectOptions(screen.getByLabelText("Room"), "room-living");
    expect(screen.getByRole("option", { name: /CA01/ })).toBeVisible();
    expect(screen.getByRole("option", { name: "Home Office/Study" })).toBeVisible();
  });

  it("shows the design upload and review surface only after an estimate exists", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1")) {
        return response({ id: "lead-1", clientName: "Asha Shah", projectName: "Asha home", location: "Pune", propertyType: "2BHK" });
      }
      if (url.endsWith("/leads/lead-1/estimate")) {
        return response({ id: "estimate-1", propertyType: "2BHK", rooms: [{ id: "room-living", label: "Living Room", icon: "🛋️", typeId: "living", sqft: 200, length: null, width: null }], scopes: ["FC"], lineItems: [], subtotal: 0, gst: 0, total: 0, status: "draft", approvalRequired: false });
      }
      if (url.endsWith("/estimates/estimate-1/design-uploads")) return response({ uploads: [], pages: [], drawings: [], revisions: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWithQuery(
      <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
        <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Upload design plans" })).toBeVisible();
  });
});
