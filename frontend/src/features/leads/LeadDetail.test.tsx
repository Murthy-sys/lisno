import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import type { LeadStage } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import type { DesignWorkflowView } from "../workflow/projectWorkflowApi";

describe("Lead details", () => {
  it("retains a failed follow-up and retries against the same lead before refreshing history", async () => {
    tokenStorage.set("sales-token");
    const user = userEvent.setup();
    const posts: Array<{ url: string; payload: Record<string, unknown> }> = [];
    let historyReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "sales-1", name: "Sales", email: "sales@example.com", role: "estimator_sales" } });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor("estimator_sales") });
      if (url === "/api/v1/leads/lead-b") return Response.json({ data: {
        id: "lead-b", projectId: null, ownerId: "sales-1", clientName: "Cedar Homes", projectName: "Cedar Loft",
        clientEmail: "cedar@example.com", clientMobile: "9000000002", stage: "contacted", propertyType: "2BHK", location: "Mysuru",
        budgetMin: 1800000, budgetMax: 2400000, nextAction: "Schedule review"
      } });
      if (url === "/api/v1/leads/lead-b/activities" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push({ url, payload });
        if (posts.length === 1) return Response.json({ error: { code: "FAILED", message: "Try again" } }, { status: 500 });
        return Response.json({ data: { id: "activity-b", ...payload } });
      }
      if (url.startsWith("/api/v1/leads/lead-b/activities?")) {
        historyReads += 1;
        return Response.json({ data: { items: posts.length > 1 ? [{ id: "activity-b", ...posts[1]!.payload }] : [], pagination: { limit: 50, offset: 0, total: posts.length > 1 ? 1 : 0, hasMore: false } } });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    renderApp(["/estimator-sales/leads/lead-b"]);
    const note = await screen.findByRole("textbox", { name: "Follow-up note" });
    expect(screen.getByRole("heading", { level: 1, name: "Cedar Homes" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Estimate steps" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Budget:/)).not.toBeInTheDocument();
    expect(screen.getByText("Next action: Schedule review")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start estimate" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add follow-up" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Activity type" }), "call");
    await user.type(note, "Confirm the site visit on Friday.");
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Follow-up could not be saved.");
    expect(note).toHaveValue("Confirm the site visit on Friday.");
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));
    await waitFor(() => expect(note).toHaveValue(""));
    expect(await screen.findByText("Confirm the site visit on Friday.")).toBeVisible();
    expect(historyReads).toBeGreaterThan(1);
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.url).toBe("/api/v1/leads/lead-b/activities");
      expect(post.payload).toMatchObject({ type: "call", note: "Confirm the site visit on Friday.", occurredAt: expect.any(String) });
    }
  });

  it("shows the estimate guide without payment or follow-ups and restores saved history and an unsaved draft on other stages", async () => {
    tokenStorage.set("sales-token");
    const user = userEvent.setup();
    let leadStage: LeadStage = "estimate_in_progress";
    const stageUpdates: LeadStage[] = [];
    const savedActivity = { id: "activity-cedar", type: "meeting", note: "Reviewed the saved ceiling scope.", occurredAt: "2026-10-07T10:00:00.000Z" };
    const paymentIssue = "The project needs a confirmed approved estimate before Initial payment received can be recorded.";
    const workflow: DesignWorkflowView = {
      projectId: "project-cedar", projectName: "Cedar Loft", serverNow: "2026-10-08T09:00:00.000Z", floors: [],
      estimateApprovalStatus: "awaiting_approval",
      initialPayment: { confirmedAt: null, canConfirm: false, version: 0, status: "awaiting_estimate_approval", issue: paymentIssue },
      notices: [{ id: "scope-review", stageId: "estimate", message: "Review the updated project scope before sending the estimate." }]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "sales-1", name: "Sales", email: "sales@example.com", role: "estimator_sales" } });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor("estimator_sales", [
        ...authorizationFor("estimator_sales").permissions, "design.plan_response_tasks.read"
      ]) });
      if (url === "/api/v1/leads/lead-cedar") {
        if (init?.method === "PATCH") {
          leadStage = (JSON.parse(String(init.body)) as { stage: LeadStage }).stage;
          stageUpdates.push(leadStage);
        }
        return Response.json({ data: {
          id: "lead-cedar", projectId: "project-cedar", ownerId: "sales-1", clientName: "Cedar Homes", projectName: "Cedar Loft",
          clientEmail: "cedar@example.com", clientMobile: "9000000002", stage: leadStage, propertyType: "2BHK", location: "Mysuru",
          budgetMin: 1800000, budgetMax: 2400000, nextAction: "Review estimate"
        } });
      }
      if (url.startsWith("/api/v1/leads/lead-cedar/activities?")) return Response.json({ data: {
        items: [savedActivity], pagination: { limit: 50, offset: 0, total: 1, hasMore: false }
      } });
      if (url === "/api/v1/projects/project-cedar/design-workflow") return Response.json({ data: workflow });
      if (url === "/api/v1/projects/project-cedar/status") return Response.json({ data: {
        projectId: "project-cedar", projectName: "Cedar Loft", serverNow: workflow.serverNow, state: "no_pending", currentStage: null, pendingActions: []
      } });
      if (url === "/api/v1/admin/design-plan-response-tasks?projectId=project-cedar") return Response.json({ data: [] });
      throw new Error(`Unhandled request: ${url}`);
    });
    renderApp(["/estimator-sales/leads/lead-cedar"]);
    const expectFollowUpsHidden = () => {
      expect(screen.queryByRole("heading", { name: "Follow-ups" })).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Activity type" })).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "Follow-up note" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add follow-up" })).not.toBeInTheDocument();
      expect(screen.queryByText(savedActivity.note)).not.toBeInTheDocument();
      expect(screen.queryByText("No follow-ups recorded.")).not.toBeInTheDocument();
      expect(screen.queryByText("Follow-up could not be saved.")).not.toBeInTheDocument();
    };
    expect(await screen.findByRole("region", { name: "Project notifications" })).toHaveTextContent(workflow.notices![0]!.message);
    expect(await screen.findByText("No design reviews are awaiting a response.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Cedar Loft" })).toBeVisible();
    expect(screen.getByText("Cedar Homes", { exact: true })).toBeVisible();
    expect(screen.getByText("2BHK", { exact: true })).toBeVisible();
    expect(screen.getByText("Mysuru", { exact: true })).toBeVisible();
    expect(screen.getAllByText("9000000002", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("cedar@example.com", { exact: true })).toHaveLength(1);
    const estimate = screen.getByRole("region", { name: "Estimate" });
    const steps = within(estimate).getByRole("list", { name: "Estimate steps" });
    expect(steps.tagName).toBe("OL");
    const stepItems = within(steps).getAllByRole("listitem");
    expect(stepItems).toHaveLength(3);
    ["Rooms & Dimensions", "Select Scope", "Generate Estimate"].forEach((label, index) => {
      expect(stepItems[index]).toHaveTextContent(label);
    });
    expect(within(steps).queryByRole("button")).not.toBeInTheDocument();
    expect(within(steps).queryByRole("link")).not.toBeInTheDocument();
    expect(steps.querySelector("[aria-current]")).toBeNull();
    expect(within(estimate).getAllByRole("button")).toHaveLength(1);
    expect(within(estimate).getByRole("button", { name: "Continue estimate" })).toBeEnabled();
    expect(estimate).not.toHaveTextContent(/Cedar Homes|9000000002|cedar@example.com/);
    expect(estimate).toHaveTextContent("Next action: Review estimate");
    expect(estimate.compareDocumentPosition(screen.getByRole("region", { name: "Project notifications" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Budget:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Configure rooms, dimensions and scope. Follow-ups remain available independently.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue estimate" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Initial payment status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Initial payment" })).not.toBeInTheDocument();
    expect(screen.queryByText("Awaiting estimate approval")).not.toBeInTheDocument();
    expect(screen.queryByText(paymentIssue)).not.toBeInTheDocument();
    expectFollowUpsHidden();

    await user.selectOptions(screen.getByRole("combobox", { name: "Lead stage" }), "estimate_sent");
    const paymentPanel = await screen.findByRole("region", { name: "Initial payment status" });
    expect(paymentPanel).toHaveTextContent("Awaiting estimate approval");
    expect(paymentPanel).toHaveTextContent("The estimate must be approved before the initial payment can be recorded.");
    expect(paymentPanel).toHaveTextContent(paymentIssue);
    expect(screen.getByRole("heading", { level: 1, name: "Cedar Homes" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Estimate steps" })).not.toBeInTheDocument();
    expect(screen.getByText("Configure rooms, dimensions and scope. Follow-ups remain available independently.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Follow-ups" })).toBeVisible();
    expect(screen.getByText(savedActivity.note)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Follow-up note" })).toHaveValue("");
    await user.selectOptions(screen.getByRole("combobox", { name: "Activity type" }), "whatsapp");
    await user.type(screen.getByRole("textbox", { name: "Follow-up note" }), "Confirm the ceiling scope.");
    expect(screen.getByRole("button", { name: "Add follow-up" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continue estimate" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Lead stage" })).toBeEnabled());

    await user.selectOptions(screen.getByRole("combobox", { name: "Lead stage" }), "estimate_in_progress");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Initial payment status" })).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Lead stage" })).toHaveValue("estimate_in_progress");
    expect(screen.getByRole("region", { name: "Project notifications" })).toHaveTextContent(workflow.notices![0]!.message);
    expect(screen.getByRole("region", { name: "Design reviews" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue estimate" })).toBeEnabled();
    expect(screen.getByRole("heading", { level: 1, name: "Cedar Loft" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Estimate steps" })).toBeVisible();
    expectFollowUpsHidden();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Lead stage" })).toBeEnabled());

    await user.selectOptions(screen.getByRole("combobox", { name: "Lead stage" }), "estimate_sent");
    expect(await screen.findByRole("heading", { name: "Follow-ups" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Initial payment status" })).toHaveTextContent(paymentIssue);
    expect(screen.getByRole("textbox", { name: "Follow-up note" })).toHaveValue("Confirm the ceiling scope.");
    expect(screen.getByRole("combobox", { name: "Activity type" })).toHaveValue("whatsapp");
    expect(screen.getByRole("button", { name: "Add follow-up" })).toBeEnabled();
    expect(screen.getByText(savedActivity.note)).toBeVisible();
    expect(stageUpdates).toEqual(["estimate_sent", "estimate_in_progress", "estimate_sent"]);
  });

  it("keeps Continue estimate pending and retryable, then opens the same lead's estimate after a successful stage update", async () => {
    tokenStorage.set("sales-token");
    const user = userEvent.setup();
    const lead = {
      id: "lead-retry", projectId: null, ownerId: "sales-1", clientName: "River House Client", projectName: "River House",
      clientEmail: "river@example.com", clientMobile: "9000000014", stage: "estimate_in_progress", propertyType: "Villa", location: "Pune",
      budgetMin: 2100000, budgetMax: 3200000, nextAction: "Check room dimensions"
    };
    const updates: Array<{ url: string; payload: unknown }> = [];
    let completeUpdate: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "sales-1", name: "Sales", email: "sales@example.com", role: "estimator_sales" } });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor("estimator_sales") });
      if (url === "/api/v1/leads/lead-retry") {
        if (init?.method === "PATCH") {
          updates.push({ url, payload: JSON.parse(String(init.body)) });
          return new Promise<Response>((resolve) => { completeUpdate = resolve; });
        }
        return Response.json({ data: lead });
      }
      if (url.startsWith("/api/v1/leads/lead-retry/activities?")) return Response.json({ data: {
        items: [], pagination: { limit: 50, offset: 0, total: 0, hasMore: false }
      } });
      if (url === "/api/v1/leads/lead-retry/estimate") return Response.json({ data: null });
      if (url.startsWith("/api/v1/estimation/catalogue?")) return Response.json({ data: {
        items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false }, ineligibleLineCount: 0
      } });
      throw new Error(`Unhandled request: ${url}`);
    });
    const { router } = renderApp(["/estimator-sales/leads/lead-retry"]);
    const continueEstimate = await screen.findByRole("button", { name: "Continue estimate" });
    expect(screen.getByRole("heading", { level: 1, name: "River House" })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Project sections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Project status/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Critical/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Follow-up note" })).not.toBeInTheDocument();
    await user.click(continueEstimate);
    expect(await screen.findByRole("button", { name: "Opening…" })).toBeDisabled();
    expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-retry");
    expect(updates).toEqual([{ url: "/api/v1/leads/lead-retry", payload: { stage: "estimate_in_progress" } }]);

    await act(async () => { completeUpdate!(Response.json({ error: { code: "UNAVAILABLE", message: "Retry the stage update" } }, { status: 503 })); });
    expect(await screen.findByRole("alert")).toHaveTextContent("The lead could not be updated. Try again.");
    expect(screen.getByRole("button", { name: "Continue estimate" })).toBeEnabled();
    expect(screen.queryByRole("textbox", { name: "Follow-up note" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Estimate steps" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-retry");

    await user.click(screen.getByRole("button", { name: "Continue estimate" }));
    expect(await screen.findByRole("button", { name: "Opening…" })).toBeDisabled();
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual(updates[0]);
    await act(async () => { completeUpdate!(Response.json({ data: lead })); });
    await waitFor(() => expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-retry/estimate"));
    expect(await screen.findByRole("heading", { name: "Configure estimate", level: 1 })).toBeVisible();
    expect(screen.queryByText("The lead could not be updated. Try again.")).not.toBeInTheDocument();
  });
});
