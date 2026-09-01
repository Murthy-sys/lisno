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
  KnowledgeSectionKey
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

vi.mock("./KnowledgeSectionEditor", () => ({
  KnowledgeSectionEditor: ({ sectionKey, onChange, onDirty }: {
    readonly sectionKey: KnowledgeSectionKey;
    readonly onChange: (payload: KnowledgeJsonObject) => void;
    readonly onDirty: () => void;
  }) => (
    <button type="button" onClick={() => {
      onChange(
        sectionKey === "pricing"
          ? { specifications: [{ id: "spec-mode-1", name: "Updated specification" }] }
          : { startMarginBps: 250 }
      );
      onDirty();
    }}>
      Edit {sectionKey}
    </button>
  )
}));

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
  "quantity-margin": "configured"
} as const satisfies Readonly<
  Record<"advanced" | "pricing" | "quantity-margin", KnowledgeSectionApplicability>
>;

const versionBySection = {
  advanced: 11,
  pricing: 12,
  "quantity-margin": 13
} as const;

function section(
  sectionKey: "advanced" | "pricing" | "quantity-margin",
  applicability: KnowledgeSectionApplicability = applicabilityBySection[sectionKey],
  payload: KnowledgeJsonObject = {}
): KnowledgeSectionEnvelope<KnowledgeJsonObject> {
  return {
    id: `section-${sectionKey}`,
    mainLineId: item.mainLineId,
    revisionId: "revision-1",
    sectionKey,
    applicability,
    payload,
    version: versionBySection[sectionKey],
    ...actorMetadata
  };
}

function savedSection(
  sectionKey: "advanced" | "pricing" | "quantity-margin",
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
    masters: { modes: panelModes },
    relationshipBaskets: [],
    relationshipItems: [],
    editable: true,
    canQuickAdd: false,
    legacyModeCatalogState: { status: "ready", onRetry: vi.fn() },
    onQuickAdd: vi.fn(),
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
        masters={{ modes: currentModes }}
      />
    </QueryClientProvider>
  );
  const view = render(panel(panelModes));
  return {
    queryClient,
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

  it("loads Mode configuration, Pricing, and Quantity in order and preserves independent section metadata", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    const pricingEditor = await screen.findByRole("button", { name: "Edit pricing" });
    const quantityEditor = await screen.findByRole("button", { name: "Edit quantity-margin" });
    expect(pricingEditor.compareDocumentPosition(quantityEditor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vi.mocked(knowledgeApi.getKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "pricing",
      "quantity-margin"
    ]);
    expect(screen.queryByRole("button", { name: "Edit UOM" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "UOM" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Pricing section state" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Quantity & margin section state" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pricing" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Quantity & margin" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Mode configuration" })).toBeVisible();
    expect(screen.getByText("Section version 11")).toBeVisible();
    expect(screen.getByText("Section version 12")).toBeVisible();
    expect(screen.getByText("Section version 13")).toBeVisible();

    await user.click(pricingEditor);
    await user.click(quantityEditor);
    expect(screen.getAllByText("Unsaved changes")).toHaveLength(2);

    let saved = false;
    await act(async () => {
      saved = (await ref.current?.save()) ?? false;
    });

    expect(saved).toBe(true);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => ({
      sectionKey: call[2],
      applicability: call[3].applicability,
      expectedVersion: call[3].expectedVersion
    }))).toEqual([
      { sectionKey: "pricing", applicability: "not_applicable", expectedVersion: 12 },
      { sectionKey: "quantity-margin", applicability: "configured", expectedVersion: 13 }
    ]);
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection)).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Section version 13")).toBeVisible();
    expect(screen.getByText("Section version 14")).toBeVisible();
    expect(vi.mocked(knowledgeApi.getKnowledgeSection).mock.calls.some((call) => call[2] === "overview")).toBe(false);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.some((call) => call[2] === "overview")).toBe(false);
  });

  it("saves only the dirty Mode block", async () => {
    const user = userEvent.setup();
    const ref = createRef<KnowledgeModePanelHandle>();
    renderPanel(ref);

    await screen.findByRole("button", { name: "Edit pricing" });
    await user.click(screen.getByRole("button", { name: "Edit quantity-margin" }));
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(screen.getByText("Section version 12")).toBeVisible();
    expect(screen.getByText("Section version 13")).toBeVisible();

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection)).toHaveBeenCalledOnce();
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[2]).toBe("quantity-margin");
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3]).toMatchObject({
      applicability: "configured",
      expectedVersion: 13
    });
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
    expect(screen.getByText("Section version 12")).toBeVisible();
    expect(screen.getByText("Section version 14")).toBeVisible();
  });

  it("saves Advanced before Pricing and Quantity while preserving unrelated Advanced keys", async () => {
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

    await user.click(await screen.findByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "PMC mark");
    await user.click(screen.getByRole("button", { name: "Edit pricing" }));
    await user.click(screen.getByRole("button", { name: "Edit quantity-margin" }));

    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[2])).toEqual([
      "advanced",
      "pricing",
      "quantity-margin"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([
      7,
      8,
      9
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload).toMatchObject({
      dependencies: [{ id: "dependency-keep", targetMainLineId: "line-related" }],
      modeOverrides: [{ id: "override-keep", modeId: modes[0]!.id, active: true }],
      revisionLineage: [{ revisionId: "revision-source" }],
      serverOwnedExtension: { preserve: true },
      modeConfigurations: [
        expect.objectContaining({
          modeKind: "pmc",
          fields: [expect.objectContaining({ label: "PMC mark" })]
        })
      ]
    });
    expect(JSON.stringify(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload))
      .not.toContain('"value"');
  });

  it("does not let a pending secondary refresh block later PUTs or post-save editability", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.updateKnowledgeSection).mockImplementation(
      async (_mainLineId, _revisionId, sectionKey, input) => {
        if (sectionKey === "quantity-margin") {
          throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Quantity unavailable.");
        }
        return savedSection(
          sectionKey as "advanced" | "pricing" | "quantity-margin",
          input
        );
      }
    );
    const ref = createRef<KnowledgeModePanelHandle>();
    const panel = renderPanel(ref);

    await user.click(await screen.findByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "PMC mark");
    await user.click(screen.getByRole("button", { name: "Edit pricing" }));
    await user.click(screen.getByRole("button", { name: "Edit quantity-margin" }));

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
      "pricing",
      "quantity-margin"
    ]);
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls.map((call) => call[3].expectedAggregateVersion)).toEqual([
      7,
      8,
      9
    ]);
    expect(invalidateSpy).toHaveBeenCalledTimes(5);
    expect(screen.getByRole("textbox", { name: "Component label" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Mode" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Quantity unavailable.");
  });

  it("keeps PMC and Execution definitions editable through same-mounted save-edit-save with authoritative CAS rebasing", async () => {
    const user = userEvent.setup();
    const initialAdvancedPayload: KnowledgeJsonObject = {
      serverOwnedExtension: { preserve: true },
      modeConfigurations: [
        {
          id: "configuration-pmc-stable",
          modeKind: "pmc",
          fields: [{
            id: "field-pmc-stable",
            type: "text",
            label: "PMC mark",
            options: [],
            value: "PMC initial"
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

    const pmcMark = await screen.findByRole("textbox", { name: "Component label" });
    await user.clear(pmcMark);
    await user.type(pmcMark, "PMC saved once");
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Component label" })).toBeEnabled());
    panel.queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), {
      ...item,
      version: 999
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "Mode" }), "execution");
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
          id: "configuration-pmc-stable",
          modeKind: "pmc",
          fields: [{
            id: "field-pmc-stable",
            type: "text",
            label: "PMC saved once",
            options: []
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
            options: []
          }]
        }
      ]
    });
    expect(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[1]?.[3].payload).toEqual({
      serverOwnedExtension: { preserve: true },
      modeConfigurations: [
        {
          id: "configuration-pmc-stable",
          modeKind: "pmc",
          fields: [{
            id: "field-pmc-stable",
            type: "text",
            label: "PMC saved once",
            options: []
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
            options: []
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

    await user.click(await screen.findByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "PMC mark");
    await user.click(screen.getByRole("button", { name: "Edit pricing" }));

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
  });

  it("keeps a dirty PMC draft editable when the legacy catalog changes", async () => {
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
                  modeKind: "pmc",
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
        modeKind: "pmc",
        fields: [expect.objectContaining({ label: "Local edit" })]
      })]
    });
    expect(JSON.stringify(vi.mocked(knowledgeApi.updateKnowledgeSection).mock.calls[0]?.[3].payload))
      .not.toContain('"value"');
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

    const selector = await screen.findByRole("combobox", { name: "Mode" });
    expect(within(selector).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "PMC",
      "Execution"
    ]);
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
                  modeKind: "pmc",
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

    const pmcMark = await screen.findByRole("textbox", { name: "Component label" });
    await user.clear(pmcMark);
    await user.type(pmcMark, "Local value");
    await user.click(screen.getByRole("button", { name: "Edit pricing" }));

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
                  modeKind: "pmc",
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
