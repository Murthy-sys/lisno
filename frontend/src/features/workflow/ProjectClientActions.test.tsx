import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiClient } from "../../api/client";
import type { PermissionCode, Role } from "../../api/authorization-contract";
import type { DesignPlanReviewTask } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { authorizationFor } from "../../test/authFixtures";
import { server } from "../../test/server";
import { ProjectClientActions } from "./ProjectClientActions";
import { projectWorkflowKeys } from "./projectWorkflowApi";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));

const permissions: PermissionCode[] = ["design.plan_response_tasks.read", "design.plan_response_tasks.decide"];
const pending: DesignPlanReviewTask = {
  id: "round-aurora", estimateId: "estimate-aurora", projectId: "project-aurora",
  projectName: "Aurora Villa", clientName: "Client Aurora", designPlanVersion: 3,
  status: "pending", deliveryStatus: "sent", submittedAt: "2026-09-10T09:00:00.000Z",
  version: 7, attachmentNames: ["aurora-design.pdf"], canDecide: true
};
const approved: DesignPlanReviewTask = {
  ...pending, status: "approved", version: 8, canDecide: false,
  decision: { action: "approve", source: "admin_proof", performedById: "sales-manager-past",
    performedByName: "Meera Manager", performedByRole: "admin", performedAt: "2026-09-10T09:30:00.000Z",
    note: "Client confirmed the revised living room.", onBehalfOfClient: true,
    proof: { filename: "client-approval.pdf", mimeType: "application/pdf", byteSize: 256, uploadedAt: "2026-09-10T09:30:00.000Z" } }
};

function auth(role: Role, granted = permissions) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: `${role}-viewer`, role }, authorization: authorizationFor(role, granted) } as ReturnType<typeof useAuth>);
}
function list(tasks: DesignPlanReviewTask[]) {
  server.use(http.get("/api/v1/admin/design-plan-response-tasks", ({ request }) => {
    expect(new URL(request.url).searchParams.get("projectId")).toBe("project-aurora");
    expect(new URL(request.url).searchParams.has("status")).toBe(false);
    return HttpResponse.json({ data: tasks });
  }));
}
function setup(projectId = "project-aurora", hideWhenEmpty = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<ProjectClientActions projectId={projectId} hideWhenEmpty={hideWhenEmpty} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
  }) };
}
async function openPending(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText("Open Client Task"));
}

beforeEach(() => auth("admin"));

describe("ProjectClientActions", () => {
  it("omits empty design reviews from the compact Client project after a successful response", async () => {
    auth("client"); list([]);
    const { client } = setup("project-aurora", true);
    expect(screen.queryByRole("region", { name: "Design reviews" })).not.toBeInTheDocument();
    await waitFor(() => expect(client.getQueryState(projectWorkflowKeys.projectReviews("project-aurora"))?.status).toBe("success"));
    expect(screen.queryByRole("region", { name: "Design reviews" })).not.toBeInTheDocument();
    expect(screen.queryByText("0 pending")).not.toBeInTheDocument();
  });

  it("retains actual Client design reviews and omits empty history in the compact presentation", async () => {
    auth("client"); list([pending]);
    const user = userEvent.setup(); setup("project-aurora", true);
    await openPending(user);
    expect(screen.getByRole("region", { name: "Design reviews" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Review design in Client portal" })).toHaveAttribute("href", "/client?estimate=estimate-aurora");
    expect(screen.queryByText("History")).not.toBeInTheDocument();
    expect(screen.queryByText("No design review history yet.")).not.toBeInTheDocument();
  });

  it.each(["admin", "super_admin"] as const)("allows %s to record an authorized Client response", async (role) => {
    auth(role);
    list([pending]);
    const user = userEvent.setup();
    setup();
    await openPending(user);
    expect(screen.getByRole("button", { name: "Approve with proof" })).toBeVisible();
    expect(screen.getByLabelText("Client decision proof")).toBeRequired();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it.each([undefined, false])("fails closed when the server canDecide capability is %s", async (canDecide) => {
    list([{ ...pending, canDecide, deliveryStatus: "failed" }]);
    const user = userEvent.setup();
    setup();
    await openPending(user);
    expect(screen.queryByRole("button", { name: "Approve with proof" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Client decision proof")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry email" })).not.toBeInTheDocument();
  });

  it("requires the decision permission even when the server capability is present", async () => {
    auth("admin", ["design.plan_response_tasks.read"]);
    list([pending]);
    const user = userEvent.setup();
    setup();
    await openPending(user);
    expect(screen.queryByRole("button", { name: "Approve with proof" })).not.toBeInTheDocument();
  });

  it.each(["client", "designer"] as const)("keeps %s read-only even with an unexpected decision capability", async (role) => {
    auth(role);
    list([pending]);
    const user = userEvent.setup();
    setup();
    await openPending(user);
    expect(screen.queryByRole("button", { name: "Approve with proof" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Client decision proof")).not.toBeInTheDocument();
    if (role === "client") expect(screen.getByRole("link", { name: "Review design in Client portal" })).toHaveAttribute("href", "/client?estimate=estimate-aurora");
    else expect(screen.queryByRole("link", { name: "Review design in Client portal" })).not.toBeInTheDocument();
  });

  it("does not fetch or expose cached data without read permission", () => {
    auth("admin", []);
    const get = vi.spyOn(apiClient, "get");
    const { client } = setup();
    act(() => client.setQueryData(projectWorkflowKeys.projectReviews("project-aurora"), [pending]));
    expect(screen.queryByRole("region", { name: "Design reviews" })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("uses the existing multipart endpoint, tracks progress, prevents duplicates and refreshes all affected views", async () => {
    let current = pending;
    server.use(http.get("/api/v1/admin/design-plan-response-tasks", () => HttpResponse.json({ data: [current] })));
    let complete!: (value: DesignPlanReviewTask) => void;
    const response = new Promise<DesignPlanReviewTask>((resolve) => { complete = resolve; });
    let progress!: (value: number) => void;
    let body!: FormData;
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockImplementation(async <T,>(path: string, data: FormData, onProgress: (value: number) => void): Promise<T> => {
      expect(path).toBe("/admin/design-plan-response-tasks/round-aurora/decision");
      body = data;
      progress = onProgress;
      return await response as T;
    });
    const user = userEvent.setup();
    const { client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await openPending(user);
    await user.click(screen.getByRole("radio", { name: "Request changes" }));
    await user.type(screen.getByRole("textbox", { name: "Required change note" }), "  Revise kitchen storage.  ");
    await user.upload(screen.getByLabelText("Client decision proof"), new File(["proof"], "client-changes.pdf", { type: "application/pdf" }));
    const form = screen.getByRole("button", { name: "Send changes with proof" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(body.get("expectedVersion")).toBe("7");
    expect(body.get("decision")).toBe("request_changes");
    expect(body.get("note")).toBe("Revise kitchen storage.");
    expect((body.get("proof") as File).name).toBe("client-changes.pdf");
    act(() => progress(100));
    expect(screen.getByRole("progressbar", { name: "Decision proof upload" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("button", { name: "Send changes with proof" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Required change note" })).toBeDisabled();
    expect(screen.getByLabelText("Client decision proof")).toBeDisabled();
    current = { ...approved, status: "changes_requested", decision: { ...approved.decision!, action: "request_changes" } };
    await act(async () => complete(current));
    await screen.findByText("No design reviews are awaiting a response.");
    for (const queryKey of [["project-workflow"], ["designer"], ["estimate-designs"], ["client", "projects"], ["client", "estimate-designs", "estimate-aurora"], ["client", "estimate-plan-review", "estimate-aurora"]]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
    expect(post).toHaveBeenCalledOnce();
  });

  it("validates required proof, advisory file types, and requested-change notes", async () => {
    list([pending]);
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    const user = userEvent.setup();
    setup();
    await openPending(user);
    await user.click(screen.getByRole("button", { name: "Approve with proof" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Upload proof of the Client's design decision.");
    expect(screen.getByLabelText("Client decision proof")).toHaveFocus();
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText("Client decision proof"), new File(["x"], "unsafe.exe", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Approve with proof" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a PDF, JPG, PNG, or WebP proof file.");
    await user.upload(screen.getByLabelText("Client decision proof"), new File(["proof"], "proof.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("radio", { name: "Request changes" }));
    await user.click(screen.getByRole("button", { name: "Send changes with proof" }));
    expect(screen.getByRole("textbox", { name: "Required change note" })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Explain the Client's requested design changes.");
    expect(post).not.toHaveBeenCalled();
  });

  it("retains failed submissions for retry without losing the selected proof", async () => {
    list([pending]);
    vi.spyOn(apiClient, "postMultipartWithProgress").mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    setup();
    await openPending(user);
    const input = screen.getByLabelText("Client decision proof") as HTMLInputElement;
    await user.upload(input, new File(["proof"], "proof.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Approve with proof" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The design decision could not be recorded.");
    expect(input.files?.[0]?.name).toBe("proof.pdf");
    expect(screen.getByRole("button", { name: "Approve with proof" })).toBeEnabled();
  });

  it("refetches a conflicting version and requires fresh proof instead of replaying the decision", async () => {
    let requests = 0;
    server.use(http.get("/api/v1/admin/design-plan-response-tasks", () => HttpResponse.json({ data: [{ ...pending, version: requests++ ? 9 : 7 }] })));
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere"));
    const user = userEvent.setup();
    const { client } = setup();
    await openPending(user);
    await user.upload(screen.getByLabelText("Client decision proof"), new File(["proof"], "proof.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Approve with proof" }));
    await waitFor(() => expect(client.getQueryData<DesignPlanReviewTask[]>(projectWorkflowKeys.projectReviews("project-aurora"))?.[0]?.version).toBe(9));
    expect((screen.getByLabelText("Client decision proof") as HTMLInputElement).files).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Approve with proof" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Upload proof of the Client's design decision.");
    expect(post).toHaveBeenCalledOnce();
  });

  it("shows immutable performer details and downloads decision proof through the authenticated API", async () => {
    auth("super_admin");
    list([approved]);
    const getBlob = vi.spyOn(apiClient, "getBlob").mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText("History"));
    await user.click(screen.getByText("Design plan v3", { selector: "strong" }));
    expect(screen.getByText("Meera Manager")).toBeVisible();
    expect(screen.getByText("Sales Manager")).toBeVisible();
    expect(screen.getByText("Recorded on behalf of the Client.")).toBeVisible();
    expect(screen.getByText("Client confirmed the revised living room.")).toBeVisible();
    expect(screen.getByText(/10 Sept 2026, 09:30 UTC/u)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Download decision proof: client-approval.pdf" }));
    expect(getBlob).toHaveBeenCalledWith("/admin/design-plan-response-tasks/round-aurora/proof");
    expect(await screen.findByRole("alert")).toHaveTextContent("The decision proof could not be downloaded.");
    expect(document.body).not.toHaveTextContent("sales-manager-past");
    expect(screen.queryByLabelText("Client decision proof")).not.toBeInTheDocument();
  });

  it("does not invent a historic role or on-behalf action for Client portal decisions", async () => {
    list([{ ...approved, decision: { ...approved.decision!, source: "client_portal", performedByRole: null, onBehalfOfClient: true, proof: null } }]);
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText("History"));
    await user.click(screen.getByText("Design plan v3", { selector: "strong" }));
    expect(screen.getByText("Role unavailable")).toBeVisible();
    expect(screen.queryByText("Recorded on behalf of the Client.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download decision proof/u })).not.toBeInTheDocument();
  });

  it("isolates unequal projects and hides previous project data while the next request loads", async () => {
    const harbor = { ...pending, id: "round-harbor", projectId: "project-harbor", projectName: "Harbor Studio", designPlanVersion: 12, attachmentNames: [] };
    let loadHarbor!: (tasks: DesignPlanReviewTask[]) => void;
    const harborResponse = new Promise<DesignPlanReviewTask[]>((resolve) => { loadHarbor = resolve; });
    const get = vi.spyOn(apiClient, "get").mockImplementation(async <T,>(path: string): Promise<T> => {
      if (path.includes("project-aurora")) return [pending] as T;
      expect(path).toBe("/admin/design-plan-response-tasks?projectId=project-harbor");
      return await harborResponse as T;
    });
    const user = userEvent.setup();
    const view = setup();
    await openPending(user);
    expect(screen.getByText("Aurora Villa")).toBeVisible();
    view.rerender(<ProjectClientActions projectId="project-harbor" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading design reviews…");
    expect(screen.queryByText("Aurora Villa")).not.toBeInTheDocument();
    await act(async () => loadHarbor([harbor, pending]));
    await openPending(user);
    expect(screen.getByText("Harbor Studio")).toBeVisible();
    expect(screen.queryByText("Aurora Villa")).not.toBeInTheDocument();
    expect(view.client.getQueryData(projectWorkflowKeys.projectReviews("project-aurora"))).toEqual([pending]);
    expect(view.client.getQueryData(projectWorkflowKeys.projectReviews("project-harbor"))).toEqual([harbor, pending]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("renders a recoverable load error and honest empty history", async () => {
    let fail = true;
    server.use(http.get("/api/v1/admin/design-plan-response-tasks", () => fail ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 }) : HttpResponse.json({ data: [] })));
    const user = userEvent.setup();
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Design reviews could not be loaded.");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No design reviews are awaiting a response.")).toBeVisible();
    await user.click(screen.getByText("History"));
    expect(screen.getByText("No design review history yet.")).toBeVisible();
  });
});
