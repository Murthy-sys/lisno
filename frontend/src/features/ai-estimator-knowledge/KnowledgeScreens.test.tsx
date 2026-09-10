import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import * as authorization from "../../auth/authorization";
import { KnowledgeBaseIndexPage } from "./KnowledgeBaseIndexPage";
import { KnowledgeItemWorkspacePage } from "./KnowledgeItemWorkspacePage";
import { KnowledgeReusableValuesPage } from "./KnowledgeReusableValuesPage";
import * as knowledgeApi from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeRevision,
  KnowledgeSectionEnvelope,
  KnowledgeSectionMutationEnvelope,
  KnowledgeSectionKey,
  KnowledgeSurface
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
    listKnowledgeSubBaskets: vi.fn(),
    createKnowledgeMainLine: vi.fn(),
    listKnowledgeMasters: vi.fn(),
    createKnowledgeMaster: vi.fn(),
    createKnowledgeSurface: vi.fn(),
    getKnowledgeItem: vi.fn(),
    getKnowledgeHistory: vi.fn(),
    getKnowledgeSection: vi.fn(),
    getKnowledgeBasketQuality: vi.fn(),
    updateKnowledgeBasketQuality: vi.fn(),
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

const canonicalPriorities: readonly KnowledgeMaster[] = [
  { id: "priority-low", name: "Low", code: "LOW", semanticTier: "low" },
  { id: "priority-high", name: "High", code: "HIGH", semanticTier: "high" },
  { id: "priority-medium", name: "Medium", code: "MEDIUM", semanticTier: "medium" },
  {
    id: "priority-non-negotiable",
    name: "Non Negotiable",
    code: "NON_NEGOTIABLE",
    semanticTier: "non_negotiable"
  }
].map((priority, displayOrder) => ({
  ...squareFoot,
  ...priority,
  masterType: "priorities" as const,
  semanticTier: priority.semanticTier as KnowledgeMaster["semanticTier"],
  description: null,
  displayOrder,
  decimalScale: undefined
}));

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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={<main>{element}</main>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
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
  const mode = within(container).getByRole("region", { name: "Mode configuration" });
  const specifications = within(container).getByRole("region", { name: "Specifications" });
  expect(mode.compareDocumentPosition(specifications) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for (const name of ["Budgeting", "Vendors", "Surfaces", "Quantity & margin"]) {
    expect(within(container).queryByRole("region", { name })).not.toBeInTheDocument();
  }
  expect(within(container).queryByRole("button", { name: "Run server preview" })).not.toBeInTheDocument();
}

async function findPricingSpecificationName() {
  const specifications = await screen.findByRole("region", { name: "Specifications" });
  return within(specifications).getByRole("textbox", { name: "Specification name" });
}

async function editPmcMargin(user: ReturnType<typeof userEvent.setup>) {
  const margin = await screen.findByRole("spinbutton", { name: "PMC Margin" });
  await user.clear(margin);
  await user.type(margin, "15");
}

function mockConfiguredModeSections(
  quantityMarginPayload: KnowledgeJsonObject = { startMarginBps: 100, gapBehavior: "no_adjustment" }
) {
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
    items: type === "uoms" ? [squareFoot, squareMetre] : type === "surfaces" ? [wallSurface] : [],
    pagination: { ...page, total: type === "uoms" ? 2 : type === "surfaces" ? 1 : 0 }
  }));
  vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
    if (sectionKey === "overview") return section(sectionKey, { description: "Server overview", uomId: squareFoot.id });
    if (sectionKey === "pricing") return section(sectionKey, configuredPricingPayload());
    if (sectionKey === "quantity-margin") return section(sectionKey, quantityMarginPayload);
    return section(sectionKey);
  });
}

beforeEach(() => {
  vi.mocked(knowledgeApi.getKnowledgeBasketQuality).mockResolvedValue({ basketId: "basket-1", basketName: "Carpentry", basketStatus: "active", version: 1, revisionId: null, revisionNumber: 0, contentDigest: null, parameters: [], updatedAt: null });

  vi.clearAllMocks();
  vi.mocked(authorization.hasFrontendPermission).mockReturnValue(true);
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockResolvedValue({ items: [], pagination: page });
  vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [], pagination: page });
  vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockResolvedValue({ items: [], pagination: page });
  vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [], pagination: { ...page, limit: 20 } });
  vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue(item);
  vi.mocked(knowledgeApi.getKnowledgeHistory).mockResolvedValue({ items: [revision], pagination: page });
  vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => section(sectionKey));
});

describe("unsaved session request card", () => {
  const route = "/admin/configuration/estimation/items/line-1";
  const pattern = "/admin/configuration/estimation/items/:itemId";
  const rule = { id: "pending-rule", trigger: "removed", action: "remove", requirement: "must", targetType: "catalog", targetBasketId: "basket-1", targetSubBasketId: null, targetMainLineId: "target-2", reason: "Saved support requirement", active: true };
  const savedPayload = { budgetAlterations: [rule], exclusions: [{ id: "untouched", name: "Untouched exclusion", reason: "Saved exclusion sentinel", active: true }] };

  function setupRecommendations() {
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key, key === "recommendations" ? savedPayload : {}));
    const target = { ...item, id: "target-2", mainLineId: "target-2", mainLineName: "Ceiling light", subBasketId: null };
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [target], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [{ ...squareFoot, id: "basket-1", name: "Carpentry", status: "active" }], pagination: { ...page, total: 1 } });
  }

  it("shows only the edited value under history, survives history errors, and disappears on revert", async () => {
    setupRecommendations();
    vi.mocked(knowledgeApi.getKnowledgeHistory).mockRejectedValue(new Error("History unavailable"));
    const user = userEvent.setup();
    renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Recommendation & Exclusions" }));
    const reason = await screen.findByRole("textbox", { name: "Why is this change needed?" });
    expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument();
    await user.clear(reason); await user.type(reason, "Local mounting requirement");
    const card = screen.getByRole("region", { name: "Now requesting" });
    expect(card).toHaveTextContent("Local mounting requirement");
    expect(card).not.toHaveTextContent("Saved support requirement");
    expect(card).not.toHaveTextContent("Saved exclusion sentinel");
    expect(card).not.toHaveTextContent("Untouched exclusion");
    const history = screen.getByRole("region", { name: "Revision history" });
    expect(history.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reason).toHaveFocus();
    await user.clear(reason); await user.type(reason, rule.reason);
    expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument();
  });

  it("freezes the displayed baseline during refetch and discards only through the navigation guard", async () => {
    setupRecommendations();
    const user = userEvent.setup();
    const { queryClient } = renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Recommendation & Exclusions" }));
    await user.type(await screen.findByRole("textbox", { name: "Why is this change needed?" }), " local edit");
    await act(async () => {
      queryClient.setQueryData(knowledgeQueryKeys.section("line-1", "revision-1", "recommendations"), section("recommendations", {
        ...savedPayload, budgetAlterations: [{ ...rule, reason: "Another editor's saved wording", action: "add" }]
      }, 8));
    });
    const card = screen.getByRole("region", { name: "Now requesting" });
    expect(card).toHaveTextContent("Saved support requirement local edit");
    expect(card).not.toHaveTextContent("Another editor's saved wording");
    expect(within(card).queryByText("Scope action")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("region", { name: "Now requesting" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Recommendation & Exclusions" }));
    expect(await screen.findByRole("textbox", { name: "Why is this change needed?" })).toHaveValue("Another editor's saved wording");
    expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument();
  });

  it("clears confirmed changes before refresh finishes and retains edits made during the refresh", async () => {
    setupRecommendations();
    const user = userEvent.setup();
    const { queryClient } = renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Recommendation & Exclusions" }));
    await user.type(await screen.findByRole("textbox", { name: "Why is this change needed?" }), " confirmed");
    let releaseHistory!: () => void;
    vi.mocked(knowledgeApi.getKnowledgeHistory).mockImplementation(() => new Promise((resolve) => { releaseHistory = () => resolve({ items: [revision], pagination: page }); }));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_id, _revision, key, input) => mutationSection(key, input.payload));
    await user.click(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
    await waitFor(() => expect(releaseHistory).toBeTypeOf("function"));
    expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument();
    const reason = screen.getByRole("textbox", { name: "Why is this change needed?" });
    await user.type(reason, " later edit");
    expect(screen.getByRole("region", { name: "Now requesting" })).toHaveTextContent("later edit");
    await act(async () => { releaseHistory(); });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(reason).toHaveValue(`${rule.reason} confirmed later edit`);
    expect(screen.getByRole("region", { name: "Now requesting" })).toHaveTextContent("later edit");
  });

  it("retains failed saves and hides the card after a successful retry", async () => {
    setupRecommendations();
    const user = userEvent.setup();
    renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Recommendation & Exclusions" }));
    await user.type(await screen.findByRole("textbox", { name: "Why is this change needed?" }), " retry me");
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(new Error("Save interrupted"));
    await user.click(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
    expect(await screen.findByRole("region", { name: "Now requesting" })).toHaveTextContent("retry me");
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_id, _revision, key, input) => mutationSection(key, input.payload));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Recommendation & Exclusions" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument());
  });

  it("shows Specifications changes while opening Mode controls alone stays clean", async () => {
    mockConfiguredModeSections();
    const user = userEvent.setup();
    renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const name = await findPricingSpecificationName();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument();
    await user.clear(name); await user.type(name, "Moisture-resistant board");
    const card = await screen.findByRole("region", { name: "Now requesting" });
    expect(card).toHaveTextContent("Specifications");
    expect(card).toHaveTextContent("Moisture-resistant board");
    expect(card).not.toHaveTextContent("Server pricing");
    await user.clear(name); await user.type(name, serverPricingSpecification.name);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument());
  });

  it("shows only an edited shared-checklist field and omits saved item-specific and untouched rows", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeBasketQuality).mockResolvedValue({ basketId: "basket-1", basketName: "Carpentry", basketStatus: "active", version: 3, revisionId: "quality-three", revisionNumber: 3, contentDigest: null, updatedAt: item.updatedAt,
      parameters: [{ id: "q-one", label: "Ceiling alignment", type: "text", acceptanceCriteria: "Saved alignment criteria" }, { id: "q-two", label: "Untouched saved question", type: "boolean" }] });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key, key === "quality" ? { parameters: [{ label: "Historical item-only check", type: "text" }] } : {}));
    renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Quality Parameter" }));
    const criteria = (await screen.findAllByRole("textbox", { name: "Acceptance criteria" }))[0]!;
    expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument();
    await user.clear(criteria); await user.type(criteria, "Joints follow the approved layout");
    const card = await screen.findByRole("region", { name: "Now requesting" });
    expect(card).toHaveTextContent("Shared checklist · Carpentry");
    expect(card).toHaveTextContent("Joints follow the approved layout");
    for (const saved of ["Saved alignment criteria", "Untouched saved question", "Historical item-only check", "Answer type"]) expect(card).not.toHaveTextContent(saved);
    await user.clear(criteria); await user.type(criteria, "Saved alignment criteria");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument());
  });

  it("tracks successive legacy-row edits without copying saved fields or sending preview IDs", async () => {
    const user = userEvent.setup();
    const exclusions = [{ name: "First saved exclusion", reason: "First saved reason", active: true }, { name: "Second saved exclusion", reason: "Second saved reason", active: true }];
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key, key === "recommendations" ? { exclusions } : {}));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_id, _revision, key, input) => mutationSection(key, input.payload));
    renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Recommendation & Exclusions" }));
    const reasons = await screen.findAllByRole("textbox", { name: "Reason" });
    await user.clear(reasons[0]!); await user.type(reasons[0]!, "First pending reason");
    await user.clear(reasons[1]!); await user.type(reasons[1]!, "Second pending reason");
    const card = screen.getByRole("region", { name: "Now requesting" });
    expect(within(card).getAllByText("Updated")).toHaveLength(2);
    expect(within(card).queryByText("Added")).not.toBeInTheDocument();
    expect(within(card).queryByText("Removed")).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent("First saved reason");
    expect(card).not.toHaveTextContent("Second saved reason");
    await user.click(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalled());
    const submitted = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.lastCall?.[3].payload;
    expect(submitted).toEqual({ exclusions: [{ ...exclusions[0], reason: "First pending reason" }, { ...exclusions[1], reason: "Second pending reason" }] });
  });
});

describe("temporary item workspace", () => {
  it("creates a related starter, saves its real identity, reloads it, and excludes archived starters", async () => {
    const user = userEvent.setup();
    const electrical = { id: "electrical", name: "Electrical", description: null, displayOrder: 1, status: "active" as const, version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt };
    const lighting = { ...electrical, id: "ceiling-lighting", basketId: electrical.id, name: "Ceiling lighting" };
    const archived: KnowledgeItemDetail = { ...item, id: "archived-spotlight", mainLineId: "archived-spotlight", mainLineName: "Adjustable recessed spotlight", basketId: electrical.id, basketName: electrical.name, subBasketId: lighting.id, subBasketName: lighting.name, status: "archived" };
    const created: KnowledgeItemDetail = { ...item, id: "created-downlight", mainLineId: "created-downlight", mainLineName: "Recessed LED downlight", basketId: electrical.id, basketName: electrical.name, subBasketId: lighting.id, subBasketName: lighting.name, itemType: "main_line" };
    let catalog: KnowledgeItemDetail[] = [];
    let savedPayload: KnowledgeJsonObject = {};
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [electrical], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockResolvedValue({ items: [lighting], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockImplementation(async (params) => ({ items: params?.status === "archived" ? [archived] : catalog, pagination: { ...page, total: params?.status === "archived" ? 1 : catalog.length } }));
    vi.mocked(knowledgeApi.createKnowledgeMainLine).mockImplementation(async () => { catalog = [created]; return created; });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, key) => section(key, key === "recommendations" ? savedPayload : {}));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_lineId, _revisionId, key, input) => {
      savedPayload = input.payload;
      return mutationSection(key, savedPayload);
    });
    const route = "/admin/configuration/estimation/items/line-1";
    const pattern = "/admin/configuration/estimation/items/:itemId";
    const view = renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Recommendation & Exclusions" }));
    await user.click(await screen.findByRole("button", { name: "Add rule" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), electrical.id);
    const related = screen.getByRole("combobox", { name: "Related item" });
    await waitFor(() => expect(related).toBeEnabled());
    expect(within(related).queryByRole("option", { name: /Adjustable recessed spotlight/ })).not.toBeInTheDocument();
    const starter = within(related).getByRole("option", { name: "Recessed LED downlight · Ceiling lighting" }) as HTMLOptionElement;
    await user.selectOptions(related, starter.value);
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Add related item" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(related).toHaveValue(created.mainLineId));
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Why is this change needed?" }), "Review the mounting when the supporting ceiling is removed.");
    await user.click(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledOnce());
    expect(savedPayload.budgetAlterations).toEqual([expect.objectContaining({ targetMainLineId: created.mainLineId, targetBasketId: electrical.id, targetSubBasketId: lighting.id, targetType: "catalog" })]);
    expect(JSON.stringify(savedPayload)).not.toContain("suggestion:");
    view.unmount();
    renderRoute(<KnowledgeItemWorkspacePage />, route, pattern);
    await user.click(await screen.findByRole("tab", { name: "Recommendation & Exclusions" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Related item" })).toHaveDisplayValue(created.mainLineName));
    expect(knowledgeApi.createKnowledgeMainLine).toHaveBeenCalledOnce();
    expect(knowledgeApi.listKnowledgeItems).toHaveBeenCalledWith({ limit: 100, offset: 0, status: "archived" });
  });

  it("lists temporary items under their Main Basket beside regular Main Lines and opens Basket-scoped creation", async () => {
    const user = userEvent.setup();
    const temporary = { ...item, id: "temp-1", mainLineId: "temp-1", mainLineName: "Temporary pendant", itemType: "temporary" as const };
    const basket = { ...squareFoot, id: "basket-1", name: "Carpentry", status: "active" as const };
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [item, temporary], pagination: { ...page, total: 2 } });
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [basket], pagination: { ...page, total: 1 } });
    renderRoute(<KnowledgeBaseIndexPage />, "/admin/configuration/estimation", "/admin/configuration/estimation");
    expect(await screen.findByRole("link", { name: "Temporary pendant" })).toHaveAttribute("href", "/admin/configuration/estimation/items/temp-1");
    expect(screen.getByRole("link", { name: "Wall panelling" })).toBeVisible();
    const temporaryCard = screen.getByRole("link", { name: "Temporary pendant" }).closest("article")!;
    expect(temporaryCard).toHaveAttribute("data-item-type", "temporary");
    expect(within(temporaryCard).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(within(temporaryCard).queryByRole("heading", { name: "Main Line info" })).not.toBeInTheDocument();
    expect(screen.queryByText("Overview · Mode · Quality Parameters")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add temporary item to Carpentry" }));
    const dialog = screen.getByRole("dialog", { name: "Add temporary item" });
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Main basket" })).toHaveValue("basket-1"));
    expect(within(dialog).getByRole("textbox", { name: "Sub basket" })).not.toBeRequired();
    expect(within(dialog).getByRole("textbox", { name: "Temporary item name" })).toBeRequired();
  });

  it("loads every related-item page and saves the rule with stable identities and section CAS", async () => {
    const user = userEvent.setup();
    const target = { ...item, id: "target-2", mainLineId: "target-2", mainLineName: "Ceiling COB Lights", subBasketId: null };
    const basket = { ...squareFoot, id: "basket-1", name: "Carpentry", status: "active" as const };
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [basket], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockImplementation(async (params) => params?.offset === 0
      ? { items: [item], pagination: { ...page, total: 2, hasMore: true } }
      : { items: [target], pagination: { ...page, offset: 1, total: 2 } });
    const budgetRule = { id: "budget-1", trigger: "removed", action: "remove", requirement: "must", targetType: "catalog", targetBasketId: "basket-1", targetSubBasketId: null, targetMainLineId: "target-2", reason: "Ceiling support is needed.", active: true };
    const notes = [{ id: "old-note", name: "Retained exclusion", reason: "Existing note", active: true }];
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_id, _revision, key) => section(key, key === "recommendations" ? { budgetAlterations: [budgetRule], exclusions: notes } : {}));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_id, _revision, key, input) => mutationSection(key, input.payload, 3, 5));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await user.click(await screen.findByRole("tab", { name: "Recommendation & Exclusions" }));
    expect(await screen.findByRole("option", { name: "Ceiling COB Lights" })).toBeInTheDocument();
    expect(knowledgeApi.listKnowledgeItems).toHaveBeenCalledWith({ limit: 100, offset: 1 });
    const reason = screen.getByRole("textbox", { name: "Why is this change needed?" });
    await user.clear(reason);
    await user.type(reason, "Recessed lights need the false ceiling.");
    await user.click(screen.getByRole("button", { name: "Save Recommendation & Exclusions" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledWith("line-1", "revision-1", "recommendations", expect.objectContaining({ expectedVersion: 2, expectedAggregateVersion: 4, payload: { budgetAlterations: [{ ...budgetRule, reason: "Recessed lights need the false ceiling." }], exclusions: notes } })));
  });

  it("exposes only Overview, Mode and Quality without changing regular Main Line navigation", async () => {
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({ ...item, itemType: "temporary" });
    const user = userEvent.setup();
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await screen.findByRole("heading", { name: "Wall panelling" });
    expect(screen.queryByRole("tab", { name: "Recommendation & Exclusions" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(await screen.findByRole("checkbox", { name: "PMC" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Quality Parameter" }));
    expect(await screen.findByRole("button", { name: "Add Quality parameter" })).toBeVisible();
    await expectNoAutomatedAccessibilityViolations();
  });
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

    await screen.findByRole("heading", { name: "UOM" });
    expect(screen.queryByText(/by super-admin-1/u)).not.toBeInTheDocument();
    await expectNoAutomatedAccessibilityViolations();
  });

  it("renders one Main Line identity, backend-owned workspace status, and main-before-history structure", async () => {
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await screen.findByRole("heading", { name: "UOM" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Wall panelling", level: 1 })).toBeVisible();
    expect(screen.getByRole("button", { name: "Back to Main Baskets" })).toBeVisible();
    expect(screen.getByText("Main Basket · Carpentry")).toBeVisible();

    const status = screen.getByRole("region", { name: "Workspace status" });
    expect(within(status).getByText("Configuration completeness")).toBeVisible();
    expect(within(status).getByText("50%")).toBeVisible();
    /* Completeness is the only status here. Revision numbers and activation
       readiness belong to the section header and the activation dialog. */
    expect(status).not.toHaveTextContent(/revision/iu);
    expect(status).not.toHaveTextContent(/Ready|Blocked|Archived|Inactive/u);

    const pageActions = screen.getByRole("group", { name: "Page actions" });
    expect(within(pageActions).queryByRole("button", { name: /^Save /u })).not.toBeInTheDocument();
    const main = document.querySelector(".knowledge-workspace-main");
    const history = document.querySelector(".knowledge-workspace-history-rail");
    expect(main).not.toBeNull();
    expect(history).not.toBeNull();
    expect(main!.compareDocumentPosition(history!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

    await screen.findByRole("heading", { name: "UOM" });
    const actions = screen.getByRole("group", { name: "Page actions" });
    expect(within(actions).getAllByRole("button")).toEqual([
      within(actions).getByRole("button", { name: "Review activation" }),
      within(actions).getByRole("button", { name: "Create revision" }),
      within(actions).getByRole("button", { name: "Duplicate" }),
      within(actions).getByRole("button", { name: "Deactivate" }),
      within(actions).getByRole("button", { name: "Delete" })
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

    /* Warnings do not block, so the action still reads as a plain activation. */
    expect(await screen.findByRole("button", { name: "Review and activate" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Review activation" })).not.toBeInTheDocument();
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

    await screen.findByRole("heading", { name: "UOM" });
    expect(screen.queryByRole("button", { name: "Review and activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "UOM" })).toBeVisible();
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

    expect(await screen.findByRole("heading", { name: "UOM" })).toBeVisible();
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

  it("saves shared quality through the unsaved-navigation guard without editing the item revision", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeBasketQuality).mockImplementation(async (basketId, input) => ({ basketId, basketName: "Carpentry", basketStatus: "active", version: 2, revisionId: "shared-v1", revisionNumber: 1, contentDigest: "shared-digest", parameters: input.parameters, updatedAt: item.updatedAt }));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await user.click(await screen.findByRole("tab", { name: "Quality Parameter" }));
    await user.click(await screen.findByRole("button", { name: "Add Quality parameter" }));
    await user.type(screen.getByRole("textbox", { name: "Question / check" }), "Check the completed finish");
    await user.selectOptions(screen.getByRole("combobox", { name: "Answer type" }), "boolean");
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    const guard = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(guard).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeBasketQuality).toHaveBeenCalledWith("basket-1", expect.objectContaining({ expectedVersion: 1, parameters: [expect.objectContaining({ label: "Check the completed finish" })] })));
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "UOM" })).toBeVisible();
    expect(screen.queryByText("Check the completed finish")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Shared quality checklist" })).not.toBeInTheDocument();
  });

  it("retains the shared quality checklist when refresh fails in its own tab and retries there", async () => {
    const user = userEvent.setup();
    const saved = { basketId: "basket-1", basketName: "Carpentry", basketStatus: "active" as const, version: 2, revisionId: "shared-v1", revisionNumber: 1, contentDigest: "shared-digest", parameters: [{ id: "shared-check", type: "text", label: "Saved finish check" }], updatedAt: item.updatedAt };
    vi.mocked(knowledgeApi.getKnowledgeBasketQuality).mockResolvedValue(saved);
    const { queryClient } = renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await user.click(await screen.findByRole("tab", { name: "Quality Parameter" }));
    expect(await screen.findByRole("textbox", { name: "Question / check" })).toHaveValue("Saved finish check");
    vi.mocked(knowledgeApi.getKnowledgeBasketQuality).mockRejectedValue(new ApiError(503, "UPSTREAM_UNAVAILABLE", "Shared checklist refresh unavailable."));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketQuality("basket-1") });
    });
    expect(await screen.findByText("The latest shared checklist could not be refreshed.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Question / check" })).toHaveValue("Saved finish check");
    vi.mocked(knowledgeApi.getKnowledgeBasketQuality).mockResolvedValue({ ...saved, version: 3, parameters: [{ ...saved.parameters[0]!, label: "Current shared finish check" }] });
    await user.click(screen.getByRole("button", { name: "Retry refresh" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Question / check" })).toHaveValue("Current shared finish check"));
    expect(screen.queryByText("The latest shared checklist could not be refreshed.")).not.toBeInTheDocument();
  });

  it("renders minimal item cards with only the linked heading and completeness", async () => {
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [{ id: "basket-1", name: "Carpentry", description: null, displayOrder: 0, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [item], pagination: { ...page, limit: 20, total: 1 } });
    renderRoute(<KnowledgeBaseIndexPage />, "/admin/configuration/estimation", "/admin/configuration/estimation");

    expect(await screen.findByRole("heading", { name: "AI Estimator Knowledge Base" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Carpentry" })).toBeVisible();
    expect(screen.getByText("50% complete")).toBeVisible();
    const title = screen.getByRole("link", { name: "Wall panelling" });
    expect(title).toHaveAttribute("href", "/admin/configuration/estimation/items/line-1");
    const card = title.closest("article")!;
    expect(within(card).getAllByRole("heading")).toHaveLength(1);
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(card.querySelector("dl")).toBeNull();
    expect(within(card).queryByText("Draft")).not.toBeInTheDocument();
    expect(within(card).queryByText(item.description!)).not.toBeInTheDocument();
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

    await screen.findByRole("heading", { name: "UOM", level: 2 });
    expect(screen.queryByRole("combobox", { name: "Section state" })).not.toBeInTheDocument();

    for (const sectionName of ["Recommendation & Exclusions", "Quality Parameter"]) {
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
    expect(uom).toBeDisabled();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeDisabled();

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

  it("rebases moved Surface edits onto the latest Overview without overwriting UOM or hidden fields", async () => {
    const user = userEvent.setup();
    const initialPayload = {
      description: "Initial hidden description",
      uomId: squareFoot.id,
      surfaceIds: [],
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
      items: type === "uoms" ? [squareFoot, squareMetre] : type === "surfaces" ? [wallSurface] : [],
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

    await user.click(await screen.findByRole("button", { name: "Applicable surfaces" }));
    await user.click(screen.getByRole("option", { name: "Wall" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    const conflict = await screen.findByRole("alertdialog", { name: "This section changed elsewhere" });
    await user.click(within(conflict).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toHaveAccessibleDescription("Wall");

    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(2));
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenLastCalledWith(
      "line-1",
      "revision-1",
      "overview",
      {
        expectedVersion: 3,
        expectedAggregateVersion: 4,
        applicability: "configured",
        payload: { ...latestPayload, surfaceIds: [wallSurface.id] }
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

  it("guards Mode tab navigation while Overview UOM changes are unsaved", async () => {
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
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    const guard = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(guard).getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("tabpanel", { name: "Mode" })).toBeVisible();
  });

  it("shows only UOM and Surface configuration for an empty Overview", async () => {
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) =>
      section(sectionKey)
    );
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByRole("heading", { name: "UOM" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Surfaces" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("radiogroup", { name: "Modes" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Selected Mode details" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Shared calculation values" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Specifications" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Budgeting" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Recommendation & Exclusions", level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Quality Parameter", level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "All section summaries" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^Open /u })).not.toBeInTheDocument();
    expect(screen.queryByText(/No .* configured/u)).not.toBeInTheDocument();
  });

  it("keeps descriptive Specifications separate from a business-only saved Budget", async () => {
    const user = userEvent.setup();
    const vendor = { ...squareFoot, id: "vendor-1", masterType: "vendors", code: "ACME", name: "Acme Vendor" } as const;
    const tax = { id: "tax-1", masterType: "taxes", code: "GST18", name: "GST 18%", description: null, displayOrder: 0, status: "active", taxVersions: [{ id: "tax-version-1", taxRuleId: "tax-1", versionNumber: 1, rateBps: 1800, treatment: "exclusive", applicability: "materials", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: null, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt } as const;
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => {
      const items = type === "taxes" ? [tax] : type === "vendors" ? [vendor] : type === "uoms" ? [squareFoot] : [];
      return { items, pagination: { ...page, total: items.length } };
    });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => section(sectionKey, sectionKey === "pricing" ? {
      specifications: [{ id: "spec-1", name: "Premium ply" }],
      priceEntries: [{
        operation: "reference",
        priceEntryId: "price-entry-1",
        priceVersionId: "price-version-1",
        priceVersion: {
          id: "price-version-1",
          priceEntryId: "price-entry-1",
          versionNumber: 1,
          vendorId: vendor.id,
          uomId: squareFoot.id,
          taxRuleId: tax.id,
          taxVersionId: "tax-version-1",
          inputAmountPaise: 12_000,
          baseAmountPaise: 12_000,
          taxAmountPaise: 2_160,
          totalAmountPaise: 14_160,
          treatment: "exclusive",
          effectiveFrom: "2026-08-01T00:00:00.000Z",
          effectiveTo: null,
          status: "active"
        }
      }]
    } : {}));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    expect(await findPricingSpecificationName()).toHaveValue("Premium ply");
    expect(screen.queryByRole("combobox", { name: "Specification" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Budgeting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Saved budget details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Specification" })).toBeEnabled();
  });

  it("saves Overview Surfaces with UOM, clears them, and preserves hidden configuration", async () => {
    const user = userEvent.setup();
    mockConfiguredModeSections();
    let overview = section("overview", { uomId: squareFoot.id, priorityId: "priority-kept", hidden: { preserve: true } }, 8);
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) => key === "overview" ? overview : section(key));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_line, _revision, key, input) => {
      const saved = mutationSection(key, input.payload, input.expectedVersion + 1, (input.expectedAggregateVersion ?? 4) + 1);
      overview = saved;
      return saved;
    });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    const surfaces = await screen.findByRole("button", { name: "Applicable surfaces" });
    await user.click(surfaces);
    await user.click(screen.getByRole("option", { name: "Wall" }));
    await user.keyboard("{Escape}");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }), squareMetre.id);
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Overview" })).toBeDisabled());
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledWith("line-1", "revision-1", "overview", {
      expectedVersion: 8, expectedAggregateVersion: 4, applicability: "configured",
      payload: { uomId: squareMetre.id, priorityId: "priority-kept", hidden: { preserve: true }, surfaceIds: [wallSurface.id] }
    });
    await user.click(surfaces);
    await user.click(screen.getByRole("option", { name: "Wall" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(2));
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3]).toMatchObject({
      expectedVersion: 9,
      payload: { uomId: squareMetre.id, priorityId: "priority-kept", hidden: { preserve: true }, surfaceIds: [] }
    });
    await expectNoAutomatedAccessibilityViolations();
  });

  it("keeps Specifications usable when unrelated Tax and Vendor catalogs fail", async () => {
    const user = userEvent.setup();
    mockConfiguredModeSections();
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => {
      if (type === "taxes" || type === "vendors") throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Catalog unavailable.");
      return { items: [], pagination: page };
    });
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_line, _revision, key, input) => mutationSection(key, input.payload, 3, 5));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const name = await findPricingSpecificationName();
    await user.type(name, " updated");
    await user.click(screen.getByRole("button", { name: "Save Mode" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledOnce());
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[2]).toBe("pricing");
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

    const selector = await screen.findByRole("group", { name: "Mode" });
    expect(within(selector).getByRole("checkbox", { name: "PMC" })).toBeChecked();
    expect(within(selector).getByRole("checkbox", { name: "Execution" })).not.toBeChecked();
    expect(vi.mocked(knowledgeApi.listKnowledgeMasters).mock.calls
      .filter(([type]) => type === "modes")
      .map(([, params]) => params?.offset ?? 0)).toEqual([0, 100]);
  });

  it("collects every Surface page for the Overview selector", async () => {
    const user = userEvent.setup();
    const firstPageSurfaces: readonly KnowledgeSurface[] = Array.from(
      { length: 100 },
      (_, index) => ({
        ...wallSurface,
        id: `surface-decoy-${index + 1}`,
        masterType: "surfaces" as const,
        code: `SURFACE_DECOY_${index + 1}`,
        name: `Surface decoy ${index + 1}`
      })
    );
    const pageTwoSurface: KnowledgeSurface = {
      ...wallSurface,
      id: "surface-page-101",
      masterType: "surfaces",
      code: "SURFACE_PAGE_101",
      name: "Zellige surface"
    };
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type, params = {}) => {
      if (type === "uoms") {
        return {
          items: [squareFoot, squareMetre],
          pagination: { ...page, total: 2 }
        };
      }
      if (type !== "surfaces") return { items: [], pagination: page };
      return (params.offset ?? 0) === 0
        ? {
            items: firstPageSurfaces,
            pagination: { limit: 100, offset: 0, total: 101, hasMore: true }
          }
        : {
            items: [pageTwoSurface],
            pagination: { limit: 100, offset: 100, total: 101, hasMore: false }
          };
    });
    renderRoute(
      <KnowledgeItemWorkspacePage />,
      "/admin/configuration/estimation/items/line-1",
      "/admin/configuration/estimation/items/:itemId"
    );

    await user.click(await screen.findByRole("button", { name: "Applicable surfaces" }));
    await user.type(screen.getByRole("searchbox", { name: "Search surfaces" }), "Zellige");
    expect(screen.getByRole("option", { name: "Zellige surface" })).toBeVisible();
    const surfaceCalls = vi.mocked(knowledgeApi.listKnowledgeMasters).mock.calls
      .filter(([type]) => type === "surfaces");
    expect(surfaceCalls.map(([, params]) => params?.offset ?? 0)).toEqual([0, 100]);
    expect(surfaceCalls.every(([, params]) => params?.includeArchived === true)).toBe(true);
  });

  it("collects every Surface page for the Main Line filter", async () => {
    const user = userEvent.setup();
    const firstPageSurfaces: readonly KnowledgeMaster[] = Array.from(
      { length: 100 },
      (_, index) => ({
        ...wallSurface,
        id: `surface-filter-decoy-${index + 1}`,
        code: `SURFACE_FILTER_DECOY_${index + 1}`,
        name: `Filter surface ${index + 1}`
      })
    );
    const pageTwoSurface = {
      ...wallSurface,
      id: "surface-filter-101",
      code: "SURFACE_FILTER_101",
      name: "Zellige filter surface"
    };
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type, params = {}) => {
      if (type !== "surfaces") return { items: [], pagination: page };
      return (params.offset ?? 0) === 0
        ? {
            items: firstPageSurfaces,
            pagination: { limit: 100, offset: 0, total: 101, hasMore: true }
          }
        : {
            items: [pageTwoSurface],
            pagination: { limit: 100, offset: 100, total: 101, hasMore: false }
          };
    });
    renderRoute(
      <KnowledgeBaseIndexPage />,
      "/admin/configuration/estimation",
      "/admin/configuration/estimation"
    );

    await user.click(await screen.findByRole("button", { name: "Filters" }));
    const filter = screen.getByRole("combobox", { name: "Surface" });
    expect(within(filter).getByRole("option", { name: "Zellige filter surface" })).toHaveValue(
      pageTwoSurface.id
    );
    const surfaceCalls = vi.mocked(knowledgeApi.listKnowledgeMasters).mock.calls
      .filter(([type]) => type === "surfaces");
    expect(surfaceCalls.map(([, params]) => params?.offset ?? 0)).toEqual([0, 100]);
    expect(surfaceCalls.every(([, params]) => params?.includeArchived === true)).toBe(true);
  });

  it("renders four guided sections without hidden-section Overview summaries while preserving Overview and Mode behavior", async () => {
    vi.mocked(knowledgeApi.getKnowledgeBasketQuality).mockResolvedValue({ basketId: "basket-1", basketName: "Carpentry", basketStatus: "active", version: 3, revisionId: "basket-quality-1", revisionNumber: 1, contentDigest: "quality-digest", parameters: [{ id: "shared-quality-1", type: "number", label: "Thickness", unit: "mm", required: true, active: true }], updatedAt: item.updatedAt });

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
      if (sectionKey === "recommendations") return section(sectionKey, { recommendations: [{ id: "recommendation-1", name: "Related panel", priorityId: "priority-1", reason: "Use matching panel", dependency: false, active: true }] });
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
      "Recommendation & Exclusions",
      "Quality Parameter"
    ]);
    expect(within(tablist).queryByRole("tab", { name: "Scope" })).not.toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: "Execution" })).not.toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: "Advanced" })).not.toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: "Pricing" })).not.toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: "Quantity & margin" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "UOM" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Section applicability rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Section key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveDisplayValue("Square foot");
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Recommendation & Exclusions", level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Quality Parameter", level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByText("Use matching panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Thickness")).not.toBeInTheDocument();
    const overview = document.querySelector(".knowledge-overview");
    expect(overview).not.toBeNull();
    expect(within(overview as HTMLElement).queryByRole("heading", { name: "All section summaries" })).not.toBeInTheDocument();
    expect(within(overview as HTMLElement).queryByRole("heading", { name: "Scope", level: 3 })).not.toBeInTheDocument();
    expect(within(overview as HTMLElement).queryByRole("heading", { name: "Execution", level: 3 })).not.toBeInTheDocument();
    expect(within(overview as HTMLElement).queryByRole("heading", { name: "Advanced", level: 3 })).not.toBeInTheDocument();
    expect(overview?.querySelectorAll("article.knowledge-overview-card")).toHaveLength(0);
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }), squareMetre.id);
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    const modePanel = await screen.findByRole("tabpanel", { name: "Mode" });
    expectModeRegionsInOrder(modePanel);
    expect(within(modePanel).getByRole("region", { name: "Specifications" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Specification" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Recommendation & Exclusions" }));
    /* Recommendation is free text now; the Basket is context above the section
       rather than anything selectable inside a row. */
    expect(await screen.findByRole("textbox", { name: "Recommendation" })).toHaveValue("Related panel");
    expect(screen.queryByRole("combobox", { name: "Recommendation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Target Basket" })).not.toBeInTheDocument();
    const recommendationSection = document.querySelector(".knowledge-section-editor");
    expect(recommendationSection).not.toBeNull();
    expect(within(recommendationSection as HTMLElement).getByText(/Main Basket ·/u)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue("Use matching panel");

    await user.click(screen.getByRole("tab", { name: "Quality Parameter" }));
    expect(await screen.findByRole("combobox", { name: "Answer type" })).toHaveValue("number");
    expect(screen.getByRole("textbox", { name: "Question / check" })).toHaveValue("Thickness");

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
    await editPmcMargin(user);
    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);

    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(2));
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual(["advanced", "pricing"]);
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenNthCalledWith(1, "line-1", "revision-1", "advanced", expect.objectContaining({
      expectedVersion: 2, expectedAggregateVersion: 4, applicability: "configured",
      payload: { pmcMarginBps: 1500 }
    }));
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenNthCalledWith(2, "line-1", "revision-1", "pricing", {
      expectedVersion: 2, expectedAggregateVersion: 5, applicability: "configured",
      payload: configuredPricingPayload("Updated specification")
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
    await editPmcMargin(user);
    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);

    const partialFailure = await screen.findByRole("alert");
    expect(partialFailure).toHaveTextContent("Specifications");
    expect(partialFailure).toHaveTextContent("Service unavailable.");
    expect(screen.getByText("Save failed. Review the message below and try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeEnabled();
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual(["advanced", "pricing"]);

    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(3));
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "pricing",
      "pricing"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([4, 5, 5]);
  });

  it("attributes a Specifications conflict without discarding the acknowledged Mode change", async () => {
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
    await editPmcMargin(user);
    await user.click(screen.getAllByRole("button", { name: "Save Mode" })[0]);

    const conflict = await screen.findByRole("alertdialog", { name: "This section changed elsewhere" });
    expect(conflict).toHaveTextContent("Specifications");
    expect(conflict).toHaveTextContent(/version 2/iu);
    expect(conflict).toHaveTextContent(/version 3/iu);
    expect(pricingReads).toBeGreaterThan(1);
    expect(knowledgeApi.getKnowledgeItem).toHaveBeenCalled();
    expect(specificationName).toHaveValue("My local specification");
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(15);

    await user.click(within(conflict).getByRole("button", { name: "Discard local changes" }));
    expect(await findPricingSpecificationName()).toHaveValue("Latest server specification");
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(15);

    expect(screen.getByRole("button", { name: "Save Mode" })).toBeDisabled();
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(2);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "pricing"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([4, 5]);
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
                  baseAmountPaise: 12_345,
                  taxAmountPaise: 2_222,
                  totalAmountPaise: 14_567,
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

    const review = screen.getByRole("region", { name: "Latest Specifications server version" });
    expect(review).toHaveTextContent("Local version 2 · Latest server version 3");
    expect(review).toHaveTextContent("Latest server specification");
    expect(review).not.toHaveTextContent("Budget 1");
    expect(review).not.toHaveTextContent(/₹\s?123\.45/u);
    expect(review).not.toHaveTextContent("Reference");
    expect(review).not.toHaveTextContent("Review Required");
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
    expect(error).toHaveTextContent("Specifications");
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
    await editPmcMargin(user);
    await user.click(screen.getByRole("tab", { name: "Recommendation & Exclusions" }));
    const guard = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(guard).getByRole("button", { name: "Discard changes" }));

    expect(await screen.findByRole("tabpanel", { name: "Recommendation & Exclusions" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(await findPricingSpecificationName()).toHaveValue("Server specification");
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(null);
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("loads only Overview section data and omits saved summaries from the Overview tab", async () => {
    mockConfiguredModeSections();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey === "overview") return section(sectionKey, { uomId: squareFoot.id, description: "Hidden saved description", priorityId: "hidden-priority", modeIds: ["hidden-mode"], surfaceIds: [wallSurface.id] });
      throw new Error(`Overview must not request ${sectionKey}`);
    });
    vi.mocked(knowledgeApi.getKnowledgeBasketQuality).mockRejectedValue(new Error("Overview must not request the shared checklist"));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveDisplayValue("Square foot");
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toHaveAccessibleDescription("Wall");
    const overview = document.querySelector(".knowledge-overview") as HTMLElement;
    expect(within(overview).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["UOM", "Surfaces"]);
    expect(overview).not.toHaveTextContent("Hidden saved description");
    expect(overview).not.toHaveTextContent("Main Basket");
    expect(within(overview).queryByRole("button", { name: /^Open /u })).not.toBeInTheDocument();
    expect(vi.mocked(knowledgeApi.getKnowledgeSection).mock.calls.map(([, , sectionKey]) => sectionKey)).toEqual(["overview"]);
    expect(knowledgeApi.getKnowledgeBasketQuality).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Revision history" })).toBeVisible();
    await expectNoAutomatedAccessibilityViolations();
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
    expect(screen.queryByRole("button", { name: "Add Unit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Overview" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Applicable surfaces" }));
    expect(screen.getByRole("listbox", { name: "Surface options" })).toHaveAttribute("aria-readonly", "true");
    await user.click(screen.getByRole("option", { name: "Wall" }));
    expect(screen.getByRole("option", { name: "Wall" })).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Surfaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Surface options" })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const panel = await screen.findByRole("tabpanel", { name: "Mode" });
    expectModeRegionsInOrder(panel);
    expect(screen.queryByRole("combobox", { name: "UOM" })).not.toBeInTheDocument();
    expect(await findPricingSpecificationName()).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Priority" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Specifications" })).queryByRole("textbox", { name: "Technical description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toBeDisabled();
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
    await user.click(await screen.findByRole("button", { name: "Applicable surfaces" }));
    expect(screen.getByRole("listbox", { name: "Surface options" })).toHaveAttribute("aria-readonly", "true");
    await user.click(screen.getByRole("option", { name: "Wall" }));
    expect(screen.getByRole("option", { name: "Wall" })).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(await findPricingSpecificationName()).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Priority" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Specifications" })).queryByRole("textbox", { name: "Technical description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review and activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
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
      section(sectionKey, sectionKey === "overview" ? {
        description: "Server overview",
        uomId: squareFoot.id,
        surfaceIds: [wallSurface.id]
      } : {})
    );
    vi.mocked(knowledgeApi.createKnowledgeMaster).mockImplementation(async () => {
      created = true;
      return squareMetre;
    });
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey, input) =>
      mutationSection(sectionKey, input.payload, 3, (input.expectedAggregateVersion ?? item.version) + 1)
    );
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Add Unit" }));
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
      expect.objectContaining({
        payload: {
          description: "Server overview",
          uomId: squareMetre.id,
          surfaceIds: [wallSurface.id]
        }
      })
    ));
  });

  it("quick-adds by returned Surface ID, preserves the failed Overview draft, and keeps the Surface after discard", async () => {
    const user = userEvent.setup();
    let created = false;
    const counterSurface: KnowledgeSurface = {
      ...wallSurface,
      id: "surface-counter-returned",
      masterType: "surfaces",
      code: "GENERATED_SURFACE_CODE",
      name: "Counter surface",
      description: "Granite, quartz, marble",
      version: 1
    };
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => ({
      items: type === "uoms"
        ? [squareFoot]
        : type === "surfaces" && created
          ? [counterSurface]
          : [],
      pagination: {
        ...page,
        total: type === "uoms" || (type === "surfaces" && created) ? 1 : 0
      }
    }));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) =>
      section(sectionKey, sectionKey === "overview" ? {
        priorityId: "priority-preserved",
        hiddenCompatibility: { preserve: true }
      } : {})
    );
    vi.mocked(knowledgeApi.createKnowledgeSurface).mockImplementation(async () => {
      created = true;
      return counterSurface;
    });
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValue(
      new ApiError(503, "UPSTREAM_UNAVAILABLE", "Surface assignment unavailable.")
    );
    renderRoute(
      <KnowledgeItemWorkspacePage />,
      "/admin/configuration/estimation/items/line-1",
      "/admin/configuration/estimation/items/:itemId"
    );

    await user.click(await screen.findByRole("button", { name: "Add Surface" }));
    const dialog = screen.getByRole("dialog", { name: "Add Surface" });
    await user.type(within(dialog).getByRole("textbox", { name: "Surface name" }), "Counter surface");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Examples / components" }),
      "Granite, quartz, marble"
    );
    await user.click(within(dialog).getByRole("button", { name: "Add Surface" }));

    await waitFor(() => expect(knowledgeApi.createKnowledgeSurface).toHaveBeenCalledWith({
      name: "Counter surface",
      description: "Granite, quartz, marble"
    }));
    expect(knowledgeApi.createKnowledgeSurface).toHaveBeenCalledWith(
      expect.not.objectContaining({ code: expect.anything() })
    );
    expect(await screen.findByText("Counter surface added. Save Overview to apply it.")).toBeInTheDocument();
    const selector = screen.getByRole("button", { name: "Applicable surfaces" });
    expect(selector).toHaveAccessibleDescription("Counter surface");

    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledWith(
      item.mainLineId,
      revision.id,
      "overview",
      expect.objectContaining({
        payload: {
          priorityId: "priority-preserved",
          hiddenCompatibility: { preserve: true },
          surfaceIds: [counterSurface.id]
        }
      })
    ));
    expect(await screen.findByText("Surface assignment unavailable.")).toBeVisible();
    expect(selector).toHaveAccessibleDescription(
      "Counter surface"
    );

    await user.click(screen.getByRole("tab", { name: "Mode" }));
    const unsaved = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(unsaved).getByRole("button", { name: "Discard changes" }));
    await user.click(await screen.findByRole("tab", { name: "Overview" }));
    const restoredSelector = await screen.findByRole("button", { name: "Applicable surfaces" });
    expect(restoredSelector).toHaveAccessibleDescription("Select surfaces");
    await user.click(restoredSelector);
    expect(screen.getByRole("option", { name: "Counter surface" })).toBeVisible();
  });

  it("preserves arrow, Home, End, and wraparound order across the four workspace tabs", async () => {
    const user = userEvent.setup();
    setViewportWidth(1024);
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await screen.findByRole("heading", { name: "UOM" });
    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Recommendation & Exclusions" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Quality Parameter" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(overview).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Quality Parameter" })).toHaveFocus();
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
    expect(screen.getByRole("tab", { name: "Recommendation & Exclusions" })).toHaveAttribute("aria-selected", "false");
    await user.click(within(guard).getByRole("button", { name: "Stay here" }));

    await waitFor(() => expect(mode).toHaveFocus());
    expect(mode).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Recommendation & Exclusions" })).toHaveAttribute("tabindex", "-1");
  });

  it.each([1440, 1024, 768, 390, 320])("keeps section and category navigation operable at %ipx", async (width) => {
    const user = userEvent.setup();
    setViewportWidth(width);
    const workspace = renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await screen.findByRole("heading", { name: "UOM" });

    if (width <= 640) {
      const selector = screen.getByRole("combobox", { name: "Configuration section" });
      expect(within(selector).getAllByRole("option").map((option) => option.textContent)).toEqual([
        "Overview",
        "Mode",
        "Recommendation & Exclusions",
        "Quality Parameter"
      ]);
      await user.selectOptions(selector, "mode");
      expect(await screen.findByRole("tabpanel", { name: "Mode" })).toBeVisible();
      expectModeRegionsInOrder(screen.getByRole("tabpanel", { name: "Mode" }));
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
      expect(await screen.findByRole("heading", { name: "Quality Parameter" })).toBeVisible();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
