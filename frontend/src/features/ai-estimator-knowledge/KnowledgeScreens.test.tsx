import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import * as authorization from "../../auth/authorization";
import { KnowledgeBaseIndexPage } from "./KnowledgeBaseIndexPage";
import { KnowledgeItemWorkspacePage } from "./KnowledgeItemWorkspacePage";
import { KnowledgeReusableValuesPage } from "./KnowledgeReusableValuesPage";
import * as knowledgeApi from "./knowledgeApi";
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeRevision,
  KnowledgeSectionEnvelope,
  KnowledgeSectionMutationEnvelope,
  KnowledgeSectionKey
} from "./knowledgeTypes";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { id: "super-admin-1", name: "Super Admin", email: "admin@lisno.example", role: "super_admin" },
    authorization: {},
    sessionExpired: false
  })
}));
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: vi.fn(() => true) }));
vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    listKnowledgeItems: vi.fn(),
    listKnowledgeBaskets: vi.fn(),
    listKnowledgeMasters: vi.fn(),
    createKnowledgeMaster: vi.fn(),
    getKnowledgeItem: vi.fn(),
    getKnowledgeHistory: vi.fn(),
    getKnowledgeSection: vi.fn(),
    updateKnowledgeSection: vi.fn(),
    previewKnowledge: vi.fn()
  };
});

const page = { limit: 100, offset: 0, total: 0, hasMore: false } as const;
const completeness: KnowledgeCompleteness = { percentage: 50, sections: [], blockers: [], warnings: [] };
const revision: KnowledgeRevision = {
  id: "revision-1",
  mainLineId: "line-1",
  revisionNumber: 1,
  status: "draft",
  sourceRevisionId: null,
  contentDigest: null,
  completeness,
  activatedAt: null,
  activatedById: null,
  supersededAt: null,
  supersededById: null,
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-28T08:00:00.000Z",
  updatedAt: "2026-08-28T08:00:00.000Z"
};
const item: KnowledgeItemDetail = {
  id: "line-1",
  mainLineId: "line-1",
  mainLineName: "Wall panelling",
  basketId: "basket-1",
  basketName: "Carpentry",
  description: "Wall panelling knowledge",
  status: "draft",
  activeRevisionId: null,
  draftRevisionId: "revision-1",
  revisionNumber: 1,
  uomId: null,
  priorityId: null,
  modeIds: [],
  surfaceIds: [],
  vendorIds: [],
  completeness,
  allowedActions: ["update_section", "review_and_activate", "duplicate", "archive"],
  activeRevision: null,
  draftRevision: revision,
  blockers: [],
  warnings: [],
  version: 4,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-28T08:00:00.000Z",
  updatedAt: "2026-08-28T08:00:00.000Z"
};

const squareFoot: KnowledgeMaster = {
  id: "uom-square-foot",
  masterType: "uoms",
  code: "SQFT",
  name: "Square foot",
  description: null,
  displayOrder: 0,
  status: "active",
  decimalScale: 2,
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: item.createdAt,
  updatedAt: item.updatedAt
};

const squareMetre: KnowledgeMaster = {
  ...squareFoot,
  id: "uom-square-metre",
  code: "SQM",
  name: "Square metre"
};

const wallSurface: KnowledgeMaster = {
  ...squareFoot,
  id: "surface-wall",
  masterType: "surfaces",
  code: "WALL",
  name: "Wall",
  decimalScale: undefined
};

const serverPricingSpecification = {
  id: "spec-mode-1",
  name: "Server specification"
} as const;

function configuredPricingPayload(
  specificationName: string = serverPricingSpecification.name,
  technicalDescription: string = "Server pricing",
  additionalPayload: KnowledgeJsonObject = {}
): KnowledgeJsonObject {
  return {
    technicalDescription,
    specifications: [{ ...serverPricingSpecification, name: specificationName }],
    ...additionalPayload
  };
}

function section(sectionKey: KnowledgeSectionKey, payload: KnowledgeJsonObject = {}, version = 2): KnowledgeSectionEnvelope<KnowledgeJsonObject> {
  return {
    id: `section-${sectionKey}`,
    mainLineId: "line-1",
    revisionId: "revision-1",
    sectionKey,
    applicability: "configured",
    payload,
    version,
    createdById: "super-admin-1",
    updatedById: "super-admin-1",
    createdAt: "2026-08-28T08:00:00.000Z",
    updatedAt: "2026-08-28T08:00:00.000Z"
  };
}

function mutationSection(
  sectionKey: KnowledgeSectionKey,
  payload: KnowledgeJsonObject = {},
  version = 3,
  aggregateVersion = 5
): KnowledgeSectionMutationEnvelope<KnowledgeJsonObject> {
  return {
    ...section(sectionKey, payload, version),
    aggregateVersion
  };
}

function renderRoute(element: React.ReactElement, path: string, route: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Match the production cache freshness window so conflict tests prove
      // that recovery performs an explicit network refresh.
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={<main>{element}</main>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function expectNoAutomatedAccessibilityViolations() {
  const results = await axe.run(document.body, {
    rules: {
      // axe's color-contrast rule requires canvas layout APIs that jsdom does
      // not implement. All semantic, name, relationship, and landmark rules run.
      "color-contrast": { enabled: false }
    }
  });
  expect(results.violations).toEqual([]);
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

function expectHeadingsInOrder(container: HTMLElement, names: readonly string[]) {
  const headings = within(container).getAllByRole("heading").map((heading) => heading.textContent);
  const indices = names.map((name) => headings.indexOf(name));
  expect(indices.every((index) => index >= 0)).toBe(true);
  expect(indices).toEqual([...indices].sort((left, right) => left - right));
}

function expectModeRegionsInOrder(container: HTMLElement) {
  const pricing = within(container).getByRole("region", { name: "Pricing" });
  const quantityMargin = within(container).getByRole("region", { name: "Quantity & margin" });
  expect(
    pricing.compareDocumentPosition(quantityMargin) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
}

async function findPricingSpecificationName() {
  const pricing = await screen.findByRole("region", { name: "Pricing" });
  const specifications = within(pricing).getByRole("region", { name: "Specifications" });
  return within(specifications).getByRole("textbox", { name: "Specification name" });
}

function mockConfiguredModeSections() {
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
    items: type === "uoms" ? [squareFoot, squareMetre] : type === "surfaces" ? [wallSurface] : [],
    pagination: { ...page, total: type === "uoms" ? 2 : type === "surfaces" ? 1 : 0 }
  }));
  vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
    if (sectionKey === "overview") return section(sectionKey, { description: "Server overview", uomId: squareFoot.id });
    if (sectionKey === "pricing") return section(sectionKey, configuredPricingPayload());
    if (sectionKey === "quantity-margin") return section(sectionKey, { startMarginBps: 100 });
    return section(sectionKey);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorization.hasFrontendPermission).mockReturnValue(true);
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockResolvedValue({ items: [], pagination: page });
  vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [], pagination: page });
  vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [], pagination: { ...page, limit: 20 } });
  vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue(item);
  vi.mocked(knowledgeApi.getKnowledgeHistory).mockResolvedValue({ items: [revision], pagination: page });
  vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => section(sectionKey));
});

describe("AI estimator knowledge screens", () => {
  it("has no automated accessibility violations on the populated index", async () => {
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [{ id: "basket-1", name: "Carpentry", description: null, displayOrder: 0, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [item], pagination: { ...page, limit: 20, total: 1 } });
    renderRoute(<KnowledgeBaseIndexPage />, "/admin/configuration/estimation", "/admin/configuration/estimation");

    await screen.findByRole("heading", { name: "Carpentry" });
    await expectNoAutomatedAccessibilityViolations();
  });

  it("has no automated accessibility violations on reusable values", async () => {
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockResolvedValue({ items: [{ id: "uom-1", masterType: "uoms", code: "SQFT", name: "Square foot", description: null, displayOrder: 0, status: "active", decimalScale: 2, version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], pagination: { ...page, total: 1 } });
    renderRoute(<KnowledgeReusableValuesPage />, "/admin/configuration/estimation/reusable-values", "/admin/configuration/estimation/reusable-values");

    await screen.findAllByText("Square foot");
    await expectNoAutomatedAccessibilityViolations();
  });

  it("has no automated accessibility violations on the editable workspace", async () => {
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await screen.findByRole("heading", { name: "Configured values" });
    expect(screen.queryByText(/by super-admin-1/u)).not.toBeInTheDocument();
    await expectNoAutomatedAccessibilityViolations();
  });

  it("renders one Main Line identity, backend-owned workspace status, and main-before-history structure", async () => {
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await screen.findByRole("heading", { name: "Configured values" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Wall panelling", level: 1 })).toBeVisible();
    expect(screen.getByRole("button", { name: "Back to Main Baskets" })).toBeVisible();
    expect(screen.getByText("Main Basket · Carpentry")).toBeVisible();

    const status = screen.getByRole("region", { name: "Workspace status" });
    expect(within(status).getByText("50%")).toBeVisible();
    expect(within(status).getByText("Ready to activate")).toBeVisible();
    expect(within(status).getByText("Draft revision 1")).toBeVisible();
    expect(within(status).getByText("No active revision")).toBeVisible();
    expect(status).not.toHaveTextContent("Backend-derived activation readiness");
    expect(status).not.toHaveTextContent("Current view");

    const pageActions = screen.getByRole("group", { name: "Page actions" });
    expect(within(pageActions).queryByRole("button", { name: /^Save /u })).not.toBeInTheDocument();
    const main = document.querySelector(".knowledge-workspace-main");
    const history = document.querySelector(".knowledge-workspace-history-rail");
    expect(main).not.toBeNull();
    expect(history).not.toBeNull();
    expect(main!.compareDocumentPosition(history!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("reports an active revision as Active instead of activation-ready", async () => {
    const activeRevision: KnowledgeRevision = {
      ...revision,
      status: "active",
      activatedAt: revision.updatedAt,
      activatedById: "super-admin-1"
    };
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      status: "active",
      activeRevisionId: activeRevision.id,
      draftRevisionId: null,
      activeRevision,
      draftRevision: null
    });
    vi.mocked(knowledgeApi.getKnowledgeHistory).mockResolvedValue({ items: [activeRevision], pagination: page });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const status = await screen.findByRole("region", { name: "Workspace status" });
    expect(within(status).getByText("Active")).toBeVisible();
    expect(within(status).queryByText("Ready to activate")).not.toBeInTheDocument();
  });

  it("reports an archived item as Archived regardless of its saved revision state", async () => {
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      status: "archived",
      allowedActions: ["duplicate"]
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const status = await screen.findByRole("region", { name: "Workspace status" });
    expect(within(status).getByText("Archived")).toBeVisible();
    expect(within(status).queryByText("Ready to activate")).not.toBeInTheDocument();
  });

  it("reports a deactivated Main Line as Inactive even when it retains an active revision", async () => {
    const retainedRevision: KnowledgeRevision = {
      ...revision,
      status: "active",
      activatedAt: revision.updatedAt,
      activatedById: "super-admin-1"
    };
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      status: "inactive",
      activeRevisionId: retainedRevision.id,
      draftRevisionId: null,
      activeRevision: retainedRevision,
      draftRevision: null
    });
    vi.mocked(knowledgeApi.getKnowledgeHistory).mockResolvedValue({ items: [retainedRevision], pagination: page });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const status = await screen.findByRole("region", { name: "Workspace status" });
    expect(within(status).getByText("Inactive")).toBeVisible();
    expect(within(status).queryByText("Active")).not.toBeInTheDocument();
  });

  it("reports Draft activation readiness for an inactive Main Line that has a new Draft", async () => {
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      status: "inactive"
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const status = await screen.findByRole("region", { name: "Workspace status" });
    expect(within(status).getByText("Ready to activate")).toBeVisible();
    expect(within(status).queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("shows a terminal empty state with no Save when the item has no revision", async () => {
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      activeRevisionId: null,
      draftRevisionId: null,
      activeRevision: null,
      draftRevision: null
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByText("This item has no revision to display.")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Workspace status" })).getByText("No revision")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Save /u })).not.toBeInTheDocument();
    expect(screen.queryByText("Loading Overview…")).not.toBeInTheDocument();
    expect(screen.queryByText("Active history is read-only")).not.toBeInTheDocument();
    expect(screen.queryByText(/active revision remains available/u)).not.toBeInTheDocument();
    expect(knowledgeApi.getKnowledgeSection).not.toHaveBeenCalled();
    await expectNoAutomatedAccessibilityViolations();
  });

  it("keeps hidden-section backend blockers visible in activation status and review", async () => {
    const user = userEvent.setup();
    const blocker = { code: "EXECUTION_REQUIRED", sectionKey: "execution" as const, message: "Execution steps are required.", blocking: true };
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      blockers: [blocker, { ...blocker, code: "UOM_REQUIRED", sectionKey: "overview", message: "UOM is required." }],
      warnings: [{ ...blocker, code: "QUALITY_RECOMMENDED", sectionKey: "quality", message: "Quality is recommended.", blocking: false }],
      allowedActions: ["update_section", "review_and_activate", "create_revision", "duplicate", "deactivate", "archive"]
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await screen.findByRole("heading", { name: "Configured values" });
    expect(screen.getByText("Blocked · 2 blockers")).toBeVisible();
    const actions = screen.getByRole("group", { name: "Page actions" });
    expect(within(actions).getAllByRole("button")).toEqual([
      within(actions).getByRole("button", { name: "Review activation" }),
      within(actions).getByRole("button", { name: "Create revision" }),
      within(actions).getByRole("button", { name: "Duplicate" }),
      within(actions).getByRole("button", { name: "Deactivate" }),
      within(actions).getByRole("button", { name: "Archive" })
    ]);
    expect(screen.queryByRole("button", { name: "Review and activate" })).not.toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Review activation" })).toHaveClass("ui-button--secondary");
    await user.click(within(actions).getByRole("button", { name: "Review activation" }));
    const activationReview = screen.getByRole("alertdialog", { name: "Activate this revision?" });
    expect(within(activationReview).getByText("Execution steps are required.")).toBeVisible();
    expect(within(activationReview).getByRole("button", { name: "Activate revision" })).toBeDisabled();
    await expectNoAutomatedAccessibilityViolations();
  });

  it("shows warning-only readiness without inventing an activation blocker", async () => {
    const warning = { code: "QUALITY_RECOMMENDED", sectionKey: "quality" as const, message: "Quality is recommended.", blocking: false };
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      blockers: [],
      warnings: [warning, { ...warning, code: "EXECUTION_RECOMMENDED", sectionKey: "execution" }]
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByText("Ready with 2 warnings")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review and activate" })).toBeVisible();
    expect(screen.queryByText(/Blocked/u)).not.toBeInTheDocument();
  });

  it("requires both frontend permission and backend allowed actions for workspace mutations", async () => {
    vi.mocked(authorization.hasFrontendPermission).mockImplementation((_authorization, permission) =>
      permission === "ai_estimator_knowledge.configuration.create"
    );
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      allowedActions: ["update_section", "review_and_activate", "duplicate", "archive"]
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await screen.findByRole("heading", { name: "Configured values" });
    expect(screen.queryByRole("button", { name: "Review and activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save Overview" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Read-only revision")[0]).toBeVisible();
  });

  it("keeps revision-history loading local and retries a failed history request", async () => {
    const user = userEvent.setup();
    let historyReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeHistory).mockImplementation(async () => {
      historyReads += 1;
      if (historyReads === 1) {
        throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Revision history is temporarily unavailable.");
      }
      return { items: [revision], pagination: { ...page, total: 1 } };
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByRole("heading", { name: "Configured values" })).toBeVisible();
    const history = screen.getByRole("region", { name: "Revision history" });
    expect(within(history).getByRole("alert")).toHaveTextContent("Revision history is temporarily unavailable.");
    await expectNoAutomatedAccessibilityViolations();
    await user.click(within(history).getByRole("button", { name: "Try again" }));

    expect(await within(history).findByText("Revision 1")).toBeVisible();
    expect(historyReads).toBe(2);
    expect(within(history).queryByText("Revision history is temporarily unavailable.")).not.toBeInTheDocument();
  });

  it("shows Revision history loading without replacing the editable workspace", async () => {
    let resolveHistory!: (history: Awaited<ReturnType<typeof knowledgeApi.getKnowledgeHistory>>) => void;
    vi.mocked(knowledgeApi.getKnowledgeHistory).mockImplementation(() => new Promise((resolve) => {
      resolveHistory = resolve;
    }));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByRole("heading", { name: "Configured values" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Revision history status" })).toHaveTextContent("Loading revision history…");
    await expectNoAutomatedAccessibilityViolations();
    resolveHistory({ items: [revision], pagination: { ...page, total: 1 } });
    expect(await screen.findByText("Revision 1")).toBeVisible();
  });

  it("renders an explicit empty Revision history state", async () => {
    vi.mocked(knowledgeApi.getKnowledgeHistory).mockResolvedValue({ items: [], pagination: page });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const history = await screen.findByRole("region", { name: "Revision history" });
    expect(within(history).getByText("No revision history is available.")).toBeVisible();
  });

  it("renders the grouped searchable index with status, completeness, and workspace action", async () => {
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [{ id: "basket-1", name: "Carpentry", description: null, displayOrder: 0, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [item], pagination: { ...page, limit: 20, total: 1 } });
    renderRoute(<KnowledgeBaseIndexPage />, "/admin/configuration/estimation", "/admin/configuration/estimation");

    expect(await screen.findByRole("heading", { name: "AI Estimator Knowledge Base" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Carpentry" })).toBeVisible();
    expect(screen.getByText("50% complete")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open workspace" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Knowledge base isolation notice" })).toBeVisible();
  });

  it("renders reusable values and opens an accessible guided create dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockResolvedValue({ items: [{ id: "uom-1", masterType: "uoms", code: "SQFT", name: "Square foot", description: null, displayOrder: 0, status: "active", decimalScale: 2, version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], pagination: { ...page, total: 1 } });
    renderRoute(<KnowledgeReusableValuesPage />, "/admin/configuration/estimation/reusable-values", "/admin/configuration/estimation/reusable-values");

    expect(await screen.findByRole("heading", { name: "Reusable estimation values" })).toBeVisible();
    expect((await screen.findAllByText("Square foot"))[0]).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add UOM" }));
    const dialog = screen.getByRole("dialog", { name: "Add UOM" });
    expect(within(dialog).getByRole("textbox", { name: /code/i })).toBeVisible();
    expect(within(dialog).getByRole("combobox", { name: /quantity decimal places/i })).toBeVisible();
  });

  it("opens a reusable-value dialog from the keyboard and restores focus on close", async () => {
    const user = userEvent.setup();
    renderRoute(<KnowledgeReusableValuesPage />, "/admin/configuration/estimation/reusable-values", "/admin/configuration/estimation/reusable-values");
    const opener = await screen.findByRole("button", { name: "Add UOM" });
    opener.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Add UOM" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("shows immutable tax-version history with effective windows", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => type === "taxes" ? {
      items: [{ id: "tax-1", masterType: "taxes", code: "GST18", name: "GST 18%", description: null, displayOrder: 0, status: "active", taxVersions: [{ id: "tax-version-1", taxRuleId: "tax-1", versionNumber: 1, rateBps: 1800, treatment: "exclusive", applicability: "materials", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: null, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }],
      pagination: { ...page, total: 1 }
    } : { items: [], pagination: page });
    renderRoute(<KnowledgeReusableValuesPage />, "/admin/configuration/estimation/reusable-values", "/admin/configuration/estimation/reusable-values");

    await user.click(await screen.findByRole("tab", { name: "Taxes" }));
    const summary = await screen.findByText("1 immutable tax version");
    await user.click(summary);
    expect(screen.getByText(/Version 1 · 18% · exclusive/u)).toBeVisible();
    expect(screen.getByText(/Open ended/u)).toBeVisible();
  });

  it("offers only active baskets when creating an estimation item", async () => {
    const user = userEvent.setup();
    const basketBase = { description: null, displayOrder: 0, version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt } as const;
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [{ ...basketBase, id: "basket-active", name: "Carpentry", status: "active" }, { ...basketBase, id: "basket-inactive", name: "Legacy painting", status: "inactive" }], pagination: { ...page, total: 2 } });
    renderRoute(<KnowledgeBaseIndexPage />, "/admin/configuration/estimation", "/admin/configuration/estimation");

    await user.click(await screen.findByRole("button", { name: "Add estimation item" }));
    const dialog = screen.getByRole("dialog", { name: "Add estimation item" });
    expect(within(dialog).getByRole("option", { name: "Carpentry" })).toBeVisible();
    expect(within(dialog).queryByRole("option", { name: "Legacy painting" })).not.toBeInTheDocument();
  });

  it("omits the section-envelope state control from every standalone workspace tab", async () => {
    const user = userEvent.setup();
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await screen.findByRole("heading", { name: "Configured values", level: 2 });
    expect(screen.queryByRole("combobox", { name: "Section state" })).not.toBeInTheDocument();

    for (const sectionName of ["Recommendations", "Quality"]) {
      await user.click(screen.getByRole("tab", { name: sectionName }));
      await screen.findByRole("heading", { name: sectionName, level: 2 });
      expect(screen.queryByRole("combobox", { name: "Section state" })).not.toBeInTheDocument();
    }
  });

  it("saves one independent Draft section with the loaded applicability and exact CAS versions", async () => {
    const user = userEvent.setup();
    const hiddenPayload = {
      description: "Stored description",
      uomId: squareFoot.id,
      priorityId: "priority-hidden",
      modeIds: ["mode-hidden"],
      surfaceIds: ["surface-hidden"],
      sectionApplicability: [{ id: "rule-hidden", sectionKey: "pricing", applicability: "configured" }],
      unknownCompatibilityValue: { preserve: true }
    } as const;
    const loaded = { ...section("overview", hiddenPayload), applicability: "not_applicable" as const };
    const saved = { ...mutationSection("overview", { ...hiddenPayload, uomId: squareMetre.id }, 3), applicability: "not_applicable" as const };
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) =>
      sectionKey === "overview" ? loaded : section(sectionKey)
    );
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockResolvedValue(saved);
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const uom = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(screen.queryByRole("combobox", { name: "Section state" })).not.toBeInTheDocument();
    await user.selectOptions(uom, squareMetre.id);
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledWith("line-1", "revision-1", "overview", {
      expectedVersion: 2,
      expectedAggregateVersion: 4,
      applicability: "not_applicable",
      payload: { ...hiddenPayload, uomId: squareMetre.id }
    }));
  });

  it("keeps exactly one contextual Overview Save across clean, dirty, and saving states", async () => {
    const user = userEvent.setup();
    let resolveSave!: (saved: KnowledgeSectionMutationEnvelope<KnowledgeJsonObject>) => void;
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) =>
      section(sectionKey, sectionKey === "overview" ? { uomId: squareFoot.id } : {})
    );
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const uom = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(screen.getAllByRole("button", { name: "Save Overview" })).toHaveLength(1);
    expect(screen.getByLabelText("Overview commands")).toHaveTextContent("Version 2");
    expect(screen.getByLabelText("Overview commands")).not.toHaveTextContent("Section version");
    expect(screen.getByRole("button", { name: "Save Overview" })).toBeDisabled();
    expect(screen.getByText("All changes saved")).toBeVisible();

    await user.selectOptions(uom, squareMetre.id);
    expect(screen.getByRole("button", { name: "Save Overview" })).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    expect(await screen.findByRole("button", { name: "Saving Overview…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("button", { name: "Saving Overview…" })).toHaveLength(1);

    resolveSave(mutationSection("overview", { uomId: squareMetre.id }, 3, 5));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Overview" })).toBeDisabled());
    expect(screen.getByText("All changes saved")).toBeVisible();
  });

  it("retains dirty Overview values and exposes retry after a failed contextual save", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) =>
      section(sectionKey, sectionKey === "overview" ? { uomId: squareFoot.id } : {})
    );
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValue(
      new ApiError(503, "UPSTREAM_UNAVAILABLE", "Save service unavailable.")
    );
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const uom = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.selectOptions(uom, squareMetre.id);
    await user.click(screen.getByRole("button", { name: "Save Overview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Save service unavailable.");
    expect(screen.getByText("Save failed. Review the message below and try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save Overview" })).toBeEnabled();
    expect(uom).toHaveValue(squareMetre.id);
  });

  it("retains local section input after a CAS conflict and never replays automatically", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."));
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    let overviewReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey !== "overview") return section(sectionKey);
      overviewReads += 1;
      return overviewReads === 1
        ? section("overview", { description: "Stored", uomId: squareFoot.id }, 2)
        : section("overview", { description: "Latest stored", uomId: squareFoot.id }, 3);
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const uom = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.selectOptions(uom, squareMetre.id);
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    expect(await screen.findByRole("alertdialog", { name: "This section changed elsewhere" })).toBeVisible();
    expect(uom).toHaveValue(squareMetre.id);
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    expect(knowledgeApi.getKnowledgeItem).toHaveBeenCalledTimes(2);
  });

  it("reviews an Overview conflict with resolved labels and no compatibility IDs or raw JSON", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."));
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : type === "surfaces" ? [wallSurface] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : type === "surfaces" ? 1 : 0 }
    }));
    let overviewReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey !== "overview") return section(sectionKey);
      overviewReads += 1;
      return overviewReads === 1
        ? section("overview", { uomId: squareFoot.id }, 2)
        : section("overview", {
            uomId: squareFoot.id,
            surfaceIds: [wallSurface.id, "private-surface-id"],
            priorityId: "private-priority-id",
            unknownCompatibilityValue: { privateId: "private-compatibility-id" }
          }, 3);
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const uom = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.selectOptions(uom, squareMetre.id);
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    const dialog = await screen.findByRole("alertdialog", { name: "This section changed elsewhere" });
    await user.click(within(dialog).getByRole("button", { name: "Review server version" }));

    const review = screen.getByRole("region", { name: "Latest Overview server version" });
    expect(review).toHaveTextContent("Local version 2 · Latest server version 3");
    expect(review).toHaveTextContent("Unit of measure (UOM)");
    expect(review).toHaveTextContent("Square foot");
    expect(review).toHaveTextContent("Wall, Unavailable value");
    expect(review).not.toHaveTextContent("private-surface-id");
    expect(review).not.toHaveTextContent("private-priority-id");
    expect(review).not.toHaveTextContent("private-compatibility-id");
    expect(review.querySelector("pre")).toBeNull();
    expect(uom).toHaveValue(squareMetre.id);
    await expectNoAutomatedAccessibilityViolations();
  });

  it("rebases only edited Overview fields onto the latest payload after a conflict", async () => {
    const user = userEvent.setup();
    const initialPayload = {
      description: "Initial hidden description",
      uomId: squareFoot.id,
      surfaceIds: ["surface-initial"],
      priorityId: "priority-initial",
      modeIds: ["mode-initial"],
      sectionApplicability: [{ id: "rule-initial", sectionKey: "pricing" }],
      unknownCompatibilityValue: { source: "initial" }
    } as const;
    const latestPayload = {
      description: "Latest hidden description",
      uomId: squareFoot.id,
      surfaceIds: ["surface-concurrent"],
      priorityId: "priority-concurrent",
      modeIds: ["mode-concurrent"],
      sectionApplicability: [{ id: "rule-concurrent", sectionKey: "quality" }],
      unknownCompatibilityValue: { source: "concurrent" }
    } as const;
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    let overviewReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey !== "overview") return section(sectionKey);
      overviewReads += 1;
      return overviewReads === 1
        ? section("overview", initialPayload, 2)
        : { ...section("overview", latestPayload, 3), applicability: "not_applicable" as const };
    });
    let updateAttempts = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey, input) => {
      updateAttempts += 1;
      if (updateAttempts === 1) throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.");
      return mutationSection(sectionKey, input.payload, 4, 5);
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.selectOptions(await screen.findByRole("combobox", { name: "Unit of measure (UOM)" }), squareMetre.id);
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    const conflict = await screen.findByRole("alertdialog", { name: "This section changed elsewhere" });
    await user.click(within(conflict).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveValue(squareMetre.id);

    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(2));
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenLastCalledWith(
      "line-1",
      "revision-1",
      "overview",
      {
        expectedVersion: 3,
        expectedAggregateVersion: 4,
        applicability: "not_applicable",
        payload: { ...latestPayload, uomId: squareMetre.id }
      }
    );
  });

  it("guards Back and lifecycle exits while the Draft section is dirty", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) =>
      section(sectionKey, sectionKey === "overview" ? { uomId: squareFoot.id } : {})
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/configuration/estimation/items/line-1"]}>
          <Routes>
            <Route path="/admin/configuration/estimation/items/:itemId" element={<KnowledgeItemWorkspacePage />} />
            <Route path="/admin/configuration/estimation" element={<h1>Knowledge home</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await user.selectOptions(await screen.findByRole("combobox", { name: "Unit of measure (UOM)" }), squareMetre.id);
    await user.click(screen.getByRole("button", { name: "Review and activate" }));
    expect(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.queryByRole("dialog", { name: /Review and activate/u })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to Main Baskets/u }));
    expect(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Knowledge home" })).toBeVisible();
  });

  it("guards Overview Open actions while UOM changes are unsaved", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey === "overview") return section(sectionKey, { uomId: squareFoot.id });
      if (sectionKey === "pricing") {
        return section(sectionKey, {
          specifications: [{ id: "spec-guard", name: "Guarded specification" }],
          priceEntries: []
        });
      }
      return section(sectionKey);
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.selectOptions(await screen.findByRole("combobox", { name: "Unit of measure (UOM)" }), squareMetre.id);
    const pricingSummary = (await screen.findByRole("heading", { name: "Specifications" })).closest("section");
    expect(pricingSummary).not.toBeNull();
    await user.click(within(pricingSummary as HTMLElement).getByRole("button", { name: "Open Mode" }));
    const guard = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(guard).getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");

    await user.click(within(pricingSummary as HTMLElement).getByRole("button", { name: "Open Mode" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("tabpanel", { name: "Mode" })).toBeVisible();
  });

  it("omits every tab-derived Overview summary after all empty sources load", async () => {
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) =>
      section(sectionKey)
    );
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByRole("heading", { name: "Configured values" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Surfaces" })).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("radiogroup", { name: "Modes" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Selected Mode details" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Shared calculation values" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Specifications" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Pricing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Recommendations", level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Quality", level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "All section summaries" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^Open /u })).not.toBeInTheDocument();
    expect(screen.queryByText(/No .* configured/u)).not.toBeInTheDocument();
  });

  it("keeps descriptive specifications separate from new prices while resolving immutable tax versions", async () => {
    const user = userEvent.setup();
    const tax = { id: "tax-1", masterType: "taxes", code: "GST18", name: "GST 18%", description: null, displayOrder: 0, status: "active", taxVersions: [{ id: "tax-version-1", taxRuleId: "tax-1", versionNumber: 1, rateBps: 1800, treatment: "exclusive", applicability: "materials", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: null, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt } as const;
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => type === "taxes" ? { items: [tax], pagination: { ...page, total: 1 } } : { items: [], pagination: page });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => section(sectionKey, sectionKey === "pricing" ? { specifications: [{ id: "spec-1", name: "Premium ply" }], priceEntries: [{ operation: "append", priceEntryId: "price-entry-1", specificationId: null, taxRuleId: "tax-1", taxVersionId: "tax-version-1" }] } : {}));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    expect(await findPricingSpecificationName()).toHaveValue("Premium ply");
    expect(screen.queryByRole("combobox", { name: "Specification" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tax rule" })).toHaveDisplayValue("GST 18%");
    expect(screen.getByRole("combobox", { name: "Tax version" })).toHaveDisplayValue(/Version 1 · 18%/u);
    expect(screen.queryByRole("textbox", { name: /Tax version ID/iu })).not.toBeInTheDocument();
  });

  it("renders immutable resolved price details and prepares a replacement with the same stable entry ID", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => section(sectionKey, sectionKey === "pricing" ? { priceEntries: [{ operation: "reference", priceEntryId: "price-entry-1", priceVersionId: "price-version-1", priceVersion: { id: "price-version-1", priceEntryId: "price-entry-1", versionNumber: 1, vendorId: "vendor-1", uomId: "uom-1", specificationId: null, modeId: null, taxRuleId: "tax-1", taxVersionId: "tax-version-1", inputAmountPaise: 12000, baseAmountPaise: 12000, taxAmountPaise: 2160, totalAmountPaise: 14160, treatment: "exclusive", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: null, status: "active", reviewRequired: false } }] } : {}));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const savedPrice = await screen.findByLabelText("Immutable saved price details");
    expect(savedPrice).toHaveTextContent(/₹\s?141\.60/u);
    expect(savedPrice).not.toHaveTextContent("paise");
    await user.click(screen.getByRole("button", { name: "Replace price version" }));
    expect(screen.getByRole("textbox", { name: "Price entry ID" })).toHaveValue("price-entry-1");
    expect(screen.getByRole("textbox", { name: "Input amount (rupees)" })).toHaveValue("120.00");
  });

  it("keeps fixed Mode kinds independent from paginated reusable Mode records", async () => {
    const user = userEvent.setup();
    const decoys: readonly KnowledgeMaster[] = Array.from({ length: 100 }, (_, index) => ({
      id: `mode-decoy-${index + 1}`,
      masterType: "modes",
      code: `MODE_${index + 1}`,
      name: `Mode ${index + 1}`,
      description: null,
      displayOrder: index,
      status: "active",
      version: 1,
      createdById: "super-admin-1",
      updatedById: "super-admin-1",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));
    const canonicalModes: readonly KnowledgeMaster[] = [
      {
        ...decoys[0]!,
        id: "mode-pmc-after-page-one",
        code: "ＰＭＣ",
        name: "Project management"
      },
      {
        ...decoys[0]!,
        id: "mode-execution-after-page-one",
        code: "ＥＸＥＣＵＴＩＯＮ",
        name: "Delivery"
      }
    ];
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type, params = {}) => {
      if (type !== "modes") return { items: [], pagination: page };
      const offset = params.offset ?? 0;
      return offset === 0
        ? {
            items: decoys,
            pagination: { limit: 100, offset: 0, total: 102, hasMore: true }
          }
        : {
            items: canonicalModes,
            pagination: { limit: 100, offset: 100, total: 102, hasMore: false }
          };
    });
    renderRoute(
      <KnowledgeItemWorkspacePage />,
      "/admin/configuration/estimation/items/line-1",
      "/admin/configuration/estimation/items/:itemId"
    );

    await user.click(await screen.findByRole("tab", { name: "Mode" }));

    const selector = await screen.findByRole("combobox", { name: "Mode" });
    expect(within(selector).getByRole("option", { name: "PMC" })).toHaveValue("pmc");
    expect(within(selector).getByRole("option", { name: "Execution" })).toHaveValue("execution");
    expect(vi.mocked(knowledgeApi.listKnowledgeMasters).mock.calls
      .filter(([type]) => type === "modes")
      .map(([, params]) => params?.offset ?? 0)).toEqual([0, 100]);
  });

  it("renders four guided sections while preserving hidden-section Overview summaries and Mode behavior", async () => {
    const user = userEvent.setup();
    const relatedItem: KnowledgeItemDetail = { ...item, id: "line-2", mainLineId: "line-2", mainLineName: "Related panel", draftRevisionId: null, draftRevision: null, activeRevisionId: "revision-2" };
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [{ id: "basket-1", name: "Carpentry", description: null, displayOrder: 0, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [relatedItem], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey === "overview") return section(sectionKey, { description: "Stored description", uomId: squareFoot.id, sectionApplicability: [{ id: "applicability-1", sectionKey: "pricing", applicability: "configured" }] });
      if (sectionKey === "scope") return section(sectionKey, { exclusions: [{ id: "exclusion-1", reason: "Protect finished flooring" }] });
      if (sectionKey === "recommendations") return section(sectionKey, { recommendations: [{ id: "recommendation-1", targetBasketId: "basket-1", targetMainLineId: "line-2", type: "recommended", reason: "Use matching panel", quantityRelationship: "same_quantity", dependency: false, active: true }] });
      if (sectionKey === "quality") return section(sectionKey, { parameters: [{ id: "quality-1", type: "number", label: "Thickness", unit: "mm", required: true, active: true }] });
      if (sectionKey === "execution") return section(sectionKey, { steps: [{ id: "step-1", order: 1, name: "Measure", dependencyStepIds: [], active: true }, { id: "step-2", order: 2, name: "Install", dependencyStepIds: ["step-1"], active: true }] });
      if (sectionKey === "advanced") return section(sectionKey, { dependencies: [{ id: "dependency-1", targetMainLineId: "line-2" }] });
      return section(sectionKey);
    });
    vi.mocked(knowledgeApi.previewKnowledge).mockResolvedValue({ formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null, effectiveUnitRatePaise: 0, adjustedUnitRate: null, requiredQuantity: "0", procurementQuantity: "0", vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null, pmcMarkup: null, duration: null });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const tablist = await screen.findByRole("tablist", { name: "Configuration sections" });
    expect(within(tablist).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Mode",
      "Recommendations",
      "Quality"
    ]);
    expect(within(tablist).queryByRole("tab", { name: "Scope" })).not.toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: "Execution" })).not.toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: "Advanced" })).not.toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: "Pricing" })).not.toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: "Quantity & margin" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Configured values" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Section applicability rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Section key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveDisplayValue("Square foot");
    const scopeSummary = screen.getByRole("heading", { name: "Scope", level: 3 }).closest("article");
    const executionSummary = screen.getByRole("heading", { name: "Execution", level: 3 }).closest("article");
    const advancedSummary = screen.getByRole("heading", { name: "Advanced", level: 3 }).closest("article");
    expect(scopeSummary).not.toBeNull();
    expect(executionSummary).not.toBeNull();
    expect(advancedSummary).not.toBeNull();
    expect(within(scopeSummary as HTMLElement).getByText("Exclusions")).toBeVisible();
    expect(within(scopeSummary as HTMLElement).getByText("1")).toBeVisible();
    expect(within(executionSummary as HTMLElement).getByText("2")).toBeVisible();
    expect(within(executionSummary as HTMLElement).getByText("Measure, Install")).toBeVisible();
    expect(within(advancedSummary as HTMLElement).getByText("Dependencies")).toBeVisible();
    expect(within(advancedSummary as HTMLElement).getByText("1")).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }), squareMetre.id);
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    const modePanel = await screen.findByRole("tabpanel", { name: "Mode" });
    expectModeRegionsInOrder(modePanel);
    const pricingRegion = within(modePanel).getByRole("region", { name: "Pricing" });
    expect(within(pricingRegion).getByRole("heading", { name: "Pricing" })).toHaveClass("sr-only");
    expect(within(pricingRegion).queryByText(/Maintain specifications, immutable price-version commands/u)).not.toBeInTheDocument();
    expect(within(pricingRegion).queryByRole("textbox", { name: "Technical description" })).not.toBeInTheDocument();
    expect(within(pricingRegion).queryByRole("textbox", { name: "Internal vendor notes" })).not.toBeInTheDocument();
    expect(within(pricingRegion).queryByRole("textbox", { name: "Quality level" })).not.toBeInTheDocument();
    expect(within(pricingRegion).getByRole("region", { name: "Specifications" })).toBeVisible();
    expect(within(modePanel).queryByRole("combobox", { name: "UOM" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add specification/iu })).toBeVisible();
    const unitRate = screen.getByRole("textbox", { name: "Unit rate (₹)" });
    await user.type(unitRate, "0");
    await user.type(screen.getByRole("textbox", { name: "Quantity" }), "0");
    const preview = screen.getByRole("button", { name: "Run server preview" });
    expect(preview).toBeEnabled();
    await user.click(preview);
    await waitFor(() => expect(knowledgeApi.previewKnowledge).toHaveBeenLastCalledWith(expect.objectContaining({ unitRatePaise: 0 })));
    expect(knowledgeApi.previewKnowledge).toHaveBeenLastCalledWith(expect.not.objectContaining({ taxTreatment: expect.anything() }));

    await user.clear(unitRate);
    await user.type(unitRate, "118.00");
    await user.click(preview);
    await waitFor(() => expect(knowledgeApi.previewKnowledge).toHaveBeenLastCalledWith(expect.objectContaining({ unitRatePaise: 11_800 })));
    expect(screen.queryByText(/paise/iu)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Recommendations" }));
    expect(await screen.findByRole("combobox", { name: "Target Basket" })).toHaveDisplayValue("Carpentry");
    expect(screen.getByRole("combobox", { name: "Target Main Line" })).toHaveDisplayValue("Related panel");
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue("Use matching panel");

    await user.click(screen.getByRole("tab", { name: "Quality" }));
    expect(await screen.findByRole("combobox", { name: "Parameter type" })).toHaveValue("number");
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("Thickness");

  });

  it("saves dirty Mode blocks in backend-section order with independent CAS versions", async () => {
    const user = userEvent.setup();
    mockConfiguredModeSections();
    let aggregateVersion = 4;
    vi.mocked(knowledgeApi.getKnowledgeItem).mockImplementation(async () => ({ ...item, version: aggregateVersion }));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey, input) => {
      aggregateVersion += 1;
      return mutationSection(sectionKey, input.payload, 3, aggregateVersion);
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const specificationName = await findPricingSpecificationName();
    await user.clear(specificationName);
    await user.type(specificationName, "Updated specification");
    await user.clear(screen.getByRole("spinbutton", { name: "Start margin (basis points)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start margin (basis points)" }), "250");
    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);

    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(2));
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "pricing",
      "quantity-margin"
    ]);
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenNthCalledWith(1, "line-1", "revision-1", "pricing", {
      expectedVersion: 2,
      expectedAggregateVersion: 4,
      applicability: "configured",
      payload: configuredPricingPayload("Updated specification")
    });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenNthCalledWith(2, "line-1", "revision-1", "quantity-margin", {
      expectedVersion: 2,
      expectedAggregateVersion: 5,
      applicability: "configured",
      payload: { startMarginBps: 250 }
    });
  });

  it("keeps one contextual Mode Save across clean, dirty, and saving states", async () => {
    const user = userEvent.setup();
    mockConfiguredModeSections();
    let resolveSave!: (saved: KnowledgeSectionMutationEnvelope<KnowledgeJsonObject>) => void;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    expect(screen.getAllByRole("button", { name: "Save Mode" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeDisabled();
    expect(screen.getByText("All changes saved")).toBeVisible();

    const specificationName = await findPricingSpecificationName();
    await user.clear(specificationName);
    await user.type(specificationName, "Updated specification");
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save Mode" }));
    expect(await screen.findByRole("button", { name: "Saving Mode…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("button", { name: "Saving Mode…" })).toHaveLength(1);

    resolveSave(mutationSection("pricing", configuredPricingPayload("Updated specification"), 3, 5));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Mode" })).toBeDisabled());
    expect(screen.getByText("All changes saved")).toBeVisible();
  });

  it("stops a Mode save on partial failure and retries only the still-dirty blocks", async () => {
    const user = userEvent.setup();
    mockConfiguredModeSections();
    let aggregateVersion = 4;
    let pricingAttempts = 0;
    vi.mocked(knowledgeApi.getKnowledgeItem).mockImplementation(async () => ({ ...item, version: aggregateVersion }));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey, input) => {
      if (sectionKey === "pricing" && pricingAttempts++ === 0) throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Service unavailable.");
      aggregateVersion += 1;
      return mutationSection(sectionKey, input.payload, 3, aggregateVersion);
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const specificationName = await findPricingSpecificationName();
    await user.clear(specificationName);
    await user.type(specificationName, "Unsaved specification");
    await user.clear(screen.getByRole("spinbutton", { name: "Start margin (basis points)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start margin (basis points)" }), "275");
    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);

    const partialFailure = await screen.findByRole("alert");
    expect(partialFailure).toHaveTextContent("Pricing");
    expect(partialFailure).toHaveTextContent("Service unavailable.");
    expect(screen.getByText("Save failed. Review the message below and try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeEnabled();
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual(["pricing"]);

    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(3));
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "pricing",
      "pricing",
      "quantity-margin"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([4, 4, 5]);
  });

  it("attributes a Mode conflict to its block while preserving and saving other dirty edits", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? [squareFoot, squareMetre] : [],
      pagination: { ...page, total: type === "uoms" ? 2 : 0 }
    }));
    let aggregateVersion = 4;
    let pricingReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeItem).mockImplementation(async () => ({ ...item, version: aggregateVersion }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey === "overview") return section(sectionKey, { description: "Server overview", uomId: squareFoot.id });
      if (sectionKey === "pricing") {
        pricingReads += 1;
        return pricingReads === 1
          ? section(sectionKey, configuredPricingPayload(), 2)
          : section(sectionKey, configuredPricingPayload("Latest server specification", "Latest server pricing"), 3);
      }
      if (sectionKey === "quantity-margin") return section(sectionKey, { startMarginBps: 100 });
      return section(sectionKey);
    });
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey, input) => {
      if (sectionKey === "pricing") throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.");
      aggregateVersion += 1;
      return mutationSection(sectionKey, input.payload, 3, aggregateVersion);
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const specificationName = await findPricingSpecificationName();
    await user.clear(specificationName);
    await user.type(specificationName, "My local specification");
    await user.clear(screen.getByRole("spinbutton", { name: "Start margin (basis points)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start margin (basis points)" }), "300");
    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);

    const conflict = await screen.findByRole("alertdialog", { name: "This section changed elsewhere" });
    expect(conflict).toHaveTextContent("Pricing");
    expect(conflict).toHaveTextContent(/version 2/iu);
    expect(conflict).toHaveTextContent(/version 3/iu);
    expect(pricingReads).toBeGreaterThan(1);
    expect(knowledgeApi.getKnowledgeItem).toHaveBeenCalledTimes(2);
    expect(specificationName).toHaveValue("My local specification");
    expect(screen.getByRole("spinbutton", { name: "Start margin (basis points)" })).toHaveValue(300);

    await user.click(within(conflict).getByRole("button", { name: "Discard local changes" }));
    expect(await findPricingSpecificationName()).toHaveValue("Latest server specification");
    expect(screen.getByRole("spinbutton", { name: "Start margin (basis points)" })).toHaveValue(300);

    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(2));
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "pricing",
      "quantity-margin"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([4, 4]);
  });

  it("reviews a Mode conflict as labelled values without raw price or vendor IDs", async () => {
    const user = userEvent.setup();
    let pricingReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey === "pricing") {
        pricingReads += 1;
        return pricingReads === 1
          ? section(sectionKey, configuredPricingPayload("Server specification", "Initial server pricing"), 2)
          : section(sectionKey, {
              technicalDescription: "Latest server pricing",
              specifications: [{ ...serverPricingSpecification, name: "Latest server specification" }],
              priceEntries: [{
                operation: "reference",
                priceEntryId: "private-price-entry-id",
                priceVersionId: "private-price-version-id",
                priceVersion: {
                  versionNumber: 7,
                  vendorId: "private-vendor-id",
                  inputAmountPaise: 12_345,
                  reviewRequired: false
                }
              }]
            }, 3);
      }
      return section(sectionKey);
    });
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValue(
      new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.")
    );
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const specificationName = await findPricingSpecificationName();
    await user.clear(specificationName);
    await user.type(specificationName, "My local specification");
    await user.click(screen.getByRole("button", { name: "Save Mode" }));
    const dialog = await screen.findByRole("alertdialog", { name: "This section changed elsewhere" });
    await user.click(within(dialog).getByRole("button", { name: "Review server version" }));

    const review = screen.getByRole("region", { name: "Latest Pricing server version" });
    expect(review).toHaveTextContent("Local version 2 · Latest server version 3");
    expect(review).toHaveTextContent("Latest server specification");
    expect(review).toHaveTextContent("Reference");
    expect(review).toHaveTextContent(/₹\s?123\.45/u);
    expect(review).toHaveTextContent("Review RequiredNo");
    expect(review).toHaveTextContent("Unavailable value");
    expect(review).not.toHaveTextContent("private-price-entry-id");
    expect(review).not.toHaveTextContent("private-price-version-id");
    expect(review).not.toHaveTextContent("private-vendor-id");
    expect(review.querySelector("pre")).toBeNull();
    expect(specificationName).toHaveValue("My local specification");
    await expectNoAutomatedAccessibilityViolations();
  });

  it("keeps a conflicted Mode block dirty when the latest server version cannot be loaded", async () => {
    const user = userEvent.setup();
    let pricingReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey === "pricing") {
        pricingReads += 1;
        if (pricingReads > 1) {
          throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Conflict refresh unavailable.");
        }
        return section(sectionKey, configuredPricingPayload(), 2);
      }
      return section(sectionKey);
    });
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValue(
      new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.")
    );
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const specificationName = await findPricingSpecificationName();
    await user.clear(specificationName);
    await user.type(specificationName, "My unsaved specification");
    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Pricing");
    expect(error).toHaveTextContent(/latest server version could not be loaded/iu);
    expect(error).toHaveTextContent("Conflict refresh unavailable.");
    expect(specificationName).toHaveValue("My unsaved specification");
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeEnabled();
    expect(screen.queryByRole("alertdialog", { name: "This section changed elsewhere" })).not.toBeInTheDocument();
  });

  it("discards every dirty Mode buffer before navigating to another section", async () => {
    const user = userEvent.setup();
    mockConfiguredModeSections();
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const specificationName = await findPricingSpecificationName();
    await user.clear(specificationName);
    await user.type(specificationName, "Local specification");
    await user.clear(screen.getByRole("spinbutton", { name: "Start margin (basis points)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start margin (basis points)" }), "350");
    await user.click(screen.getByRole("tab", { name: "Recommendations" }));
    const guard = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(guard).getByRole("button", { name: "Discard changes" }));

    expect(await screen.findByRole("tabpanel", { name: "Recommendations" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(await findPricingSpecificationName()).toHaveValue("Server specification");
    expect(screen.getByRole("spinbutton", { name: "Start margin (basis points)" })).toHaveValue(100);
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("keeps healthy Overview summaries usable while retrying one failed section load", async () => {
    const user = userEvent.setup();
    let pricingReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey === "pricing" && pricingReads++ === 0) {
        throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Pricing is temporarily unavailable.");
      }
      if (sectionKey === "overview") return section(sectionKey, { uomId: squareFoot.id });
      if (sectionKey === "pricing") return section(sectionKey, { technicalDescription: "Recovered pricing" });
      if (sectionKey === "quantity-margin") return section(sectionKey, { startMarginBps: 100 });
      return section(sectionKey);
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const pricingSummary = (await screen.findByRole("heading", { name: "Specifications" })).closest("section");
    const sharedValues = screen.getByRole("heading", { name: "Shared calculation values" }).closest("section");
    expect(pricingSummary).not.toBeNull();
    expect(sharedValues).not.toBeNull();
    expect(within(pricingSummary as HTMLElement).getByText(/Pricing is temporarily unavailable/u)).toBeVisible();
    expect(within(sharedValues as HTMLElement).getByText("1.00%")).toBeVisible();

    await user.click(within(pricingSummary as HTMLElement).getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Specifications" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Pricing" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/No (?:Specifications|Pricing) configured/u)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shared calculation values" })).toBeVisible();
  });

  it("keeps all Mode blocks visible and non-mutable for an active read-only revision", async () => {
    const user = userEvent.setup();
    const activeRevision: KnowledgeRevision = { ...revision, status: "active", activatedAt: revision.updatedAt, activatedById: "super-admin-1" };
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      status: "active",
      activeRevisionId: activeRevision.id,
      activeRevision,
      draftRevisionId: null,
      draftRevision: null,
      allowedActions: ["create_revision", "duplicate", "deactivate", "archive"]
    });
    mockConfiguredModeSections();
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    const status = screen.getByRole("region", { name: "Workspace status" });
    expect(within(status).getByText("Active revision 1")).toBeVisible();
    expect(within(status).getByText("Revision 1")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Overview" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Surfaces" }));
    expect(screen.getByRole("listbox", { name: "Surface options" })).toHaveAttribute("aria-readonly", "true");
    await user.keyboard("{Escape}");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const panel = await screen.findByRole("tabpanel", { name: "Mode" });
    expectModeRegionsInOrder(panel);
    expect(screen.queryByRole("combobox", { name: "UOM" })).not.toBeInTheDocument();
    expect(await findPricingSpecificationName()).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Pricing" })).queryByRole("textbox", { name: "Technical description" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Start margin (basis points)" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add UOM" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Mode" })).not.toBeInTheDocument();
    await expectNoAutomatedAccessibilityViolations();
  });

  it("keeps an archived workspace and every active section non-mutable", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({
      ...item,
      status: "archived",
      allowedActions: ["duplicate"]
    });
    mockConfiguredModeSections();
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByText("Archived configuration")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save Overview" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(await findPricingSpecificationName()).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Pricing" })).queryByRole("textbox", { name: "Technical description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review and activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    await expectNoAutomatedAccessibilityViolations();
  });

  it("quick-adds and saves a stable primary UOM ID from Overview", async () => {
    const user = userEvent.setup();
    let created = false;
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms" ? (created ? [squareFoot, squareMetre] : [squareFoot]) : [],
      pagination: { ...page, total: type === "uoms" ? (created ? 2 : 1) : 0 }
    }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) =>
      section(sectionKey, sectionKey === "overview" ? { description: "Server overview", uomId: squareFoot.id } : {})
    );
    vi.mocked(knowledgeApi.createKnowledgeMaster).mockImplementation(async () => {
      created = true;
      return squareMetre;
    });
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey, input) =>
      mutationSection(sectionKey, input.payload, 3, (input.expectedAggregateVersion ?? item.version) + 1)
    );
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("button", { name: "Add unit of measure" }));
    const dialog = screen.getByRole("dialog", { name: "Quick add UOM" });
    await user.type(within(dialog).getByRole("textbox", { name: "Code" }), "SQM");
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Square metre");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Quantity decimal places" }), "2");
    await user.click(within(dialog).getByRole("button", { name: "Add UOM" }));

    await waitFor(() => expect(knowledgeApi.createKnowledgeMaster).toHaveBeenCalledWith("uoms", {
      code: "SQM",
      name: "Square metre",
      description: null,
      decimalScale: 2
    }));
    expect(await screen.findByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveDisplayValue("Square metre");
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledWith(
      "line-1",
      "revision-1",
      "overview",
      expect.objectContaining({ payload: { description: "Server overview", uomId: squareMetre.id } })
    ));
  });

  it("preserves arrow, Home, End, and wraparound order across the four workspace tabs", async () => {
    const user = userEvent.setup();
    setViewportWidth(1024);
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await screen.findByRole("heading", { name: "Configured values" });
    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Recommendations" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Quality" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(overview).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Quality" })).toHaveFocus();
  });

  it("keeps focus on the selected Mode tab when dirty keyboard navigation is declined", async () => {
    const user = userEvent.setup();
    mockConfiguredModeSections();
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const mode = await screen.findByRole("tab", { name: "Mode" });
    await user.click(mode);
    const specificationName = await findPricingSpecificationName();
    await user.clear(specificationName);
    await user.type(specificationName, "Unsaved specification");
    mode.focus();

    await user.keyboard("{ArrowRight}");
    const guard = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    expect(mode).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Recommendations" })).toHaveAttribute("aria-selected", "false");
    await user.click(within(guard).getByRole("button", { name: "Stay here" }));

    await waitFor(() => expect(mode).toHaveFocus());
    expect(mode).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Recommendations" })).toHaveAttribute("tabindex", "-1");
  });

  it.each([1440, 1024, 768, 390, 320])("keeps section and category navigation operable at %ipx", async (width) => {
    const user = userEvent.setup();
    setViewportWidth(width);
    const workspace = renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await screen.findByRole("heading", { name: "Configured values" });

    if (width <= 640) {
      const selector = screen.getByRole("combobox", { name: "Configuration section" });
      expect(within(selector).getAllByRole("option").map((option) => option.textContent)).toEqual([
        "Overview",
        "Mode",
        "Recommendations",
        "Quality"
      ]);
      await user.selectOptions(selector, "mode");
      expect(await screen.findByRole("tabpanel", { name: "Mode" })).toBeVisible();
      const pricingRegion = screen.getByRole("region", { name: "Pricing" });
      expect(pricingRegion).toBeVisible();
      expect(within(pricingRegion).getByRole("heading", { name: "Pricing" })).toHaveClass("sr-only");
      expect(within(pricingRegion).getByRole("region", { name: "Specifications" })).toBeVisible();
      expect(screen.queryByRole("combobox", { name: "UOM" })).not.toBeInTheDocument();
    } else {
      const overview = screen.getByRole("tab", { name: "Overview" });
      overview.focus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: "Mode" })).toHaveFocus();
    }
    workspace.unmount();

    renderRoute(<KnowledgeReusableValuesPage />, "/admin/configuration/estimation/reusable-values", "/admin/configuration/estimation/reusable-values");
    await screen.findByRole("heading", { name: "Reusable estimation values" });
    if (width <= 640) {
      const selector = screen.getByRole("combobox", { name: "Reusable value category" });
      await user.selectOptions(selector, "taxes");
      expect(screen.getByRole("tab", { name: "Taxes" })).toHaveAttribute("aria-selected", "true");
    } else {
      const uomTab = screen.getByRole("tab", { name: "UOMs" });
      uomTab.focus();
      await user.keyboard("{End}");
      const surfaceTab = screen.getByRole("tab", { name: "Surfaces" });
      expect(surfaceTab).toHaveFocus();
      expect(surfaceTab).toHaveAttribute("aria-selected", "true");
      expect(surfaceTab).toHaveAttribute("aria-controls");
      expect(screen.queryByRole("tab", { name: "Modes" })).not.toBeInTheDocument();
    }
  });

  it("keeps mobile selectors keyboard-operable when reduced motion is requested", async () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));
    setViewportWidth(320);
    const user = userEvent.setup();
    try {
      renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
      const selector = await screen.findByRole("combobox", { name: "Configuration section" });
      selector.focus();
      await user.selectOptions(selector, "quality");
      expect(selector).toHaveFocus();
      expect(await screen.findByRole("heading", { name: "Quality" })).toBeVisible();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
