import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function setup(workflow?: DesignWorkflowView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{workflow ? <ProjectInitialPaymentStatus workflow={workflow} /> : <DesignPaymentConfirmations />}</QueryClientProvider>) };
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "finance-1", role: "finance_head" }, authorization: authorizationFor("finance_head", ["projects.design_workflow.payments.read", "projects.design_workflow.act"]) } as ReturnType<typeof useAuth>);
  server.use(http.get("/api/v1/design-workflow/payment-confirmations", () => HttpResponse.json({ data: [{ projectId: "project-one", projectName: "Project One", confirmedAt: null, version: 0, status: "awaiting_payment", canConfirm: true }] })));
});

describe("DesignPaymentConfirmations", () => {
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
