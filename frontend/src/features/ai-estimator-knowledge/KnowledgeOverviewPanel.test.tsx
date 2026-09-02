import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  KnowledgeOverviewPanel,
  type KnowledgeOverviewPanelProps,
  type KnowledgeOverviewSectionState
} from "./KnowledgeOverviewPanel";
import { projectKnowledgeOverviewSummary } from "./knowledgeOverviewSummary";
import { formatKnowledgeDateTime } from "./knowledgePresentation";
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeRevision,
  KnowledgeSectionKey
} from "./knowledgeTypes";

const completeness: KnowledgeCompleteness = {
  percentage: 74,
  sections: [
    "overview",
    "pricing",
    "quantity-margin",
    "scope",
    "recommendations",
    "quality",
    "execution",
    "advanced"
  ].map((sectionKey) => ({
    sectionKey: sectionKey as KnowledgeSectionKey,
    state: "complete" as const,
    findings: []
  })),
  blockers: [],
  warnings: []
};

const item = {
  id: "item-record-1",
  mainLineId: "main-line-stable-1",
  mainLineName: "Decorative wall panelling",
  basketId: "basket-stable-1",
  basketName: "Interior carpentry",
  description: "Stored generic description that must not render",
  status: "draft",
  activeRevisionId: null,
  draftRevisionId: "revision-stable-1",
  revisionNumber: 3,
  uomId: "uom-square-foot",
  priorityId: "priority-hidden",
  modeIds: ["mode-pmc", "mode-labour"],
  surfaceIds: ["surface-wall"],
  vendorIds: ["vendor-a"],
  completeness,
  allowedActions: ["update_section"],
  activeRevision: null,
  draftRevision: null,
  blockers: [],
  warnings: [],
  version: 11,
  createdById: "actor-created",
  updatedById: "actor-updated",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
} satisfies KnowledgeItemDetail;

const revision = {
  id: "revision-stable-1",
  mainLineId: item.mainLineId,
  revisionNumber: 3,
  status: "draft",
  sourceRevisionId: null,
  contentDigest: null,
  completeness,
  activatedAt: null,
  activatedById: null,
  supersededAt: null,
  supersededById: null,
  version: 7,
  createdById: "actor-created",
  updatedById: "actor-updated",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
} satisfies KnowledgeRevision;

const squareFoot = master("uom-square-foot", "uoms", "Square foot", 10);
const squareMetre = master("uom-square-metre", "uoms", "Square metre", 20);
const wall = master("surface-wall", "surfaces", "Wall", 10);
const pmc = master("mode-pmc", "modes", "PMC", 10);
const labour = master("mode-labour", "modes", "Labour only", 20);
const vendor = master("vendor-a", "vendors", "Acme supply", 10);
const tax = master("tax-gst", "taxes", "GST", 10);

const masters = {
  uoms: [squareFoot, squareMetre],
  surfaces: [wall],
  modes: [pmc, labour],
  vendors: [vendor],
  taxes: [tax],
  priorities: []
} as const;

const overviewPayload = {
  description: "Preserve this stored value",
  uomId: squareFoot.id,
  priorityId: "priority-hidden",
  modeIds: [pmc.id, labour.id],
  surfaceIds: [wall.id],
  sectionApplicability: [{ id: "rule-hidden", sectionKey: "quality" }],
  unknownCompatibilityValue: { keep: true }
} as const;

const sections = {
  overview: overviewPayload,
  pricing: {
    specifications: [
      { id: "spec-premium", name: "Premium finish", description: "Specialized description" },
      { id: "spec-standard", name: "Standard finish" }
    ],
    priceEntries: [
      {
        priceEntryId: "price-pmc",
        operation: "append",
        specificationId: "spec-premium",
        modeId: pmc.id,
        vendorId: vendor.id,
        uomId: squareFoot.id,
        taxRuleId: tax.id,
        inputAmountPaise: 123_45,
        baseAmountPaise: 120_00,
        taxAmountPaise: 3_45,
        totalAmountPaise: 123_45,
        status: "active"
      },
      {
        priceEntryId: "price-labour",
        operation: "append",
        specificationId: "spec-standard",
        modeId: labour.id,
        vendorId: vendor.id,
        uomId: squareMetre.id,
        inputAmountPaise: 987_65,
        baseAmountPaise: 980_00,
        taxAmountPaise: 7_65,
        totalAmountPaise: 987_65,
        status: "active"
      }
    ]
  },
  "quantity-margin": {
    startMarginBps: 1_100,
    bottomMarginBps: 800,
    pmcMarkupBps: 2_500,
    wastageBps: 300,
    gapBehavior: "use_nearest",
    quantitySlabs: []
  },
  scope: { modeIds: [pmc.id], surfaceIds: [wall.id], exclusions: [] },
  recommendations: {
    recommendations: [{
      id: "recommendation-one",
      targetBasketId: "basket-target",
      targetMainLineId: "line-target-one",
      type: "recommended",
      reason: "Use on feature walls",
      quantityRelationship: "same_quantity",
      dependency: false,
      active: true
    }, {
      id: "recommendation-two",
      targetBasketId: "basket-target",
      targetMainLineId: "line-target-two",
      type: "alternative",
      reason: "Use when moisture resistant",
      quantityRelationship: "fixed",
      quantityValue: "2",
      dependency: true,
      active: true
    }]
  },
  quality: {
    parameters: [{
      id: "quality-thickness",
      label: "Panel thickness",
      type: "number",
      unit: "mm",
      minimum: "10",
      maximum: "24",
      defaultValue: 12,
      required: true,
      active: true
    }]
  },
  execution: { steps: [{ id: "step-prepare", name: "Prepare substrate" }], productivity: [] },
  advanced: {
    dependencies: [],
    modeOverrides: [{ id: "override-pmc", modeId: pmc.id, description: "PMC procurement workflow", active: true }],
    modeConfigurations: [{
      id: "configuration-pmc",
      modeKind: "pmc",
      fields: [{ id: "field-pmc", type: "text", label: "PMC mark", options: [], value: "A1" }]
    }, {
      id: "configuration-execution",
      modeKind: "execution",
      executionSource: "sub_vendor",
      fields: [{ id: "field-execution", type: "text", label: "Execution phase", options: [], value: "Install" }]
    }]
  }
} as const;

const summary = projectKnowledgeOverviewSummary({
  sections,
  masters,
  baskets: [{ id: "basket-target", name: "Finishes" }],
  items: [
    { mainLineId: "line-target-one", mainLineName: "Paint finish" },
    { mainLineId: "line-target-two", mainLineName: "Laminate finish" }
  ],
  completeness
});

const emptySections = {
  overview: {},
  pricing: { specifications: [], priceEntries: [] },
  "quantity-margin": { quantitySlabs: [] },
  scope: { modeIds: [], surfaceIds: [], exclusions: [] },
  recommendations: { recommendations: [] },
  quality: { parameters: [] },
  execution: { steps: [], productivity: [] },
  advanced: { dependencies: [], modeOverrides: [] }
} as const;

const emptySummary = projectKnowledgeOverviewSummary({
  sections: emptySections,
  masters,
  baskets: [],
  items: [],
  completeness
});

function readyStates() {
  return Object.fromEntries(
    ["pricing", "quantity-margin", "scope", "recommendations", "quality", "execution", "advanced"].map((key) => [
      key,
      { status: "ready", onRetry: vi.fn() } satisfies KnowledgeOverviewSectionState
    ])
  ) as KnowledgeOverviewPanelProps["sectionStates"];
}

function renderPanel(overrides: Partial<KnowledgeOverviewPanelProps> = {}) {
  const props: KnowledgeOverviewPanelProps = {
    item,
    revision,
    overviewPayload,
    summary,
    masters,
    sectionStates: readyStates(),
    editable: true,
    canQuickAdd: true,
    onOverviewPayloadChange: vi.fn(),
    onOverviewDirty: vi.fn(),
    onQuickAddUom: vi.fn(),
    onOpenSection: vi.fn(),
    ...overrides
  };
  render(<main><KnowledgeOverviewPanel {...props} /></main>);
  return props;
}

function expectSectionSummaryCardsAbsent() {
  expect(screen.queryByRole("heading", { name: "All section summaries" })).not.toBeInTheDocument();
  expect(screen.queryByText(
    "Review completeness and key configured values before opening a detailed editor."
  )).not.toBeInTheDocument();
  expect(document.querySelector(".knowledge-overview__cards")).not.toBeInTheDocument();
  expect(document.querySelectorAll(".knowledge-overview-card")).toHaveLength(0);
  for (const label of ["Mode", "Scope", "Recommendations", "Quality", "Execution", "Advanced"]) {
    expect(screen.queryByRole("heading", { name: label, level: 3 })).not.toBeInTheDocument();
  }
}

describe("KnowledgeOverviewPanel", () => {
  it("renders only compact context and the UOM editor after every empty source is ready", async () => {
    const readyReferenceState = {
      status: "ready",
      onRetry: vi.fn()
    } satisfies KnowledgeOverviewSectionState;
    const failedUnusedReference = {
      status: "error",
      errorMessage: "Unused reference failed",
      onRetry: vi.fn()
    } satisfies KnowledgeOverviewSectionState;
    renderPanel({
      overviewPayload: {},
      summary: emptySummary,
      referenceStates: {
        masters: {
          uoms: readyReferenceState,
          surfaces: readyReferenceState,
          modes: { status: "loading", onRetry: vi.fn() },
          vendors: failedUnusedReference,
          taxes: failedUnusedReference,
          priorities: failedUnusedReference
        },
        relationships: failedUnusedReference
      }
    });

    const context = document.querySelector(".knowledge-overview__context");
    expect(context).not.toBeNull();
    expect(context).toHaveTextContent(`${item.mainLineName} · Main Basket: ${item.basketName}`);
    expect(within(context as HTMLElement).getAllByText(item.mainLineName)).toHaveLength(1);
    expect(within(context as HTMLElement).getAllByText(item.basketName)).toHaveLength(1);
    expect(within(context as HTMLElement).queryByText("Revision")).not.toBeInTheDocument();
    expect(within(context as HTMLElement).queryByText("Status")).not.toBeInTheDocument();
    expect(within(context as HTMLElement).queryByText("Completeness")).not.toBeInTheDocument();
    expect(screen.getAllByText(item.mainLineName)).toHaveLength(1);
    expect(screen.getAllByText(item.basketName)).toHaveLength(1);
    expect(screen.queryByText("Revision")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Completeness")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Configured values" })).toBeVisible();
    expect(screen.getByText("Reusable values for this Main Line.")).toBeVisible();
    const uomControlRow = document.querySelector(".knowledge-overview__uom-control-row");
    expect(uomControlRow).not.toBeNull();
    expect(within(uomControlRow as HTMLElement).getByRole("combobox", {
      name: "Unit of measure (UOM)"
    })).toBeVisible();
    expect(within(uomControlRow as HTMLElement).getByRole("button", {
      name: "Add Unit"
    })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Surfaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Surface options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Modes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Selected Mode details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Shared calculation values" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Specifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recommendations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Quality" })).not.toBeInTheDocument();
    expectSectionSummaryCardsAbsent();
    expect(screen.queryByRole("button", { name: /^Open /u })).not.toBeInTheDocument();
    expect(screen.queryByText("Some reusable labels are unavailable")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("ignores a failed Surface reference without affecting available UOM controls", () => {
    const retrySurface = vi.fn();
    renderPanel({
      referenceStates: {
        masters: {
          uoms: { status: "ready", onRetry: vi.fn() },
          surfaces: {
            status: "error",
            errorMessage: "Surface options failed",
            onRetry: retrySurface
          }
        }
      }
    });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Surfaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Surface options" })).not.toBeInTheDocument();
    expect(screen.queryByText("Surface options failed")).not.toBeInTheDocument();
    expect(screen.queryByText("Surface options unavailable.")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading Surface options…")).not.toBeInTheDocument();
    expect(screen.queryByText("Some reusable labels are unavailable")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(retrySurface).not.toHaveBeenCalled();
  });

  it("keeps a saved price visible with one non-blocking reference-loading status", () => {
    const unassignedPriceSections = {
      ...emptySections,
      pricing: {
        specifications: [],
        priceEntries: [{
          priceEntryId: "price-unassigned",
          operation: "append",
          vendorId: "vendor-unresolved",
          inputAmountPaise: 0
        }]
      }
    } as const;
    const unassignedPriceSummary = projectKnowledgeOverviewSummary({
      sections: unassignedPriceSections,
      masters,
      baskets: [],
      items: [],
      completeness
    });

    renderPanel({
      overviewPayload: {},
      summary: unassignedPriceSummary,
      referenceStates: {
        masters: {
          vendors: { status: "loading", onRetry: vi.fn() },
          taxes: { status: "loading", onRetry: vi.fn() }
        }
      }
    });

    const pricingPanel = screen
      .getByRole("heading", { name: "Pricing" })
      .closest("section");
    expect(pricingPanel).not.toBeNull();
    expect(within(pricingPanel as HTMLElement).getByText("₹0.00")).toBeVisible();
    expect(within(pricingPanel as HTMLElement).getByText("Unavailable value")).toBeVisible();
    expect(within(pricingPanel as HTMLElement).queryByText("vendor-unresolved")).not.toBeInTheDocument();
    expect(within(pricingPanel as HTMLElement).queryByRole("combobox", {
      name: "Specification"
    })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Specifications" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Loading reusable labels…");
  });

  it("shows only selected descriptive Specification information for legacy and typed rows", async () => {
    const user = userEvent.setup();
    const specificationSections = {
      ...emptySections,
      pricing: {
        specifications: [
          { id: "spec-legacy", name: "Legacy finish" },
          {
            id: "spec-checkbox",
            name: "Inspection required",
            description: "Confirm after installation",
            type: "checkbox",
            options: [],
            value: false
          },
          {
            id: "spec-number",
            name: "Tolerance",
            description: "Millimetres",
            type: "number",
            options: [],
            value: "0"
          },
          {
            id: "spec-choice",
            name: "Fixing method",
            type: "dropdown",
            options: ["Chosen method", "Definition-only alternative"],
            value: "Chosen method"
          }
        ],
        priceEntries: []
      }
    } as const;
    const specificationSummary = projectKnowledgeOverviewSummary({
      sections: specificationSections,
      masters,
      baskets: [],
      items: [],
      completeness
    });

    renderPanel({ overviewPayload: {}, summary: specificationSummary });

    const specificationPanel = screen
      .getByRole("heading", { name: "Specifications" })
      .closest("section");
    expect(specificationPanel).not.toBeNull();
    const selector = within(specificationPanel as HTMLElement).getByRole("combobox", {
      name: "Specification"
    });
    expect(within(selector).getAllByRole("option").map(({ textContent }) => textContent)).toEqual([
      "Legacy finish",
      "Inspection required",
      "Tolerance",
      "Fixing method"
    ]);
    expect(within(specificationPanel as HTMLElement).getAllByText("Legacy finish")).toHaveLength(2);
    expect(within(specificationPanel as HTMLElement).getByText("Specification name")).toBeVisible();
    expect(within(specificationPanel as HTMLElement).queryByText("Brief description")).not.toBeInTheDocument();

    await user.selectOptions(selector, "spec-checkbox");
    expect(within(specificationPanel as HTMLElement).getByText("Brief description")).toBeVisible();
    expect(within(specificationPanel as HTMLElement).getByText("Confirm after installation")).toBeVisible();
    expect(within(specificationPanel as HTMLElement).queryByText("No")).not.toBeInTheDocument();

    await user.selectOptions(selector, "spec-number");
    expect(within(specificationPanel as HTMLElement).getByText("Millimetres")).toBeVisible();
    expect(within(specificationPanel as HTMLElement).queryByText("0")).not.toBeInTheDocument();

    await user.selectOptions(selector, "spec-choice");
    expect(within(specificationPanel as HTMLElement).queryByText("Chosen method")).not.toBeInTheDocument();
    expect(within(specificationPanel as HTMLElement).queryByText("Definition-only alternative")).not.toBeInTheDocument();
    expect(within(specificationPanel as HTMLElement).queryByText("dropdown")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pricing" })).not.toBeInTheDocument();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("keeps a saved Recommendation visible with one relationship-loading status", () => {
    const recommendationSections = {
      ...emptySections,
      recommendations: {
        recommendations: [{
          id: "recommendation-loading-labels",
          targetBasketId: "basket-unresolved",
          targetMainLineId: "main-line-unresolved",
          active: true
        }]
      }
    } as const;
    const recommendationSummary = projectKnowledgeOverviewSummary({
      sections: recommendationSections,
      masters,
      baskets: [],
      items: [],
      completeness
    });

    renderPanel({
      overviewPayload: {},
      summary: recommendationSummary,
      referenceStates: {
        relationships: { status: "loading", onRetry: vi.fn() }
      }
    });

    const recommendationPanel = screen
      .getByRole("heading", { name: "Recommendations", level: 2 })
      .closest("section");
    expect(recommendationPanel).not.toBeNull();
    expect(within(recommendationPanel as HTMLElement).getAllByText("Unavailable value")).toHaveLength(3);
    expect(within(recommendationPanel as HTMLElement).getByText("Yes")).toBeVisible();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Loading reusable labels…");
    expect(screen.queryByRole("heading", { name: "Specifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pricing" })).not.toBeInTheDocument();
  });

  it("keeps fixed Mode choices independent from reusable-label loading", () => {
    renderPanel({
      referenceStates: {
        masters: {
          modes: { status: "loading", onRetry: vi.fn() }
        }
      }
    });

    expect(screen.getByRole("radio", { name: pmc.name })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Execution" })).toBeVisible();
    expect(screen.queryByText("Loading Mode labels…")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading reusable labels…")).not.toBeInTheDocument();
  });

  it("keeps a literal saved 'Not configured' value visible", () => {
    const literalSections = {
      ...emptySections,
      "quantity-margin": {
        gapBehavior: "Not configured",
        quantitySlabs: []
      }
    } as const;
    const literalSummary = projectKnowledgeOverviewSummary({
      sections: literalSections,
      masters,
      baskets: [],
      items: [],
      completeness
    });

    renderPanel({ overviewPayload: {}, summary: literalSummary });

    const sharedPanel = screen
      .getByRole("heading", { name: "Shared calculation values" })
      .closest("section");
    expect(sharedPanel).not.toBeNull();
    expect(within(sharedPanel as HTMLElement).getByText("Not configured")).toBeVisible();
  });

  it("renders complete metadata for assigned and unassigned prices", () => {
    const effectiveFrom = "2026-09-01T10:30:00.000Z";
    const effectiveTo = "2026-09-30T18:00:00.000Z";
    const metadataSections = {
      ...emptySections,
      overview: { modeIds: [pmc.id] },
      pricing: {
        specifications: [{ id: "spec-metadata", name: "Metadata specification" }],
        priceEntries: [{
          priceEntryId: "price-mode-metadata",
          operation: "append",
          specificationId: "spec-metadata",
          modeId: pmc.id,
          versionNumber: 0,
          treatment: "exclusive",
          effectiveFrom,
          effectiveTo,
          reviewRequired: false
        }, {
          priceEntryId: "price-unassigned-metadata",
          operation: "reference",
          priceVersionId: "private-price-version-id",
          versionNumber: 2,
          treatment: "inclusive",
          effectiveFrom,
          effectiveTo,
          reviewRequired: false
        }]
      }
    } as const;
    const metadataSummary = projectKnowledgeOverviewSummary({
      sections: metadataSections,
      masters,
      baskets: [],
      items: [],
      completeness
    });

    renderPanel({ overviewPayload: metadataSections.overview, summary: metadataSummary });

    const pricingPanel = screen
      .getByRole("heading", { name: "Pricing" })
      .closest("section");
    expect(pricingPanel).not.toBeNull();
    expect(within(pricingPanel as HTMLElement).getAllByText("Version number").length).toBeGreaterThan(0);
    expect(within(pricingPanel as HTMLElement).getByText("0")).toBeVisible();
    expect(within(pricingPanel as HTMLElement).getAllByText("Tax treatment").length).toBeGreaterThan(0);
    expect(within(pricingPanel as HTMLElement).getByText("exclusive")).toBeVisible();
    expect(within(pricingPanel as HTMLElement).getAllByText("Effective from").length).toBeGreaterThan(0);
    expect(within(pricingPanel as HTMLElement).getAllByText("Effective to").length).toBeGreaterThan(0);
    expect(within(pricingPanel as HTMLElement).getAllByText(formatKnowledgeDateTime(effectiveFrom)).length).toBeGreaterThan(0);
    expect(within(pricingPanel as HTMLElement).getAllByText(formatKnowledgeDateTime(effectiveTo)).length).toBeGreaterThan(0);
    expect(within(pricingPanel as HTMLElement).getAllByText("Review required").length).toBeGreaterThan(0);

    expect(within(pricingPanel as HTMLElement).getByText("Price version")).toBeVisible();
    expect(within(pricingPanel as HTMLElement).getByText("Unavailable value")).toBeVisible();
    expect(within(pricingPanel as HTMLElement).getByText("2")).toBeVisible();
    expect(within(pricingPanel as HTMLElement).getByText("inclusive")).toBeVisible();
    expect(within(pricingPanel as HTMLElement).getAllByText("No")).toHaveLength(2);
    expect(pricingPanel).not.toHaveTextContent("private-price-version-id");

    const specificationPanel = screen
      .getByRole("heading", { name: "Specifications" })
      .closest("section");
    expect(specificationPanel).not.toBeNull();
    expect(within(specificationPanel as HTMLElement).queryByText("Price entries")).not.toBeInTheDocument();
    expect(within(specificationPanel as HTMLElement).queryByText("Version number")).not.toBeInTheDocument();
    expect(specificationPanel?.parentElement).toBe(pricingPanel?.parentElement);
    expect(specificationPanel?.parentElement).toHaveClass("knowledge-overview__principal-grid");
  });

  it("renders the approved summary hierarchy and preserves hidden Overview values on edits", async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      summary: {
        ...summary,
        sectionCards: summary.sectionCards.map((card) => card.key === "mode" ? {
          ...card,
          warnings: [{
            code: "pricing_not_configured",
            sectionKey: "pricing",
            message: "pricing is not configured.",
            blocking: false
          }, {
            code: "quantity_margin_not_configured",
            sectionKey: "quantity-margin",
            message: "quantity-margin is not configured.",
            blocking: false
          }]
        } : card)
      }
    });

    expect(screen.getByText(item.mainLineName)).toBeVisible();
    expect(screen.getByText(item.basketName)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Configured values" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Priority" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Section applicability rules" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(item.description!);
    expectSectionSummaryCardsAbsent();
    expect(screen.queryByText("pricing is not configured.")).not.toBeInTheDocument();
    expect(screen.queryByText("quantity-margin is not configured.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open Mode" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Open Recommendations" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Open Quality" })).toHaveLength(1);

    const uomControlRow = document.querySelector(".knowledge-overview__uom-control-row");
    expect(uomControlRow).not.toBeNull();
    expect(within(uomControlRow as HTMLElement).getByRole("combobox", {
      name: "Unit of measure (UOM)"
    })).toBeVisible();
    await user.click(within(uomControlRow as HTMLElement).getByRole("button", {
      name: "Add Unit"
    }));
    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    expect(props.onQuickAddUom).toHaveBeenCalledTimes(1);
    const selectQuickAddedUom = vi.mocked(props.onQuickAddUom).mock.calls[0]?.[0];
    selectQuickAddedUom?.(squareMetre);
    expect(props.onOverviewDirty).toHaveBeenCalledWith("uomId");
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({
      ...overviewPayload,
      uomId: squareMetre.id
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }), squareMetre.id);
    expect(props.onOverviewDirty).toHaveBeenCalledWith("uomId");
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({
      ...overviewPayload,
      uomId: squareMetre.id
    });
    expect(screen.queryByRole("button", { name: "Surfaces" })).not.toBeInTheDocument();

    const payloadCallCount = vi.mocked(props.onOverviewPayloadChange).mock.calls.length;
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Specification" }),
      "spec-standard"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Recommendation" }),
      "recommendation-two"
    );
    expect(screen.getAllByText("Laminate finish").length).toBeGreaterThan(0);
    expect(props.onOverviewPayloadChange).toHaveBeenCalledTimes(payloadCallCount);
  });

  it("keeps fixed-kind component definitions isolated while PMC markup remains shared", async () => {
    const user = userEvent.setup();
    renderPanel();
    const modePanel = screen.getByRole("heading", { name: "Selected Mode details" }).closest("section");
    const sharedPanel = screen.getByRole("heading", { name: "Shared calculation values" }).closest("section");
    expect(modePanel).not.toBeNull();
    expect(sharedPanel).not.toBeNull();

    expect(within(modePanel as HTMLElement).getByText("PMC mark")).toBeVisible();
    expect(within(modePanel as HTMLElement).getByText("Text field")).toBeVisible();
    expect(within(modePanel as HTMLElement).queryByText("A1")).not.toBeInTheDocument();
    expect(within(modePanel as HTMLElement).queryByText("Execution phase")).not.toBeInTheDocument();
    expect(within(modePanel as HTMLElement).queryByText("PMC procurement workflow")).not.toBeInTheDocument();
    expect(within(sharedPanel as HTMLElement).getByText("25.00%")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Execution" }));
    expect(within(modePanel as HTMLElement).getByRole("heading", { name: "Sub-Vendor" })).toBeVisible();
    expect(within(modePanel as HTMLElement).getByText("Execution phase")).toBeVisible();
    expect(within(modePanel as HTMLElement).queryByText("Install")).not.toBeInTheDocument();
    expect(within(modePanel as HTMLElement).queryByText("PMC mark")).not.toBeInTheDocument();
    expect(within(sharedPanel as HTMLElement).getByText("25.00%")).toBeVisible();
  });

  it("shows only the selected Mode's component definitions without saved answers", async () => {
    const user = userEvent.setup();
    const executionMode = master("mode-execution-asymmetric", "modes", "Execution", 20);
    const dynamicSummary = projectKnowledgeOverviewSummary({
      sections: {
        advanced: {
          modeConfigurations: [
            {
              id: "configuration-pmc-asymmetric",
              modeKind: "pmc",
              fields: [
                { id: "field-pmc-mark", type: "text", label: "PMC mark", options: [], value: "A1" },
                { id: "field-pmc-empty", type: "text", label: "Empty note", options: [], value: "" },
                { id: "field-pmc-check", type: "checkbox", label: "Reviewed", options: [], value: false }
              ]
            },
            {
              id: "configuration-execution-asymmetric",
              modeKind: "execution",
              executionSource: "sub_vendor",
              fields: [
                { id: "field-execution-phase", type: "dropdown", label: "Execution phase", options: ["Install"], value: "Install" }
              ]
            }
          ]
        }
      },
      masters: { modes: [pmc, executionMode] }
    });
    renderPanel({
      summary: dynamicSummary,
      masters: { ...masters, modes: [pmc, executionMode] }
    });
    const modePanel = screen.getByRole("heading", { name: "Selected Mode details" }).closest("section");
    expect(modePanel).not.toBeNull();
    expect(within(modePanel as HTMLElement).getByText("PMC mark")).toBeVisible();
    expect(within(modePanel as HTMLElement).queryByText("A1")).not.toBeInTheDocument();
    expect(within(modePanel as HTMLElement).getByText("Reviewed")).toBeVisible();
    expect(within(modePanel as HTMLElement).getByText("Checkbox")).toBeVisible();
    expect(within(modePanel as HTMLElement).queryByText("No")).not.toBeInTheDocument();
    expect(within(modePanel as HTMLElement).getByText("Empty note")).toBeVisible();
    expect(within(modePanel as HTMLElement).queryByText("Execution phase")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Execution" }));
    expect(within(modePanel as HTMLElement).getByRole("heading", { name: "Sub-Vendor" })).toBeVisible();
    expect(within(modePanel as HTMLElement).getByText("Execution phase")).toBeVisible();
    expect(within(modePanel as HTMLElement).getByText("Install")).toBeVisible();
    expect(within(modePanel as HTMLElement).queryByText("PMC mark")).not.toBeInTheDocument();
    expect(within(modePanel as HTMLElement).queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("keeps the fixed Mode selector usable and isolates a failed legacy mapping reference", async () => {
    const user = userEvent.setup();
    const retryModes = vi.fn();
    const legacySummary = projectKnowledgeOverviewSummary({
      sections: {
        advanced: {
          modeConfigurations: [{
            id: "configuration-pmc-fixed",
            modeKind: "pmc",
            fields: [{ id: "field-pmc-fixed", type: "text", label: "PMC mark", options: [], value: "A1" }]
          }, {
            id: "configuration-execution-fixed",
            modeKind: "execution",
            executionSource: "in_house",
            fields: [{ id: "field-execution-fixed", type: "text", label: "Execution mark", options: [], value: "EX-1" }]
          }, {
            id: "configuration-legacy-unresolved",
            modeId: "private-unresolved-mode-id",
            fields: [{ id: "field-legacy-saved", type: "text", label: "Saved legacy mark", options: [], value: "Keep visible" }]
          }]
        }
      },
      masters: { modes: [] }
    });
    renderPanel({
      summary: legacySummary,
      referenceStates: {
        masters: {
          modes: {
            status: "error",
            errorMessage: "Modes reference failed",
            onRetry: retryModes
          }
        }
      }
    });

    const modeChoices = screen.getByRole("radiogroup", { name: "Modes" });
    expect(within(modeChoices).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "pmc",
      "execution"
    ]);
    expect(screen.getByText("Saved Mode configuration mapping is unavailable")).toBeVisible();
    expect(screen.getByText("Modes reference failed")).toBeVisible();
    expect(screen.queryByText("Some reusable labels are unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("Saved legacy mark")).toBeVisible();
    expect(screen.queryByText("Keep visible")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-unresolved-mode-id");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryModes).toHaveBeenCalledTimes(1);
  });

  it("omits section-summary cards, warnings, and retries when card-only sources fail", () => {
    const retryExecution = vi.fn();
    const states = {
      ...readyStates(),
      scope: {
        status: "loading",
        onRetry: vi.fn()
      } satisfies KnowledgeOverviewSectionState,
      execution: {
        status: "error",
        errorMessage: "Execution summary failed",
        onRetry: retryExecution
      } satisfies KnowledgeOverviewSectionState
    };
    renderPanel({ sectionStates: states });

    expectSectionSummaryCardsAbsent();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByText("Execution summary failed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Scope" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Advanced" })).not.toBeInTheDocument();
    expect(retryExecution).not.toHaveBeenCalled();
  });

  it("keeps principal actions for every navigable Overview destination", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    const principalPanels = [
      {
        heading: screen.getByRole("heading", { name: "Selected Mode details", level: 2 }),
        action: "Open Mode",
        key: "mode"
      },
      {
        heading: screen.getByRole("heading", { name: "Specifications", level: 2 }),
        action: "Open Mode",
        key: "mode"
      },
      {
        heading: screen.getByRole("heading", { name: "Pricing", level: 2 }),
        action: "Open Mode",
        key: "mode"
      },
      {
        heading: screen.getByRole("heading", { name: "Recommendations", level: 2 }),
        action: "Open Recommendations",
        key: "recommendations"
      },
      {
        heading: screen.getByRole("heading", { name: "Quality", level: 2 }),
        action: "Open Quality",
        key: "quality"
      }
    ] as const;
    for (const { heading, action } of principalPanels) {
      const panel = heading.closest("section");
      expect(panel).not.toBeNull();
      await user.click(within(panel as HTMLElement).getByRole("button", { name: action }));
    }

    expectSectionSummaryCardsAbsent();
    expect(props.onOpenSection).toHaveBeenCalledTimes(5);
    expect(vi.mocked(props.onOpenSection).mock.calls.map(([key]) => key)).toEqual([
      ...principalPanels.map(({ key }) => key)
    ]);
  });

  it("keeps saved summaries visible when UOM labels fail and ignores Surface failure", async () => {
    const user = userEvent.setup();
    const retryUom = vi.fn();
    const retrySurface = vi.fn();
    const failedUomState = {
      status: "error",
      errorMessage: "Reusable values failed",
      onRetry: retryUom
    } satisfies KnowledgeOverviewSectionState;
    const failedSurfaceState = {
      status: "error",
      errorMessage: "Surface values failed",
      onRetry: retrySurface
    } satisfies KnowledgeOverviewSectionState;
    renderPanel({
      referenceStates: {
        masters: { uoms: failedUomState, surfaces: failedSurfaceState }
      }
    });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Surfaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Surface options" })).not.toBeInTheDocument();
    expect(screen.getByText("UOM options unavailable.")).toBeVisible();
    expect(screen.queryByText("Surface values failed")).not.toBeInTheDocument();
    expect(screen.queryByText("Surface options unavailable.")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: pmc.name })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Selected Mode details" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Specifications" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Pricing" })).toBeVisible();
    const warning = screen
      .getByText("Some reusable labels are unavailable")
      .closest(".ui-inline-message");
    expect(warning).not.toBeNull();
    await user.click(within(warning as HTMLElement).getByRole("button", { name: "Try again" }));
    expect(retryUom).toHaveBeenCalledTimes(1);
    expect(retrySurface).not.toHaveBeenCalled();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("keeps saved zero and false values while omitting blank fields and derived absence", () => {
    const partialSections = {
      ...emptySections,
      overview: { modeIds: [pmc.id] },
      "quantity-margin": { startMarginBps: 0, quantitySlabs: [] },
      recommendations: {
        recommendations: [{
          id: "recommendation-partial",
          targetBasketId: "missing-basket-id",
          targetMainLineId: "missing-main-line-id",
          dependency: false,
          active: false
        }]
      },
      quality: {
        parameters: [{
          id: "quality-partial",
          label: "Acoustic rating",
          minimum: "10",
          defaultValue: false,
          required: false,
          active: false
        }]
      }
    } as const;
    const partialSummary = projectKnowledgeOverviewSummary({
      sections: partialSections,
      masters: {
        ...masters,
        modes: [...masters.modes, master("mode-unused", "modes", "Unused Mode", 30)]
      },
      baskets: [],
      items: [],
      completeness
    });

    renderPanel({
      overviewPayload: partialSections.overview,
      summary: partialSummary,
      masters: {
        ...masters,
        modes: [...masters.modes, master("mode-unused", "modes", "Unused Mode", 30)]
      }
    });

    expect(screen.getByText("0.00%")).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Unused Mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Selected Mode details" })).not.toBeInTheDocument();

    const recommendationPanel = screen
      .getByRole("heading", { name: "Recommendations", level: 2 })
      .closest("section");
    expect(recommendationPanel).not.toBeNull();
    expect(within(recommendationPanel as HTMLElement).getAllByText("No")).toHaveLength(2);
    expect(within(recommendationPanel as HTMLElement).queryByText("Type")).not.toBeInTheDocument();
    expect(within(recommendationPanel as HTMLElement).queryByText("Reason")).not.toBeInTheDocument();
    expect(within(recommendationPanel as HTMLElement).getAllByText("Unavailable value")).toHaveLength(3);
    expect(recommendationPanel).not.toHaveTextContent("missing-basket-id");
    expect(recommendationPanel).not.toHaveTextContent("missing-main-line-id");

    const qualityPanel = screen.getByRole("heading", { name: "Quality", level: 2 }).closest("section");
    expect(qualityPanel).not.toBeNull();
    expect(within(qualityPanel as HTMLElement).getByText("Optional")).toBeVisible();
    expect(within(qualityPanel as HTMLElement).getByText("Inactive")).toBeVisible();
    expect(within(qualityPanel as HTMLElement).getByText("No")).toBeVisible();
    expect(within(qualityPanel as HTMLElement).getByText("Minimum 10")).toBeVisible();
    expect(within(qualityPanel as HTMLElement).queryByText("No maximum")).not.toBeInTheDocument();
    expect(within(qualityPanel as HTMLElement).queryByText("Unit")).not.toBeInTheDocument();

    expectSectionSummaryCardsAbsent();
  });

  it("keeps loading, failed, and cached-refresh sources operational without empty copy", async () => {
    const user = userEvent.setup();
    const retryRecommendations = vi.fn();
    const retryQuality = vi.fn();
    const partialSummary = projectKnowledgeOverviewSummary({
      sections: {
        ...emptySections,
        quality: { parameters: [{ id: "quality-cached", label: "Cached finish" }] }
      },
      masters,
      baskets: [],
      items: [],
      completeness
    });
    const states = {
      ...readyStates(),
      pricing: { status: "loading", onRetry: vi.fn() },
      recommendations: {
        status: "error",
        errorMessage: "Recommendations failed",
        onRetry: retryRecommendations
      },
      quality: {
        status: "ready",
        refreshErrorMessage: "Latest Quality failed",
        onRetry: retryQuality
      }
    } satisfies KnowledgeOverviewPanelProps["sectionStates"];

    renderPanel({ overviewPayload: {}, summary: partialSummary, sectionStates: states });

    expect(screen.getByRole("heading", { name: "Specifications" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    const recommendationsPanel = screen
      .getByRole("heading", { name: "Recommendations", level: 2 })
      .closest("section");
    expect(recommendationsPanel).not.toBeNull();
    expect(within(recommendationsPanel as HTMLElement).getByText("Recommendations failed")).toBeVisible();
    await user.click(within(recommendationsPanel as HTMLElement).getByRole("button", { name: "Try again" }));
    expect(retryRecommendations).toHaveBeenCalledTimes(1);

    const qualityPanel = screen.getByRole("heading", { name: "Quality", level: 2 }).closest("section");
    expect(qualityPanel).not.toBeNull();
    expect(within(qualityPanel as HTMLElement).getByText("Cached finish")).toBeVisible();
    expect(within(qualityPanel as HTMLElement).getByText("Latest Quality failed")).toBeVisible();
    await user.click(within(qualityPanel as HTMLElement).getByRole("button", { name: "Try again" }));
    expect(retryQuality).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/No .* configured/u)).not.toBeInTheDocument();
  });

  it("renders stable-only records without card-only failures or empty definition lists", async () => {
    const retryExecution = vi.fn();
    const stableOnlySections = {
      ...emptySections,
      pricing: {
        specifications: [],
        priceEntries: [{ priceEntryId: "private-stable-price-id" }]
      },
      recommendations: {
        recommendations: [{ id: "private-stable-recommendation-id" }]
      },
      quality: {
        parameters: [{ id: "private-stable-quality-id" }]
      }
    } as const;
    const stableOnlySummary = projectKnowledgeOverviewSummary({
      sections: stableOnlySections,
      masters,
      baskets: [],
      items: [],
      completeness
    });
    const states = {
      ...readyStates(),
      execution: {
        status: "error",
        errorMessage: "Execution summary failed",
        onRetry: retryExecution
      }
    } satisfies KnowledgeOverviewPanelProps["sectionStates"];

    renderPanel({ overviewPayload: {}, summary: stableOnlySummary, sectionStates: states });

    expect(screen.getAllByText("Unavailable value").length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent("private-stable-price-id");
    expect(document.body).not.toHaveTextContent("private-stable-recommendation-id");
    expect(document.body).not.toHaveTextContent("private-stable-quality-id");
    expect(document.querySelectorAll("dl:empty")).toHaveLength(0);

    expectSectionSummaryCardsAbsent();
    expect(screen.queryByText("Execution summary failed")).not.toBeInTheDocument();
    expect(retryExecution).not.toHaveBeenCalled();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("keeps read-only summary filters usable while disabling Overview mutation controls and passes axe", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ editable: false, canQuickAdd: false });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add Unit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add unit of measure" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Surfaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Surface options" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Execution" }));
    expect(screen.getByRole("radio", { name: "Execution" })).toBeChecked();
    expect(props.onOverviewPayloadChange).not.toHaveBeenCalled();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });
});

function master(
  id: string,
  masterType: KnowledgeMasterType,
  name: string,
  displayOrder: number
): KnowledgeMaster {
  return {
    id,
    masterType,
    code: id,
    name,
    description: null,
    displayOrder,
    status: "active",
    version: 1,
    createdById: "actor-created",
    updatedById: "actor-updated",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z"
  };
}
