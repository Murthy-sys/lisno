import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { collectionWorkflow } from "../../test/keyCollectionFixtures";
import { ClientProjectPhasePanel } from "../client/ClientProjectPhasePanel";
import { KeyCollectionHeader } from "./KeyCollectionHeader";
import { ProjectWorkflowPanel } from "./ProjectWorkflowPanel";
import * as api from "./projectWorkflowApi";

const auth = vi.hoisted(() => ({ user: { id: "client-a", role: "client" as const }, reviewSession: null as { id: string } | null, allowed: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ ...auth, authorization: authorizationFor("client", auth.allowed ? ["projects.design_workflow.read"] : []) }) }));
vi.mock("./ProjectClientActions", () => ({ ProjectClientActions: () => null }));
vi.mock("./ProjectDesignRequirementsPanel", () => ({ ProjectDesignRequirementsPanel: () => null }));
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}{location.hash}</output>; }
function Page({ projectId = "project-a" }: { projectId?: string }) {
  const location = useLocation();
  return <><header><KeyCollectionHeader projectId={projectId} projectName="Courtyard Home" /></header>
    <ClientProjectPhasePanel title="Design flow" enabled revealKey={location.hash === "#key-collection" ? location.key : undefined}>
      <ProjectWorkflowPanel projectId={projectId} presentation="client" showAppointmentTimer={false} />
    </ClientProjectPhasePanel><Location /></>;
}
function mount(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/client/projects/project-a"]}>{children}</MemoryRouter></QueryClientProvider>;
  return { ...render(ui, { wrapper }), client };
}
beforeEach(() => { auth.user = { id: "client-a", role: "client" }; auth.reviewSession = null; auth.allowed = true; });

describe("KeyCollectionHeader", () => {
  it("shares one workflow source, remains above a collapsed Design flow and opens the existing collection stage", async () => {
    const read = vi.spyOn(api, "getDesignWorkflow").mockImplementation(async () => collectionWorkflow());
    const user = userEvent.setup(); mount(<Page />);
    const button = await screen.findByRole("button", { name: "Key collection for Courtyard Home" });
    await screen.findByRole("timer");
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Design flow" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("timer", { hidden: true })).toHaveLength(1);
    button.focus(); await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Key collection" });
    expect(within(dialog).getByText("Designer A")).toBeVisible();
    expect(within(dialog).getByText("Complete Internal Kickoff.")).toBeVisible();
    expect(within(dialog).getByText(/Asia\/Kolkata/)).toBeVisible();
    await user.keyboard("{Escape}"); await waitFor(() => expect(button).toHaveFocus());
    await user.click(button); await user.click(screen.getByRole("button", { name: "Open key collection" }));
    expect(screen.getByRole("status")).toHaveTextContent("/client/projects/project-a#key-collection");
    expect(screen.getByRole("button", { name: "Design flow" })).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("button", { name: /Key Collection —/ })).toBeVisible();
    await waitFor(() => expect(document.getElementById("key-collection")).toHaveFocus());
    expect(screen.getAllByRole("timer")).toHaveLength(1);
  });

  it("removes the active header after Designer receipt, keeping the handover workflow", async () => {
    let workflow = collectionWorkflow();
    vi.spyOn(api, "getDesignWorkflow").mockImplementation(async () => workflow);
    const view = mount(<Page />); await screen.findByRole("timer");
    workflow = { ...workflow, designerHandoff: { ...workflow.designerHandoff!, state: "received", appointment: { ...workflow.designerHandoff!.appointment!, receivedAt: workflow.serverNow, timing: null } } };
    await act(() => view.client.invalidateQueries({ queryKey: api.projectWorkflowKeys.all }));
    await waitFor(() => expect(screen.queryByRole("timer", { hidden: true })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Key collection for Courtyard Home" })).not.toBeInTheDocument();
    expect(screen.getByText(/Designer has received the keys/)).toBeInTheDocument();
  });

  it("preserves a stale warning on transient failure, then hides cached project information on denial", async () => {
    const read = vi.spyOn(api, "getDesignWorkflow").mockResolvedValue(collectionWorkflow());
    const view = mount(<KeyCollectionHeader projectId="project-a" projectName="Courtyard Home" />);
    await screen.findByRole("timer");
    read.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(() => view.client.invalidateQueries({ queryKey: api.projectWorkflowKeys.all }));
    expect(await screen.findByText("May be out of date")).toBeVisible();
    expect(screen.getByRole("timer")).toBeVisible();
    read.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
    await act(() => view.client.invalidateQueries({ queryKey: api.projectWorkflowKeys.all }));
    await waitFor(() => expect(screen.queryByRole("timer")).not.toBeInTheDocument());
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    read.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(() => view.client.invalidateQueries({ queryKey: api.projectWorkflowKeys.all }));
    expect(await screen.findByText("Key collection · Unavailable")).toBeVisible();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Key collection for Courtyard Home" }));
    expect(screen.queryByText("Designer A")).not.toBeInTheDocument();
    expect(screen.queryByText("Complete Internal Kickoff.")).not.toBeInTheDocument();
  });

  it("isolates a switched project, actor and review session without retaining the old dialog", async () => {
    const read = vi.spyOn(api, "getDesignWorkflow").mockResolvedValue(collectionWorkflow());
    const view = mount(<KeyCollectionHeader projectId="project-a" projectName="Courtyard Home" />);
    await screen.findByRole("timer"); await userEvent.click(screen.getByRole("button", { name: "Key collection for Courtyard Home" }));
    read.mockImplementation(() => new Promise(() => {}));
    auth.user = { ...auth.user, id: "client-b" }; auth.reviewSession = { id: "review-b" };
    view.rerender(<KeyCollectionHeader projectId="project-b" projectName="Lakeside Home" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("Key collection · Loading…")).toBeVisible();
    await waitFor(() => expect(read).toHaveBeenCalledWith("project-b"));
  });

  it("does not request workflow data without read permission", () => {
    auth.allowed = false; const read = vi.spyOn(api, "getDesignWorkflow"); mount(<KeyCollectionHeader projectId="project-a" />);
    expect(read).not.toHaveBeenCalled(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
