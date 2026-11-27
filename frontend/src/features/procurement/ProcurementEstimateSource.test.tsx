import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import type { EstimationPreparationSource, WorkOrderIssueReadiness } from "../../api/types";
import { PreparedOrderActions } from "./PreparedOrderActions";
import { ProcurementEstimateSource } from "./ProcurementEstimateSource";

const source: EstimationPreparationSource = {
  workflowVersion: 3, phase: "post", kind: "approved_final", estimateId: "estimate-one",
  estimateVersion: 4, estimateReviewRoundId: "review-one", sourceSnapshotId: "source-one", sourceDigest: "digest-one"
};
const readiness: WorkOrderIssueReadiness = {
  required: true, canIssue: true, blockers: [],
  finalSource: { estimateId: "estimate-one", estimateVersion: 4, estimateReviewRoundId: "review-one" }
};
const order = { id: "order-one", projectId: "project-one", version: 5, status: "ready_to_issue", issueReadiness: readiness };

describe("procurement release conditions", () => {
  it.each([2, 3] as const)("shows ready v%s work without requesting initial-payment confirmation", (workflowVersion) => {
    render(<ProcurementEstimateSource source={{ ...source, workflowVersion }} readiness={readiness} />);
    expect(screen.getByText("Ready for work order issue")).toBeVisible();
    expect(screen.getByText(/Initial payment confirmation is optional for release/)).toBeVisible();
    expect(screen.queryByText("Work order issue is blocked")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps current approval failures authoritative while initial receipt recording is optional", () => {
    const client = new QueryClient();
    const blocked = { ...readiness, canIssue: false, blockers: ["The current quotation requires Client approval."] };
    render(<QueryClientProvider client={client}>
      <ProcurementEstimateSource source={source} readiness={blocked} />
      <PreparedOrderActions source={{ ...order, issueReadiness: blocked }} kind="order" canManage />
    </QueryClientProvider>);
    expect(screen.getAllByText("The current quotation requires Client approval.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Issue approved work orders" })).toBeDisabled();
  });

  it("keeps readiness hidden while the source refreshes", () => {
    render(<ProcurementEstimateSource source={source} readiness={readiness} stale />);
    expect(screen.getByRole("status")).toHaveTextContent("Changes are paused");
    expect(screen.queryByText("Ready for work order issue")).not.toBeInTheDocument();
  });

  it("does not offer issue controls without the server-derived management capability", () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><PreparedOrderActions source={order} kind="order" canManage={false} /></QueryClientProvider>);
    expect(screen.getByText("Ready for work order issue")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("issues through the keyboard without a payment action and refreshes execution consumers", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ id: order.id, status: "approved" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const keys = [["procurement", "project-one"], ["project-finance", "project-one"],
      ["project-workflow", "project-status", "project-one"], ["assigned-projects", "project-one"]];
    keys.forEach(key => client.setQueryData(key, { source: "saved-server-record" }));
    render(<QueryClientProvider client={client}><PreparedOrderActions source={order} kind="order" canManage /></QueryClientProvider>);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Issue approved work orders" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Issue approved work orders?" });
    expect(dialog).toHaveTextContent("The server rechecks current Client and design approvals");
    expect(dialog).toHaveTextContent("Initial payment confirmation is optional for release");
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Confirm issue" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent("Work orders issued");
    expect(post).toHaveBeenCalledExactlyOnceWith("/procurement/projects/project-one/purchase-orders/order-one/issue", {
      expectedVersion: 5, idempotencyKey: expect.any(String)
    });
    await waitFor(() => keys.forEach(key => expect(client.getQueryState(key)?.isInvalidated).toBe(true)));
  });
});
