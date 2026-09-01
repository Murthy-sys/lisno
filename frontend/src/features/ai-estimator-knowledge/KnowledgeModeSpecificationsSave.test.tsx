import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef, type ComponentProps } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { KnowledgeModePanel, type KnowledgeModePanelHandle } from "./KnowledgeModePanel";
import * as knowledgeApi from "./knowledgeApi";
import type {
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeSectionEnvelope,
  KnowledgeSectionMutationEnvelope
} from "./knowledgeTypes";

vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    getKnowledgeItem: vi.fn(),
    getKnowledgeSection: vi.fn(),
    updateKnowledgeSection: vi.fn()
  };
});

const metadata = {
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-09-02T08:00:00.000Z",
  updatedAt: "2026-09-02T08:00:00.000Z"
} as const;

const item: KnowledgeItemDetail = {
  id: "line-spec-save",
  mainLineId: "line-spec-save",
  mainLineName: "Specification save line",
  basketId: "basket-1",
  basketName: "Carpentry",
  description: null,
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
  ...metadata
};

const versions = {
  advanced: 11,
  pricing: 12,
  "quantity-margin": 13
} as const;

function section(
  sectionKey: "advanced" | "pricing" | "quantity-margin",
  payload: KnowledgeJsonObject = {}
): KnowledgeSectionEnvelope<KnowledgeJsonObject> {
  return {
    id: `section-${sectionKey}`,
    mainLineId: item.mainLineId,
    revisionId: "revision-1",
    sectionKey,
    applicability: "configured",
    payload,
    referenceState: sectionKey === "pricing"
      ? { specificationIds: ["spec-panel-grade"] }
      : undefined,
    version: versions[sectionKey],
    ...metadata
  };
}

function savedSection(
  sectionKey: "advanced" | "pricing" | "quantity-margin",
  input: {
    readonly applicability?: "configured" | "not_configured" | "not_applicable";
    readonly payload: KnowledgeJsonObject;
    readonly expectedVersion: number;
    readonly expectedAggregateVersion?: number;
  },
  aggregateVersion: number
): KnowledgeSectionMutationEnvelope<KnowledgeJsonObject> {
  return {
    ...section(sectionKey, input.payload),
    applicability: input.applicability ?? "configured",
    version: input.expectedVersion + 1,
    aggregateVersion
  };
}

function renderPanel(ref: React.RefObject<KnowledgeModePanelHandle | null>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const props: ComponentProps<typeof KnowledgeModePanel> = {
    item,
    revisionId: "revision-1",
    masters: {},
    relationshipBaskets: [],
    relationshipItems: [],
    editable: true,
    canQuickAdd: false,
    legacyModeCatalogState: { status: "ready" },
    onQuickAdd: vi.fn(),
    onDirtyChange: vi.fn(),
    onSavingChange: vi.fn(),
    onBusyChange: vi.fn(),
    onAnnouncement: vi.fn()
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeModePanel ref={ref} {...props} />
    </QueryClientProvider>
  );
}

describe("Knowledge Mode Specifications save integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue(item);
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) => section(
        sectionKey as "advanced" | "pricing" | "quantity-margin",
        sectionKey === "pricing"
          ? {
              serverOwnedExtension: { preserve: true },
              specifications: [{
                id: "spec-panel-grade",
                name: "Plywood",
                description: "18 mm BWP-grade plywood.",
                type: "text",
                options: [],
                value: "A1"
              }],
              brands: [],
              priceEntries: []
            }
          : {}
      )
    );
  });

  it("keeps the same descriptive control editable through save-edit-save, preserves typed data, and rebases both CAS versions", async () => {
    const user = userEvent.setup();
    const returnedAggregateVersions = [41, 73] as const;
    let saveIndex = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => savedSection(
        sectionKey as "advanced" | "pricing" | "quantity-margin",
        input,
        returnedAggregateVersions[saveIndex++]!
      )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    const descriptionControl = await screen.findByRole("textbox", { name: "Brief description" });
    await user.clear(descriptionControl);
    await user.type(descriptionControl, "Inner carcass uses 18 mm BWP plywood.");
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Brief description" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Brief description" })).toBe(descriptionControl);
    await user.clear(descriptionControl);
    await user.type(descriptionControl, "Final approved BWP plywood guidance.");
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "pricing",
      "pricing"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedVersion)).toEqual([
      12,
      13
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([
      7,
      41
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload).toMatchObject({
      serverOwnedExtension: { preserve: true },
      specifications: [{
        id: "spec-panel-grade",
        name: "Plywood",
        description: "Inner carcass uses 18 mm BWP plywood.",
        type: "text",
        options: [],
        value: "A1"
      }]
    });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload).toMatchObject({
      serverOwnedExtension: { preserve: true },
      specifications: [{
        id: "spec-panel-grade",
        name: "Plywood",
        description: "Final approved BWP plywood guidance.",
        type: "text",
        options: [],
        value: "A1"
      }]
    });
    expect(screen.getByRole("textbox", { name: "Brief description" })).toBe(descriptionControl);
  });

  it("removes stale Specification price scope at the save boundary for append commands", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) => section(
        sectionKey as "advanced" | "pricing" | "quantity-margin",
        sectionKey === "pricing"
          ? {
              specifications: [{
                id: "spec-panel-grade",
                name: "Plywood",
                description: "Original guidance"
              }],
              priceEntries: [{
                operation: "append",
                priceEntryId: "price-entry-stale-client",
                vendorId: "vendor-1",
                uomId: "uom-1",
                specificationId: "spec-panel-grade",
                modeId: null,
                taxRuleId: "tax-1",
                taxVersionId: "tax-version-1",
                inputAmountPaise: 12_000,
                treatment: "exclusive",
                effectiveFrom: "2026-09-02T00:00:00.000Z",
                effectiveTo: null,
                status: "draft"
              }]
            }
          : {}
      )
    );
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => savedSection(
        sectionKey as "advanced" | "pricing" | "quantity-margin",
        input,
        45
      )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    const description = await screen.findByRole("textbox", { name: "Brief description" });
    expect(screen.queryByRole("combobox", { name: "Specification" }))
      .not.toBeInTheDocument();
    await user.clear(description);
    await user.type(description, "Updated descriptive guidance");
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload)
      .toMatchObject({
        specifications: [{
          id: "spec-panel-grade",
          name: "Plywood",
          description: "Updated descriptive guidance"
        }],
        priceEntries: [{
          operation: "append",
          priceEntryId: "price-entry-stale-client",
          specificationId: null,
          inputAmountPaise: 12_000
        }]
      });
  });

  it("blocks save for an unnamed new Specification and focuses Specification name", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("button", { name: "Add Specification" }));
    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    const invalidName = screen.getAllByRole("textbox", { name: "Specification name" })
      .find((control) => control.getAttribute("aria-invalid") === "true");
    expect(invalidName).toHaveFocus();
    expect(screen.getAllByRole("alert").some((alert) =>
      alert.textContent?.includes("Specification name is required")
    )).toBe(true);
  });

  it("uses revision-wide response metadata to block history-only Specification removal", async () => {
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    const remove = await screen.findByRole("button", {
      name: "Remove Specifications entry 1"
    });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(
      "This Specification is retained by an immutable historical price version and cannot be removed."
    );
  });

  it("maps server payload.specifications issues to the descriptive control and clears them on edit", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "Specification is invalid.", {
        "payload.specifications.0.name": "Specification name is no longer accepted."
      })
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    const nameControl = await screen.findByRole("textbox", { name: "Specification name" });
    await user.clear(nameControl);
    await user.type(nameControl, "Rejected plywood");
    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(await screen.findAllByText("Specification name is no longer accepted.")).toHaveLength(2);
    expect(nameControl).toHaveAttribute("aria-invalid", "true");
    await user.clear(nameControl);
    await user.type(nameControl, "Accepted plywood");

    await waitFor(() => {
      expect(screen.queryAllByText("Specification name is no longer accepted.")).toHaveLength(0);
    });
    expect(nameControl).not.toHaveAttribute("aria-invalid", "true");
  });

  it("maps only allowed Pricing server issues and clears Vendor feedback on edit", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "Vendor is invalid.", {
        "payload.brands.0.name": "Vendor name is no longer accepted.",
        "payload.internalVendorNotes": "Private pricing feedback must stay hidden.",
        "payload.priceEntries.0.vendorId": "Price lineage feedback must stay hidden."
      })
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await screen.findByDisplayValue("Plywood");
    await user.click(await screen.findByRole("button", { name: "Add vendor" }));
    const vendorName = await screen.findByRole("textbox", { name: "Vendor name" });
    await user.type(vendorName, "Rejected vendor");
    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(await screen.findByText("Vendor name is no longer accepted.")).toBeVisible();
    expect(screen.getAllByRole("alert").some((alert) =>
      alert.textContent?.includes("Vendors → 0 → name")
    )).toBe(true);
    expect(screen.queryByText("Private pricing feedback must stay hidden.")).not.toBeInTheDocument();
    expect(screen.queryByText("Price lineage feedback must stay hidden.")).not.toBeInTheDocument();

    await user.clear(vendorName);
    await user.type(vendorName, "Accepted vendor");
    await waitFor(() => {
      expect(screen.queryByText("Vendor name is no longer accepted.")).not.toBeInTheDocument();
      expect(screen.queryAllByRole("alert").some((alert) =>
        alert.textContent?.includes("Vendors → 0 → name")
      )).toBe(false);
    });
  });

  it("preserves Vendor rows and all Pricing data through add-edit-move-remove and two saves", async () => {
    const user = userEvent.setup();
    const pricingPayload: KnowledgeJsonObject = {
      serverOwnedExtension: { preserve: true, marker: "vendor-lifecycle" },
      technicalDescription: "Hidden technical detail",
      internalVendorNotes: "Hidden internal note",
      qualityLevel: "premium",
      specifications: [{
        id: "spec-panel-grade",
        name: "Plywood",
        description: "18 mm BWP-grade plywood.",
        type: "text",
        options: [],
        value: "A1"
      }],
      brands: [
        { id: "brand-alpha", name: "Alpha vendor", description: "Primary supplier" },
        { id: "brand-beta", name: "Beta vendor", description: "Remove after comparison" }
      ],
      priceEntries: [{
        operation: "reference",
        priceEntryId: "price-entry-vendor-lifecycle",
        priceVersionId: "price-version-vendor-lifecycle",
        priceVersion: {
          id: "price-version-vendor-lifecycle",
          versionNumber: 3,
          inputAmountPaise: 12_000,
          baseAmountPaise: 12_000,
          taxAmountPaise: 2_160,
          totalAmountPaise: 14_160,
          status: "active"
        }
      }]
    };
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) => section(
        sectionKey as "advanced" | "pricing" | "quantity-margin",
        sectionKey === "pricing" ? pricingPayload : {}
      )
    );
    const returnedAggregateVersions = [51, 93] as const;
    let saveIndex = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => savedSection(
        sectionKey as "advanced" | "pricing" | "quantity-margin",
        input,
        returnedAggregateVersions[saveIndex++]!
      )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await screen.findByDisplayValue("Plywood");
    const vendors = await screen.findByRole("region", { name: "Vendors" });
    let vendorNames = await within(vendors).findAllByRole("textbox", { name: "Vendor name" });
    expect(vendorNames.map((control) => control.getAttribute("value"))).toEqual([
      "Alpha vendor",
      "Beta vendor"
    ]);
    await user.clear(vendorNames[0]);
    await user.type(vendorNames[0], "Alpha vendor edited");
    await user.click(within(vendors).getByRole("button", { name: "Add vendor" }));

    vendorNames = within(vendors).getAllByRole("textbox", { name: "Vendor name" });
    await user.type(vendorNames[2], "Gamma vendor");
    const descriptions = within(vendors).getAllByRole("textbox", { name: "Description" });
    await user.type(descriptions[2], "Newly approved supplier");
    await user.click(within(vendors).getByRole("button", { name: "Move Vendors entry 3 up" }));
    await user.click(within(vendors).getByRole("button", { name: "Remove Vendors entry 3" }));

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    const vendorsAfterFirstSave = await screen.findByRole("region", { name: "Vendors" });
    const namesAfterFirstSave = within(vendorsAfterFirstSave).getAllByRole("textbox", { name: "Vendor name" });
    expect(namesAfterFirstSave).toHaveLength(2);
    expect(namesAfterFirstSave[0]).toHaveValue("Alpha vendor edited");
    expect(namesAfterFirstSave[1]).toHaveValue("Gamma vendor");
    await user.clear(namesAfterFirstSave[1]);
    await user.type(namesAfterFirstSave[1], "Gamma vendor final");

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    const calls = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls;
    expect(calls.map((call) => call[2])).toEqual(["pricing", "pricing"]);
    expect(calls.map((call) => call[3].expectedVersion)).toEqual([12, 13]);
    expect(calls.map((call) => call[3].expectedAggregateVersion)).toEqual([7, 51]);

    const firstPayload = calls[0]?.[3].payload as KnowledgeJsonObject;
    const secondPayload = calls[1]?.[3].payload as KnowledgeJsonObject;
    const firstBrands = firstPayload.brands as readonly KnowledgeJsonObject[];
    const secondBrands = secondPayload.brands as readonly KnowledgeJsonObject[];
    const newVendorId = firstBrands[1]?.id;
    expect(newVendorId).toEqual(expect.stringMatching(/^knowledge-brands-/u));
    expect(firstBrands).toEqual([
      { id: "brand-alpha", name: "Alpha vendor edited", description: "Primary supplier" },
      { id: newVendorId, name: "Gamma vendor", description: "Newly approved supplier" }
    ]);
    expect(secondBrands).toEqual([
      { id: "brand-alpha", name: "Alpha vendor edited", description: "Primary supplier" },
      { id: newVendorId, name: "Gamma vendor final", description: "Newly approved supplier" }
    ]);
    for (const payload of [firstPayload, secondPayload]) {
      expect(payload).toMatchObject({
        serverOwnedExtension: { preserve: true, marker: "vendor-lifecycle" },
        technicalDescription: "Hidden technical detail",
        internalVendorNotes: "Hidden internal note",
        qualityLevel: "premium",
        specifications: [expect.objectContaining({
          id: "spec-panel-grade",
          name: "Plywood",
          value: "A1"
        })],
        priceEntries: [{
          operation: "reference",
          priceEntryId: "price-entry-vendor-lifecycle",
          priceVersionId: "price-version-vendor-lifecycle"
        }]
      });
    }
  });
});
