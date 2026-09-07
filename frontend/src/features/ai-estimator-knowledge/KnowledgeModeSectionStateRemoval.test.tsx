import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRef,
  type ComponentProps
} from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
    updateKnowledgeSection: vi.fn()
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
    rerenderModes(currentModes: readonly KnowledgeMaster[]) {
      view.rerender(panel(currentModes));
    }
  };
}

describe("Knowledge Mode section-state removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it.each(["paragraph", "configuration"] as const)("rebases a local %s edit without overwriting the other server value", async (edited) => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    await screen.findByRole("button", { name: "Edit Mode paragraph" });
    if (edited === "paragraph") {
      await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
      await user.clear(screen.getByRole("textbox", { name: "Mode paragraph" }));
      await user.type(screen.getByRole("textbox", { name: "Mode paragraph" }), "Local paragraph");
      await user.click(screen.getByRole("button", { name: "Save" }));
    } else {
      await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    }
    const serverConfigurations = [{ id: "server-execution", modeKind: "execution", executionSource: "in_house", fields: [] }];
    const serverPayload = { modeDescription: "Server paragraph", modeConfigurations: serverConfigurations, dependencies: [] };
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
      dependencies: []
    } });
    if (edited === "paragraph") expect(submitted?.payload.modeConfigurations).toEqual(serverConfigurations);
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
    expect(text).toHaveAccessibleDescription("Please correct this paragraph.");
    await user.clear(text);
    await user.type(text, "Corrected wording");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload)
      .toMatchObject({ modeDescription: "Corrected wording" });
  });

  it("saves independent PMC checkboxes and custom names through save-edit-save", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    const inclusions = await screen.findByRole("group", { name: "Inclusions" });
    expect(screen.getByText(`PMC for ${item.mainLineName}`)).toBeVisible();
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

  it("loads only Mode and Specifications with their independent section metadata", async () => {
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);
    expect(await screen.findByRole("button", { name: "Add Specification" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Mode configuration" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Specifications" })).toBeVisible();
    expect(screen.getByText("Section version 11")).toBeVisible();
    expect(screen.getByText("Section version 12")).toBeVisible();
    expect(vi.mocked(knowledgeApi.getKnowledgeSection).mock.calls.map((call) => call[2]))
      .toEqual(["advanced", "pricing"]);
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
    await user.click(await screen.findByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "PMC mark");
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
      modeConfigurations: [
        expect.objectContaining({
          modeKind: "execution",
          executionSource: "sub_vendor",
          fields: [expect.objectContaining({ label: "PMC mark" })]
        })
      ]
    });
    /* The new component was never answered, so it must not persist an empty value. */
    expect(JSON.stringify(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload))
      .not.toContain('"value"');
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
    await user.click(await screen.findByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "PMC mark");
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
    expect(invalidateSpy).toHaveBeenCalledTimes(5);
    expect(screen.getByRole("textbox", { name: "Component label" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "PMC" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Execution" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Specifications unavailable.");
  });

  it("keeps both Execution definitions editable through same-mounted save-edit-save with authoritative CAS rebasing", async () => {
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
    await user.click(screen.getByRole("radio", { name: "In-house" }));
    const pmcMark = await screen.findByRole("textbox", { name: "Component label" });
    await user.clear(pmcMark);
    await user.type(pmcMark, "In-house saved once");
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Component label" })).toBeEnabled());
    panel.queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), {
      ...item,
      version: 999
    });
    await user.click(screen.getByRole("radio", { name: "Sub-Vendor" }));
    const executionNote = screen.getByRole("textbox", { name: "Component label" });
    expect(executionNote).toBeEnabled();
    await user.clear(executionNote);
    await user.type(executionNote, "Execution saved twice");
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
      serverOwnedExtension: { preserve: true },
      modeConfigurations: [
        {
          id: "configuration-in-house-stable",
          modeKind: "execution",
          executionSource: "in_house",
          fields: [{
            id: "field-in-house-stable",
            type: "text",
            label: "In-house saved once",
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
    });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload).toEqual({
      serverOwnedExtension: { preserve: true },
      modeConfigurations: [
        {
          id: "configuration-in-house-stable",
          modeKind: "execution",
          executionSource: "in_house",
          fields: [{
            id: "field-in-house-stable",
            type: "text",
            label: "In-house saved once",
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
            label: "Execution saved twice",
            options: [],
            value: "Execution initial"
          }]
        }
      ]
    });
    expect(screen.getByRole("textbox", { name: "Component label" })).toBeEnabled();
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
    await user.click(await screen.findByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "PMC mark");

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
    await user.click(await screen.findByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "PMC mark");
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
    await user.click(await screen.findByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "Local definition");

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
    expect(screen.getByRole("textbox", { name: "Component label" }))
      .toHaveValue("Local definition");
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    await user.click(within(conflict).getByRole("button", { name: "Keep editing" }));
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementationOnce(
      async (_line, _revision, key, input) => savedSection(key as "advanced", input)
    );
    await act(async () => { expect(await ref.current?.save()).toBe(true); });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3]).toMatchObject({
      applicability: "configured",
      payload: { modeConfigurations: [expect.objectContaining({ fields: [expect.objectContaining({ label: "Local definition" })] })] }
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
    const pmcMark = await screen.findByRole("textbox", { name: "Component label" });
    await user.clear(pmcMark);
    await user.type(pmcMark, "Local edit");
    panel.rerenderModes([modes[0]!]);

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Component label" })).toBeEnabled());
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection)).toHaveBeenCalledOnce();
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload).toMatchObject({
      modeConfigurations: [expect.objectContaining({
        modeKind: "execution",
                  executionSource: "sub_vendor",
        fields: [expect.objectContaining({ label: "Local edit", value: "Initial" })]
      })]
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

  it("stops after an Advanced failure, preserves the local definition, and retries only dirty blocks", async () => {
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
    const pmcMark = await screen.findByRole("textbox", { name: "Component label" });
    await user.clear(pmcMark);
    await user.type(pmcMark, "Local value");
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    await user.type(screen.getByRole("textbox", { name: "Specification name" }), "Plywood");

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced"
    ]);
    expect(screen.getByRole("textbox", { name: "Component label" })).toHaveValue("Local value");

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "advanced",
      "pricing"
    ]);
  });

  it("maps authoritative Advanced validation paths to the component definition and clears them on edit", async () => {
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
        "payload.modeConfigurations.0.fields.0.label": "PMC component label is no longer accepted."
      })
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await user.click(await screen.findByRole("checkbox", { name: "Execution" }));
    const pmcMark = await screen.findByRole("textbox", { name: "Component label" });
    await user.clear(pmcMark);
    await user.type(pmcMark, "Rejected value");

    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });

    expect(await screen.findAllByText("PMC component label is no longer accepted.")).toHaveLength(2);
    expect(screen.getByRole("textbox", { name: "Component label" }))
      .toHaveAttribute("aria-invalid", "true");

    await user.clear(screen.getByRole("textbox", { name: "Component label" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "Accepted label");

    await waitFor(() => {
      expect(screen.queryAllByText("PMC component label is no longer accepted.")).toHaveLength(0);
    });
    expect(screen.getByRole("textbox", { name: "Component label" }))
      .not.toHaveAttribute("aria-invalid", "true");
  });
});
