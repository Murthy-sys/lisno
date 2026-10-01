import { screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EstimateClientReviewSummary } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { retryEstimateClientEmail, type EstimateDraft, type EstimateStatus } from "./leadsApi";
import { clientKeys } from "../client/clientApi";
import { estimateWorkflowKeys } from "../estimates/estimateWorkflowApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";

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
  status: EstimateStatus;
  approvalRequired: boolean;
  clientReview: EstimateClientReviewSummary | null;
  clientFeedback?: EstimateDraft["clientFeedback"];
}

const deliveryCopy: Record<DeliveryStatus, string> = {
  queued: "Email queued",
  sending: "Email sending",
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
    response?: EstimateFixture;
    deferRefetch?: boolean;
  };
  failure?: "save" | "submit";
  refetchFailure?: boolean;
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
      if (options.refetchFailure) return Response.json({ error: { code: "UNAVAILABLE", message: "Read failed." } }, { status: 503 });
      const published = counts.submits > 0 || counts.sends > 0;
      if (published && options.publication?.deferRefetch) return pendingRefetch.promise;
      return response(published ? options.publication?.result ?? options.refetchedEstimate : options.refetchedEstimate);
    }
    if (url.endsWith("/leads/lead-1") && method === "GET") return response(leadFixture);
    if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
      counts.saves += 1;
      if (options.failure === "save") return Response.json({ error: { code: "CONFLICT", message: "Save failed." } }, { status: 409 });
      return response(options.initialEstimate);
    }
    if (url.endsWith("/leads/lead-1/estimate/submit") && method === "POST") {
      counts.submits += 1;
      if (options.failure === "submit") return Response.json({ error: { code: "CONFLICT", message: "Submit failed." } }, { status: 409 });
      if (options.publication?.endpoint !== "submit") {
        throw new Error("Unexpected low-value submission");
      }
      return response(options.publication.response ?? options.publication.result);
    }
    if (url.endsWith("/estimates/estimate-1/send-client") && method === "POST") {
      counts.sends += 1;
      if (options.publication?.endpoint !== "send") {
        throw new Error("Unexpected high-value send");
      }
      return response(options.publication.response ?? options.publication.result);
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
    if (url.includes("/estimate-plan-change-requests?") && method === "GET") return response([]);
    if (url.endsWith("/estimates/estimate-1/design-uploads") && method === "GET") return response({ uploads: [], drawings: [] });
    throw new Error(`Unexpected request: ${method} ${url}`);
  });

  return {
    counts,
    requests,
    releaseRefetch() {
      pendingRefetch.resolve(response(options.publication?.result ?? options.refetchedEstimate));
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
  const clientFeedback = {
    note: "Reduce the false ceiling to 120 sqft. Keep the current finish.",
    occurredAt: "2026-09-30T10:15:00.000Z",
    reviewRoundId: "round-1"
  };

  it("keeps Client feedback through editing and draft save, then clears it after the new submitted round is confirmed", async () => {
    const initial = { ...estimateFixture("client_changes_requested"), clientFeedback };
    const revisedDraft = {
      ...initial,
      status: "draft" as const,
      lineItems: initial.lineItems.map((line) => ({ ...line, quantity: 120 }))
    };
    const published = {
      ...revisedDraft,
      status: "sent_to_client" as const,
      clientReview: reviewSummary("disabled", { id: "round-2", estimateVersion: 6 }),
      clientFeedback: null
    };
    const harness = installWorkspaceHarness({
      initialEstimate: initial,
      refetchedEstimate: revisedDraft,
      publication: { endpoint: "submit", result: published, response: { ...published, clientFeedback: undefined }, deferRefetch: true }
    });
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup();
    renderWorkspace();

    const feedback = await screen.findByRole("region", { name: "Changes requested" });
    expect(within(feedback).getByText(clientFeedback.note)).toBeVisible();
    expect(feedback.querySelector("time")).toHaveAttribute("datetime", clientFeedback.occurredAt);
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity);
    await user.type(quantity, "120");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    await waitFor(() => expect(harness.counts.estimateGets).toBe(2));
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: /false ceiling.*quantity/i })).toHaveValue(120);
    const saveRequest = harness.requests.find((request) => request.method === "PUT");
    expect(JSON.parse(String(saveRequest?.body)).lineItems[0].quantity).toBe(120);

    await user.click(screen.getByRole("button", { name: "Submit estimate" }));
    await screen.findByText(/Submitted to the client portal for approval/);
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
    harness.releaseRefetch();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Changes requested" })).not.toBeInTheDocument());
    expect(harness.counts.submits).toBe(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: estimateWorkflowKeys.client });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clientKeys.projects });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.all });
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
  });

  it("labels retained feedback as stale and prevents repeat submission when publication succeeds but refresh fails", async () => {
    const initial = { ...estimateFixture("draft"), clientFeedback };
    const published = { ...estimateFixture("sent_to_client", reviewSummary("disabled")), clientFeedback: null };
    const options: WorkspaceHarnessOptions = {
      initialEstimate: initial,
      refetchedEstimate: published,
      publication: { endpoint: "submit", result: published, response: { ...published, clientFeedback: undefined } },
      refetchFailure: true
    };
    const harness = installWorkspaceHarness(options);
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Submit estimate" }));

    const feedback = screen.getByRole("region", { name: "Changes requested" });
    expect(await within(feedback).findByRole("alert")).toHaveTextContent("The latest feedback could not be loaded.");
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    options.refetchFailure = false;
    await user.click(screen.getByRole("button", { name: "Refresh feedback" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Changes requested" })).not.toBeInTheDocument());
    expect(harness.counts.submits).toBe(1);
  });

  it.each(["save", "submit"] as const)("retains the Client request and edited values when %s fails", async (failure) => {
    const initial = { ...estimateFixture("client_changes_requested"), clientFeedback };
    const harness = installWorkspaceHarness({ initialEstimate: initial, refetchedEstimate: initial, failure });
    const user = userEvent.setup();
    renderWorkspace();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity);
    await user.type(quantity, "120");
    await user.click(screen.getByRole("button", { name: failure === "save" ? "Save draft" : "Submit estimate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The estimate action could not be completed.");
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    expect(quantity).toHaveValue(120);
    expect(screen.getByRole("button", { name: "Submit estimate" })).toBeEnabled();
    expect(harness.counts.submits).toBe(failure === "save" ? 0 : 1);
  });

  it("retains Client feedback while a revised estimate awaits design approval", async () => {
    const initial = { ...estimateFixture("draft"), clientFeedback };
    const awaitingDesign = { ...initial, status: "pending_manager_assignment" as const, approvalRequired: true };
    installWorkspaceHarness({
      initialEstimate: initial,
      refetchedEstimate: awaitingDesign,
      publication: { endpoint: "submit", result: awaitingDesign }
    });
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Submit estimate" }));
    await screen.findByText("Submitted. A design manager must now assign a designer for approval.");
    expect(screen.getByText(clientFeedback.note)).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument());
  });

  it("shows useful legacy empty-note feedback separately from design requests", async () => {
    const initial = { ...estimateFixture("client_changes_requested"), clientFeedback: { ...clientFeedback, note: "  ", reviewRoundId: null } };
    installWorkspaceHarness({ initialEstimate: initial, refetchedEstimate: initial });
    renderWorkspace();
    const feedback = await screen.findByRole("region", { name: "Changes requested" });
    expect(within(feedback).getByText(/The client requested changes without an explanation/)).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Plan change requests" })).toBeVisible();
    expect(within(feedback).queryByText("No open plan requests.")).not.toBeInTheDocument();
  });

  it("does not carry feedback into another project's estimate after navigation", async () => {
    const first = { ...estimateFixture("draft"), clientFeedback };
    const second = {
      ...estimateFixture("client_approved"), id: "estimate-2", subtotal: 60000, gst: 10800, total: 70800,
      lineItems: first.lineItems.map((line) => ({ ...line, rate: 120, quantity: 500 })), clientFeedback: null
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1/estimate")) return response(first);
      if (url.endsWith("/leads/lead-2/estimate")) return response(second);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-2")) return response({ ...leadFixture, id: "lead-2", projectName: "Neel villa", clientName: "Neel Roy" });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(
      <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
        <Link to="/estimator-sales/leads/lead-2/estimate">Open Neel villa</Link>
        <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(clientFeedback.note)).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Open Neel villa" }));
    await screen.findByText("Neel villa · Pune");
    expect(await screen.findByText("₹70,800")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Changes requested" })).not.toBeInTheDocument();
    expect(screen.queryByText(clientFeedback.note)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit estimate" })).not.toBeInTheDocument();
  });

  it("keeps a delayed submission attached to its originating lead after navigation", async () => {
    const initial = { ...estimateFixture("draft"), clientFeedback };
    const published = { ...estimateFixture("sent_to_client"), clientFeedback: null };
    const second = {
      ...estimateFixture("draft"), id: "estimate-2", subtotal: 60000, gst: 10800, total: 70800,
      lineItems: initial.lineItems.map((line) => ({ ...line, rate: 120, quantity: 500 })),
      clientFeedback: { ...clientFeedback, note: "Use oak finish in the villa.", reviewRoundId: "round-8" }
    };
    const pendingSubmission = deferred<Response>();
    let publishedFirst = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/leads/lead-1/estimate/submit")) return pendingSubmission.promise;
      if (url.endsWith("/leads/lead-1/estimate") && init?.method === "PUT") return response(initial);
      if (url.endsWith("/leads/lead-1/estimate")) return response(publishedFirst ? published : initial);
      if (url.endsWith("/leads/lead-2/estimate")) return response(second);
      if (url.endsWith("/leads/lead-1")) return response(leadFixture);
      if (url.endsWith("/leads/lead-2")) return response({ ...leadFixture, id: "lead-2", projectName: "Neel villa", clientName: "Neel Roy" });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(
      <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
        <Link to="/estimator-sales/leads/lead-2/estimate">Open Neel villa</Link>
        <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole("button", { name: "Submit estimate" }));
    await user.click(screen.getByRole("link", { name: "Open Neel villa" }));
    await screen.findByText("Neel villa · Pune");
    publishedFirst = true;
    pendingSubmission.resolve(response(published));
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit estimate" })).toBeEnabled());
    expect(screen.getByText(second.clientFeedback.note)).toBeVisible();
    expect(screen.getByText("₹70,800")).toBeVisible();
    expect(screen.queryByText(/Submitted to the client portal for approval/)).not.toBeInTheDocument();
  });

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

      await user.click(await screen.findByRole("button", { name: "Submit estimate" }));
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

      await user.click(await screen.findByRole("button", { name: "Send to client" }));
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

  it("does not render or request the design upload workspace for an estimator", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/leads/lead-1")) {
        return response({ id: "lead-1", clientName: "Asha Shah", projectName: "Asha home", location: "Pune", propertyType: "2BHK" });
      }
      if (url.endsWith("/leads/lead-1/estimate")) {
        return response({ id: "estimate-1", propertyType: "2BHK", rooms: [{ id: "room-living", label: "Living Room", icon: "🛋️", typeId: "living", sqft: 200, length: null, width: null }], scopes: ["FC"], lineItems: [], subtotal: 0, gst: 0, total: 0, status: "draft", approvalRequired: false });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWithQuery(
      <MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
        <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Configure estimate" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Upload design plans" })
    ).not.toBeInTheDocument();
    expect(
      requests.some((url) => url.endsWith("/estimates/estimate-1/design-uploads"))
    ).toBe(false);
  });
});
