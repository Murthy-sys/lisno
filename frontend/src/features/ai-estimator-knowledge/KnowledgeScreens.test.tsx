import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { KnowledgeBaseIndexPage } from "./KnowledgeBaseIndexPage";
import { KnowledgeItemWorkspacePage } from "./KnowledgeItemWorkspacePage";
import { KnowledgeReusableValuesPage } from "./KnowledgeReusableValuesPage";
import * as knowledgeApi from "./knowledgeApi";
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeRevision,
  KnowledgeSectionEnvelope,
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
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: () => true }));
vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    listKnowledgeItems: vi.fn(),
    listKnowledgeBaskets: vi.fn(),
    listKnowledgeMasters: vi.fn(),
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

function renderRoute(element: React.ReactElement, path: string, route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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

beforeEach(() => {
  vi.clearAllMocks();
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

    await screen.findByRole("textbox", { name: "Description" });
    await expectNoAutomatedAccessibilityViolations();
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

  it("saves one independent Draft section with the exact aggregate and section CAS versions", async () => {
    const user = userEvent.setup();
    const saved = section("overview", { description: "Updated knowledge" }, 3);
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockResolvedValue(saved);
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const description = await screen.findByRole("textbox", { name: "Description" });
    await user.type(description, "Updated knowledge");
    await user.click(screen.getAllByRole("button", { name: "Save section" })[0]);
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledWith("line-1", "revision-1", "overview", {
      expectedVersion: 2,
      expectedAggregateVersion: 4,
      applicability: "configured",
      payload: { description: "Updated knowledge" }
    }));
  });

  it("retains local section input after a CAS conflict and never replays automatically", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."));
    vi.mocked(knowledgeApi.getKnowledgeSection)
      .mockResolvedValueOnce(section("overview", {}, 2))
      .mockResolvedValueOnce(section("overview", { description: "Server value" }, 3));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    const description = await screen.findByRole("textbox", { name: "Description" });
    await user.type(description, "My local value");
    await user.click(screen.getAllByRole("button", { name: "Save section" })[0]);
    expect(await screen.findByRole("alertdialog", { name: "This section changed elsewhere" })).toBeVisible();
    expect(description).toHaveValue("My local value");
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    expect(knowledgeApi.getKnowledgeItem).toHaveBeenCalledTimes(2);
  });

  it("guards Back and lifecycle exits while the Draft section is dirty", async () => {
    const user = userEvent.setup();
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

    await user.type(await screen.findByRole("textbox", { name: "Description" }), "Unsaved");
    await user.click(screen.getByRole("button", { name: "Review and activate" }));
    expect(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.queryByRole("dialog", { name: /Review and activate/u })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to knowledge base/u }));
    expect(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Knowledge home" })).toBeVisible();
  });

  it("selects pricing specifications and immutable tax versions by name while storing stable IDs", async () => {
    const user = userEvent.setup();
    const tax = { id: "tax-1", masterType: "taxes", code: "GST18", name: "GST 18%", description: null, displayOrder: 0, status: "active", taxVersions: [{ id: "tax-version-1", taxRuleId: "tax-1", versionNumber: 1, rateBps: 1800, treatment: "exclusive", applicability: "materials", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: null, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt } as const;
    vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => type === "taxes" ? { items: [tax], pagination: { ...page, total: 1 } } : { items: [], pagination: page });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => section(sectionKey, sectionKey === "pricing" ? { specifications: [{ id: "spec-1", name: "Premium ply" }], priceEntries: [{ operation: "append", priceEntryId: "price-entry-1", specificationId: "spec-1", taxRuleId: "tax-1", taxVersionId: "tax-version-1" }] } : {}));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    await user.click(await screen.findByRole("tab", { name: "Pricing" }));
    expect(await screen.findByRole("combobox", { name: "Specification" })).toHaveDisplayValue("Premium ply");
    expect(screen.getByRole("combobox", { name: "Tax rule" })).toHaveDisplayValue("GST 18%");
    expect(screen.getByRole("combobox", { name: "Tax version" })).toHaveDisplayValue(/Version 1 · 18%/u);
    expect(screen.queryByRole("textbox", { name: /Tax version ID/iu })).not.toBeInTheDocument();
  });

  it("renders immutable resolved price details and prepares a replacement with the same stable entry ID", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => section(sectionKey, sectionKey === "pricing" ? { priceEntries: [{ operation: "reference", priceEntryId: "price-entry-1", priceVersionId: "price-version-1", priceVersion: { id: "price-version-1", priceEntryId: "price-entry-1", versionNumber: 1, vendorId: "vendor-1", uomId: "uom-1", specificationId: null, modeId: null, taxRuleId: "tax-1", taxVersionId: "tax-version-1", inputAmountPaise: 12000, baseAmountPaise: 12000, taxAmountPaise: 2160, totalAmountPaise: 14160, treatment: "exclusive", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: null, status: "active", reviewRequired: false } }] } : {}));
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await user.click(await screen.findByRole("tab", { name: "Pricing" }));
    expect(await screen.findByLabelText("Immutable saved price details")).toHaveTextContent("14160 paise");
    await user.click(screen.getByRole("button", { name: "Replace price version" }));
    expect(screen.getByRole("textbox", { name: "Price entry ID" })).toHaveValue("price-entry-1");
    expect(screen.getByRole("spinbutton", { name: "Input amount (paise)" })).toHaveValue(12000);
  });

  it("renders all eight guided sections, prompts on unsaved navigation, and accepts zero-valued server preview inputs", async () => {
    const user = userEvent.setup();
    const relatedItem: KnowledgeItemDetail = { ...item, id: "line-2", mainLineId: "line-2", mainLineName: "Related panel", draftRevisionId: null, draftRevision: null, activeRevisionId: "revision-2" };
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [{ id: "basket-1", name: "Carpentry", description: null, displayOrder: 0, status: "active", version: 1, createdById: "super-admin-1", updatedById: "super-admin-1", createdAt: item.createdAt, updatedAt: item.updatedAt }], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [relatedItem], pagination: { ...page, total: 1 } });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_lineId, _revisionId, sectionKey) => {
      if (sectionKey === "overview") return section(sectionKey, { sectionApplicability: [{ id: "applicability-1", sectionKey: "pricing", applicability: "configured" }] });
      if (sectionKey === "recommendations") return section(sectionKey, { recommendations: [{ id: "recommendation-1", targetBasketId: "basket-1", targetMainLineId: "line-2", type: "recommended", reason: "Use matching panel", quantityRelationship: "same_quantity", dependency: false, active: true }] });
      if (sectionKey === "quality") return section(sectionKey, { parameters: [{ id: "quality-1", type: "number", label: "Thickness", unit: "mm", required: true, active: true }] });
      if (sectionKey === "execution") return section(sectionKey, { steps: [{ id: "step-1", order: 1, name: "Measure", dependencyStepIds: [], active: true }, { id: "step-2", order: 2, name: "Install", dependencyStepIds: ["step-1"], active: true }] });
      return section(sectionKey);
    });
    vi.mocked(knowledgeApi.previewKnowledge).mockResolvedValue({ formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null, effectiveUnitRatePaise: 0, adjustedUnitRate: null, requiredQuantity: "0", procurementQuantity: "0", vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null, pmcMarkup: null, duration: null });
    renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");

    expect(await screen.findAllByRole("tab")).toHaveLength(8);
    expect(await screen.findByRole("combobox", { name: "Section key" })).toHaveValue("pricing");
    expect(screen.getAllByRole("option", { name: "Advanced" }).length).toBeGreaterThan(0);
    await user.type(await screen.findByRole("textbox", { name: "Description" }), "Draft");
    await user.click(screen.getByRole("tab", { name: "Pricing" }));
    expect(screen.getByRole("alertdialog", { name: "Save changes before leaving?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByRole("heading", { name: "Pricing" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Add specification/iu })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Quantity & margin" }));
    expect(await screen.findByRole("heading", { name: "Quantity & margin" })).toBeVisible();
    await user.clear(screen.getByRole("spinbutton", { name: "Unit rate (paise)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Unit rate (paise)" }), "0");
    await user.type(screen.getByRole("textbox", { name: "Quantity" }), "0");
    const preview = screen.getByRole("button", { name: "Run server preview" });
    expect(preview).toBeEnabled();
    await user.click(preview);
    await waitFor(() => expect(knowledgeApi.previewKnowledge).toHaveBeenCalledWith(expect.not.objectContaining({ taxTreatment: expect.anything() })));

    await user.click(screen.getByRole("tab", { name: "Recommendations" }));
    expect(await screen.findByRole("combobox", { name: "Target Basket" })).toHaveDisplayValue("Carpentry");
    expect(screen.getByRole("combobox", { name: "Target Main Line" })).toHaveDisplayValue("Related panel");
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue("Use matching panel");

    await user.click(screen.getByRole("tab", { name: "Quality" }));
    expect(await screen.findByRole("combobox", { name: "Parameter type" })).toHaveValue("number");
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("Thickness");

    await user.click(screen.getByRole("tab", { name: "Execution" }));
    expect((await screen.findAllByRole("textbox", { name: "Step name" }))[0]).toHaveValue("Measure");
    expect(screen.getAllByRole("listbox", { name: "Dependency steps" })[1]).toHaveDisplayValue("Measure");
  });

  it.each([1440, 1024, 768, 390, 320])("keeps section and category navigation operable at %ipx", async (width) => {
    const user = userEvent.setup();
    setViewportWidth(width);
    const workspace = renderRoute(<KnowledgeItemWorkspacePage />, "/admin/configuration/estimation/items/line-1", "/admin/configuration/estimation/items/:itemId");
    await screen.findByRole("textbox", { name: "Description" });

    if (width <= 640) {
      const selector = screen.getByRole("combobox", { name: "Configuration section" });
      await user.selectOptions(selector, "execution");
      expect(await screen.findByRole("heading", { name: "Execution" })).toBeVisible();
    } else {
      const overview = screen.getByRole("tab", { name: "Overview" });
      overview.focus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: "Pricing" })).toHaveFocus();
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
      const modeTab = screen.getByRole("tab", { name: "Modes" });
      expect(modeTab).toHaveFocus();
      expect(modeTab).toHaveAttribute("aria-selected", "true");
      expect(modeTab).toHaveAttribute("aria-controls");
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
