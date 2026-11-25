import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { createProcurementGroupFixture } from "../../test/fixtures/enterpriseProcurementData";
import { initialProcurementPriorityView, ProcurementBasketPriorityGroups } from "./ProcurementBasketPriorityGroups";
import { ProcurementBasketWorkspace } from "./ProcurementBasketWorkspace";
import { procurementBasketKeys, type ProcurementBasketList, type ProcurementBasketPriorityGroup, type ProcurementBasketSummary } from "./procurementBasketApi";

vi.mock("./ProcurementBasketDetailView", () => ({ ProcurementBasketDetailView: ({ projectId, basket }: { projectId: string; basket: ProcurementBasketSummary }) =>
  <div role="status">Full basket {basket.id} in {projectId}</div> }));

function Harness({ groups, onOpen = vi.fn() }: { groups: ProcurementBasketPriorityGroup[]; onOpen?: (id: string) => void }) {
  const [preferences, setPreferences] = useState(initialProcurementPriorityView);
  return <div className="procurement-basket"><ProcurementBasketPriorityGroups groups={groups} preferences={preferences} onPreferencesChange={setPreferences} onOpen={onOpen} /></div>;
}
const panel = (priority: string) => screen.getByRole("button", { name: new RegExp(`^${priority} \\d`) });

function install() {
  let data = createProcurementGroupFixture().list;
  let failed = false;
  server.use(http.get("/api/v1/procurement/projects/:projectId/baskets", () => failed
    ? HttpResponse.json({ error: { message: "Priority request failed." } }, { status: 503 })
    : HttpResponse.json({ data })));
  return { get data() { return data; }, setData: (next: ProcurementBasketList) => { data = next; }, setFailed: (value: boolean) => { failed = value; } };
}
function WorkspaceHarness() {
  const [projectId, setProjectId] = useState("project-one");
  const client = useQueryClient();
  return <><button type="button" onClick={() => setProjectId("project-two")}>Open second project</button>
    <button type="button" onClick={() => void client.invalidateQueries({ queryKey: procurementBasketKeys.list(projectId) })}>Refresh source</button>
    <ProcurementBasketWorkspace projectId={projectId} projectName={projectId} projectSourceStale={false} />
  </>;
}
function workspace() { return renderWithQuery(<MemoryRouter><WorkspaceHarness /></MemoryRouter>); }

describe("Procurement Main Line priority panels", () => {
  it("opens the first group, supports multiple keyboard disclosures, and keeps mixed-basket rows separate", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const view = render(<Harness groups={createProcurementGroupFixture().list.priorityGroups!} onOpen={onOpen} />);
    expect(panel("P1")).toHaveAttribute("aria-expanded", "true");
    expect(panel("P2")).toHaveAttribute("aria-expanded", "false");
    expect(panel("P3")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("table", { name: "P1 Main Lines" })).toHaveTextContent("Standard POP finish");
    expect(screen.queryByRole("table", { name: "P2 Main Lines" })).not.toBeInTheDocument();
    panel("P2").focus(); await user.keyboard("{Enter}");
    expect(screen.getByRole("table", { name: "P2 Main Lines" })).toHaveTextContent("Special cove finish");
    expect(panel("P1")).toHaveAttribute("aria-expanded", "true");
    await user.click(within(screen.getByRole("table", { name: "P2 Main Lines" })).getByRole("button", { name: /Open basket POP/ }));
    expect(onOpen).toHaveBeenCalledWith("basket-mixed");
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("finds names, rooms and basket context in closed panels without replacing manual expansion state", async () => {
    const user = userEvent.setup();
    render(<Harness groups={createProcurementGroupFixture().list.priorityGroups!} />);
    await user.click(panel("P1"));
    const search = screen.getByRole("searchbox", { name: "Search Main Lines" });
    await user.type(search, "In-house ceiling trim");
    expect(screen.getByRole("table", { name: "P3 Main Lines" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("1 matching item");
    await user.clear(search); await user.type(search, "Bedroom");
    expect(screen.getByRole("table", { name: "P1 Main Lines" })).toBeVisible();
    expect(screen.getByRole("table", { name: "P3 Main Lines" })).toBeVisible();
    await user.clear(search); await user.type(search, "Ceiling finishes");
    expect(screen.getByRole("table", { name: "P2 Main Lines" })).toBeVisible();
    await user.clear(search);
    expect(panel("P1")).toHaveAttribute("aria-expanded", "false");
    expect(panel("P3")).toHaveAttribute("aria-expanded", "false");
    await user.type(search, "No such Main Line");
    expect(screen.getByText("No Main Lines match your search.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue(""); expect(search).toHaveFocus();
  });

  it("shows all unresolved reasons and retained commitments without inventing a priority", () => {
    const base = createProcurementGroupFixture().list.priorityGroups![0]!.items[0]!;
    const states = ["unset", "unavailable", "invalid", "legacy"] as const;
    render(<Harness groups={[{ priority: "unassigned", lineCount: states.length, items: states.map((state, index) => ({
      ...base, sourceLineItemKey: `unknown-${index}`, mainLineName: index === 0 ? null : `Unknown ${index}`,
      scope: index === 0 ? "commitment_only" : "included", resolution: { state, value: null, revision: null }
    })) }]} />);
    expect(panel("Priority not set")).toHaveAttribute("aria-expanded", "true");
    for (const text of ["No priority selected in Configuration", "Current Configuration unavailable", "Saved priority needs review", "Main Line Configuration not linked", "Retained for an existing commitment", "Main Line name unavailable"]) {
      expect(screen.getByText(text)).toBeVisible();
    }
    expect(screen.queryByRole("button", { name: /^P1 / })).not.toBeInTheDocument();
  });

  it("distinguishes an empty project from filtered results", () => {
    render(<Harness groups={[]} />);
    expect(screen.getByText("No approved Main Line items are available for this project.")).toBeVisible();
    expect(screen.queryByText("No Main Lines match your search.")).not.toBeInTheDocument();
  });

  it("defaults to priority and restores its search and expansion after full-basket navigation", async () => {
    install(); const user = userEvent.setup(); workspace();
    expect(await screen.findByRole("heading", { name: "Main Lines by priority" })).toBeVisible();
    expect(screen.getByRole("button", { name: "By priority" })).toHaveAttribute("aria-pressed", "true");
    await user.click(panel("P2"));
    await user.type(screen.getByRole("searchbox", { name: "Search Main Lines" }), "Special cove");
    await user.click(screen.getByRole("button", { name: /Open basket POP.*Special cove/ }));
    expect(screen.getByText("Full basket basket-mixed in project-one")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Back to main baskets/ }));
    expect(screen.getByRole("searchbox", { name: "Search Main Lines" })).toHaveValue("Special cove");
    await user.clear(screen.getByRole("searchbox", { name: "Search Main Lines" }));
    expect(panel("P2")).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps independent mode and priority search preferences", async () => {
    install(); const user = userEvent.setup(); workspace();
    await user.type(await screen.findByRole("searchbox", { name: "Search Main Lines" }), "Bedroom");
    await user.click(screen.getByRole("button", { name: "By execution mode" }));
    await user.type(screen.getByRole("searchbox", { name: "Search baskets" }), "POP");
    await user.click(screen.getByRole("button", { name: "By priority" }));
    expect(screen.getByRole("searchbox", { name: "Search Main Lines" })).toHaveValue("Bedroom");
    await user.click(screen.getByRole("button", { name: "By execution mode" }));
    expect(screen.getByRole("searchbox", { name: "Search baskets" })).toHaveValue("POP");
  });

  it.each(["missing", "invalid"])("reports %s metadata without classifying it as unset and retains mode access", async kind => {
    const installed = install(); const valid = structuredClone(installed.data);
    const broken = structuredClone(valid);
    if (kind === "missing") delete broken.priorityGroups;
    else broken.priorityGroups![0]!.lineCount = 99;
    installed.setData(broken);
    const user = userEvent.setup(); workspace();
    expect(await screen.findByText(/Main Line priorities are unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Priority not set / })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "By execution mode" }));
    expect(screen.getByRole("heading", { name: "Main baskets" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "By priority" }));
    installed.setData(valid);
    await user.click(screen.getByRole("button", { name: "Refresh baskets" }));
    expect(await screen.findByRole("heading", { name: "Main Lines by priority" })).toBeVisible();
  });

  it("moves a refreshed item to its new priority without changing its basket identity", async () => {
    const installed = install(); const user = userEvent.setup(); workspace();
    await screen.findByRole("heading", { name: "Main Lines by priority" });
    const next = structuredClone(installed.data);
    const moved = next.priorityGroups![0]!.items.shift()!;
    next.priorityGroups![0]!.lineCount--;
    moved.resolution.value = "P2";
    next.priorityGroups![1]!.items.push(moved); next.priorityGroups![1]!.lineCount++;
    installed.setData(next);
    await user.click(screen.getByRole("button", { name: "Refresh source" }));
    await waitFor(() => expect(panel("P2")).toHaveTextContent("2 items"));
    await user.click(panel("P2"));
    const row = within(screen.getByRole("table", { name: "P2 Main Lines" })).getByRole("button", { name: /Open basket POP.*Standard POP/ });
    await user.click(row);
    expect(screen.getByText("Full basket basket-mixed in project-one")).toBeVisible();
  });

  it("resets view state when the project changes even without a parent key", async () => {
    const installed = install(); const user = userEvent.setup(); workspace();
    await user.type(await screen.findByRole("searchbox", { name: "Search Main Lines" }), "Bedroom");
    await user.click(screen.getByRole("button", { name: "By execution mode" }));
    const other = structuredClone(installed.data); other.projectId = "project-two";
    other.priorityGroups!.forEach(group => group.items.forEach(item => { item.mainLineName = `Second project ${item.mainLineName}`; }));
    installed.setData(other);
    await user.click(screen.getByRole("button", { name: "Open second project" }));
    expect(await screen.findByRole("searchbox", { name: "Search Main Lines" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "By priority" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Second project Standard POP finish")).toBeVisible();
  });

  it("rejects a response for another project before showing any basket or priority data", async () => {
    const installed = install(); installed.setData({ ...installed.data, projectId: "foreign-project" }); workspace();
    expect(await screen.findByText("Main baskets could not be loaded.")).toBeVisible();
    expect(screen.queryByText("Standard POP finish")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "By priority" })).not.toBeInTheDocument();
  });

  it("reports failed refreshes without converting existing priorities to unset", async () => {
    const installed = install(); const user = userEvent.setup(); workspace();
    await screen.findByRole("heading", { name: "Main Lines by priority" });
    installed.setFailed(true); await user.click(screen.getByRole("button", { name: "Refresh source" }));
    expect(await screen.findByText("Priority request failed.")).toBeVisible();
    expect(screen.queryByText("Standard POP finish")).not.toBeInTheDocument();
    installed.setFailed(false); await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Standard POP finish")).toBeVisible();
  });
});
