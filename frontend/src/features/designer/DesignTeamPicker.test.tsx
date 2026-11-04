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
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Secondary Designers" }));
    expect(screen.queryByRole("option", { name: "Primary Designer" })).not.toBeInTheDocument();
    for (const name of ["A", "B", "C"]) await user.click(screen.getByRole("option", { name: `Designer ${name}` }));
    expect(screen.getByRole("option", { name: "Designer D" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Secondary Designers" })).toHaveTextContent("3 of 3 selected");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save team" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/projects/project-a/secondary-designers", { expectedVersion: 4, designerIds: ["A", "B", "C"] }));
    expect(await screen.findByText("Design team saved.")).toBeVisible();
  });
  it("honors read-only access and the server's reason requirement", async () => {
    const team = fixture(); team.canManage = false; const client = setup(team);
    expect(await screen.findByText("Primary Designer")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Secondary Designers" })).not.toBeInTheDocument();
    vi.mocked(apiClient.get).mockResolvedValue({ ...team, canManage: true, requiresReason: true });
    await act(async () => client.setQueryData(designTeamKeys.detail("project-a", ""), { ...team, canManage: true, requiresReason: true }));
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Secondary Designers" }));
    await user.click(screen.getByRole("option", { name: "Designer A" }));
    expect(screen.getByRole("button", { name: "Save team" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Assignment change reason" }), "Provide assistance");
    expect(screen.getByRole("button", { name: "Save team" })).toBeEnabled();
  });
  it("retains a stale selection and blocks saving until it is discarded", async () => {
    const client = setup(); const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Secondary Designers" }));
    await user.click(screen.getByRole("option", { name: "Designer A" }));
    await act(async () => client.setQueryData(designTeamKeys.detail("project-a", ""), { ...fixture(), version: 5, secondaries: [{ id: "B", name: "Designer B" }] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("team changed");
    expect(screen.getByRole("option", { name: "Designer A" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Save team" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Secondary Designers" }));
    expect(screen.getByRole("option", { name: "Designer B" })).toHaveAttribute("aria-selected", "true");
  });
  it("searches, removes local selections and cancels back to the saved team", async () => {
    const team = fixture(); team.secondaries = [team.candidates[0]]; setup(team);
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Secondary Designers" }));
    await user.type(screen.getByRole("searchbox", { name: "Search Designers" }), "Designer B");
    expect(await screen.findByRole("option", { name: "Designer B" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Designer C" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("option", { name: "Designer B" })).toBeEnabled());
    await user.click(screen.getByRole("option", { name: "Designer B" }));
    await user.click(screen.getByRole("button", { name: "Remove Designer A" }));
    expect(screen.queryByRole("button", { name: "Remove Designer A" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Secondary Designers" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Remove Designer A" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove Designer B" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Assignment change reason" })).not.toBeInTheDocument();
  });
  it("supports keyboard options and closes on Escape or outside clicks with focus restored", async () => {
    setup(); const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Secondary Designers" });
    await user.click(trigger);
    expect(screen.getByRole("searchbox")).toHaveFocus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("option", { name: "Designer A" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
    await user.click(trigger); await user.click(screen.getByRole("heading", { name: "Design team" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
    expect(screen.getByRole("button", { name: "Remove Designer A" })).toBeVisible();
  });
});
