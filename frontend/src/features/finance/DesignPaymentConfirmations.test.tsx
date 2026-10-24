import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ApiError, apiClient } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { authorizationFor } from "../../test/authFixtures";
import { server } from "../../test/server";
import type { DesignWorkflowView } from "../workflow/projectWorkflowApi";
import { DesignPaymentConfirmations, ProjectInitialPaymentStatus } from "./DesignPaymentConfirmations";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));

const projectWorkflow: DesignWorkflowView = { projectId: "project-one", projectName: "Project One", serverNow: "2026-09-11T09:00:00.000Z", floors: [], initialPayment: { confirmedAt: null, version: 0, status: "awaiting_payment", canConfirm: true } };

function asSuperAdmin() {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "sa-one", role: "super_admin" }, authorization: authorizationFor("super_admin", ["projects.design_workflow.payments.read", "projects.design_workflow.act"]) } as ReturnType<typeof useAuth>);
}

function setup(workflow?: DesignWorkflowView, summaryHref?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{workflow ? <ProjectInitialPaymentStatus workflow={workflow} /> : <MemoryRouter><DesignPaymentConfirmations summaryHref={summaryHref} /></MemoryRouter>}</QueryClientProvider>) };
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "finance-1", role: "finance_head" }, authorization: authorizationFor("finance_head", ["projects.design_workflow.payments.read", "projects.design_workflow.act"]) } as ReturnType<typeof useAuth>);
  server.use(http.get("/api/v1/design-workflow/payment-confirmations", () => HttpResponse.json({ data: [{ projectId: "project-one", projectName: "Project One", confirmedAt: null, version: 0, status: "awaiting_payment", canConfirm: true }] })));
});

describe("DesignPaymentConfirmations", () => {
  it("counts unconfirmed receipts including final-estimate attestations without exposing summary mutations", async () => {
    asSuperAdmin();
    server.use(http.get("/api/v1/design-workflow/payment-confirmations", () => HttpResponse.json({ data: [
      { projectId: "new", projectName: "New receipt", confirmedAt: null, version: 0, canConfirm: true },
      { projectId: "attestation", projectName: "Existing receipt", confirmedAt: null, version: 3, canConfirm: true, workflowVersion: 2, requiresAttestation: true, existingReceiptAt: "2026-09-11T09:04:00.000Z" },
      { projectId: "done", projectName: "Confirmed", confirmedAt: "2026-09-11T09:04:00.000Z", version: 4, canConfirm: false }
    ] })));
    const post = vi.spyOn(apiClient, "post");
    const href = "/admin/dashboard?tab=finance&periodDays=30&section=payments";
    const { container } = setup(undefined, href);
    const region = screen.getByRole("region", { name: "Initial payment confirmations" });
    const link = await within(region).findByRole("link", { name: /Awaiting initial payment confirmation/ });
    await waitFor(() => expect(link).toHaveTextContent("2"));
    expect(link).toHaveAttribute("href", href);
    expect(region).toHaveTextContent("Review receipts and final-estimate attestations");
    expect(within(region).queryByRole("form")).not.toBeInTheDocument();
    expect(within(region).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.setup().click(link);
    expect(post).not.toHaveBeenCalled();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps a failed compact queue retryable without displaying a fabricated zero", async () => {
    asSuperAdmin();
    let reads = 0;
    server.use(http.get("/api/v1/design-workflow/payment-confirmations", () => ++reads === 1
      ? HttpResponse.json({ message: "Unavailable" }, { status: 503 })
      : HttpResponse.json({ data: [] })));
    setup(undefined, "/admin/dashboard?tab=finance&section=payments");
    const region = screen.getByRole("region", { name: "Initial payment confirmations" });
    expect(within(region).getByRole("status")).toHaveTextContent("Loading payment confirmations");
    expect(await within(region).findByRole("alert")).toHaveTextContent("Payment confirmations could not be refreshed.");
    expect(within(region).getByRole("link")).not.toHaveTextContent("0");
    await userEvent.setup().click(within(region).getByRole("button", { name: "Reload confirmations" }));
    await waitFor(() => expect(within(region).getByRole("link")).toHaveTextContent("0"));
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not fetch or render a compact queue without payment-read permission", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "sa-one", role: "super_admin" }, authorization: authorizationFor("super_admin", []) } as ReturnType<typeof useAuth>);
    const get = vi.spyOn(apiClient, "get");
    setup(undefined, "/admin/dashboard?tab=finance&section=payments");
    expect(screen.queryByRole("region", { name: "Initial payment confirmations" })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps final-estimate payment read-only for Finance even if cached capabilities are stale", () => {
    setup({ ...projectWorkflow, initialPayment: { ...projectWorkflow.initialPayment!, workflowVersion: 2 } });
    expect(screen.queryByRole("button", { name: "Mark initial payment received" })).not.toBeInTheDocument();
    expect(screen.getByText(/Design starts after pre-estimate approval/)).toBeVisible();
  });

  it("lets Super Admin attest an existing receipt without implying another payment", async () => {
    asSuperAdmin();
    setup({ ...projectWorkflow, initialPayment: { ...projectWorkflow.initialPayment!, workflowVersion: 2,
      requiresAttestation: true, existingReceiptAt: "2026-09-11T09:04:00.000Z" } });
    expect(screen.getByRole("button", { name: "Confirm existing receipt" })).toBeDisabled();
    expect(screen.getByText(/This does not record another payment/)).toBeVisible();
    expect(screen.getByText("Confirm existing receipt against final estimate")).toBeVisible();
    expect(await axe.run(screen.getByRole("region", { name: "Initial payment status" }), { rules: { "color-contrast": { enabled: false } } })).toHaveProperty("violations", []);
  });

  it.each([false, true])("records a v2 Super Admin confirmation with a verified reference, attestation=%s", async (requiresAttestation) => {
    asSuperAdmin();
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    setup({ ...projectWorkflow, initialPayment: { ...projectWorkflow.initialPayment!, workflowVersion: 2, version: 4,
      requiresAttestation, ...(requiresAttestation ? { existingReceiptAt: "2026-09-11T09:04:00.000Z" } : {}) } });
    const label = requiresAttestation ? "Confirm existing receipt" : "Mark initial payment received";
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Payment reference / receipt note" }), "  Final estimate bank receipt REF-42.  ");
    await user.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByText("Initial payment confirmed for the final estimate. Work orders can be issued when procurement checks are complete.")).toBeVisible();
    expect(post).toHaveBeenCalledExactlyOnceWith("/projects/project-one/design-workflow/actions", {
      action: "confirm_initial_payment", expectedVersion: 4,
      note: "Final estimate bank receipt REF-42.", idempotencyKey: expect.any(String)
    }, { showGlobalLoader: false });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/countdown has started/)).not.toBeInTheDocument();
    if (!requiresAttestation) expect(document.querySelector("time")).not.toBeInTheDocument();
  });

  it("keeps the v2 Finance queue read-only while retaining legacy receipt confirmation", async () => {
    server.use(http.get("/api/v1/design-workflow/payment-confirmations", () => HttpResponse.json({ data: [
      { projectId: "project-v2", projectName: "Final Estimate Project", confirmedAt: null, version: 4, status: "awaiting_payment", canConfirm: true, workflowVersion: 2 },
      { projectId: "project-one", projectName: "Legacy Project", confirmedAt: null, version: 0, status: "awaiting_payment", canConfirm: true }
    ] })));
    setup();
    expect(await screen.findByRole("heading", { name: "Final Estimate Project" })).toBeVisible();
    expect(screen.queryByRole("form", { name: "Record initial payment for Final Estimate Project" })).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Record initial payment for Legacy Project" })).toBeVisible();
  });

  it("explains the final approval prerequisite separately from design start", () => {
    asSuperAdmin();
    setup({ ...projectWorkflow, initialPayment: { ...projectWorkflow.initialPayment!, workflowVersion: 2,
      status: "awaiting_estimate_approval", canConfirm: false } });
    expect(screen.getByText("Awaiting final estimate approval")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark initial payment received" })).not.toBeInTheDocument();
  });
  it("does not request the queue without its operation permission", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "finance-1", role: "finance_head" }, authorization: authorizationFor("finance_head", []) } as ReturnType<typeof useAuth>);
    const get = vi.spyOn(apiClient, "get");
    setup();
    expect(screen.queryByRole("region", { name: "Initial payment confirmations" })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("records one confirmation with a reference and server-owned timestamp", async () => {
    let finish!: (value: { version: number }) => void;
    const pending = new Promise<{ version: number }>((resolve) => { finish = resolve; });
    const post = vi.spyOn(apiClient, "post").mockImplementation(async <T,>(): Promise<T> => await pending as T);
    const user = userEvent.setup();
    setup();
    const field = await screen.findByRole("textbox", { name: "Payment reference / receipt note" });
    expect(screen.getByRole("button", { name: "Mark initial payment received" })).toBeDisabled();
    await user.type(field, "  Verified initial bank receipt REF-37.  ");
    const form = screen.getByRole("form", { name: "Record initial payment for Project One" });
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/projects/project-one/design-workflow/actions", expect.objectContaining({ action: "confirm_initial_payment", expectedVersion: 0, note: "Verified initial bank receipt REF-37.", idempotencyKey: expect.any(String) }), { showGlobalLoader: false });
    expect(post.mock.calls[0]![1]).not.toHaveProperty("confirmedAt");
    expect(screen.getByRole("button", { name: "Mark initial payment received" })).toBeDisabled();
    await act(async () => finish({ version: 1 }));
    expect(await screen.findByText("Initial payment received. The Designer’s Internal Kick off countdown has started.")).toBeVisible();
  });

  it("shows a retryable failure without losing the Finance reference", async () => {
    vi.spyOn(apiClient, "post").mockRejectedValue(new Error("Confirmation could not be saved."));
    const user = userEvent.setup();
    setup();
    await user.type(await screen.findByRole("textbox", { name: "Payment reference / receipt note" }), "Verified reference 8");
    await user.click(screen.getByRole("button", { name: "Mark initial payment received" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confirmation could not be saved.");
    expect(screen.getByRole("textbox")).toHaveValue("Verified reference 8");
  });

  it("lets Super Admin record a verified project receipt and displays the saved server timestamp", async () => {
    asSuperAdmin();
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 1 });
    const user = userEvent.setup();
    const { client, rerender } = setup(projectWorkflow);
    expect(screen.getByText("Awaiting initial payment")).toBeVisible();
    expect(screen.getByText(/countdown starts when initial payment is marked received/)).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Payment reference / receipt note" }), "Verified receipt 21");
    await user.click(screen.getByRole("button", { name: "Mark initial payment received" }));
    await screen.findByText("Initial payment received. The Designer’s Internal Kick off countdown has started. The recorded time will appear when the workflow refreshes.");
    expect(screen.queryByText("Awaiting initial payment")).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    rerender(<QueryClientProvider client={client}><ProjectInitialPaymentStatus workflow={{ ...projectWorkflow, initialPayment: { confirmedAt: "2026-09-11T09:04:00.000Z", status: "received", version: 1, canConfirm: false } }} /></QueryClientProvider>);
    expect(screen.getByText("Initial payment received")).toBeVisible();
    expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-09-11T09:04:00.000Z");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified receipt 21")).not.toBeInTheDocument();
  });

  it.each(["designer", "client", "admin"] as const)("keeps %s read-only even if a stale payload claims payment capability", (role) => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: `${role}-one`, role }, authorization: authorizationFor(role, ["projects.design_workflow.act"]) } as ReturnType<typeof useAuth>);
    setup(projectWorkflow);
    expect(screen.getByRole("region", { name: "Initial payment status" })).toHaveTextContent("Awaiting initial payment");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("waits for canonical estimate approval and never offers payment confirmation prematurely", () => {
    asSuperAdmin();
    setup({ ...projectWorkflow, initialPayment: { confirmedAt: null, version: 0, status: "awaiting_estimate_approval", canConfirm: false, issue: "The linked estimate is awaiting Client approval." } });
    expect(screen.getByText("Awaiting estimate approval")).toBeVisible();
    expect(screen.getByText("The linked estimate is awaiting Client approval.")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("requires backend payment capability and action permission in the queue", async () => {
    asSuperAdmin();
    server.use(http.get("/api/v1/design-workflow/payment-confirmations", () => HttpResponse.json({ data: [{ projectId: "project-one", projectName: "Project One", confirmedAt: null, version: 0 }] })));
    setup();
    await screen.findByText("Project One");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps a payment note on a version change and requires review before another submission", async () => {
    asSuperAdmin();
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 2 });
    const user = userEvent.setup();
    const { client, rerender } = setup(projectWorkflow);
    await user.type(screen.getByRole("textbox"), "Verified note remains");
    rerender(<QueryClientProvider client={client}><ProjectInitialPaymentStatus workflow={{ ...projectWorkflow, initialPayment: { ...projectWorkflow.initialPayment!, version: 1 } }} /></QueryClientProvider>);
    expect(screen.getByRole("textbox")).toHaveValue("Verified note remains");
    expect(screen.getByRole("button", { name: "Mark initial payment received" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use latest status" }));
    await user.click(screen.getByRole("button", { name: "Mark initial payment received" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ expectedVersion: 1, note: "Verified note remains" }), expect.anything()));
  });

  it("does not retry an unchanged conflicting payment state and keeps controls accessible", async () => {
    asSuperAdmin();
    const post = vi.spyOn(apiClient, "post").mockRejectedValue(new ApiError(409, "CONFLICT", "Workflow changed."));
    const user = userEvent.setup();
    setup(projectWorkflow);
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.type(screen.getByRole("textbox"), "Verified receipt");
    await user.click(screen.getByRole("button", { name: "Mark initial payment received" }));
    await screen.findByText("Workflow changed.");
    expect(screen.getByRole("button", { name: "Mark initial payment received" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveValue("Verified receipt");
    fireEvent.submit(screen.getByRole("form"));
    expect(post).toHaveBeenCalledTimes(1);
  });
});
