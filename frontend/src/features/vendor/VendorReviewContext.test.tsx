import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "../../test/server";
import { executionFixture } from "../execution/executionTestFixtures";
import type { ExecutionWork } from "../execution/executionApi";
import { VendorReviewContext } from "./VendorReviewContext";
import { vendorWorkKeys, type VendorWorkTask } from "./vendorWorkApi";

let work: ExecutionWork;
let task: VendorWorkTask;
beforeEach(() => {
  work = { ...structuredClone(executionFixture), status: "awaiting_client", legacyStatus: "submitted_for_client", allowedActions: [], executionRound: 5 };
  task = {
    id: work.id, projectId: work.projectId, vendorId: work.vendorId, orderId: work.orderId, orderRevision: work.orderRevision,
    lineId: work.lineId, sourceLineItemKey: work.sourceLineItemKey, sourceSectionId: "section-one", sectionLabel: "Carpentry",
    roomName: work.roomName, itemName: work.itemName, scopeType: "execution", description: work.description,
    targetDate: work.originalTargetDate, deliveryLocation: "Project site", status: "submitted_for_client", version: 19,
    progress: 100, displayProgress: 100, progressSource: "vendor", currentRound: 2, note: "Completed work", requestedChangeReason: null,
    imageCount: 0, submittedAt: "2026-10-10T08:00:00Z", acceptedAt: null
  };
  server.use(http.get("/api/v1/vendor/work/work-one", () => HttpResponse.json({ data: task })));
});

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><VendorReviewContext work={work} /></QueryClientProvider>) };
}

describe("vendor Client review context", () => {
  it("shows a saved Client submission without equating Client and execution rounds", async () => {
    renderReview();
    expect(await screen.findByText("The Client's decision is pending.")).toBeVisible();
    expect(screen.getByText("Submitted to Client")).toBeVisible();
    expect(screen.getByText(/10 Oct 2026/).closest("time")).toHaveAttribute("datetime", task.submittedAt);
    expect(screen.queryByText("Accepted by Client")).not.toBeInTheDocument();
  });

  it("labels a previous Client submission during rework and preserves its reason", async () => {
    work = { ...work, status: "changes_requested", legacyStatus: "changes_requested", allowedActions: ["report"] };
    task = { ...task, status: "changes_requested", requestedChangeReason: "Correct the corner alignment.", acceptedAt: "2026-10-09T08:00:00Z" };
    renderReview();
    expect(await screen.findByText("Requested changes: Correct the corner alignment.")).toBeVisible();
    expect(screen.getByText("Previous Client submission")).toBeVisible();
    expect(screen.queryByText("Submitted to Client")).not.toBeInTheDocument();
    expect(screen.queryByText("Accepted by Client")).not.toBeInTheDocument();
  });

  it("keeps absent dates explicit instead of inventing a decision timestamp", async () => {
    work = { ...work, status: "client_approved", legacyStatus: "client_approved" };
    task = { ...task, status: "client_approved", submittedAt: null, acceptedAt: null };
    renderReview();
    expect(await screen.findByText("The Client accepted this assignment.")).toBeVisible();
    expect(screen.getByText("Submission date unavailable")).toBeVisible();
    expect(screen.getByText("Acceptance date unavailable")).toBeVisible();
  });

  it("rejects same-name review data belonging to a different project and order", async () => {
    task = { ...task, projectId: "project-two", orderId: "order-two", note: "Other project information" };
    renderReview();
    expect(await screen.findByText("Client review details could not be matched to this issued assignment.")).toBeVisible();
    expect(screen.queryByText("The Client's decision is pending.")).not.toBeInTheDocument();
    expect(screen.queryByText(/10 Oct 2026/)).not.toBeInTheDocument();
  });

  it("hides cached facts after review access is denied without hiding independent work", async () => {
    const view = renderReview();
    await screen.findByText("The Client's decision is pending.");
    server.use(http.get("/api/v1/vendor/work/work-one", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Review unavailable" } }, { status: 403 })));
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorWorkKeys.detail(work.id) }); });
    expect(await screen.findByText("Client review details are unavailable for this assignment.")).toBeVisible();
    expect(screen.queryByText("The Client's decision is pending.")).not.toBeInTheDocument();
    expect(screen.queryByText(/10 Oct 2026/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Client review details" })).toBeVisible();
  });

  it("retries a failed supplemental read and does not present stale review facts", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/vendor/work/work-one", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 })));
    renderReview();
    expect(await screen.findByText(/Client review details could not be refreshed/)).toBeVisible();
    expect(screen.queryByText("The Client's decision is pending.")).not.toBeInTheDocument();
    server.use(http.get("/api/v1/vendor/work/work-one", () => HttpResponse.json({ data: task })));
    await user.click(screen.getByRole("button", { name: "Retry Client review details" }));
    expect(await screen.findByText("The Client's decision is pending.")).toBeVisible();
  });

  it("requests an assignment refresh when the supplemental status has advanced", async () => {
    task = { ...task, status: "client_approved", acceptedAt: "2026-10-11T08:00:00Z" };
    renderReview();
    expect(await screen.findByText("Client review status changed. Refresh the assignment to see the latest workflow.")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Client review details" })).queryByText(/accepted this assignment/)).not.toBeInTheDocument();
  });

  it("does not fetch supplemental review data for superseded work", () => {
    work = { ...work, status: "superseded" };
    const { client } = renderReview();
    expect(client.isFetching()).toBe(0);
    expect(screen.queryByRole("region", { name: "Client review details" })).not.toBeInTheDocument();
  });
});
