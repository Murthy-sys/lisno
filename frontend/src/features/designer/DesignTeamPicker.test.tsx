import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/client";
import { DesignTeamPicker } from "./DesignTeamPicker";
import { designTeamKeys, type DesignTeamDetail } from "./designTeamApi";

const fixture = (): DesignTeamDetail => ({ projectId: "project-a", version: 4, primary: { id: "primary", name: "Primary Designer" }, secondaries: [], candidates: ["A", "B", "C", "D"].map(name => ({ id: name, name: `Designer ${name}` })), canManage: true, requiresReason: false });
function setup(team = fixture()) {
  vi.spyOn(apiClient, "get").mockResolvedValue(team);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><DesignTeamPicker projectId="project-a" /></QueryClientProvider>);
  return client;
}
describe("Design team selection", () => {
  it("keeps primary read-only, limits secondary selection to three and saves the scoped version", async () => {
    const team = fixture(); const put = vi.spyOn(apiClient, "put").mockResolvedValue(team); setup(team);
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Choose secondary Designers" }));
    expect(screen.queryByRole("checkbox", { name: "Primary Designer" })).not.toBeInTheDocument();
    for (const name of ["A", "B", "C"]) await user.click(screen.getByRole("checkbox", { name: `Designer ${name}` }));
    expect(screen.getByRole("checkbox", { name: "Designer D" })).toBeDisabled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save design team" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/projects/project-a/secondary-designers", { expectedVersion: 4, designerIds: ["A", "B", "C"] }));
    expect(await screen.findByText("Design team saved.")).toBeVisible();
  });
  it("honors read-only access and the server's reason requirement", async () => {
    const team = fixture(); team.canManage = false; const client = setup(team);
    expect(await screen.findByText("Primary Designer")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Choose secondary Designers" })).not.toBeInTheDocument();
    await act(async () => client.setQueryData(designTeamKeys.detail("project-a", ""), { ...team, canManage: true, requiresReason: true }));
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Choose secondary Designers" }));
    await user.click(screen.getByRole("checkbox", { name: "Designer A" }));
    expect(screen.getByRole("button", { name: "Save design team" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Assignment change reason" }), "Provide assistance");
    expect(screen.getByRole("button", { name: "Save design team" })).toBeEnabled();
  });
  it("retains a stale selection and blocks saving until it is discarded", async () => {
    const client = setup(); const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Choose secondary Designers" }));
    await user.click(screen.getByRole("checkbox", { name: "Designer A" }));
    await act(async () => client.setQueryData(designTeamKeys.detail("project-a", ""), { ...fixture(), version: 5, secondaries: [{ id: "B", name: "Designer B" }] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("team changed");
    expect(screen.getByRole("checkbox", { name: "Designer A" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save design team" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard selection" }));
    expect(screen.getByRole("checkbox", { name: "Designer B" })).toBeChecked();
  });
});
