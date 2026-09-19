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
  completionRequired: false,
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

async function openSpecificationEditor(
  user: ReturnType<typeof userEvent.setup>,
  index = 1
) {
  await user.click(await screen.findByRole("button", {
    name: `Edit Specification ${index}`
  }));
  return screen.findByRole("dialog", { name: "Edit Specification" });
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

    await openSpecificationEditor(user);
    let descriptionControl = screen.getByRole("textbox", { name: "Brief description" });
    await user.clear(descriptionControl);
    await user.type(descriptionControl, "Inner carcass uses 18 mm BWP plywood.");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Brief description" })).not.toBeInTheDocument();
    expect(screen.getByText("Unsaved")).toBeVisible();
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    await waitFor(() => expect(screen.getByText("Saved")).toBeVisible());
    await openSpecificationEditor(user);
    descriptionControl = screen.getByRole("textbox", { name: "Brief description" });
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
    expect(screen.getByRole("textbox", { name: "Brief description" })).toHaveValue("Final approved BWP plywood guidance.");
  });

  it("saves a Brand association with four independent wardrobe parts in one Pricing payload", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => savedSection(
        sectionKey as "advanced" | "pricing" | "quantity-margin",
        input,
        41
      )
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await openSpecificationEditor(user);
    const brandSelect = screen.getByRole("combobox", { name: "Brand name" });
    await user.selectOptions(brandSelect, screen.getByRole("option", { name: "Add brand" }));
    const brandDialog = await screen.findByRole("dialog", { name: "Add Brand" });
    await user.type(within(brandDialog).getByRole("textbox", { name: "Brand name" }), "Century Green");
    await user.click(within(brandDialog).getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    for (const part of ["Laminate", "Hinges", "Glue"]) {
      await user.click(screen.getByRole("button", { name: "Add Specification" }));
      await user.type(screen.getByRole("textbox", { name: "Item name" }), part);
      await user.click(screen.getByRole("button", { name: "Done" }));
    }

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    const payload = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload;
    const brands = payload?.brands as KnowledgeJsonObject[];
    const specifications = payload?.specifications as KnowledgeJsonObject[];
    expect(brands).toEqual([
      expect.objectContaining({ id: expect.any(String), name: "Century Green" })
    ]);
    expect(specifications.map(({ name }) => name)).toEqual([
      "Plywood",
      "Laminate",
      "Hinges",
      "Glue"
    ]);
    expect(specifications[0]).toMatchObject({
      name: "Plywood",
      brandId: brands[0]?.id
    });
    expect(specifications.slice(1).every((part) => !Object.hasOwn(part, "brandId"))).toBe(true);
    expect(screen.getByRole("cell", { name: "Century Green" })).toBeVisible();
    expect(screen.getAllByText("Saved")).toHaveLength(4);
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
        return pricingReads === 1 ? base : { ...base, version: 13, payload: { ...base.payload, brands: [{ id: "brand-latest", name: "Latest Brand" }], serverOwnedExtension: { updated: true } } };
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
    await user.type(screen.getByRole("textbox", { name: "Item name" }), "Local plywood");

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
      brands: [{ id: "brand-latest", name: "Latest Brand" }],
      serverOwnedExtension: { updated: true }
    });
  });

  it("three-way merges a local description with a concurrent Brand change on the same item/part", async () => {
    const user = userEvent.setup();
    let pricingReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) => {
        if (sectionKey !== "pricing") {
          return section(sectionKey as "advanced" | "pricing" | "quantity-margin", {});
        }
        pricingReads += 1;
        const latest = pricingReads > 1;
        return {
          ...section("pricing", {
            specifications: [{
              id: "spec-panel-grade",
              name: "Plywood",
              description: "Saved guidance",
              brandId: latest ? "brand-hettich" : "brand-century"
            }],
            brands: [
              { id: "brand-century", name: "Century Green" },
              { id: "brand-hettich", name: "Hettich" }
            ],
            priceEntries: []
          }),
          version: latest ? 13 : 12
        };
      }
    );
    let updateAttempts = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => {
        updateAttempts += 1;
        if (updateAttempts === 1) throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.");
        return savedSection(sectionKey as "advanced" | "pricing" | "quantity-margin", input, 8);
      }
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await openSpecificationEditor(user);
    const description = screen.getByRole("textbox", { name: "Brief description" });
    await user.clear(description);
    await user.type(description, "Local guidance");
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("combobox", { name: "Brand name" })).toHaveDisplayValue("Hettich");
    expect(screen.getByRole("textbox", { name: "Brief description" })).toHaveValue("Local guidance");

    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload.specifications).toEqual([{
      id: "spec-panel-grade",
      name: "Plywood",
      description: "Local guidance",
      brandId: "brand-hettich"
    }]);
  });

  it("three-way merges an inline local Brand addition with concurrent Brand addition and deletion", async () => {
    const user = userEvent.setup();
    let pricingReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) => {
        if (sectionKey !== "pricing") {
          return section(sectionKey as "advanced" | "pricing" | "quantity-margin", {});
        }
        pricingReads += 1;
        const latest = pricingReads > 1;
        return {
          ...section("pricing", {
            specifications: [{ id: "spec-panel-grade", name: "Plywood", brandId: "brand-century" }],
            brands: latest
              ? [
                  { id: "brand-century", name: "Century Green" },
                  { id: "brand-new", name: "Server-added Brand" }
                ]
              : [
                  { id: "brand-century", name: "Century Green" },
                  { id: "brand-removed", name: "Server-removed Brand" }
                ],
            priceEntries: []
          }),
          version: latest ? 13 : 12
        };
      }
    );
    let updateAttempts = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => {
        updateAttempts += 1;
        if (updateAttempts === 1) throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.");
        return savedSection(sectionKey as "advanced" | "pricing" | "quantity-margin", input, 8);
      }
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await openSpecificationEditor(user);
    const brandSelect = screen.getByRole("combobox", { name: "Brand name" });
    await user.selectOptions(brandSelect, screen.getByRole("option", { name: "Add brand" }));
    const addBrand = await screen.findByRole("dialog", { name: "Add Brand" });
    await user.type(within(addBrand).getByRole("textbox", { name: "Brand name" }), "Local Blum");
    await user.click(within(addBrand).getByRole("button", { name: "Add" }));
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("combobox", { name: "Brand name" })).toHaveDisplayValue("Local Blum");
    expect(screen.queryByRole("region", { name: "Brands" })).not.toBeInTheDocument();

    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    const retriedPayload = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload;
    const retriedBrands = retriedPayload.brands as KnowledgeJsonObject[];
    expect(retriedBrands).toEqual([
      { id: "brand-century", name: "Century Green" },
      { id: "brand-new", name: "Server-added Brand" },
      expect.objectContaining({ id: expect.any(String), name: "Local Blum" })
    ]);
    expect(retriedPayload.specifications).toEqual([{
      id: "spec-panel-grade",
      name: "Plywood",
      brandId: retriedBrands[2]?.id
    }]);
  });

  it("repairs a concurrent same-name Brand conflict from the selected Brand dropdown", async () => {
    const user = userEvent.setup();
    let pricingReads = 0;
    vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey) => {
        if (sectionKey !== "pricing") {
          return section(sectionKey as "advanced" | "pricing" | "quantity-margin", {});
        }
        pricingReads += 1;
        const latest = pricingReads > 1;
        return {
          ...section("pricing", {
            specifications: [{ id: "spec-panel-grade", name: "Plywood", brandId: "brand-century" }],
            brands: latest
              ? [
                  { id: "brand-century", name: "Century Green" },
                  { id: "brand-server-blum", name: "Blum" }
                ]
              : [{ id: "brand-century", name: "Century Green" }],
            priceEntries: []
          }),
          version: latest ? 13 : 12
        };
      }
    );
    let updateAttempts = 0;
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => {
        updateAttempts += 1;
        if (updateAttempts === 1) throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.");
        return savedSection(sectionKey as "advanced" | "pricing" | "quantity-margin", input, 8);
      }
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await openSpecificationEditor(user);
    const brandSelect = screen.getByRole("combobox", { name: "Brand name" });
    await user.selectOptions(brandSelect, screen.getByRole("option", { name: "Add brand" }));
    const addBrand = await screen.findByRole("dialog", { name: "Add Brand" });
    await user.type(within(addBrand).getByRole("textbox", { name: "Brand name" }), "Blum");
    await user.click(within(addBrand).getByRole("button", { name: "Add" }));

    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Keep editing" }));

    expect(brandSelect).toHaveAccessibleDescription("Brand names must be unique.");
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(knowledgeApi.updateKnowledgeSection).toHaveBeenCalledTimes(1);

    await user.selectOptions(brandSelect, screen.getByRole("option", { name: "Edit selected brand" }));
    const editBrand = await screen.findByRole("dialog", { name: "Edit Brand" });
    const brandName = within(editBrand).getByRole("textbox", { name: "Brand name" });
    expect(brandName).toHaveValue("Blum");
    await user.clear(brandName);
    await user.type(brandName, "Local Blum");
    await user.click(within(editBrand).getByRole("button", { name: "Save" }));

    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    const retriedPayload = vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload;
    const retriedBrands = retriedPayload.brands as KnowledgeJsonObject[];
    expect(retriedBrands).toEqual([
      { id: "brand-century", name: "Century Green" },
      { id: "brand-server-blum", name: "Blum" },
      expect.objectContaining({ id: expect.any(String), name: "Local Blum" })
    ]);
    expect(retriedPayload.specifications).toEqual([{
      id: "spec-panel-grade",
      name: "Plywood",
      brandId: retriedBrands[2]?.id
    }]);
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

    await openSpecificationEditor(user);
    const description = screen.getByRole("textbox", { name: "Brief description" });
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

  it("blocks save for an unnamed new Specification and focuses Item name", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("button", { name: "Add Specification" }));
    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(knowledgeApi.updateKnowledgeSection).not.toHaveBeenCalled();
    const invalidName = screen.getAllByRole("textbox", { name: "Item name" })
      .find((control) => control.getAttribute("aria-invalid") === "true");
    expect(invalidName).toHaveFocus();
    expect(screen.getAllByRole("alert").some((alert) =>
      alert.textContent?.includes("Item name is required")
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

    await openSpecificationEditor(user);
    const specificationName = screen.getByRole("textbox", { name: "Item name" });
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

    await openSpecificationEditor(user);
    const description = screen.getByRole("textbox", { name: "Brief description" });
    await user.clear(description);
    await user.type(description, "Valid Pricing change that must not save alone");
    const margin = screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" });
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

    const specifications = await screen.findByRole("region", { name: "Specifications" });
    const remove = within(specifications).getByRole("button", { name: "Remove Specification 1: Plywood" });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(
      "This Specification is retained by saved configuration or immutable price history and cannot be removed."
    );
  });

  it("maps server payload.specifications issues to the descriptive control and clears them on edit", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "Specification is invalid.", {
        "payload.specifications.0.name": "Item name is no longer accepted."
      })
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await openSpecificationEditor(user);
    const nameControl = screen.getByRole("textbox", { name: "Item name" });
    await user.clear(nameControl);
    await user.type(nameControl, "Rejected plywood");
    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(await screen.findAllByText("Item name is no longer accepted.")).toHaveLength(2);
    expect(nameControl).toHaveAttribute("aria-invalid", "true");
    await user.clear(nameControl);
    await user.type(nameControl, "Accepted plywood");

    await waitFor(() => {
      expect(screen.queryAllByText("Item name is no longer accepted.")).toHaveLength(0);
    });
    expect(nameControl).not.toHaveAttribute("aria-invalid", "true");
  });

  it("shows only Specification and Brand field issues from a failed Pricing save", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "Specification is invalid.", {
        "payload.specifications.0.name": "Choose another name.",
        "payload.brands.0.name": "Brand needs correction.",
        "payload.internalVendorNotes": "Private pricing feedback.",
        "payload.priceEntries.0.vendorId": "Hidden price feedback."
      })
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    await openSpecificationEditor(user);
    const name = screen.getByRole("textbox", { name: "Item name" });
    await user.type(name, " update");
    await act(async () => { expect(await ref.current?.save()).toBe(false); });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
    expect(screen.getByText("Brand needs correction.")).toBeVisible();
    for (const text of ["Private pricing feedback.", "Hidden price feedback."]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    await user.type(name, " corrected");
    expect(screen.queryAllByText("Choose another name.")).toHaveLength(0);
  });

  it("focuses the Pricing error summary when a hidden Brand identity is rejected", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "Brand identity is invalid.", {
        "payload.brands.0.id": "Brand identity must be unique."
      })
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    await openSpecificationEditor(user);
    const description = screen.getByRole("textbox", { name: "Brief description" });
    await user.type(description, " update");

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    const summary = screen.getByLabelText("Pricing validation errors");
    expect(summary).toHaveFocus();
    expect(screen.getAllByText("Brand identity must be unique.")).toHaveLength(1);
    expect(screen.getByText("Review item and Brand details")).toBeVisible();
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

    await openSpecificationEditor(user);
    const description = screen.getByRole("textbox", { name: "Brief description" });
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
