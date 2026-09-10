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
  KnowledgeMaster,
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
  ...metadata
};

const budgetVendor: KnowledgeMaster = {
  ...squareFoot,
  id: "vendor-1",
  masterType: "vendors",
  code: "VENDOR_1",
  name: "Vendor 1"
};

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
    masters: { uoms: [squareFoot], vendors: [budgetVendor], taxes: [] },
    relationshipBaskets: [],
    relationshipItems: [],
    editable: true,
    legacyModeCatalogState: { status: "ready" },
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

  it("rebases Specifications onto the latest hidden Pricing data before retry", async () => {
    const user = userEvent.setup();
    let pricingReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) => {
        const base = section(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          sectionKey === "pricing"
            ? {
                serverOwnedExtension: { preserve: true },
                specifications: [],
                brands: [],
                priceEntries: []
              }
            : {}
        );
        if (sectionKey !== "pricing") return base;
        pricingReads += 1;
        return pricingReads === 1 ? base : { ...base, version: 13, payload: { ...base.payload, brands: [{ id: "vendor-latest", name: "Latest vendor" }], serverOwnedExtension: { updated: true } } };
      }
    );
    let updateAttempts = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => {
        updateAttempts += 1;
        if (updateAttempts === 1) {
          throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.");
        }
        return savedSection(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          input,
          8
        );
      }
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("button", { name: "Add Specification" }));
    await user.type(screen.getByRole("textbox", { name: "Specification name" }), "Local plywood");

    let saved: boolean | undefined;
    await act(async () => {
      saved = await ref.current?.save();
    });
    expect(saved).toBe(false);
    const conflict = await screen.findByRole("alertdialog", { name: "This section changed elsewhere" });
    await user.click(within(conflict).getByRole("button", { name: "Keep editing" }));

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    const calls = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[2]).toBe("pricing");
    expect(calls[1]?.[3].expectedVersion).toBe(13);
    expect(calls[1]?.[3].expectedAggregateVersion).toBe(7);
    expect(calls[1]?.[3].payload).toMatchObject({
      specifications: [{ name: "Local plywood" }],
      brands: [{ id: "vendor-latest", name: "Latest vendor" }],
      serverOwnedExtension: { updated: true }
    });
  });


  it("preserves existing Specification price scope when saving descriptive changes", async () => {
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
                uomId: squareFoot.id,
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
          specificationId: "spec-panel-grade",
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

  it("renames a Specification without writing hidden Quantity data", async () => {
    const user = userEvent.setup();
    const returnedAggregateVersions = [31, 32] as const;
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

    const specificationName = await screen.findByRole("textbox", { name: "Specification name" });
    await user.clear(specificationName);
    await user.type(specificationName, "Renamed plywood");
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    const calls = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls;
    expect(calls.map((call) => call[2])).toEqual(["pricing"]);
    expect(calls[0]?.[3].expectedAggregateVersion).toBe(7);
    expect(calls[0]?.[3].payload.specifications).toEqual([
      expect.objectContaining({ id: "spec-panel-grade", name: "Renamed plywood" })
    ]);
  });

  it("preflights every dirty Mode draft before the first section update", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    const description = await screen.findByRole("textbox", { name: "Brief description" });
    await user.clear(description);
    await user.type(description, "Valid Pricing change that must not save alone");
    const margin = screen.getByRole("spinbutton", { name: "PMC Margin" });
    await user.clear(margin);
    await user.type(margin, "9");

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(margin).toHaveAttribute("aria-invalid", "true");
  });

  it("uses revision-wide response metadata to block history-only Specification removal", async () => {
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    const remove = await screen.findByRole("button", {
      name: "Remove Specifications entry 1"
    });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(
      "This Specification is retained by saved configuration or immutable price history and cannot be removed."
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

  it("shows only Specification field issues from a failed Pricing save", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "Specification is invalid.", {
        "payload.specifications.0.name": "Choose another name.",
        "payload.brands.0.name": "Hidden vendor feedback.",
        "payload.internalVendorNotes": "Private pricing feedback.",
        "payload.priceEntries.0.vendorId": "Hidden price feedback."
      })
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    const name = await screen.findByRole("textbox", { name: "Specification name" });
    await user.type(name, " update");
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
    for (const text of ["Hidden vendor feedback.", "Private pricing feedback.", "Hidden price feedback."]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    await user.type(name, " corrected");
    expect(screen.queryAllByText("Choose another name.")).toHaveLength(0);
  });

  it("preserves hidden Vendor rows and immutable price references through two Specification saves", async () => {
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

    const description = await screen.findByRole("textbox", { name: "Brief description" });
    expect(screen.queryByRole("region", { name: "Vendors" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Budgeting" })).not.toBeInTheDocument();
    for (const value of ["First specification update", "Second specification update"]) {
      await user.clear(description);
      await user.type(description, value);
      await act(async () => { expect(await ref.current?.save()).toBe(true); });
    }
    const calls = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls;
    expect(calls.map((call) => call[3].expectedAggregateVersion)).toEqual([7, 51]);
    for (const call of calls) {
      expect(call[2]).toBe("pricing");
      expect(call[3].payload).toMatchObject({
        brands: pricingPayload.brands,
        serverOwnedExtension: pricingPayload.serverOwnedExtension,
        technicalDescription: pricingPayload.technicalDescription,
        internalVendorNotes: pricingPayload.internalVendorNotes,
        qualityLevel: pricingPayload.qualityLevel,
        priceEntries: [{ operation: "reference", priceEntryId: "price-entry-vendor-lifecycle", priceVersionId: "price-version-vendor-lifecycle" }]
      });
      expect(call[3].payload.priceEntries).toEqual([{ operation: "reference", priceEntryId: "price-entry-vendor-lifecycle", priceVersionId: "price-version-vendor-lifecycle" }]);
    }
  });
});
