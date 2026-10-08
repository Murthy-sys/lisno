import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizationSnapshot } from "../../api/authorization-contract";
import type { ProcurementProject } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { createProcurementGalleryFixture } from "../../test/fixtures/enterpriseProcurementGalleryData";
import { server } from "../../test/server";
import { procurementKeys } from "./procurementApi";
import { procurementProjectsIntegrityError } from "./procurementPresentation";
import { ProcurementWorkspace } from "./ProcurementWorkspace";

const authState = vi.hoisted(() => ({ authorization: null as AuthorizationSnapshot | null }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => authState }));
beforeEach(() => { authState.authorization = authorizationFor("procurement"); });

function install(initial = createProcurementGalleryFixture()) {
  let projects = initial;
  let error: { status: number; message: string } | null = null;
  const requests: string[] = [];
  server.use(http.all("/api/v1/procurement/projects", ({ request }) => {
    requests.push(request.method);
    return error ? HttpResponse.json({ error: { code: "GALLERY_UNAVAILABLE", message: error.message } }, { status: error.status })
      : HttpResponse.json({ data: projects });
  }));
  return { requests, setProjects: (next: ProcurementProject[]) => { projects = next; },
    setError: (next: typeof error) => { error = next; } };
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const content = <QueryClientProvider client={queryClient}><MemoryRouter><ProcurementWorkspace /></MemoryRouter></QueryClientProvider>;
  const view = render(content);
  return { ...view, queryClient, refresh: async () => {
    await act(async () => { await queryClient.invalidateQueries({ queryKey: procurementKeys.projects }); });
  } };
}

const firstCard = () => screen.findByRole("article", { name: "Aurora Villa" });
const summary = () => screen.getByRole("region", { name: "Procurement portfolio summary" });
const cards = () => screen.queryAllByRole("article");
function expectAmount(card: HTMLElement, label: string, value: string) {
  expect(within(card).getByText(label).closest("dt")?.parentElement).toHaveTextContent(value);
}

describe("Procurement project gallery", () => {
  it("reconciles unequal projects, real occurrence counts, opened date and client metadata", async () => {
    const data = createProcurementGalleryFixture();
    // A repeated catalogue item in a different room remains a distinct selected occurrence.
    data[0]!.sections[0]!.items[2]!.catalogueId = data[0]!.sections[0]!.items[0]!.catalogueId;
    expect(procurementProjectsIntegrityError(data)).toBeNull();
    install(data); mount();
    const first = await firstCard();
    expect(within(summary()).getByText("3")).toBeVisible();
    expect(within(summary()).getByText("₹87,050.00")).toBeVisible();
    expect(summary()).toHaveTextContent(/all projects/i);
    expect(within(first).getByLabelText("6 selected items")).toBeVisible();
    expect(within(first).getByText("3 selected Estimate sections")).toBeVisible();
    expect(within(first).getByLabelText("Procurement opened 2 Oct 2026")).toHaveAttribute("datetime", "2026-10-02T09:00:00.000Z");
    expect(within(first).getByLabelText("Client: Asha Rao")).toBeVisible();
    expect(within(first).getByText("Estimate v4")).toBeVisible();
    expectAmount(first, "Selected estimate value", "₹1,970.00");
    expectAmount(first, "Recorded spend", "₹1,250.00");
    expectAmount(first, "Remaining selected value", "₹720.00");
    const second = cards()[1]!;
    expect(within(second).getByLabelText("1 selected item")).toBeVisible();
    expectAmount(second, "Selected estimate value", "₹85,000.00");
    expectAmount(second, "Recorded spend", "₹85,000.00");
    expectAmount(second, "Remaining selected value", "₹0.00");
    expect(within(second).getByLabelText("Client: Dev Mehta and Kavya Mehta")).toBeVisible();
    const third = cards()[2]!;
    expectAmount(third, "Selected estimate value", "₹80.00");
    expectAmount(third, "Recorded spend", "₹125.00");
    expectAmount(third, "Remaining selected value", "-₹45.00");
    expect(within(third).queryByLabelText(/^Client:/)).not.toBeInTheDocument();
    expect(cards().map((card) => within(card).getByText("Design approved"))).toHaveLength(3);
  });

  it("filters trimmed case-insensitive names and task status locally while preserving full-list summaries", async () => {
    const installed = install(); const user = userEvent.setup(); mount(); await firstCard();
    const input = screen.getByRole("searchbox", { name: "Search projects" });
    const status = screen.getByRole("combobox", { name: "Project status" });
    await user.type(input, "  aUrOrA  ");
    expect(cards()).toHaveLength(1);
    expect(screen.getByText("1 of 3 projects")).toBeVisible();
    expect(summary()).toHaveTextContent("₹87,050.00");
    await user.selectOptions(status, "completed");
    expect(cards()).toHaveLength(0);
    expect(screen.getByText("0 of 3 projects")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(input).toHaveValue(""); expect(status).toHaveValue("all");
    expect(cards()).toHaveLength(3);
    for (const [value, name] of [["open", "Northern Courtyard Residence and Upper Floor Renovation"], ["in_progress", "Aurora Villa"], ["completed", "Cedar Studio"]]) {
      await user.selectOptions(status, value!);
      expect(cards()).toHaveLength(1);
      expect(screen.getByRole("article", { name })).toBeVisible();
      expect(summary()).toHaveTextContent("₹87,050.00");
    }
    expect(installed.requests).toEqual(["GET"]);
  });

  it("supports keyboard clear/reset and keeps one native project link per card", async () => {
    const installed = install(); const user = userEvent.setup(); mount(); await firstCard();
    const input = screen.getByRole("searchbox", { name: "Search projects" });
    input.focus(); await user.keyboard("cedar");
    const clear = screen.getByRole("button", { name: "Clear search" });
    clear.focus(); await user.keyboard("{Enter}");
    expect(input).toHaveFocus(); expect(input).toHaveValue("");
    expect(cards()).toHaveLength(3);
    screen.getByRole("combobox", { name: "Project status" }).focus();
    await user.tab();
    expect(screen.getByRole("link", { name: "View procurement items for Aurora Villa" })).toHaveFocus();
    expect(cards().map((card) => card.querySelectorAll("a,button,input,select").length)).toEqual([1, 1, 1]);
    expect(installed.requests).toEqual(["GET"]);
  });

  it("assigns decorative covers by stable identity across filtering, renaming and reordered refresh", async () => {
    const data = createProcurementGalleryFixture(); const installed = install(data); const user = userEvent.setup();
    const view = mount(); await firstCard();
    const sourceById = new Map(cards().map((card) => [card.querySelector("a")!.getAttribute("href"), card.querySelector("img")!.getAttribute("src")]));
    for (const card of cards()) expect(card.querySelector("img")).toHaveAttribute("alt", "");
    expect(screen.getByText("Representative interiors")).toBeVisible();
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "Cedar");
    expect(cards()[0]!.querySelector("img")!.getAttribute("src")).toBe(sourceById.get("/procurement/projects/project-gallery-cedar"));
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    const renamed = data.map((project) => ({ ...project, projectName: `${project.projectName} revised` })).reverse();
    installed.setProjects(renamed); await view.refresh();
    await screen.findByRole("article", { name: "Aurora Villa revised" });
    expect(cards().map((card) => card.querySelector("a")!.getAttribute("href")))
      .toEqual(["/procurement/projects/project-gallery-cedar", "/procurement/projects/project-gallery-north", "/procurement/projects/project-one"]);
    for (const card of cards()) expect(card.querySelector("img")!.getAttribute("src")).toBe(sourceById.get(card.querySelector("a")!.getAttribute("href")));
    expect(installed.requests).toEqual(["GET", "GET"]);
  });

  it("retains badges, values and navigation when a cover fails", async () => {
    const installed = install(); mount(); const card = await firstCard();
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")).not.toBeInTheDocument();
    expect(card.querySelector(".procurement-gallery-card__cover-placeholder")).toBeInTheDocument();
    expect(within(card).getByText("Design approved")).toBeVisible();
    expectAmount(card, "Remaining selected value", "₹720.00");
    expect(within(card).getByRole("link", { name: "View procurement items for Aurora Villa" })).toHaveAttribute("href", "/procurement/projects/project-one");
    expect(installed.requests).toEqual(["GET"]);
  });

  it("keeps same-named projects and encoded IDs separate", async () => {
    const data = createProcurementGalleryFixture().slice(0, 2);
    const second = data[1]!;
    second.projectName = "Aurora Villa";
    second.projectId = "project/north";
    second.sections[0]!.items[0]!.expenses[0]!.projectId = second.projectId;
    install(data); mount();
    await screen.findAllByRole("article", { name: "Aurora Villa" });
    const links = screen.getAllByRole("link", { name: "View procurement items for Aurora Villa" });
    expect(links.map((link) => link.getAttribute("href")))
      .toEqual(["/procurement/projects/project-one", "/procurement/projects/project%2Fnorth"]);
    expect(within(cards()[0]!).getByLabelText("Client: Asha Rao")).toBeVisible();
    expect(within(cards()[1]!).getByLabelText("Client: Dev Mehta and Kavya Mehta")).toBeVisible();
    expectAmount(cards()[0]!, "Selected estimate value", "₹1,970.00");
    expectAmount(cards()[1]!, "Selected estimate value", "₹85,000.00");
  });

  it("renders large paise-precise card and portfolio values without replacing their digits", async () => {
    install(createProcurementGalleryFixture(true)); mount(); await firstCard();
    expectAmount(cards()[1]!, "Selected estimate value", "₹1,23,45,67,890.12");
    expectAmount(cards()[1]!, "Recorded spend", "₹1,23,45,67,890.12");
    expectAmount(cards()[1]!, "Remaining selected value", "₹0.00");
    expect(summary()).toHaveTextContent("₹1,23,45,69,940.12");
  });

  it("omits missing legacy clients and invalid dates without inventing metadata", async () => {
    const data = createProcurementGalleryFixture();
    data[0]!.clientName = "  "; data[0]!.openedAt = "invalid-date";
    delete data[1]!.clientName; data[1]!.openedAt = "";
    install(data); mount(); await firstCard();
    expect(screen.queryByLabelText(/^Client:/)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Procurement opened/)).toHaveLength(1);
    expect(document.body).not.toHaveTextContent("Invalid Date");
    expect(summary()).toHaveTextContent("₹87,050.00");
  });

  it("keeps valid large individual amounts while marking an overflowing portfolio unavailable", async () => {
    const data = createProcurementGalleryFixture().slice(1).map((project) => ({ ...project,
      sections: project.sections.map((section) => ({ ...section, estimatedAmountPaise: Number.MAX_SAFE_INTEGER,
        actualSpendPaise: 0, items: section.items.map((item) => ({ ...item,
          estimatedAmountPaise: Number.MAX_SAFE_INTEGER, actualSpendPaise: 0, expenses: [] })) })) }));
    expect(procurementProjectsIntegrityError(data)).toBeNull();
    install(data); mount();
    await screen.findByRole("article", { name: "Cedar Studio" });
    expect(cards()).toHaveLength(2);
    expect(within(summary()).getByText("Unavailable")).toBeVisible();
    expect(within(summary()).queryByText("₹0.00")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^View procurement items for/ })).toHaveLength(2);
  });

  it("renders zero summaries for an empty successful response", async () => {
    install([]); mount();
    await screen.findByText(/automatically after their Design plan is approved/i);
    expect(summary()).toHaveTextContent("0");
    expect(summary()).toHaveTextContent("₹0.00");
    expect(cards()).toHaveLength(0);
  });

  it("withholds counts and summaries during initial loading", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.get("/api/v1/procurement/projects", async () => { await pending; return HttpResponse.json({ data: createProcurementGalleryFixture() }); }));
    mount();
    expect(await screen.findByText("Loading procurement projects…")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Procurement portfolio summary" })).not.toBeInTheDocument();
    expect(cards()).toHaveLength(0);
    await act(async () => { release(); }); await firstCard();
  });

  it.each([403, 503])("hides cached project identities, clients and summaries after a %s refresh, then retries", async (status) => {
    const installed = install(); const user = userEvent.setup(); const view = mount(); await firstCard();
    installed.setError({ status, message: "Synthetic gallery refresh unavailable." }); await view.refresh();
    await screen.findByText("Synthetic gallery refresh unavailable.");
    expect(cards()).toHaveLength(0);
    expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();
    expect(screen.queryByText("3 projects")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Procurement portfolio summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search projects" })).not.toBeInTheDocument();
    installed.setError(null); await user.click(screen.getByRole("button", { name: "Try again" })); await firstCard();
    expect(installed.requests).toEqual(["GET", "GET", "GET"]);
  });

  it("hides all financial and client presentation when a refreshed purchase has invalid lineage", async () => {
    const installed = install(); const view = mount(); await firstCard();
    const invalid = createProcurementGalleryFixture(); invalid[0]!.sections[0]!.items[0]!.expenses[0]!.projectId = "different-project";
    installed.setProjects(invalid); await view.refresh();
    expect(await screen.findByText(/does not match this project, section, or Estimate item/i)).toBeVisible();
    expect(cards()).toHaveLength(0);
    expect(screen.queryByLabelText(/^Client:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Procurement portfolio summary" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh procurement" })).toBeEnabled();
  });

  it("never fetches project data without workspace permission", async () => {
    const installed = install(); authState.authorization = authorizationFor("procurement", []); mount();
    expect(await screen.findByText("You do not have permission to view the procurement workspace.")).toBeVisible();
    expect(installed.requests).toEqual([]);
    expect(screen.queryByRole("region", { name: "Procurement portfolio summary" })).not.toBeInTheDocument();
  });
});
