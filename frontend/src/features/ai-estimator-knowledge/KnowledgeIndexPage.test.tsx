import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { server } from "../../test/server";
import { KnowledgeBaseIndexPage } from "./KnowledgeBaseIndexPage";
import { KnowledgeSafetyNotice } from "./KnowledgeSafetyNotice";
import * as knowledgeApi from "./knowledgeApi";
import type {
  KnowledgeBasket,
  KnowledgeItemDetail,
  KnowledgeItemListItem,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeSubBasket
} from "./knowledgeTypes";

const authState = vi.hoisted(() => ({
  create: true,
  update: true,
  lifecycle: true
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "super-admin-1",
      name: "Super Admin",
      email: "admin@lisno.example",
      role: "super_admin"
    },
    authorization: {},
    sessionExpired: false
  })
}));

vi.mock("../../auth/authorization", () => ({
  hasFrontendPermission: (_authorization: unknown, permission: string) =>
    permission === "ai_estimator_knowledge.configuration.lifecycle"
      ? authState.lifecycle
      : permission === "ai_estimator_knowledge.configuration.update"
        ? authState.update
        : permission === "ai_estimator_knowledge.configuration.create"
          ? authState.create
          : true
}));

vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    listKnowledgeItems: vi.fn(),
    listKnowledgeBaskets: vi.fn(),
    listKnowledgeSubBaskets: vi.fn(),
    listKnowledgeMasters: vi.fn(),
    getKnowledgeBasketDeletionImpact: vi.fn(),
    getKnowledgeItem: vi.fn(),
    updateKnowledgeMainLine: vi.fn(),
    updateKnowledgeSubBasket: vi.fn()
  };
});

const timestamp = "2026-09-25T08:00:00.000Z";
const pagination = { limit: 100, offset: 0, total: 0, hasMore: false } as const;
const actor = {
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: timestamp,
  updatedAt: timestamp
} as const;

const carpentry: KnowledgeBasket = {
  ...actor,
  id: "basket-carpentry",
  name: "Carpentry",
  description: "Wardrobes, panelling and loose furniture",
  displayOrder: 0,
  status: "active",
  version: 3
};
/* Different name, description state and version, so no assertion can pass by
   reading the wrong basket. */
const plumbing: KnowledgeBasket = {
  ...actor,
  id: "basket-plumbing",
  name: "Plumbing",
  description: null,
  displayOrder: 1,
  status: "active",
  version: 8
};

function master(
  masterType: KnowledgeMasterType,
  id: string,
  name: string,
  overrides: Partial<KnowledgeMaster> = {}
): KnowledgeMaster {
  return {
    ...actor,
    id,
    masterType,
    code: id.toUpperCase(),
    name,
    description: null,
    displayOrder: 0,
    status: "active",
    version: 1,
    ...overrides
  };
}

const highPriority = master("priorities", "priority-high", "High", { semanticTier: "high" });
const lowPriority = master("priorities", "priority-low", "Low", { semanticTier: "low" });
const squareFoot = master("uoms", "uom-sqft", "Square foot", { decimalScale: 2 });
const runningMetre = master("uoms", "uom-rmt", "Running metre", { decimalScale: 2 });

function listItem(overrides: Partial<KnowledgeItemListItem> = {}): KnowledgeItemListItem {
  return {
    ...actor,
    id: "line-panel",
    itemType: "main_line",
    completionRequired: false,
    basketId: carpentry.id,
    basketName: carpentry.name,
    mainLineId: "line-panel",
    mainLineName: "Wall panelling",
    description: null,
    status: "draft",
    activeRevisionId: null,
    draftRevisionId: "revision-1",
    revisionNumber: 1,
    uomId: squareFoot.id,
    priorityId: highPriority.id,
    modeIds: [],
    surfaceIds: [],
    vendorIds: [],
    completeness: { percentage: 40, sections: [], blockers: [], warnings: [] },
    allowedActions: [],
    version: 2,
    ...overrides
  };
}

const panelling = listItem();
const pipework = listItem({
  id: "line-pipes",
  basketId: plumbing.id,
  basketName: plumbing.name,
  mainLineId: "line-pipes",
  mainLineName: "Concealed pipework",
  uomId: runningMetre.id,
  priorityId: lowPriority.id,
  completeness: { percentage: 90, sections: [], blockers: [], warnings: [] }
});

function detail(item: KnowledgeItemListItem, overrides: Partial<KnowledgeItemDetail> = {}): KnowledgeItemDetail {
  return {
    ...item,
    activeRevision: null,
    draftRevision: null,
    blockers: [],
    warnings: [],
    ...overrides
  };
}

function subBasket(basket: KnowledgeBasket, id: string, name: string, version: number): KnowledgeSubBasket {
  return { ...actor, id, name, basketId: basket.id, displayOrder: 0, version };
}

function mockMasters(catalogs: Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>) {
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => {
    const items = catalogs[type] ?? [];
    return { items, pagination: { ...pagination, total: items.length } };
  });
}

function WorkspaceStub() {
  const { itemId } = useParams();
  return <h1>Workspace for {itemId}</h1>;
}

function renderIndex() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/configuration/estimation"]}>
        <Routes>
          <Route
            path="/admin/configuration/estimation"
            element={<main><KnowledgeBaseIndexPage /></main>}
          />
          <Route
            path="/admin/configuration/estimation/items/:itemId"
            element={<WorkspaceStub />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function basketPanel(name: string) {
  return screen.getByRole("heading", { level: 2, name }).closest("section")!;
}

/* The idle Button content; its busy label stays hidden until a mutation runs. */
function visibleLabel(button: HTMLElement) {
  return button.querySelector(".ui-button__content")?.textContent;
}

function itemCard(name: string) {
  return screen.getByRole("link", { name }).closest("article")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.create = true;
  authState.update = true;
  authState.lifecycle = true;
  vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({
    items: [carpentry, plumbing],
    pagination: { ...pagination, total: 2 }
  });
  vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
    items: [panelling, pipework],
    pagination: { ...pagination, limit: 20, total: 2 }
  });
  vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockResolvedValue({ items: [], pagination });
  mockMasters({ priorities: [highPriority, lowPriority], uoms: [squareFoot, runningMetre] });
  vi.mocked(knowledgeApi.getKnowledgeBasketDeletionImpact).mockImplementation(async (basketId) => ({
    basketId,
    basketName: basketId === plumbing.id ? plumbing.name : carpentry.name,
    version: basketId === plumbing.id ? plumbing.version : carpentry.version,
    mainLineCount: 1,
    historicalReferenceCount: 0,
    bootstrapOwned: false
  }));
});

describe("Knowledge Base index page", () => {
  it("opens Main Basket request review from Configuration", async () => {
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/basket-requests", () =>
      HttpResponse.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } })));
    const user = userEvent.setup();
    renderIndex();
    const trigger = screen.getByRole("button", { name: "Main Basket requests" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Main Basket requests" })).not.toBeInTheDocument();
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("No pending Main Basket requests.")).toBeVisible();
  });

  it("scopes the page root to the index modifier", async () => {
    const { container } = renderIndex();

    expect(await screen.findByRole("heading", { level: 1, name: "AI Estimator Knowledge Base" })).toBeVisible();
    const root = container.querySelector("main > .knowledge-page");
    expect(root).toHaveClass("knowledge-page", "knowledge-page--index");
  });

  it("dismisses the isolation notice for this visit only", async () => {
    const user = userEvent.setup();
    renderIndex();

    const notice = await screen.findByRole("region", { name: "Knowledge base isolation notice" });
    expect(notice).toHaveTextContent(
      "Knowledge-base changes do not modify current estimates or the existing Sales estimate builder."
    );
    const dismiss = within(notice).getByRole("button", { name: "Dismiss notice" });
    expect(dismiss).toHaveAttribute("title", "Dismiss notice");
    expect(dismiss).toHaveClass("knowledge-notice-dismiss");
    expect(visibleLabel(dismiss)).toBe("");

    await user.click(dismiss);

    expect(screen.queryByRole("region", { name: "Knowledge base isolation notice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss notice" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "AI Estimator Knowledge Base" })).toBeVisible();
  });

  it("keeps the shared notice without a dismiss control when no handler is given", () => {
    render(<KnowledgeSafetyNotice />);

    const notice = screen.getByRole("region", { name: "Knowledge base isolation notice" });
    expect(notice).toHaveTextContent(
      "Knowledge-base changes do not modify current estimates or the existing Sales estimate builder."
    );
    expect(within(notice).queryByRole("button")).not.toBeInTheDocument();
    expect(notice.querySelector(".ui-inline-message__action")).toBeNull();
  });

  it("renders a basket description only when the loaded basket record has one", async () => {
    const orphan = listItem({
      id: "line-orphan",
      basketId: "basket-unloaded",
      basketName: "Unloaded basket",
      mainLineId: "line-orphan",
      mainLineName: "Orphaned item"
    });
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({
      items: [carpentry, plumbing, { ...plumbing, id: "basket-blank", name: "Blank notes", description: "   ", displayOrder: 2 }],
      pagination: { ...pagination, total: 3 }
    });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
      items: [panelling, pipework, orphan],
      pagination: { ...pagination, limit: 20, total: 3 }
    });
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Carpentry" });
    const carpentryPanel = basketPanel("Carpentry");
    const description = carpentryPanel.querySelector(".knowledge-basket-panel__description");
    expect(description).toHaveTextContent(/^Wardrobes, panelling and loose furniture$/u);
    expect(description?.closest(".knowledge-basket-panel__heading")).toContainElement(
      within(carpentryPanel).getByRole("heading", { level: 2, name: "Carpentry" })
    );
    expect(carpentryPanel.querySelector(".knowledge-basket-panel__icon")).toHaveAttribute("aria-hidden", "true");

    for (const name of ["Plumbing", "Blank notes", "Unloaded basket"]) {
      const panel = basketPanel(name);
      expect(panel.querySelector(".knowledge-basket-panel__description")).toBeNull();
      expect(panel.querySelector(".knowledge-basket-panel__icon")).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.getAllByText("Wardrobes, panelling and loose furniture")).toHaveLength(1);
  });

  it("keeps the named basket add buttons with plus icons", async () => {
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Plumbing" });
    const panel = basketPanel("Plumbing");
    for (const name of ["Add estimation item to Plumbing", "Add temporary item to Plumbing"]) {
      const button = within(panel).getByRole("button", { name });
      expect(button.querySelector(".ui-button__icon svg")).not.toBeNull();
    }
  });

  it("discloses Sub-Baskets before their items and includes empty groups", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
      items: [{ ...panelling, subBasketId: "sub-finish", subBasketName: "Paint finishes" }, pipework],
      pagination: { ...pagination, limit: 20, total: 2 }
    });
    vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockImplementation(async (basketId) => ({
      items: basketId === carpentry.id ? [
        { ...carpentry, id: "sub-finish", name: "Paint finishes", basketId: carpentry.id },
        { ...carpentry, id: "sub-empty", name: "Empty finishes", basketId: carpentry.id }
      ] : [],
      pagination: { ...pagination, total: basketId === carpentry.id ? 2 : 0 }
    }));
    renderIndex();
    const group = await screen.findByRole("button", { name: "Paint finishes" });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Wall panelling" })).not.toBeInTheDocument();
    group.focus();
    await user.keyboard("{Enter}");
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Wall panelling" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Empty finishes" }));
    expect(screen.getByText("No items in this Sub-Basket yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Items directly under Main Basket" })).toBeVisible();
  });

  it("opens the basket editor from the icon-only Edit button for the right basket", async () => {
    const user = userEvent.setup();
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Plumbing" });
    const edit = within(basketPanel("Plumbing")).getByRole("button", { name: "Edit basket Plumbing" });
    expect(edit).toHaveAttribute("title", "Edit basket");
    expect(edit).toHaveClass("knowledge-icon-action", "ui-button--quiet");
    expect(visibleLabel(edit)).toBe("");
    expect(screen.queryByRole("button", { name: "Edit basket" })).not.toBeInTheDocument();

    await user.click(edit);

    const dialog = screen.getByRole("dialog", { name: "Edit main basket" });
    expect(within(dialog).getByRole("textbox", { name: "Basket name" })).toHaveValue("Plumbing");
    expect(within(dialog).getByRole("spinbutton", { name: "Display order" })).toHaveValue(1);
  });

  it("opens the delete impact dialog from the icon-only Delete button for the right basket", async () => {
    const user = userEvent.setup();
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Carpentry" });
    const remove = within(basketPanel("Carpentry")).getByRole("button", { name: "Delete Carpentry" });
    expect(remove).toHaveAttribute("title", "Delete basket");
    expect(remove).toHaveClass(
      "knowledge-icon-action",
      "knowledge-icon-action--danger",
      "ui-button--destructive-outline"
    );
    expect(visibleLabel(remove)).toBe("");

    await user.click(remove);

    const dialog = await screen.findByRole("alertdialog", { name: "Delete basket?" });
    expect(dialog).toHaveTextContent("“Carpentry” and everything inside it will be permanently deleted.");
    await waitFor(() => expect(knowledgeApi.getKnowledgeBasketDeletionImpact).toHaveBeenCalledWith(carpentry.id));
    expect(knowledgeApi.getKnowledgeBasketDeletionImpact).not.toHaveBeenCalledWith(plumbing.id);
  });

  it("hides the icon-only basket actions without their permissions", async () => {
    authState.update = false;
    authState.lifecycle = false;
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Carpentry" });
    expect(screen.queryByRole("button", { name: /^Edit basket/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Carpentry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Plumbing" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add temporary item to Carpentry" })).toBeVisible();
  });

  it("submits the search from the toolbar Search button and toggles the Filters disclosure", async () => {
    const user = userEvent.setup();
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Carpentry" });
    const search = screen.getByRole("button", { name: "Search" });
    expect(search).toHaveAttribute("type", "submit");
    expect(search).toHaveTextContent(/^$/u);
    expect(search.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    await user.type(screen.getByRole("searchbox", { name: "Search Basket or Main Line" }), "panel");
    await user.click(search);

    await waitFor(() => expect(knowledgeApi.listKnowledgeItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "panel", limit: 20, offset: 0 })
    ));
    const applied = screen.getByRole("list", { name: "Applied filters" });
    expect(within(applied).getByText("panel")).toBeVisible();

    const filters = screen.getByRole("button", { name: "Filters" });
    expect(filters).toHaveAttribute("type", "button");
    expect(filters).toHaveTextContent(/^$/u);
    expect(filters.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(filters).toHaveAttribute("aria-controls", "knowledge-advanced-filters");
    expect(filters).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "Priority" })).not.toBeInTheDocument();
    await user.click(filters);
    expect(filters).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Priority" })).toBeVisible();
    await user.click(filters);
    expect(filters).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "Priority" })).not.toBeInTheDocument();
  });

  it("submits search with Enter and names the icon actions on keyboard focus and hover", async () => {
    const user = userEvent.setup();
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Carpentry" });
    await user.type(screen.getByRole("searchbox", { name: "Search Basket or Main Line" }), "pipe{Enter}");

    await waitFor(() => expect(knowledgeApi.listKnowledgeItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "pipe", limit: 20, offset: 0 })
    ));
    expect(within(screen.getByRole("list", { name: "Applied filters" })).getByText("pipe")).toBeVisible();

    const filters = screen.getByRole("button", { name: "Filters" });
    const search = screen.getByRole("button", { name: "Search" });
    await user.tab();
    expect(filters).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent(/^Filters$/u);
    expect(filters).toHaveAccessibleDescription("Filters");
    await user.tab();
    expect(search).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent(/^Search$/u);
    expect(search).toHaveAccessibleDescription("Search");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(filters);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/^Filters$/u);
    await user.unhover(filters);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.hover(search);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/^Search$/u);
    await user.unhover(search);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("describes the selected draft-filter count without changing the Filters name or applied state", async () => {
    const user = userEvent.setup();
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Carpentry" });
    const filters = screen.getByRole("button", { name: "Filters" });
    expect(filters).not.toHaveAttribute("aria-describedby");
    await user.click(filters);
    const requestCount = vi.mocked(knowledgeApi.listKnowledgeItems).mock.calls.length;
    await user.selectOptions(screen.getByRole("combobox", { name: "Priority" }), highPriority.id);
    expect(filters).toHaveAccessibleName("Filters");
    expect(filters).toHaveAccessibleDescription("1 filter selected");
    const badge = document.querySelector(".knowledge-filter-count");
    expect(badge).toHaveTextContent(/^1$/u);
    expect(badge).toHaveAttribute("aria-hidden", "true");

    await user.selectOptions(screen.getByRole("combobox", { name: "Basket" }), carpentry.id);
    expect(filters).toHaveAccessibleDescription("2 filters selected");
    expect(badge).toHaveTextContent(/^2$/u);
    expect(knowledgeApi.listKnowledgeItems).toHaveBeenCalledTimes(requestCount);
    expect(screen.queryByRole("list", { name: "Applied filters" })).not.toBeInTheDocument();
    await user.hover(filters);
    expect(filters).toHaveAccessibleDescription("2 filters selected Filters");
    expect(screen.getByRole("tooltip")).toHaveTextContent(/^Filters$/u);
    await user.unhover(filters);

    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(knowledgeApi.listKnowledgeItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ priorityId: highPriority.id, basketId: carpentry.id, limit: 20, offset: 0 })
    ));
    const applied = screen.getByRole("list", { name: "Applied filters" });
    expect(within(applied).getByText("High")).toBeVisible();
    expect(within(applied).getByText("Carpentry")).toBeVisible();
    await user.click(within(applied).getByRole("button", { name: "Remove Priority filter" }));
    expect(filters).toHaveAccessibleDescription("1 filter selected");
    expect(within(applied).queryByText("High")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(filters).not.toHaveAttribute("aria-describedby");
    expect(document.querySelector(".knowledge-filter-count")).toBeNull();
    expect(screen.queryByRole("list", { name: "Applied filters" })).not.toBeInTheDocument();
  });

  it("gives each card the priority and unit names from the loaded catalogs", async () => {
    renderIndex();

    await screen.findByRole("link", { name: "Concealed pipework" });
    const panellingCard = itemCard("Wall panelling");
    const pipeworkCard = itemCard("Concealed pipework");

    await waitFor(() => expect(panellingCard.querySelector('[data-metric="unit"]')).toHaveTextContent("Square foot"));
    expect(panellingCard.querySelector(".knowledge-priority-chip")).toHaveTextContent("High");
    expect(panellingCard.querySelector(".knowledge-priority-chip")).toHaveAttribute("data-tone", "high");
    expect(pipeworkCard.querySelector('[data-metric="unit"]')).toHaveTextContent("Running metre");
    expect(pipeworkCard.querySelector(".knowledge-priority-chip")).toHaveTextContent("Low");
    expect(pipeworkCard.querySelector(".knowledge-priority-chip")).toHaveAttribute("data-tone", "low");
    expect(panellingCard).not.toHaveTextContent("Running metre");
    expect(pipeworkCard).not.toHaveTextContent("Square foot");
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows loading values while the catalogs load and unavailable values after they fail", async () => {
    let failCatalogs: (error: Error) => void = () => undefined;
    const pendingCatalogs = new Promise<never>((_resolve, reject) => { failCatalogs = reject; });
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation((type) =>
      type === "priorities" || type === "uoms"
        ? pendingCatalogs
        : Promise.resolve({ items: [], pagination })
    );
    renderIndex();

    await screen.findByRole("link", { name: "Wall panelling" });
    const card = itemCard("Wall panelling");
    expect(card.querySelector('[data-metric="unit"]')).toHaveTextContent("…");
    expect(card.querySelector(".knowledge-priority-chip")).toHaveTextContent("…");

    failCatalogs(new Error("Catalog unavailable"));

    await waitFor(() => expect(card.querySelector('[data-metric="unit"]')).toHaveTextContent("Unit unavailable"));
    expect(card.querySelector(".knowledge-priority-chip")).toHaveTextContent("Priority unavailable");
    expect(card.querySelector(".knowledge-priority-chip")).toHaveAttribute("data-tone", "unavailable");
    expect(screen.getByText("Some filters are unavailable")).toBeVisible();
  });

  it("opens the item workspace from the card menu", async () => {
    const user = userEvent.setup();
    renderIndex();

    await screen.findByRole("link", { name: "Concealed pipework" });
    await user.click(screen.getByRole("button", { name: "More actions for Concealed pipework" }));
    await user.click(screen.getByRole("menuitem", { name: "Open item" }));

    expect(await screen.findByRole("heading", { name: "Workspace for line-pipes" })).toBeVisible();
  });

  it("renames an empty Sub-Basket by its parent and version while preserving the hierarchy", async () => {
    const user = userEvent.setup();
    const populated = subBasket(carpentry, "sub-populated", "Panel finishes", 3);
    const empty = subBasket(carpentry, "sub-empty", "Shared name", 7);
    const otherParent = subBasket(plumbing, "sub-plumbing", "Shared name", 12);
    let carpentryGroups = [populated, empty];
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
      items: [
        { ...panelling, subBasketId: populated.id, subBasketName: populated.name },
        { ...pipework, subBasketId: otherParent.id, subBasketName: otherParent.name }
      ],
      pagination: { ...pagination, limit: 20, total: 2 }
    });
    vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockImplementation(async (basketId) => {
      const items = basketId === carpentry.id ? carpentryGroups : [otherParent];
      return { items, pagination: { ...pagination, total: items.length } };
    });
    vi.mocked(knowledgeApi.updateKnowledgeSubBasket).mockImplementation(async (_basketId, _subBasketId, input) => {
      const renamed = { ...empty, name: input.name, version: 8 };
      carpentryGroups = [populated, renamed];
      return renamed;
    });
    renderIndex();

    await screen.findByRole("heading", { level: 2, name: "Carpentry" });
    const panel = basketPanel("Carpentry");
    const action = await within(panel).findByRole("button", { name: "Edit Sub-Basket name for Shared name" });
    expect(action).toHaveClass("knowledge-rename-pen");
    expect(action.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(action).toHaveTextContent("");
    expect(action.closest(".knowledge-sub-basket__name")).toContainElement(within(panel).getByRole("button", { name: "Shared name" }));
    expect(within(panel).getByRole("heading", { level: 3, name: "Shared name" })).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Edit Sub-Basket name for Panel finishes" })).toBeVisible();
    await user.click(action);
    const editor = screen.getByRole("dialog", { name: "Edit Sub-Basket name" });
    expect(editor).toHaveTextContent("Carpentry");
    const name = within(editor).getByRole("textbox", { name: "Sub-Basket name" });
    expect(name).toHaveValue("Shared name");
    expect(within(editor).getByRole("button", { name: "Save name" })).toBeDisabled();
    await user.clear(name);
    await user.type(name, "Empty finishes");
    await user.click(within(editor).getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(knowledgeApi.updateKnowledgeSubBasket).toHaveBeenCalledWith(
      carpentry.id, empty.id, { expectedVersion: 7, name: "Empty finishes", managementContext: "configuration" }
    ));
    expect(await within(panel).findByRole("button", { name: "Empty finishes" })).toBeVisible();
    expect(within(basketPanel("Plumbing")).getByRole("button", { name: "Shared name" })).toBeVisible();
    expect(knowledgeApi.updateKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Edit Sub-Basket name for Empty finishes" })).toHaveFocus());
  });

  it("does not rename a Sub-Basket from a copied item label when its catalog fails", async () => {
    const user = userEvent.setup();
    const group = subBasket(carpentry, "sub-finish", "Paint finishes", 4);
    let unavailable = true;
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
      items: [{ ...panelling, subBasketId: group.id, subBasketName: group.name }],
      pagination: { ...pagination, limit: 20, total: 1 }
    });
    vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockImplementation(async (basketId) => {
      if (basketId === carpentry.id && unavailable) throw new Error("Catalog unavailable");
      return { items: basketId === carpentry.id ? [group] : [], pagination: { ...pagination, total: basketId === carpentry.id ? 1 : 0 } };
    });
    renderIndex();

    await screen.findByRole("button", { name: "Paint finishes" });
    expect(screen.queryByRole("button", { name: "Edit Sub-Basket name for Paint finishes" })).not.toBeInTheDocument();
    unavailable = false;
    await user.click(screen.getByRole("button", { name: "Retry Sub-Baskets" }));
    expect(await screen.findByRole("button", { name: "Edit Sub-Basket name for Paint finishes" })).toBeVisible();
    expect(knowledgeApi.updateKnowledgeSubBasket).not.toHaveBeenCalled();
  });

  it("keeps a committed Sub-Basket rename safe when catalog refresh fails", async () => {
    const user = userEvent.setup();
    let group = subBasket(carpentry, "sub-empty", "Old group", 5);
    let reads = 0;
    vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockImplementation(async (basketId) => {
      if (basketId !== carpentry.id) return { items: [], pagination };
      reads += 1;
      if (reads === 2) throw new Error("Refresh unavailable");
      return { items: [group], pagination: { ...pagination, total: 1 } };
    });
    vi.mocked(knowledgeApi.updateKnowledgeSubBasket).mockImplementation(async (_basketId, _id, input) => {
      group = { ...group, name: input.name, version: 6 };
      return group;
    });
    renderIndex();

    await user.click(await screen.findByRole("button", { name: "Edit Sub-Basket name for Old group" }));
    const editor = screen.getByRole("dialog", { name: "Edit Sub-Basket name" });
    const name = within(editor).getByRole("textbox", { name: "Sub-Basket name" });
    await user.clear(name);
    await user.type(name, "New group");
    await user.click(within(editor).getByRole("button", { name: "Save name" }));
    expect(await within(editor).findByText("Sub-Basket saved")).toBeVisible();
    expect(name).toHaveValue("New group");
    expect(knowledgeApi.updateKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    await user.click(within(editor).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Edit Sub-Basket name" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New group" })).toBeVisible();
    expect(screen.getByText("Sub-Baskets could not be loaded. Known items remain available.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit Sub-Basket name for New group" })).not.toBeInTheDocument();
    expect(knowledgeApi.updateKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Retry Sub-Baskets" }));
    expect(await screen.findByRole("button", { name: "Edit Sub-Basket name for New group" })).toBeVisible();
    expect(knowledgeApi.updateKnowledgeSubBasket).toHaveBeenCalledTimes(1);
  });

  it("loads authoritative Main Line detail before renaming an Active temporary item", async () => {
    const user = userEvent.setup();
    const temporary = listItem({ id: "temporary-1", mainLineId: "temporary-1", mainLineName: "Site covering", itemType: "temporary", status: "active", version: 2 });
    let current = detail(temporary, { version: 11 });
    let listed = temporary;
    vi.mocked(knowledgeApi.listKnowledgeItems).mockImplementation(async () => ({ items: [listed], pagination: { ...pagination, limit: 20, total: 1 } }));
    vi.mocked(knowledgeApi.getKnowledgeItem).mockImplementation(async () => current);
    vi.mocked(knowledgeApi.updateKnowledgeMainLine).mockImplementation(async (_id, input) => {
      if (!input.name) throw new Error("A name is required for this test.");
      current = { ...current, mainLineName: input.name, version: 12 };
      listed = { ...listed, mainLineName: input.name, version: 12 };
      return current;
    });
    renderIndex();

    const titleLink = await screen.findByRole("link", { name: "Site covering" });
    titleLink.focus();
    await user.tab();
    const edit = screen.getByRole("button", { name: "Edit Main Line name for Site covering" });
    expect(edit).toHaveFocus();
    expect(edit).toHaveClass("knowledge-rename-pen");
    expect(edit.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(edit.closest(".knowledge-index-card__name")).toContainElement(titleLink);
    expect(within(itemCard("Site covering")).getByRole("heading", { level: 3, name: "Site covering" })).toBeVisible();
    await user.keyboard("{Enter}");
    await screen.findByRole("textbox", { name: "Main Line name" });
    const editor = screen.getByRole("dialog", { name: "Edit Main Line" });
    expect(knowledgeApi.getKnowledgeItem).toHaveBeenCalledWith(temporary.mainLineId);
    expect(editor).toHaveTextContent("Main Basket: Carpentry");
    const name = within(editor).getByRole("textbox", { name: "Main Line name" });
    expect(name).toHaveValue("Site covering");
    expect(within(editor).getByRole("button", { name: "Save Main Line" })).toBeDisabled();
    await user.clear(name);
    await user.type(name, "Finished site covering");
    await user.click(within(editor).getByRole("button", { name: "Save Main Line" }));

    await waitFor(() => expect(knowledgeApi.updateKnowledgeMainLine).toHaveBeenCalledWith(
      temporary.mainLineId, { expectedVersion: 11, name: "Finished site covering" }
    ));
    const link = await screen.findByRole("link", { name: "Finished site covering" });
    expect(link).toHaveAttribute("href", "/admin/configuration/estimation/items/temporary-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Main Line name for Finished site covering" })).toHaveFocus());
  });

  it("keeps the Main Line draft through duplicate and version conflicts without automatic resubmission", async () => {
    const user = userEvent.setup();
    let current = detail(panelling, { version: 4 });
    let listed = panelling;
    vi.mocked(knowledgeApi.listKnowledgeItems).mockImplementation(async () => ({ items: [listed], pagination: { ...pagination, limit: 20, total: 1 } }));
    vi.mocked(knowledgeApi.getKnowledgeItem).mockImplementation(async () => current);
    vi.mocked(knowledgeApi.updateKnowledgeMainLine)
      .mockRejectedValueOnce(new ApiError(409, "DUPLICATE_IDENTITY", "That name is already used."))
      .mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."))
      .mockImplementation(async (_id, input) => {
        if (!input.name) throw new Error("A name is required for this test.");
        current = { ...current, mainLineName: input.name, version: 7 };
        listed = { ...listed, mainLineName: input.name, version: 7 };
        return current;
      });
    renderIndex();

    await screen.findByRole("link", { name: "Wall panelling" });
    await user.click(screen.getByRole("button", { name: "Edit Main Line name for Wall panelling" }));
    await screen.findByRole("textbox", { name: "Main Line name" });
    const editor = screen.getByRole("dialog", { name: "Edit Main Line" });
    const name = within(editor).getByRole("textbox", { name: "Main Line name" });
    await user.clear(name);
    await user.type(name, "Entered title");
    await user.click(within(editor).getByRole("button", { name: "Save Main Line" }));
    expect(await within(editor).findByRole("alert")).toHaveTextContent("That name is already used.");
    expect(name).toHaveValue("Entered title");
    await user.click(within(editor).getByRole("button", { name: "Save Main Line" }));
    expect(await within(editor).findByText("Main Line changed")).toBeVisible();
    expect(within(editor).getByRole("button", { name: "Save Main Line" })).toBeDisabled();
    expect(knowledgeApi.updateKnowledgeMainLine).toHaveBeenCalledTimes(2);
    current = { ...current, mainLineName: "Another title", version: 6 };
    await user.click(within(editor).getByRole("button", { name: "Load current Main Line" }));
    expect(await within(editor).findByText(/Current saved name:/)).toHaveTextContent("Another title");
    expect(name).toHaveValue("Entered title");
    await user.click(within(editor).getByRole("button", { name: "Save Main Line" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeMainLine).toHaveBeenLastCalledWith(
      panelling.mainLineId, { expectedVersion: 6, name: "Entered title" }
    ));
  });

  it("requires a successful Main Line detail load and distinguishes a saved name from failed refresh", async () => {
    const user = userEvent.setup();
    let current = detail(panelling);
    let listed = panelling;
    let listReads = 0;
    vi.mocked(knowledgeApi.listKnowledgeItems).mockImplementation(async () => {
      listReads += 1;
      if (listReads === 2) throw new Error("Refresh unavailable");
      return { items: [listed], pagination: { ...pagination, limit: 20, total: 1 } };
    });
    vi.mocked(knowledgeApi.getKnowledgeItem).mockRejectedValueOnce(new Error("Detail unavailable")).mockImplementation(async () => current);
    vi.mocked(knowledgeApi.updateKnowledgeMainLine).mockImplementation(async (_id, input) => {
      if (!input.name) throw new Error("A name is required for this test.");
      current = { ...current, mainLineName: input.name, version: 3 };
      listed = { ...listed, mainLineName: input.name, version: 3 };
      return current;
    });
    renderIndex();

    await screen.findByRole("link", { name: "Wall panelling" });
    await user.click(screen.getByRole("button", { name: "Edit Main Line name for Wall panelling" }));
    const editor = await screen.findByRole("dialog", { name: "Edit Main Line" });
    expect(await within(editor).findByText("Detail unavailable")).toBeVisible();
    expect(knowledgeApi.updateKnowledgeMainLine).not.toHaveBeenCalled();
    await user.click(within(editor).getByRole("button", { name: "Retry Main Line" }));
    await screen.findByRole("textbox", { name: "Main Line name" });
    const loadedEditor = screen.getByRole("dialog", { name: "Edit Main Line" });
    const name = within(loadedEditor).getByRole("textbox", { name: "Main Line name" });
    await user.clear(name);
    await user.type(name, "Updated panelling");
    await user.click(within(loadedEditor).getByRole("button", { name: "Save Main Line" }));
    expect(await within(loadedEditor).findByText("Main Line saved")).toBeVisible();
    expect(name).toHaveValue("Updated panelling");
    expect(within(loadedEditor).queryByRole("button", { name: "Save Main Line" })).not.toBeInTheDocument();
    expect(knowledgeApi.updateKnowledgeMainLine).toHaveBeenCalledTimes(1);
    await user.click(within(loadedEditor).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Edit Main Line" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Updated panelling" })).toBeVisible();
    expect(screen.getByText("Knowledge items could not refresh")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit Main Line name for Updated panelling" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions for Updated panelling" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "Open item" })).toBeVisible();
    expect(knowledgeApi.updateKnowledgeMainLine).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Retry knowledge items" }));
    expect(await screen.findByRole("link", { name: "Updated panelling" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit Main Line name for Updated panelling" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "More actions for Updated panelling" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(knowledgeApi.updateKnowledgeMainLine).toHaveBeenCalledTimes(1);
  });

  it("hides rename for unauthorized or archived records and allows an inactive parent", async () => {
    const activeGroup = subBasket({ ...carpentry, status: "inactive" }, "sub-inactive", "Inactive parent child", 4);
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [{ ...carpentry, status: "inactive" }, plumbing], pagination: { ...pagination, total: 2 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [
      { ...panelling, status: "archived", subBasketId: activeGroup.id, subBasketName: activeGroup.name }, pipework
    ], pagination: { ...pagination, limit: 20, total: 2 } });
    vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockImplementation(async (basketId) => ({
      items: basketId === carpentry.id ? [activeGroup] : [], pagination: { ...pagination, total: basketId === carpentry.id ? 1 : 0 }
    }));
    const view = renderIndex();

    const subEdit = await screen.findByRole("button", { name: "Edit Sub-Basket name for Inactive parent child" });
    expect(subEdit).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Inactive parent child" }));
    expect(screen.queryByRole("button", { name: "Edit Main Line name for Wall panelling" })).not.toBeInTheDocument();
    view.unmount();
    authState.update = false;
    renderIndex();
    expect(screen.queryByRole("button", { name: "Edit Sub-Basket name for Inactive parent child" })).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "More actions for Concealed pipework" });
    expect(screen.queryByRole("button", { name: "Edit Main Line name for Concealed pipework" })).not.toBeInTheDocument();
  });

  it("hides Sub-Basket rename when its loaded Main Basket is archived", async () => {
    const archived = { ...carpentry, status: "archived" as const };
    const group = subBasket(archived, "sub-archived", "Archived group", 4);
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [archived], pagination: { ...pagination, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
      items: [{ ...panelling, subBasketId: group.id, subBasketName: group.name }],
      pagination: { ...pagination, limit: 20, total: 1 }
    });
    vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockResolvedValue({ items: [group], pagination: { ...pagination, total: 1 } });
    renderIndex();

    await screen.findByRole("button", { name: "Archived group" });
    expect(screen.queryByRole("button", { name: "Edit Sub-Basket name for Archived group" })).not.toBeInTheDocument();
  });
});
