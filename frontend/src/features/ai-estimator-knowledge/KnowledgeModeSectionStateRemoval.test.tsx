import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRef,
  type ComponentProps
} from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { KnowledgeModePanel, type KnowledgeModePanelHandle } from "./KnowledgeModePanel";
import * as knowledgeApi from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type {
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeSectionApplicability,
  KnowledgeSectionEnvelope,
  KnowledgeSectionMutationEnvelope,
  KnowledgeSurface
} from "./knowledgeTypes";

vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    getKnowledgeItem: vi.fn(),
    getKnowledgeSection: vi.fn(),
    updateKnowledgeSection: vi.fn(),
    previewKnowledge: vi.fn()
  };
});

const actorMetadata = {
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-28T08:00:00.000Z",
  updatedAt: "2026-08-28T08:00:00.000Z"
} as const;

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
  completeness: { percentage: 0, sections: [], blockers: [], warnings: [] },
  allowedActions: ["update_section"],
  activeRevision: null,
  draftRevision: null,
  blockers: [],
  warnings: [],
  version: 7,
  ...actorMetadata
};

const applicabilityBySection = {
  advanced: "configured",
  pricing: "not_applicable",
  overview: "configured",
  "quantity-margin": "configured"
} as const satisfies Readonly<
  Record<"advanced" | "pricing" | "overview" | "quantity-margin", KnowledgeSectionApplicability>
>;

const versionBySection = {
  advanced: 11,
  pricing: 12,
  overview: 10,
  "quantity-margin": 13
} as const;

function section(
  sectionKey: "advanced" | "pricing" | "overview" | "quantity-margin",
  applicability: KnowledgeSectionApplicability = applicabilityBySection[sectionKey],
  payload: KnowledgeJsonObject = {},
  version: number = versionBySection[sectionKey]
): KnowledgeSectionEnvelope<KnowledgeJsonObject> {
  return {
    id: `section-${sectionKey}`,
    mainLineId: item.mainLineId,
    revisionId: "revision-1",
    sectionKey,
    applicability,
    payload,
    version,
    ...actorMetadata
  };
}

function savedSection(
  sectionKey: "advanced" | "pricing" | "overview" | "quantity-margin",
  input: {
    readonly applicability?: KnowledgeSectionApplicability;
    readonly payload: KnowledgeJsonObject;
    readonly expectedVersion: number;
    readonly expectedAggregateVersion?: number;
  },
  aggregateVersion = (input.expectedAggregateVersion ?? item.version) + 1
): KnowledgeSectionMutationEnvelope<KnowledgeJsonObject> {
  return {
    ...section(
      sectionKey,
      input.applicability ?? applicabilityBySection[sectionKey],
      input.payload
    ),
    version: input.expectedVersion + 1,
    aggregateVersion
  };
}

const modes: readonly KnowledgeMaster[] = [
  {
    id: "mode-pmc-stable",
    masterType: "modes",
    code: "PMC",
    name: "PMC",
    description: null,
    displayOrder: 10,
    status: "active",
    version: 1,
    ...actorMetadata
  },
  {
    id: "mode-execution-stable",
    masterType: "modes",
    code: "EXECUTION",
    name: "Execution",
    description: null,
    displayOrder: 20,
    status: "active",
    version: 1,
    ...actorMetadata
  }
];

const priorities: readonly KnowledgeMaster[] = [
  ["priority-low", "Low", "low"],
  ["priority-medium", "Medium", "medium"],
  ["priority-high", "High", "high"],
  ["priority-non-negotiable", "Non Negotiable", "non_negotiable"]
].map(([id, name, semanticTier], displayOrder) => ({
  id: id!,
  masterType: "priorities" as const,
  code: id!.toUpperCase(),
  name: name!,
  description: null,
  displayOrder,
  status: "active" as const,
  semanticTier: semanticTier as "low" | "medium" | "high" | "non_negotiable",
  version: 1,
  ...actorMetadata
}));

const uoms: readonly KnowledgeMaster[] = [
  {
    id: "uom-square-foot",
    masterType: "uoms",
    code: "SQFT",
    name: "Sq.ft",
    description: null,
    displayOrder: 1,
    status: "active",
    decimalScale: 2,
    version: 1,
    ...actorMetadata
  }
];

const surfaces: readonly KnowledgeSurface[] = [
  {
    id: "surface-floor",
    masterType: "surfaces",
    code: "SURFACE_FLOOR",
    name: "Floor surface",
    description: "Tile, marble",
    displayOrder: 20,
    status: "active",
    version: 1,
    ...actorMetadata
  },
  {
    id: "surface-wall",
    masterType: "surfaces",
    code: "SURFACE_WALL",
    name: "Wall surface",
    description: "Paint, wallpaper",
    displayOrder: 10,
    status: "active",
    version: 1,
    ...actorMetadata
  }
];

function renderPanel(
  ref: React.RefObject<KnowledgeModePanelHandle | null>,
  panelModes: readonly KnowledgeMaster[] = modes
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const props: ComponentProps<typeof KnowledgeModePanel> = {
    item,
    revisionId: "revision-1",
    masters: { modes: panelModes, priorities, surfaces, uoms },
    relationshipBaskets: [],
    relationshipItems: [],
    editable: true,
    legacyModeCatalogState: { status: "ready", onRetry: vi.fn() },
    onDirtyChange: vi.fn(),
    onSavingChange: vi.fn(),
    onBusyChange: vi.fn(),
    onAnnouncement: vi.fn()
  };
  const panel = (currentModes: readonly KnowledgeMaster[]) => (
    <QueryClientProvider client={queryClient}>
      <KnowledgeModePanel
        ref={ref}
        {...props}
        masters={{ modes: currentModes, priorities, surfaces, uoms }}
      />
    </QueryClientProvider>
  );
  const view = render(panel(panelModes));
  return {
    queryClient,
    props,
    unmount: view.unmount,
    rerenderModes(currentModes: readonly KnowledgeMaster[]) {
      view.rerender(panel(currentModes));
    }
  };
}

async function selectExecutionSource(user: ReturnType<typeof userEvent.setup>, source: "Sub-Vendor" | "In-house") {
  for (const label of ["Sub-Vendor", "In-house"] as const) {
    const checkbox = screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
    if (checkbox.checked !== (label === source)) await user.click(checkbox);
  }
}

describe("Knowledge Mode section-state removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(knowledgeApi.previewKnowledge).mockResolvedValue({
      formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
      effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null,
      vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
      pmcMarkup: null, duration: null,
      modeCalculation: { revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 222_750, appliedImpactBps: 1_000 },
      pmcCalculation: { baseAmountPaise: 150_000, lowQuantityImpactAmountPaise: 15_000,
        revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 189_750,
        appliedImpactBps: 1_000, pmcMarginBps: 1_500, pmcMarginAmountPaise: 24_750,
        totalBeforeDiscountPaise: 189_750, finalVendorChargesPaise: 165_000 }
    });
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue(item);
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(sectionKey as "advanced" | "pricing" | "quantity-margin")
    );
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) =>
        savedSection(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          input
        )
    );
  });

  it("preserves a previously saved PMC margin when editing another Mode field", async () => {
    const ref = createRef<KnowledgeModePanelHandle>();
    let saved = section("advanced", "configured", { pmcMarginBps: 1_525 });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? saved : section(key as "pricing" | "overview"));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_line, _revision, key, input) => {
      const result = savedSection(key as "advanced", input);
      saved = result;
      return result;
    });
    renderPanel(ref);
    expect(await screen.findByRole("spinbutton", { name: "PMC Margin" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(15.25));
    expect(screen.queryByRole("textbox", { name: "PMC Margin (%)" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenLastCalledWith("line-1", "revision-1", "advanced", expect.objectContaining({
      expectedVersion: 11, expectedAggregateVersion: 7, payload: expect.objectContaining({ pmcMarginBps: 1_525 })
    }));
    await userEvent.click(screen.getByRole("checkbox", { name: "PMC" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(1);
  });

  it.each([525, 2300])("requires correction of saved PMC margin %i before saving, then supports reload and discard", async (pmcMarginBps) => {
    const ref = createRef<KnowledgeModePanelHandle>();
    let saved = section("advanced", "configured", { pmcMarginBps, modeDescription: "Original scope" });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? saved : section(key as "pricing" | "overview"));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_line, _revision, key, input) => {
      const result = savedSection(key as "advanced", input);
      saved = result;
      return result;
    });
    const panel = renderPanel(ref);
    const margin = () => screen.getByRole("spinbutton", { name: "PMC Margin" });
    await waitFor(() => expect(margin()).toHaveValue(pmcMarginBps / 100));
    expect(margin()).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    const invalidMargin = margin();
    await userEvent.click(screen.getByRole("button", { name: "Collapse PMC" }));
    expect(invalidMargin).not.toBeVisible();
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Collapse PMC" })).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(invalidMargin).toHaveFocus());
    fireEvent.change(margin(), { target: { value: "15.75" } });
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(saved.payload).toMatchObject({ pmcMarginBps: 1575, modeDescription: expect.stringContaining("Original scope") });
    fireEvent.change(margin(), { target: { value: "23" } });
    await userEvent.click(screen.getByRole("checkbox", { name: "PMC" }));
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(margin()).toHaveFocus());
    act(() => ref.current?.discard());
    expect(margin()).toHaveValue(15.75);
    panel.unmount();
    renderPanel(ref);
    await waitFor(() => expect(margin()).toHaveValue(15.75));
  });

  it("uses the saved PMC margin and Overview UOM while keeping simulation quantity and discount out of saved configuration", async () => {
    const ref = createRef<KnowledgeModePanelHandle>();
    const payload = { modeDescription: "Shared saved paragraph", dependencies: [], pmcMarginBps: 1_500 };
    let savedAdvanced = section("advanced", "configured", payload);
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? savedAdvanced : key === "overview" ? section("overview", "configured", { uomId: uoms[0]!.id }) : section("pricing"));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_line, _revision, key, input) => {
      const saved = savedSection(key as "advanced", input);
      savedAdvanced = saved;
      return saved;
    });
    const { props } = renderPanel(ref);
    const rate = await screen.findByRole("textbox", { name: "Base Rate (₹)" });
    await screen.findByText("Sq.ft");
    const calculations = screen.getByRole("region", { name: "PMC calculations" });
    expect(within(calculations).getAllByRole("spinbutton", { name: "PMC Margin" })).toHaveLength(1);
    expect(screen.getAllByRole("spinbutton", { name: "PMC Margin" })).toHaveLength(1);
    expect(within(calculations).queryByRole("group", { name: "Gross margin markup" })).not.toBeInTheDocument();
    expect(within(calculations).queryByRole("status", { name: "Max Discount" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "PMC" })).toContainElement(calculations);
    fireEvent.change(rate, { target: { value: "1500" } });
    expect(screen.queryByRole("textbox", { name: "Quantity (test)" })).not.toBeInTheDocument();
    expect(knowledgeApi.previewKnowledge).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Test calculations" }));
    const simulator = within(screen.getByRole("dialog", { name: "Test calculations" }));
    for (const label of ["Base Rate (₹)", "Low Quantity Limit", "Impact (%)", "UOM", "PMC Margin (%)"]) {
      expect(simulator.getByRole("textbox", { name: label })).toHaveAttribute("readonly");
    }
    expect(simulator.getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("1500");
    expect(simulator.getByRole("textbox", { name: "PMC Margin (%)" })).toHaveValue("15.00");
    expect(simulator.queryByRole("radio")).not.toBeInTheDocument();
    expect(simulator.queryByRole("textbox", { name: /Gross Margin Markup/ })).not.toBeInTheDocument();
    fireEvent.change(simulator.getByRole("textbox", { name: "Quantity" }), { target: { value: "14.25" } });
    fireEvent.change(simulator.getByRole("textbox", { name: "Discount (%)" }), { target: { value: "2" } });
    vi.mocked(knowledgeApi.previewKnowledge).mockResolvedValueOnce({
      formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
      effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "14.25", procurementQuantity: null,
      vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
      pmcMarkup: null, duration: null,
      pmcCalculation: {
        baseAmountPaise: 2_137_500, lowQuantityImpactAmountPaise: 213_750,
        revisedUnitRatePaise: 165_000, revisedAmountPaise: 2_351_250, appliedImpactBps: 1_000,
        pmcMarginBps: 1_500, pmcMarginAmountPaise: 352_688, totalBeforeDiscountPaise: 2_703_938,
        discount: { rateBps: 200, totalBeforeDiscountPaise: 2_703_938, amountPaise: 54_079 },
        totalPaise: 2_649_859, finalVendorChargesPaise: 2_297_171
      }
    });
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await waitFor(() => expect(knowledgeApi.previewKnowledge).toHaveBeenLastCalledWith({
      quantity: "14.25", quantityScale: 2, modeCalculationDiscountBps: 200,
      pmcCalculation: { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, pmcMarginBps: 1_500 }
    }));
    expect(await simulator.findByLabelText("Base amount")).toHaveTextContent("₹21,375.00");
    expect(simulator.getByLabelText("Low-quantity impact amount")).toHaveTextContent("₹2,137.50");
    expect(simulator.queryByText(/Additional low-quantity impact/)).not.toBeInTheDocument();
    expect(simulator.queryByLabelText("Additional low-quantity impact amount")).not.toBeInTheDocument();
    expect(simulator.getByLabelText("Total including low-quantity charges")).toHaveTextContent("₹23,512.50");
    expect(simulator.getByLabelText("PMC margin amount")).toHaveTextContent("₹3,526.88");
    expect(simulator.getByLabelText("Subtotal after PMC margin")).toHaveTextContent("₹27,039.38");
    expect(simulator.getByLabelText("Discount amount")).toHaveTextContent("₹540.79");
    expect(simulator.getByLabelText("Final vendor charges")).toHaveTextContent("₹22,971.71");
    expect(simulator.getByLabelText("Final total")).toHaveTextContent("₹26,498.59");
    expect(simulator.queryByLabelText("Effective PMC margin")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledWith("line-1", "revision-1", "advanced", expect.objectContaining({
      expectedVersion: 11, expectedAggregateVersion: 7,
      payload: { ...payload, modeCalculations: { pmc: { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 }, sub_vendor: null, in_house_labor: null, in_house_material: null } }
    }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getAllByRole("region", { name: / calculations$/ })).toHaveLength(2);
    expect(screen.getByRole("region", { name: "PMC" })).not.toContainElement(
      screen.getByRole("region", { name: "Execution" })
    );
    fireEvent.change(within(screen.getByRole("region", { name: "PMC calculations" })).getByRole("spinbutton", { name: "PMC Margin" }), { target: { value: "23" } });
    await userEvent.click(screen.getByRole("checkbox", { name: "PMC" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveFocus());
    act(() => ref.current?.discard());
    expect(screen.getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("1500.00");
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(15);
    expect(screen.queryByRole("textbox", { name: "Quantity (test)" })).not.toBeInTheDocument();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("groups PMC and Execution controls separately while keeping the Mode paragraph shared", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced"
        ? section("advanced", "configured", { modeDescription: "Shared delivery requirements.", pmcMarginBps: 1_500 })
        : key === "overview" ? section("overview", "configured", { uomId: uoms[0]!.id }) : section("pricing"));
    const { props } = renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    const pmc = screen.getByRole("region", { name: "PMC" });
    const execution = screen.getByRole("region", { name: "Execution" });
    const paragraph = screen.getByText("Shared delivery requirements.");
    const paragraphEditor = screen.getByRole("button", { name: "Edit Mode paragraph" });
    const pmcCalculation = within(pmc).getByRole("region", { name: "PMC calculations" });
    const subVendorCalculation = within(execution).getByRole("region", { name: "Sub-Vendor calculations" });

    expect(within(pmcCalculation).getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(15);
    expect(pmc).not.toContainElement(execution);
    expect(execution).not.toContainElement(pmc);
    expect(within(execution).queryByRole("spinbutton", { name: "PMC Margin" })).not.toBeInTheDocument();
    expect(within(execution).getByRole("group", { name: "Execution source" })).toBeVisible();
    expect(within(execution).getByRole("region", { name: "Sub-Vendor scope" })).toContainElement(
      within(execution).getByRole("group", { name: "Inclusions" })
    );
    expect(within(execution).queryByRole("region", { name: "Sub-Vendor components" })).not.toBeInTheDocument();
    expect(within(execution).queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    for (const mode of [pmc, execution]) {
      expect(mode).not.toContainElement(paragraph);
      expect(mode).not.toContainElement(paragraphEditor);
      expect(paragraph.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    await user.click(within(execution).getByRole("checkbox", { name: "In-house" }));
    expect(subVendorCalculation).toBeVisible();
    expect(within(execution).getByRole("region", { name: "Sub-Vendor scope" })).toBeVisible();
    expect(within(execution).getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    expect(within(execution).getByRole("region", { name: "Labor cost calculations" })).toBeVisible();
    const material = within(execution).getByRole("region", { name: "Material cost calculations" });
    const total = within(execution).getByRole("region", { name: "In-house total" });
    expect(material.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(execution).queryByRole("region", { name: "In-house components" })).not.toBeInTheDocument();
    expect(within(execution).queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    expect(within(pmc).getByRole("region", { name: "PMC calculations" })).toBe(pmcCalculation);
    expect(pmcCalculation).toBeVisible();
    expect(screen.getAllByText("Shared delivery requirements.")).toEqual([paragraph]);

    await user.click(screen.getByRole("button", { name: "Collapse Sub-Vendor" }));
    expect(subVendorCalculation).not.toBeVisible();
    expect(material).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Expand Sub-Vendor" }));
    expect(within(execution).getByRole("region", { name: "Sub-Vendor calculations" })).toBe(subVendorCalculation);
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(knowledgeApi.previewKnowledge).not.toHaveBeenCalled();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    { mode: "PMC", calculation: "PMC calculations", otherMode: "Execution" },
    { mode: "Execution", calculation: "Sub-Vendor calculations", otherMode: "PMC" }
  ])("preserves a collapsed $mode calculation draft and opens it for validation", async ({ mode, calculation, otherMode }) => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? section("advanced", "configured", {
        pmcMarginBps: 1_500,
        modeCalculation: { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 }
      }) : key === "overview" ? section("overview", "configured", { uomId: uoms[0]!.id }) : section("pricing"));
    const { props } = renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    const impact = within(screen.getByRole("region", { name: calculation })).getByRole("textbox", { name: "Impact (%)" });
    fireEvent.change(impact, { target: { value: "5." } });
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    const dirtyCalls = vi.mocked(props.onDirtyChange).mock.calls.length;

    await user.click(screen.getByRole("button", { name: `Collapse ${mode}` }));
    expect(impact).toBeInTheDocument();
    expect(impact).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: `Expand ${mode}` }));
    expect(within(screen.getByRole("region", { name: calculation })).getByRole("textbox", { name: "Impact (%)" })).toBe(impact);
    expect(impact).toHaveValue("5.");
    await user.click(screen.getByRole("button", { name: `Collapse ${mode}` }));
    await user.click(screen.getByRole("button", { name: `Collapse ${otherMode}` }));
    expect(vi.mocked(props.onDirtyChange).mock.calls).toHaveLength(dirtyCalls);
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(knowledgeApi.previewKnowledge).not.toHaveBeenCalled();

    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(screen.getByRole("button", { name: `Collapse ${mode}` })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: `Expand ${otherMode}` })).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(impact).toHaveFocus());
    expect(impact).toBeVisible();
    expect(impact).toHaveValue("5.");
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it.each([
    { source: "Sub-Vendor", calculation: "Sub-Vendor calculations" },
    { source: "In-house", calculation: "Labor cost calculations" },
    { source: "In-house", calculation: "Material cost calculations" }
  ])("retains a $calculation draft through nested collapse and reveals it for save validation", async ({ source, calculation }) => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    const settings = { baseRatePaise: 10_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) => key === "advanced"
      ? section("advanced", "configured", { pmcMarginBps: 1_200, subVendorMarginBps: 1_700, modeCalculation: settings }) : section("pricing"));
    const { props } = renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    await user.click(screen.getByRole("checkbox", { name: "In-house" }));
    const input = within(screen.getByRole("region", { name: calculation })).getByRole("textbox", { name: "Base Rate (₹)" });
    fireEvent.change(input, { target: { value: "333." } });
    const dirtyCalls = vi.mocked(props.onDirtyChange).mock.calls.length;
    await user.click(screen.getByRole("button", { name: `Collapse ${source}` }));
    expect(input).toBeInTheDocument();
    expect(input).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: `Expand ${source}` }));
    expect(within(screen.getByRole("region", { name: calculation })).getByRole("textbox", { name: "Base Rate (₹)" })).toBe(input);
    expect(input).toHaveValue("333.");
    await user.click(screen.getByRole("button", { name: `Collapse ${source}` }));
    await user.click(screen.getByRole("button", { name: "Collapse Execution" }));
    expect(vi.mocked(props.onDirtyChange).mock.calls).toHaveLength(dirtyCalls);
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toBeVisible();
    expect(input).toHaveValue("333.");
    expect(screen.getByRole("button", { name: "Collapse Execution" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: `Collapse ${source}` })).toHaveAttribute("aria-expanded", "true");
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(knowledgeApi.previewKnowledge).not.toHaveBeenCalled();
  });

  it("keeps scope lists under Sub-Vendor while saving its calculations independently", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    const pmc = { id: "shared-scope", modeKind: "pmc", fields: [],
      inclusions: [{ id: "transport-in", name: "Transport", selected: true }],
      exclusions: [{ id: "transport-out", name: "Transport", selected: false }]
    };
    const inHouse = { id: "in-house-existing", modeKind: "execution", executionSource: "in_house",
      fields: [{ id: "crew", type: "number", label: "Crew size", options: [], value: "4" }]
    };
    const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
    const payload = { modeConfigurations: [pmc, inHouse], modeCalculation: settings, subVendorMarginBps: 1_700, dependencies: [] };
    let savedAdvanced = section("advanced", "configured", payload);
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? savedAdvanced : key === "overview" ? section("overview", "configured", { uomId: uoms[0]!.id }) : section("pricing"));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_line, _revision, key, input) => {
      const saved = savedSection(key as "advanced", input);
      savedAdvanced = saved;
      return saved;
    });
    renderPanel(ref);
    await screen.findByRole("textbox", { name: "Base Rate (₹)" });
    await screen.findByText("Sq.ft");
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    const rate = screen.getByRole("textbox", { name: "Base Rate (₹)" });
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    expect(screen.queryByRole("spinbutton", { name: "PMC Margin" })).not.toBeInTheDocument();
    expect(screen.getByText(`Execution (Sub-Vendor) for ${item.mainLineName}`)).toBeVisible();
    const inclusions = screen.getByRole("group", { name: "Inclusions" });
    const exclusions = screen.getByRole("group", { name: "Exclusions" });
    const calculations = screen.getByRole("region", { name: "Sub-Vendor calculations" });
    expect(screen.getByRole("group", { name: "Execution source" }).compareDocumentPosition(inclusions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(exclusions.compareDocumentPosition(calculations) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(inclusions).getByRole("checkbox", { name: "Transport" })).toBeChecked();
    expect(rate).toHaveValue("1500.00");
    expect(screen.getByRole("textbox", { name: "Impact (%)" })).toHaveValue("10.00");
    expect(screen.queryByRole("status", { name: "Max Discount" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toHaveValue(17);
    await user.click(within(exclusions).getByRole("checkbox", { name: "Transport" }));
    expect(within(inclusions).getByRole("checkbox", { name: "Transport" })).toBeChecked();
    fireEvent.change(rate, { target: { value: "1750" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Impact (%)" }), { target: { value: "12.5" } });
    await user.click(screen.getByRole("button", { name: "Test calculations" }));
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await waitFor(() => expect(knowledgeApi.previewKnowledge).toHaveBeenLastCalledWith({
      quantity: "1", quantityScale: 2, subVendorCalculation: { baseRatePaise: 175_000, lowQuantityLimit: "15", impactBps: 1_250, subVendorMarginBps: 1_700 }
    }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenLastCalledWith("line-1", "revision-1", "advanced", expect.objectContaining({
      payload: { ...payload, modeCalculations: { pmc: settings, sub_vendor: { ...settings, baseRatePaise: 175_000, impactBps: 1_250 }, in_house_labor: settings, in_house_material: settings },
        modeConfigurations: [{ ...pmc, exclusions: [{ ...pmc.exclusions[0], selected: true }] }, inHouse]
      }
    }));
    await selectExecutionSource(user, "In-house");
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Value" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "In-house calculations" })).not.toBeInTheDocument();
    for (const label of ["Labor cost", "Material cost"]) {
      const cost = within(screen.getByRole("region", { name: `${label} calculations` }));
      expect(cost.getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("1500.00");
      expect(cost.getByRole("textbox", { name: "Impact (%)" })).toHaveValue("10.00");
    }
    await selectExecutionSource(user, "Sub-Vendor");
    expect(screen.getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("1750");
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.getAllByRole("region", { name: / calculations$/ })).toHaveLength(2);
    expect(screen.getAllByRole("group", { name: "Inclusions" })).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    act(() => ref.current?.discard());
    expect(screen.getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("1500.00");
    expect(screen.getByRole("textbox", { name: "Impact (%)" })).toHaveValue("10.00");
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("1750.00");
    expect(screen.getByRole("textbox", { name: "Impact (%)" })).toHaveValue("12.50");
    expect(within(screen.getByRole("group", { name: "Exclusions" })).getByRole("checkbox", { name: "Transport" })).toBeChecked();
  });

  it("keeps PMC and Sub-Vendor margins separate from In-house markups through validation, save and reload", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    const legacy = { baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
    let saved = section("advanced", "configured", { modeCalculation: legacy, pmcMarginBps: 1_750, subVendorMarginBps: 1_850 });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? saved : key === "overview" ? section("overview", "configured", { uomId: uoms[0]!.id }) : section("pricing"));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_line, _revision, key, input) => {
      const updated = savedSection(key as "advanced", input); saved = updated; return updated;
    });
    renderPanel(ref);
    await screen.findByRole("region", { name: "PMC calculations" });
    await screen.findByDisplayValue("1500.00");
    const cases = [
      { scope: "pmc", label: "PMC", inputs: ["2100", "12", "7.25"], settings: { ...legacy, baseRatePaise: 210_000, lowQuantityLimit: "12", impactBps: 725 } },
      { scope: "sub_vendor", label: "Sub-Vendor", inputs: ["800", "8", "5.25"], settings: { ...legacy, baseRatePaise: 80_000, lowQuantityLimit: "8", impactBps: 525 } },
      { scope: "in_house_labor", label: "Labor cost", inputs: ["450", "4", "0", "8", "23"], discount: "15.00%", settings: { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 } },
      { scope: "in_house_material", label: "Material cost", inputs: ["650", "9", "12.75", "18", "36"], discount: "18.00%", settings: { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 } }
    ] as const;
    const labels = ["Base Rate (₹)", "Low Quantity Limit", "Impact (%)", "Min. Gross Margin Markup (%)", "Starting Gross Margin Markup (%)"];
    async function select(label: string) {
      const pmc = screen.getByRole("checkbox", { name: "PMC" });
      const execution = screen.getByRole("checkbox", { name: "Execution" });
      if ((pmc as HTMLInputElement).checked !== (label === "PMC")) await user.click(pmc);
      if ((execution as HTMLInputElement).checked !== (label !== "PMC")) await user.click(execution);
      if (label !== "PMC") await selectExecutionSource(user, label === "Sub-Vendor" ? label : "In-house");
      return within(screen.getByRole("region", { name: `${label} calculations` }));
    }
    for (const scenario of cases) {
      const region = await select(scenario.label);
      expect(region.getByRole("textbox", { name: labels[0] })).toHaveValue("1500.00");
      const editableLabels = scenario.scope === "pmc" || scenario.scope === "sub_vendor" ? labels.slice(0, 3) : labels;
      editableLabels.forEach((name, index) => fireEvent.change(region.getByRole("textbox", { name }), { target: { value: scenario.inputs[index] } }));
      if (scenario.scope === "pmc") {
        expect(region.queryByRole("status", { name: "Max Discount" })).not.toBeInTheDocument();
        expect(region.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(17.5);
      } else if (scenario.scope === "sub_vendor") {
        expect(region.queryByRole("status", { name: "Max Discount" })).not.toBeInTheDocument();
        expect(region.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toHaveValue(18.5);
      } else expect(region.getByRole("status", { name: "Max Discount" })).toHaveTextContent(scenario.discount);
      if (scenario.scope === "sub_vendor") fireEvent.change(region.getByRole("textbox", { name: "Impact (%)" }), { target: { value: "5." } });
    }
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Sub-Vendor calculations" })).getByRole("textbox", { name: "Impact (%)" })).toHaveFocus());
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    const subVendorImpact = within(screen.getByRole("region", { name: "Sub-Vendor calculations" })).getByRole("textbox", { name: "Impact (%)" });
    expect(subVendorImpact).toHaveValue("5.");
    fireEvent.change(subVendorImpact, { target: { value: "5.25" } });
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(saved.payload).toEqual({ modeCalculation: legacy, pmcMarginBps: 1_750, subVendorMarginBps: 1_850, modeCalculations: Object.fromEntries(cases.map(({ scope, settings }) => [scope, settings])) });
    act(() => ref.current?.discard());
    for (const scenario of cases) {
      const region = await select(scenario.label);
      const editableLabels = scenario.scope === "pmc" || scenario.scope === "sub_vendor" ? labels.slice(0, 3) : labels;
      editableLabels.forEach((name, index) => expect(Number((region.getByRole("textbox", { name }) as HTMLInputElement).value)).toBe(Number(scenario.inputs[index])));
      if (scenario.scope === "pmc") expect(region.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(17.5);
      else if (scenario.scope === "sub_vendor") expect(region.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toHaveValue(18.5);
      else expect(region.getByRole("status", { name: "Max Discount" })).toHaveTextContent(scenario.discount);
      await user.click(region.getByRole("button", { name: "Test calculations" }));
      expect(screen.getByText(`${scenario.label} calculation simulator`)).toBeVisible();
      if (scenario.scope === "pmc") vi.mocked(knowledgeApi.previewKnowledge).mockResolvedValueOnce({
        formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
        effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null,
        vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
        pmcMarkup: null, duration: null,
        pmcCalculation: {
          baseAmountPaise: 210_000, lowQuantityImpactAmountPaise: 15_225,
          revisedUnitRatePaise: 225_225, revisedAmountPaise: 225_225, appliedImpactBps: 725,
          pmcMarginBps: 1_750, pmcMarginAmountPaise: 39_414, totalBeforeDiscountPaise: 264_639,
          totalPaise: 264_639, finalVendorChargesPaise: 225_225
        }
      });
      if (scenario.scope === "sub_vendor") vi.mocked(knowledgeApi.previewKnowledge).mockResolvedValueOnce({
        formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null,
        effectiveUnitRatePaise: null, adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null,
        vendorPreTax: null, vendorTax: null, vendorTotal: null, startMargin: null, bottomMargin: null,
        pmcMarkup: null, duration: null,
        subVendorCalculation: {
          baseAmountPaise: 80_000, lowQuantityImpactAmountPaise: 4_200,
          revisedUnitRatePaise: 84_200, revisedAmountPaise: 84_200, appliedImpactBps: 525,
          subVendorMarginBps: 1_850, subVendorMarginAmountPaise: 15_577, totalBeforeDiscountPaise: 99_777,
          totalPaise: 99_777, finalVendorChargesPaise: 84_200
        }
      });
      await user.click(screen.getByRole("button", { name: "Calculate" }));
      expect(knowledgeApi.previewKnowledge).toHaveBeenLastCalledWith(scenario.scope === "pmc"
        ? { pmcCalculation: { baseRatePaise: scenario.settings.baseRatePaise, lowQuantityLimit: scenario.settings.lowQuantityLimit, impactBps: scenario.settings.impactBps, pmcMarginBps: 1_750 }, quantity: "1", quantityScale: 2 }
        : scenario.scope === "sub_vendor"
          ? { subVendorCalculation: { baseRatePaise: scenario.settings.baseRatePaise, lowQuantityLimit: scenario.settings.lowQuantityLimit, impactBps: scenario.settings.impactBps, subVendorMarginBps: 1_850 }, quantity: "1", quantityScale: 2 }
          : { modeCalculation: scenario.settings, quantity: "1", quantityScale: 2, modeCalculationMarkupBasis: "starting" });
      if (scenario.scope === "pmc") expect(await screen.findByLabelText("Final total")).toHaveTextContent("₹2,646.39");
      if (scenario.scope === "sub_vendor") expect(await screen.findByLabelText("Final total")).toHaveTextContent("₹997.77");
      await user.click(screen.getByRole("button", { name: "Close" }));
    }
  });

  it("shows the combined total after both cost sections without saving test values and clears it on an incomplete cost edit", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    const labor = { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 };
    const material = { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 };
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) => key === "advanced"
      ? section("advanced", "configured", { modeCalculations: { pmc: null, sub_vendor: null, in_house_labor: labor, in_house_material: material } })
      : key === "overview" ? section("overview", "configured", { uomId: uoms[0]!.id }) : section("pricing"));
    vi.mocked(knowledgeApi.previewKnowledge).mockResolvedValue({
      formulaVersion: "knowledge-preview-v1", effectivePriceVersionId: null, taxVersionId: null, effectiveUnitRatePaise: null,
      adjustedUnitRate: null, requiredQuantity: "1", procurementQuantity: null, vendorPreTax: null, vendorTax: null, vendorTotal: null,
      startMargin: null, bottomMargin: null, pmcMarkup: null, duration: null,
      inHouseCalculation: { labor: { revisedUnitRatePaise: 45_000, revisedAmountPaise: 45_000, totalPaise: 55_350, appliedImpactBps: 0 },
        material: { revisedUnitRatePaise: 73_288, revisedAmountPaise: 73_288, totalPaise: 99_672, appliedImpactBps: 1_275 }, totalPaise: 155_022 }
    });
    const { props } = renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "PMC" }));
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await selectExecutionSource(user, "In-house");
    const total = screen.getByRole("region", { name: "In-house total" });
    const materialSection = screen.getByRole("region", { name: "Material cost calculations" });
    expect(screen.getByRole("region", { name: "Execution" })).toContainElement(total);
    expect(screen.getByRole("region", { name: "Execution" })).toContainElement(materialSection);
    expect(materialSection.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(within(total).getByRole("button", { name: "Test In-house total" }));
    await user.click(screen.getByRole("button", { name: "Calculate total" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(within(total).getByLabelText("Labor + Material total")).toHaveTextContent("₹1,550.22");
    expect(knowledgeApi.previewKnowledge).toHaveBeenCalledWith({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 2, modeCalculationMarkupBasis: "starting" });
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(within(materialSection).getByRole("textbox", { name: "Impact (%)" }), { target: { value: "12." } });
    expect(screen.queryByLabelText("Labor + Material total")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test In-house total" })).toBeDisabled();
    await selectExecutionSource(user, "Sub-Vendor");
    expect(screen.queryByRole("region", { name: "In-house total" })).not.toBeInTheDocument();
  });

  it.each(["Labor cost", "Material cost"])("preserves an incomplete %s draft and reveals its field when saving from another source", async (label) => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    const settings = { baseRatePaise: 90_000, lowQuantityLimit: "15", impactBps: 525, minimumMarkupBps: 1_200, startingMarkupBps: 3_100 };
    const payload = { modeCalculations: { pmc: null, sub_vendor: null, in_house: settings } };
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? section("advanced", "configured", payload) : key === "overview" ? section("overview", "configured", { uomId: uoms[0]!.id }) : section("pricing"));
    renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "PMC" }));
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await selectExecutionSource(user, "In-house");
    const cost = () => within(screen.getByRole("region", { name: `${label} calculations` }));
    expect(cost().getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("900.00");
    fireEvent.change(cost().getByRole("textbox", { name: "Impact (%)" }), { target: { value: "7." } });
    await selectExecutionSource(user, "Sub-Vendor");
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    await waitFor(() => expect(cost().getByRole("textbox", { name: "Impact (%)" })).toHaveFocus());
    expect(screen.getByRole("checkbox", { name: "In-house" })).toBeChecked();
    expect(cost().getByRole("textbox", { name: "Impact (%)" })).toHaveValue("7.");
    const sibling = within(screen.getByRole("region", { name: `${label === "Labor cost" ? "Material cost" : "Labor cost"} calculations` }));
    expect(sibling.getByRole("textbox", { name: "Impact (%)" })).toHaveValue("5.25");
    act(() => ref.current?.discard());
    expect(cost().getByRole("textbox", { name: "Impact (%)" })).toHaveValue("5.25");
  });

  it("rebases a Labor edit onto newly split server costs without overwriting Material or other modes", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    const settings = { baseRatePaise: 90_000, lowQuantityLimit: "15", impactBps: 525, minimumMarkupBps: 1_200, startingMarkupBps: 3_100 };
    const initial = { modeCalculations: { pmc: null, sub_vendor: null, in_house: settings } };
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) => key === "advanced" ? section("advanced", "configured", initial) : section("pricing"));
    renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "PMC" }));
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await selectExecutionSource(user, "In-house");
    fireEvent.change(within(screen.getByRole("region", { name: "Labor cost calculations" })).getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "450" } });
    const serverScopes = { ...initial.modeCalculations,
      pmc: { ...settings, baseRatePaise: 200_000 }, sub_vendor: { ...settings, baseRatePaise: 125_000 },
      in_house_labor: settings, in_house_material: { ...settings, baseRatePaise: 65_000, impactBps: 1_275 }
    };
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) => key === "advanced" ? section("advanced", "configured", { modeCalculations: serverScopes }, 25) : section("pricing"));
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({ ...item, version: 30 });
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    await user.click(within(screen.getByRole("alertdialog", { name: "This section changed elsewhere" })).getByRole("button", { name: "Keep editing" }));
    expect(within(screen.getByRole("region", { name: "Material cost calculations" })).getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("650.00");
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3]).toMatchObject({ expectedVersion: 25, expectedAggregateVersion: 30,
      payload: { modeCalculations: { ...serverScopes, in_house_labor: { ...settings, baseRatePaise: 45_000 } } }
    });
  });

  it("rebases only the locally edited calculation mode and keeps newer server values for the other modes", async () => {
    const ref = createRef<KnowledgeModePanelHandle>();
    const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
    const scopes = { pmc: settings, sub_vendor: { ...settings, baseRatePaise: 75_000 }, in_house: { ...settings, baseRatePaise: 45_000 } };
    const initial = { modeCalculations: scopes, modeDescription: "Shared paragraph." };
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) => key === "advanced" ? section("advanced", "configured", initial) : section("pricing"));
    renderPanel(ref);
    fireEvent.change(await screen.findByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "1750" } });
    const serverScopes = { ...scopes, sub_vendor: { ...scopes.sub_vendor, impactBps: 1_275, baseRatePaise: 95_000 }, in_house: { ...scopes.in_house, lowQuantityLimit: "9" } };
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) => key === "advanced" ? section("advanced", "configured", { ...initial, modeCalculations: serverScopes }, 25) : section("pricing"));
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({ ...item, version: 30 });
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    await userEvent.click(within(screen.getByRole("alertdialog", { name: "This section changed elsewhere" })).getByRole("button", { name: "Keep editing" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3]).toMatchObject({ expectedVersion: 25, expectedAggregateVersion: 30,
      payload: { ...initial, modeCalculations: { ...serverScopes, pmc: { ...settings, baseRatePaise: 175_000 }, in_house_labor: serverScopes.in_house, in_house_material: serverScopes.in_house } }
    });
  });

  it("does not preview configured calculations when saved Overview UOM cannot be loaded", async () => {
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) => {
      if (key === "overview") throw new Error("Overview unavailable");
      return key === "advanced" ? section("advanced", "configured", { pmcMarginBps: 1_500, modeCalculation: {
        baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500
      } }) : section("pricing");
    });
    renderPanel(createRef<KnowledgeModePanelHandle>());
    await screen.findByText("Could not load the UOM saved in Overview.");
    expect(screen.queryByLabelText("Total with starting markup")).not.toBeInTheDocument();
    expect(knowledgeApi.previewKnowledge).not.toHaveBeenCalled();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockResolvedValueOnce(section("overview", "configured", { uomId: uoms[0]!.id }));
    await userEvent.click(screen.getByRole("button", { name: "Retry UOM" }));
    await screen.findByText("Sq.ft");
    await userEvent.click(screen.getByRole("button", { name: "Test calculations" }));
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByLabelText("Final total")).toHaveTextContent("₹1,897.50");
  });

  it("protects pending paragraph edits, saves shared wording, and discards cancelled changes", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    const { props } = renderPanel(ref);
    await user.click(await screen.findByRole("button", { name: "Edit Mode paragraph" }));
    await user.clear(screen.getByRole("textbox", { name: "Mode paragraph" }));
    await user.type(screen.getByRole("textbox", { name: "Mode paragraph" }), "Pending wording");
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.queryByRole("textbox", { name: "Mode paragraph" })).not.toBeInTheDocument();
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "PMC" })).toBeChecked();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Mode paragraph" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    await user.clear(screen.getByRole("textbox", { name: "Mode paragraph" }));
    await user.type(screen.getByRole("textbox", { name: "Mode paragraph" }), "Saved shared wording");
    await user.click(screen.getByRole("button", { name: "Save" }));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementationOnce(async (_line, _revision, key, input) => {
      const saved = savedSection(key as "advanced", input);
      vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_mainLine, _revisionId, sectionKey) =>
        sectionKey === "advanced" ? saved : section("pricing"));
      return saved;
    });
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload)
      .toEqual({ modeDescription: "Saved shared wording" });
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getAllByText("Saved shared wording")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    await user.type(screen.getByRole("textbox", { name: "Mode paragraph" }), " discarded");
    act(() => ref.current?.discard());
    expect(screen.queryByRole("textbox", { name: "Mode paragraph" })).not.toBeInTheDocument();
    expect(screen.getByText("Saved shared wording")).toBeVisible();
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it.each(["paragraph", "configuration", "calculation"] as const)("rebases a local %s edit without overwriting the other server value", async (edited) => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    await screen.findByRole("button", { name: "Edit Mode paragraph" });
    if (edited === "paragraph") {
      await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
      await user.clear(screen.getByRole("textbox", { name: "Mode paragraph" }));
      await user.type(screen.getByRole("textbox", { name: "Mode paragraph" }), "Local paragraph");
      await user.click(screen.getByRole("button", { name: "Save" }));
    } else if (edited === "calculation") {
      fireEvent.change(screen.getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "1500" } });
    } else {
      await user.click(screen.getByRole("checkbox", { name: "Execution" }));
      await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    }
    const serverConfigurations = [{ id: "server-execution", modeKind: "execution", executionSource: "in_house", fields: [] }];
    const serverCalculation = { baseRatePaise: 50_000, lowQuantityLimit: "10", minimumMarkupBps: 2_000, startingMarkupBps: 3_000 };
    const serverPayload = { modeDescription: "Server paragraph", modeConfigurations: serverConfigurations, modeCalculation: serverCalculation, pmcMarginBps: 1_000, dependencies: [] };
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."));
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? section("advanced", "configured", serverPayload, 25) : section("pricing"));
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue({ ...item, version: 30 });
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    await user.click(within(screen.getByRole("alertdialog", { name: "This section changed elsewhere" })).getByRole("button", { name: "Keep editing" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    const submitted = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3];
    expect(submitted).toMatchObject({ expectedVersion: 25, expectedAggregateVersion: 30, payload: {
      modeDescription: edited === "paragraph" ? "Local paragraph" : "Server paragraph",
      pmcMarginBps: 1_000,
      modeCalculation: serverCalculation,
      ...(edited === "calculation" ? { modeCalculations: {
        pmc: { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 },
        sub_vendor: serverCalculation, in_house_labor: serverCalculation, in_house_material: serverCalculation
      } } : {}),
      dependencies: []
    } });
    if (edited !== "configuration") expect(submitted?.payload.modeConfigurations).toEqual(serverConfigurations);
    else expect(submitted?.payload.modeConfigurations).toEqual([expect.objectContaining({ modeKind: "pmc", inclusions: expect.arrayContaining([
      expect.objectContaining({ name: "Transport", selected: true })
    ]) })]);
  });

  it("keeps a rejected paragraph editable and saves a corrected retry", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    await user.click(await screen.findByRole("button", { name: "Edit Mode paragraph" }));
    await user.clear(screen.getByRole("textbox", { name: "Mode paragraph" }));
    await user.type(screen.getByRole("textbox", { name: "Mode paragraph" }), "Rejected wording");
    await user.click(screen.getByRole("button", { name: "Save" }));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Review the paragraph.", {
      "payload.modeDescription": "Please correct this paragraph."
    }));
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    const text = await screen.findByRole("textbox", { name: "Mode paragraph" });
    expect(text).toHaveValue("Rejected wording");
    expect(text).toHaveAccessibleDescription(/Please correct this paragraph\./);
    await user.clear(text);
    await user.type(text, "Corrected wording");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload)
      .toMatchObject({ modeDescription: "Corrected wording" });
  });

  it("persists the paragraph with selected lists and keeps it synchronized after another checkbox change", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    await user.click(within(await screen.findByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    await user.click(within(screen.getByRole("group", { name: "Exclusions" })).getByRole("checkbox", { name: "Shifting" }));
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    const text = screen.getByRole("textbox", { name: "Mode paragraph" });
    await user.clear(text);
    await user.type(text, "Custom installation. Inclusions: none. Exclusions: none.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload).toMatchObject({
      modeDescription: "Custom installation. Inclusions: Transport. Exclusions: Shifting.",
      modeConfigurations: [expect.objectContaining({
        inclusions: expect.arrayContaining([expect.objectContaining({ name: "Transport", selected: true })]),
        exclusions: expect.arrayContaining([expect.objectContaining({ name: "Shifting", selected: true })])
      })]
    });
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Unloading" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload).toMatchObject({
      modeDescription: "Custom installation. Inclusions: Transport, Unloading. Exclusions: Shifting."
    });
  });

  it("discards or saves checklist deletions with the paragraph and preserves an empty list", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    let stored = section("advanced", "configured", {
      modeDescription: "Custom work. Inclusions: Lift service. Exclusions: Lift service.",
      modeConfigurations: [{ id: "pmc-delete", modeKind: "pmc", fields: [],
        inclusions: [{ id: "lift-in", name: "Lift service", selected: true }],
        exclusions: [{ id: "lift-out", name: "Lift service", selected: true }]
      }]
    });
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_line, _revision, key) =>
      key === "advanced" ? stored : section(key as "pricing" | "overview"));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(async (_line, _revision, key, input) => {
      const result = savedSection(key as "advanced", input);
      stored = result;
      return result;
    });
    const { props } = renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    await user.click(await screen.findByRole("button", { name: "Delete inclusion Lift service" }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    act(() => ref.current?.discard());
    expect(screen.getByRole("button", { name: "Delete inclusion Lift service" })).toBeVisible();
    expect(screen.getByText("Custom work. Inclusions: Lift service. Exclusions: Lift service.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete inclusion Lift service" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenLastCalledWith("line-1", "revision-1", "advanced", expect.objectContaining({
      expectedVersion: 11, expectedAggregateVersion: 7,
      payload: {
        modeDescription: "Custom work. Inclusions: none. Exclusions: Lift service.",
        modeConfigurations: [{ id: "pmc-delete", modeKind: "pmc", fields: [], inclusions: [],
          exclusions: [{ id: "lift-out", name: "Lift service", selected: true }]
        }]
      }
    }));
    act(() => ref.current?.discard());
    expect(screen.getByText("No inclusions added.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete inclusion Lift service" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Exclusions" })).getByRole("checkbox", { name: "Lift service" })).toBeChecked();
  });

  it("saves independent Sub-Vendor scope checkboxes and custom names through save-edit-save", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    const inclusions = await screen.findByRole("group", { name: "Inclusions" });
    expect(screen.getByText(/^PMC fee (?:for )?Wall panelling$/)).toBeVisible();
    const exclusions = screen.getByRole("group", { name: "Exclusions" });
    await user.click(within(inclusions).getByRole("checkbox", { name: "Transport" }));
    await user.click(within(exclusions).getByRole("checkbox", { name: "Transport" }));
    await user.click(within(exclusions).getByRole("button", { name: "Add Exclusion" }));
    await user.type(within(exclusions).getByRole("textbox", { name: "Exclusion name" }), "Night unloading");
    await user.click(within(exclusions).getByRole("button", { name: "Save" }));
    await user.click(within(exclusions).getByRole("checkbox", { name: "Night unloading" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(within(inclusions).getByRole("checkbox", { name: "Transport" })).toBeChecked();
    expect(within(exclusions).getByRole("checkbox", { name: "Transport" })).toBeChecked();
    await user.click(within(inclusions).getByRole("checkbox", { name: "Transport" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    const calls = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls;
    expect(calls.map((call) => call[2])).toEqual(["advanced", "advanced"]);
    expect(calls.map((call) => call[3].expectedVersion)).toEqual([11, 12]);
    expect(calls[1]?.[3].payload).toMatchObject({ modeConfigurations: [{
      modeKind: "pmc", fields: [],
      inclusions: expect.arrayContaining([expect.objectContaining({ name: "Transport", selected: false })]),
      exclusions: expect.arrayContaining([
        expect.objectContaining({ name: "Transport", selected: true }),
        expect.objectContaining({ name: "Night unloading", selected: true })
      ])
    }] });
    expect(within(exclusions).getByRole("checkbox", { name: "Night unloading" })).toBeChecked();
  });

  it("loads Mode, Specifications, and the saved Overview UOM with independent section metadata", async () => {
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    expect(await screen.findByRole("button", { name: "Add Specification" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Mode configuration" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Specifications" })).toBeVisible();
    expect(screen.getByText("Section version 11")).toBeVisible();
    expect(screen.getByText("Section version 12")).toBeVisible();
    expect(vi.mocked(knowledgeApi.getKnowledgeSection).mock.calls.map((call) => call[2]))
      .toEqual(["advanced", "pricing", "overview"]);
    for (const name of ["Budgeting", "Vendors", "Surfaces", "Quantity & margin"]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
  });

  it("saves only the dirty Specifications block", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    await user.click(await screen.findByRole("button", { name: "Add Specification" }));
    await user.type(screen.getByRole("textbox", { name: "Specification name" }), "Plywood");
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledOnce();
    const call = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]!;
    expect(call[2]).toBe("pricing");
    expect(call[3]).toMatchObject({ applicability: "not_applicable", expectedVersion: 12 });
    expect(screen.getByText("Section version 11")).toBeVisible();
    expect(screen.getByText("Section version 13")).toBeVisible();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("saves Advanced before Specifications while preserving unrelated Advanced keys", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          applicabilityBySection[sectionKey as keyof typeof applicabilityBySection],
          sectionKey === "advanced"
            ? {
                dependencies: [{ id: "dependency-keep", targetMainLineId: "line-related" }],
                modeOverrides: [{ id: "override-keep", modeId: modes[0]!.id, active: true }],
                revisionLineage: [{ revisionId: "revision-source" }],
                serverOwnedExtension: { preserve: true }
              }
            : {}
        )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "15");
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    await user.type(screen.getByRole("textbox", { name: "Specification name" }), "Plywood");

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "pricing"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([
      7,
      8
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload).toMatchObject({
      dependencies: [{ id: "dependency-keep", targetMainLineId: "line-related" }],
      modeOverrides: [{ id: "override-keep", modeId: modes[0]!.id, active: true }],
      revisionLineage: [{ revisionId: "revision-source" }],
      serverOwnedExtension: { preserve: true },
      subVendorMarginBps: 1_500
    });
  });

  it("does not let a pending secondary refresh block later PUTs or post-save editability", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => {
        if (sectionKey === "pricing") {
          throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Specifications unavailable.");
        }
        return savedSection(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          input
        );
      }
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    const panel = renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "15");
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    await user.type(screen.getByRole("textbox", { name: "Specification name" }), "Plywood");

    const invalidationNeverSettles = new Promise<void>(() => undefined);
    const invalidateSpy = vi
      .spyOn(panel.queryClient, "invalidateQueries")
      .mockImplementation(() => invalidationNeverSettles);
    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await ref.current!.save();
    });

    expect(saveResult).toBe(false);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "pricing"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([
      7,
      8
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.item(item.mainLineId) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.contexts() });
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "PMC" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Execution" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Specifications unavailable.");
  });

  it("preserves both sources’ saved components through margin save-edit-save with authoritative CAS rebasing", async () => {
    const user = userEvent.setup();
    const initialAdvancedPayload: KnowledgeJsonObject = {
      serverOwnedExtension: { preserve: true },
      modeConfigurations: [
        {
          id: "configuration-in-house-stable",
          modeKind: "execution",
          executionSource: "in_house",
          fields: [{
            id: "field-in-house-stable",
            type: "text",
            label: "In-house mark",
            options: [],
            value: "In-house initial"
          }]
        },
        {
          id: "configuration-execution-stable",
          modeKind: "execution",
          executionSource: "sub_vendor",
          fields: [{
            id: "field-execution-stable",
            type: "text",
            label: "Execution note",
            options: [],
            value: "Execution initial"
          }]
        }
      ]
    };
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          applicabilityBySection[sectionKey as keyof typeof applicabilityBySection],
          sectionKey === "advanced" ? initialAdvancedPayload : {}
        )
    );
    const returnedAggregateVersions = [41, 73] as const;
    let saveIndex = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) =>
        savedSection(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          input,
          returnedAggregateVersions[saveIndex++]!
        )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    const panel = renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "15");
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toBeEnabled());
    panel.queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), {
      ...item,
      version: 999
    });
    const margin = screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" });
    expect(margin).toBeEnabled();
    await user.clear(margin);
    await user.type(margin, "17");
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "advanced"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedVersion)).toEqual([
      11,
      12
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([
      7,
      41
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload).toEqual({
      ...initialAdvancedPayload, subVendorMarginBps: 1_500
    });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload).toEqual({
      ...initialAdvancedPayload, subVendorMarginBps: 1_700
    });
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toBeEnabled();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("promotes a fresh Advanced configuration to configured without changing other section applicability", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          sectionKey === "advanced"
            ? "not_configured"
            : applicabilityBySection[sectionKey as keyof typeof applicabilityBySection]
        )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "15");

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection)).toHaveBeenCalledOnce();
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[2]).toBe("advanced");
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3]).toMatchObject({
      applicability: "configured",
      expectedVersion: 11
    });
  });

  it("keeps the Advanced promotion after a later partial-save failure", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          sectionKey === "advanced"
            ? "not_configured"
            : applicabilityBySection[sectionKey as keyof typeof applicabilityBySection]
        )
    );
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => {
        if (sectionKey === "pricing") {
          throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Pricing unavailable.");
        }
        return savedSection(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          input
        );
      }
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "15");
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    await user.type(screen.getByRole("textbox", { name: "Specification name" }), "Plywood");

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => [
      call[2],
      call[3].applicability
    ])).toEqual([
      ["advanced", "configured"],
      ["pricing", "not_applicable"]
    ]);
    expect(screen.getAllByText("Unsaved changes")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Pricing unavailable.");
  });

  it("retains the promoted Advanced draft and request semantics through a conflict", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          sectionKey === "advanced"
            ? "not_configured"
            : applicabilityBySection[sectionKey as keyof typeof applicabilityBySection]
        )
    );
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValue(
      new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.")
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "15");

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3]).toMatchObject({
      applicability: "configured",
      expectedVersion: 11
    });
    const conflict = screen.getByRole("alertdialog", { name: "This section changed elsewhere" });
    expect(conflict).toBeVisible();
    expect(conflict).toHaveTextContent("Mode configuration");
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }))
      .toHaveValue(15);
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    await user.click(within(conflict).getByRole("button", { name: "Keep editing" }));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementationOnce(
      async (_line, _revision, key, input) => savedSection(key as "advanced", input)
    );
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3]).toMatchObject({
      applicability: "configured",
      payload: { subVendorMarginBps: 1_500 }
    });

  });

  it("keeps a dirty Execution draft editable when the legacy catalog changes", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          applicabilityBySection[sectionKey as keyof typeof applicabilityBySection],
          sectionKey === "advanced"
            ? {
                modeConfigurations: [{
                  id: "configuration-pmc-dirty",
                  modeKind: "execution",
                  executionSource: "sub_vendor",
                  fields: [{
                    id: "field-pmc-dirty",
                    type: "text",
                    label: "PMC mark",
                    options: [],
                    value: "Initial"
                  }]
                }]
              }
            : {}
        )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    const panel = renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    const margin = await screen.findByRole("spinbutton", { name: "Sub-Vendor Margin" });
    await user.clear(margin);
    await user.type(margin, "15");
    panel.rerenderModes([modes[0]!]);

    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toBeEnabled());
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection)).toHaveBeenCalledOnce();
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload).toMatchObject({
      modeConfigurations: [expect.objectContaining({
        modeKind: "execution",
                  executionSource: "sub_vendor",
        fields: [expect.objectContaining({ label: "PMC mark", value: "Initial" })]
      })],
      subVendorMarginBps: 1_500
    });
    expect(screen.queryByText(/Execution is missing|reusable Mode/iu)).not.toBeInTheDocument();
  });

  it("promotes Advanced when removing an unavailable configuration from a fresh section", async () => {
    const user = userEvent.setup();
    const inactivePmc: KnowledgeMaster = {
      ...modes[0]!,
      id: "mode-inactive-pmc",
      name: "Inactive PMC",
      status: "inactive"
    };
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          sectionKey === "advanced"
            ? "not_configured"
            : applicabilityBySection[sectionKey as keyof typeof applicabilityBySection],
          sectionKey === "advanced"
            ? {
                modeConfigurations: [{
                  id: "configuration-unavailable",
                  modeId: inactivePmc.id,
                  fields: [{
                    id: "field-unavailable",
                    type: "text",
                    label: "Legacy mark",
                    options: [],
                    value: "Visible recovery value"
                  }]
                }]
              }
            : {}
        )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref, [inactivePmc, modes[1]!]);

    const selector = await screen.findByRole("group", { name: "Mode" });
    expect(within(selector).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(selector).getByRole("checkbox", { name: "PMC" })).toBeChecked();
    expect(within(selector).getByRole("checkbox", { name: "Execution" })).not.toBeChecked();
    const recovery = await screen.findByRole("region", {
      name: "Saved Mode configurations needing recovery"
    });
    expect(within(recovery).getByText("Legacy mark")).toBeVisible();
    expect(within(recovery).queryByText("Visible recovery value")).not.toBeInTheDocument();
    await user.click(within(recovery).getByRole("button", {
      name: "Remove saved Mode recovery 1"
    }));

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection)).toHaveBeenCalledWith(
      item.mainLineId,
      "revision-1",
      "advanced",
      expect.objectContaining({
        applicability: "configured",
        payload: { modeConfigurations: [] }
      })
    );
  });

  it("stops after an Advanced failure, preserves the local margin, and retries only dirty blocks", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          applicabilityBySection[sectionKey as keyof typeof applicabilityBySection],
          sectionKey === "advanced"
            ? {
                modeConfigurations: [{
                  id: "configuration-pmc-existing",
                  modeKind: "execution",
                  executionSource: "sub_vendor",
                  fields: [{
                    id: "field-pmc-mark-existing",
                    type: "text",
                    label: "PMC mark",
                    options: [],
                    value: "Initial"
                  }]
                }]
              }
            : {}
        )
    );
    let advancedAttempts = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => {
        if (sectionKey === "advanced" && advancedAttempts++ === 0) {
          throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Advanced unavailable.");
        }
        return savedSection(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          input
        );
      }
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    const margin = await screen.findByRole("spinbutton", { name: "Sub-Vendor Margin" });
    await user.clear(margin);
    await user.type(margin, "15");
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    await user.type(screen.getByRole("textbox", { name: "Specification name" }), "Plywood");

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced"
    ]);
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toHaveValue(15);

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "advanced",
      "pricing"
    ]);
  });

  it("maps authoritative Advanced validation paths to the Sub-Vendor margin and clears them on edit", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) =>
        section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          applicabilityBySection[sectionKey as keyof typeof applicabilityBySection],
          sectionKey === "advanced"
            ? {
                modeConfigurations: [{
                  id: "configuration-pmc-existing",
                  modeKind: "execution",
                  executionSource: "sub_vendor",
                  fields: [{
                    id: "field-pmc-mark-existing",
                    type: "text",
                    label: "PMC mark",
                    options: [],
                    value: "Initial"
                  }]
                }]
              }
            : {}
        )
    );
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "Mode configuration is invalid.", {
        "payload.subVendorMarginBps": "Sub-Vendor margin is no longer accepted."
      })
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    const margin = await screen.findByRole("spinbutton", { name: "Sub-Vendor Margin" });
    await user.clear(margin);
    await user.type(margin, "15");

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(await screen.findAllByText("Sub-Vendor margin is no longer accepted.")).toHaveLength(2);
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }))
      .toHaveAttribute("aria-invalid", "true");

    await user.clear(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }));
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "17");

    await waitFor(() => {
      expect(screen.queryAllByText("Sub-Vendor margin is no longer accepted.")).toHaveLength(0);
    });
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }))
      .not.toHaveAttribute("aria-invalid", "true");
  });
});
