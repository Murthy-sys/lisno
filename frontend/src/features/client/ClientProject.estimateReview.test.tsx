import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { estimateWorkflowKeys, type EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { withPublishedReview } from "../estimates/clientEstimateReviewTestUtils";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";

const client = { id: "client-1", name: "Review Client", email: "review@example.test", role: "client" as const };
const project = { id: "project-villa", name: "Submitted Villa", clientId: client.id, status: "active", location: "Bengaluru", floors: [], progress: 0 };

function estimate(id = "estimate-villa", projectId: string | null = project.id): EstimateQueueItem {
  return withPublishedReview({
    id, projectId, propertyType: "Villa", rooms: [], scopes: ["FC"],
    status: "sent_to_client" as const, approvalRequired: true,
    lineItems: [{ catalogueId: "LEGACY-ITEM", roomName: "Living room", specification: "Custom shelving", unit: "unit", quantity: 2, rate: 400, amount: 750, included: true }],
    subtotal: 750, gst: 135, total: 885,
    lead: { _id: "lead-1", clientName: client.name, clientEmail: client.email, projectName: "Submitted Villa", location: "Bengaluru" }
  });
}

function installApi(rows: EstimateQueueItem[], options: { decisionStatus?: number; getError?: () => number | undefined; pending?: Promise<Response>; decisionPending?: Promise<void> } = {}) {
  tokenStorage.set("client-token");
  const decisions: unknown[] = [];
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ data: client });
    if (url.endsWith("/auth/authorization")) return Response.json({ data: authorizationFor("client") });
    if (url.endsWith(`/projects/${project.id}`)) return Response.json({ data: project });
    if (url.endsWith("/client/estimates")) {
      if (options.pending) return options.pending;
      const status = options.getError?.();
      return status ? Response.json({ error: { code: "UNAVAILABLE", message: "Not available" } }, { status }) : Response.json({ data: rows });
    }
    if (url.endsWith("/decision") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)); decisions.push(body);
      if (options.decisionPending) await options.decisionPending;
      if (options.decisionStatus) return Response.json({ error: { code: "CONFLICT", message: "A newer estimate was submitted. Refresh to review it." } }, { status: options.decisionStatus });
      rows[0] = { ...rows[0]!, status: body.decision === "approve" ? "client_approved" : "client_changes_requested", publishedReview: { ...rows[0]!.publishedReview!, version: 2, canDecide: false, status: body.decision === "approve" ? "approved" : "changes_requested", decisionNote: body.note } };
      return Response.json({ data: rows[0] });
    }
    if (url.endsWith("/design-workflow")) return Response.json({ data: { projectId: project.id, projectName: project.name, estimateApprovalStatus: rows[0]?.status === "client_approved" ? "approved" : "awaiting_approval", serverNow: new Date().toISOString(), floors: [], projectStages: [] } });
    if (url.endsWith("/design-sections")) return Response.json({ data: { projectId: project.id, sections: [], progress: { total: 0, approved: 0, rejected: 0, awaitingReview: 0 } } });
    if (url.includes("/design-versions?") || url.includes("/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url.endsWith("/latest-approved-versions")) return Response.json({ data: [] });
    if (url.endsWith("/design-drawings")) return Response.json({ data: { uploads: [], pages: [], drawings: [], revisions: [], readiness: { ready: true, total: 0, approved: 0, awaitingReview: 0, changesRequested: 0 } } });
    if (url.endsWith("/plan-review")) return Response.json({ data: { uploads: [], pages: [], openRequests: [] } });
    throw new Error(`Unhandled request: ${url}`);
  });
  return { fetch, decisions };
}

describe("Client project published estimate review", () => {
  it("shows the exact project's submitted amounts and unknown items as read only, then confirms the displayed round", async () => {
    const selected = estimate();
    selected.total = 999999;
    selected.lineItems = [{ ...selected.lineItems[0]!, specification: "Unsubmitted change" }];
    const other = estimate("estimate-other", "project-other");
    other.publishedReview!.snapshot.projectName = "Private other project";
    other.publishedReview!.snapshot.total = 47200;
    const { decisions } = installApi([selected, other]);
    const user = userEvent.setup();
    const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const review = await screen.findByRole("region", { name: "Submitted estimate" });
    expect(within(review).getByText("LEGACY-ITEM")).toBeVisible();
    expect(within(review).getByText("Custom shelving")).toBeVisible();
    expect(within(review).getAllByText("₹750").length).toBeGreaterThan(0);
    expect(within(review).getByText("₹885")).toBeVisible();
    expect(screen.queryByText("Unsubmitted change")).not.toBeInTheDocument();
    expect(screen.queryByText("Private other project")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Approve estimate" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Approve this estimate?" });
    expect(within(dialog).getByText("₹885")).toBeVisible();
    expect(within(dialog).getByText("Version 3 · Submission 1")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(decisions).toEqual([]);
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("Estimate approved")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("region", { name: "Submitted estimate" })).toHaveFocus());
    expect(decisions).toEqual([{ decision: "approve", note: "", reviewRoundId: "round-estimate-villa", reviewRoundVersion: 1 }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.all });
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
  });

  it("requires explained changes, records the trimmed note, and offers the new submitted version after revision", async () => {
    const rows = [estimate()];
    const { decisions } = installApi(rows);
    const user = userEvent.setup();
    const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    await user.click(await screen.findByRole("button", { name: "Request changes" }));
    const dialog = screen.getByRole("dialog", { name: "Request estimate changes" });
    const note = within(dialog).getByRole("textbox", { name: /Changes needed/ });
    expect(note).toHaveFocus();
    expect(note).toHaveAttribute("maxLength", "1000");
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Send change request" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Describe the changes");
    expect(decisions).toEqual([]);
    await user.type(note, "  Use oak shelving in the living room.  ");
    await user.click(within(dialog).getByRole("button", { name: "Send change request" }));
    expect(await screen.findByText("Sales is revising your estimate")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("region", { name: "Submitted estimate" })).toHaveFocus());
    expect(screen.getByText("Use oak shelving in the living room.")).toBeVisible();
    expect(decisions).toEqual([{ decision: "request_changes", note: "Use oak shelving in the living room.", reviewRoundId: "round-estimate-villa", reviewRoundVersion: 1 }]);
    rows[0] = { ...rows[0]!, status: "draft", total: 800000, rooms: [], scopes: [] };
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    expect(screen.getAllByText("₹885").length).toBeGreaterThan(0);
    expect(screen.queryByText("₹8,00,000")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    rows[0] = estimate();
    rows[0].publishedReview = { ...rows[0].publishedReview!, id: "round-second", version: 1, estimateVersion: 5, sendGeneration: 2 };
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    expect(await screen.findByText("Version 5 · Submission 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });

  it("locks a failed stale decision until refresh and closes its confirmation", async () => {
    installApi([estimate()], { decisionStatus: 409 });
    const user = userEvent.setup();
    renderApp([`/client/projects/${project.id}`]);
    await user.click(await screen.findByRole("button", { name: "Approve estimate" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("This estimate has changed")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh estimate" }));
    expect(await screen.findByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });

  it.each(["none", "ambiguous", "missing", "conflict"] as const)("fails closed for a %s review source", async (state) => {
    const rows = state === "none" ? [estimate("other", "project-other")] : state === "ambiguous" ? [estimate(), estimate("duplicate")] : [estimate()];
    if (state === "missing") rows[0]!.publishedReview = null;
    if (state === "conflict") rows[0]!.reviewSourceIssue = "source_conflict";
    installApi(rows);
    renderApp([`/client/projects/${project.id}`]);
    const text = state === "none" ? /No submitted estimate is linked/ : state === "ambiguous" ? /current estimate for this project could not be verified/ : "Submitted estimate unavailable";
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
  });

  it("hides cached review content after a denied read and offers retry", async () => {
    let status: number | undefined;
    installApi([estimate()], { getError: () => status });
    const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText("Custom shelving")).toBeVisible();
    status = 403;
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    expect(screen.queryByText("Custom shelving")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry estimates" })).toBeVisible();
    status = 503;
    await userEvent.click(screen.getByRole("button", { name: "Retry estimates" }));
    expect(screen.queryByText("Custom shelving")).not.toBeInTheDocument();
  });

  it("keeps an unlinked estimate actionable on the dashboard", async () => {
    installApi([estimate("estimate-unlinked", null)]);
    renderApp(["/client?estimate=estimate-unlinked"]);
    expect(await screen.findByRole("button", { name: "Approve estimate" })).toBeEnabled();
    expect(screen.getByText("Custom shelving")).toBeVisible();
  });

  it("shows a loading state until a submitted review arrives", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    installApi([], { pending });
    renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText("Loading submitted estimates…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    await act(async () => { release(Response.json({ data: [estimate()] })); });
    expect(await screen.findByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });

  it("prevents a duplicate submit while a decision is saving", async () => {
    let release!: () => void;
    const decisionPending = new Promise<void>((resolve) => { release = resolve; });
    const { decisions } = installApi([estimate()], { decisionPending });
    const user = userEvent.setup();
    renderApp([`/client/projects/${project.id}`]);
    await user.click(await screen.findByRole("button", { name: "Approve estimate" }));
    const confirm = screen.getByRole("button", { name: "Confirm approval" });
    await user.dblClick(confirm);
    expect(confirm).toBeDisabled();
    expect(decisions).toHaveLength(1);
    await act(async () => { release(); });
    expect(await screen.findByText("Estimate approved")).toBeVisible();
  });

  it("closes the old confirmation when a newer submitted round arrives", async () => {
    installApi([estimate()]);
    const user = userEvent.setup();
    const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    await user.click(await screen.findByRole("button", { name: "Approve estimate" }));
    const next = estimate();
    next.publishedReview = { ...next.publishedReview!, id: "new-round", estimateVersion: 7, sendGeneration: 2 };
    act(() => { queryClient.setQueryData(estimateWorkflowKeys.client, [next]); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Version 7 · Submission 2")).toBeVisible();
  });
});
