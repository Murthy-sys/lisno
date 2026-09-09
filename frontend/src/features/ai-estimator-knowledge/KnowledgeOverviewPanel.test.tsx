import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  KnowledgeOverviewPanel,
  type KnowledgeOverviewPanelProps
} from "./KnowledgeOverviewPanel";
import type { KnowledgeMaster, KnowledgeMasterType } from "./knowledgeTypes";

const squareFoot = master("uom-square-foot", "uoms", "Square foot", 10);
const squareMetre = master("uom-square-metre", "uoms", "Square metre", 20);
const wall = master("surface-wall", "surfaces", "Wall", 10);
const floor = master("surface-floor", "surfaces", "Floor", 20);

const masters = {
  uoms: [squareFoot, squareMetre],
  surfaces: [wall, floor]
} as const;

const overviewPayload = {
  description: "Preserve this stored description",
  uomId: squareFoot.id,
  priorityId: "priority-hidden",
  modeIds: ["mode-pmc", "mode-labour"],
  surfaceIds: [wall.id],
  sectionApplicability: [{ id: "rule-hidden", sectionKey: "quality" }],
  unknownCompatibilityValue: { keep: true }
} as const;

function renderPanel(overrides: Partial<KnowledgeOverviewPanelProps> = {}) {
  const props: KnowledgeOverviewPanelProps = {
    overviewPayload,
    masters,
    editable: true,
    canQuickAdd: true,
    onOverviewPayloadChange: vi.fn(),
    onOverviewDirty: vi.fn(),
    onQuickAddUom: vi.fn(),
    onQuickAddSurface: vi.fn(),
    ...overrides
  };
  const result = render(<main><KnowledgeOverviewPanel {...props} /></main>);
  return { ...props, ...result };
}

describe("KnowledgeOverviewPanel", () => {
  it("shows only UOM and Surface configuration without context or saved section summaries", async () => {
    renderPanel();

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Surfaces" })).toBeVisible();
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["UOM", "Surfaces"]);
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeVisible();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Open /u })).not.toBeInTheDocument();
    expect(document.querySelector(".knowledge-overview__context")).not.toBeInTheDocument();
    expect(document.querySelector(".knowledge-overview__principal-grid")).not.toBeInTheDocument();
    for (const label of [
      "Configured values", "Modes", "Selected Mode details", "Shared calculation values",
      "Specifications", "Budgeting", "Pricing", "Recommendation & Exclusions",
      "Quality Parameter", "All section summaries", "Section applicability rules"
    ]) {
      expect(screen.queryByRole("heading", { name: label })).not.toBeInTheDocument();
    }
    expect(document.body).not.toHaveTextContent(overviewPayload.description);
    expect(document.body).not.toHaveTextContent("Main Basket:");

    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(result.violations).toEqual([]);
  });

  it("changes or clears UOM while preserving Surface selections and hidden Overview values", async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    const uom = screen.getByRole("combobox", { name: "Unit of measure (UOM)" });

    await user.selectOptions(uom, squareMetre.id);
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("uomId");
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({
      ...overviewPayload,
      uomId: squareMetre.id
    });

    await user.selectOptions(uom, "");
    const { uomId: _uomId, ...preserved } = overviewPayload;
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith(preserved);
    expect(props.onOverviewDirty).toHaveBeenCalledTimes(2);
  });

  it("selects a Surface by keyboard while preserving UOM and hidden Overview values", async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    const selector = screen.getByRole("button", { name: "Applicable surfaces" });

    selector.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Floor" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("surfaceIds");
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({
      ...overviewPayload,
      surfaceIds: [floor.id, wall.id]
    });
    await user.keyboard("{Escape}");
    expect(selector).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects returned quick-add IDs and marks only the corresponding configuration dirty", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("button", { name: "Add Unit" }));
    expect(props.onQuickAddUom).toHaveBeenCalledOnce();
    vi.mocked(props.onQuickAddUom).mock.calls[0]?.[0](squareMetre);
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("uomId");
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({
      ...overviewPayload,
      uomId: squareMetre.id
    });

    await user.click(screen.getByRole("button", { name: "Add Surface" }));
    expect(props.onQuickAddSurface).toHaveBeenCalledOnce();
    vi.mocked(props.onQuickAddSurface!).mock.calls[0]?.[0](floor);
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("surfaceIds");
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({
      ...overviewPayload,
      surfaceIds: [wall.id, floor.id]
    });
    expect(props.onOverviewDirty).toHaveBeenCalledTimes(2);
  });

  it("keeps unresolved saved IDs readable without exposing them or replacing them on another edit", async () => {
    const user = userEvent.setup();
    const unresolvedPayload = {
      ...overviewPayload,
      uomId: "private-missing-uom-id",
      surfaceIds: ["private-missing-surface-id", wall.id]
    };
    const props = renderPanel({ overviewPayload: unresolvedPayload });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveDisplayValue("Unavailable value");
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toHaveAccessibleDescription("Wall, Unavailable value");
    expect(document.body).not.toHaveTextContent("private-missing-uom-id");
    expect(document.body).not.toHaveTextContent("private-missing-surface-id");

    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }), squareMetre.id);
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({
      ...unresolvedPayload,
      uomId: squareMetre.id
    });
  });

  it("retains a selected inactive UOM and excludes inactive UOMs that are not selected", () => {
    const retired = { ...squareFoot, status: "inactive" as const };
    const unused = { ...master("unused-uom", "uoms", "Unused retired unit", 30), status: "inactive" as const };
    renderPanel({ masters: { ...masters, uoms: [squareMetre, unused, retired] } });

    const uom = screen.getByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(uom).toHaveDisplayValue(squareFoot.name);
    expect(within(uom).getByRole("option", { name: squareMetre.name })).toBeInTheDocument();
    expect(within(uom).queryByRole("option", { name: unused.name })).not.toBeInTheDocument();
  });

  it("keeps empty catalogs configurable through quick add", () => {
    renderPanel({ overviewPayload: {}, masters: { uoms: [], surfaces: [] } });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveDisplayValue("Not configured");
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toHaveAccessibleDescription("Select surfaces");
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("No surfaces have been added.");
  });

  it.each(["uoms", "surfaces"] as const)("isolates initial %s loading to its own controls", (loadingCatalog) => {
    renderPanel({
      referenceStates: {
        masters: { [loadingCatalog]: { status: "loading", onRetry: vi.fn() } }
      }
    });

    const uom = screen.getByRole("combobox", { name: "Unit of measure (UOM)" });
    const surfaces = screen.getByRole("button", { name: "Applicable surfaces" });
    if (loadingCatalog === "uoms") {
      expect(uom).toBeDisabled();
      expect(screen.getByRole("button", { name: "Add Unit" })).toBeDisabled();
      expect(surfaces).toBeEnabled();
      expect(screen.getByRole("button", { name: "Add Surface" })).toBeEnabled();
      expect(screen.getByRole("status")).toHaveTextContent("Loading UOM options…");
    } else {
      expect(uom).toBeEnabled();
      expect(screen.getByRole("button", { name: "Add Unit" })).toBeEnabled();
      expect(surfaces).toBeDisabled();
      expect(screen.getByRole("button", { name: "Add Surface" })).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent("Loading surfaces…");
    }
  });

  it("offers independent retries for unavailable UOM and Surface catalogs", async () => {
    const user = userEvent.setup();
    const retryUom = vi.fn();
    const retrySurface = vi.fn();
    renderPanel({
      referenceStates: {
        masters: {
          uoms: { status: "error", onRetry: retryUom },
          surfaces: { status: "error", onRetry: retrySurface }
        }
      }
    });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeDisabled();
    expect(screen.getByText("UOM options unavailable.")).toBeVisible();
    expect(screen.getByText("Surfaces could not be loaded.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry UOM" }));
    expect(retryUom).toHaveBeenCalledOnce();
    expect(retrySurface).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("region", { name: "Surfaces" })).getByRole("button", { name: "Retry" }));
    expect(retrySurface).toHaveBeenCalledOnce();
  });

  it("retains cached configuration during a catalog refresh failure", async () => {
    const user = userEvent.setup();
    const retryUom = vi.fn();
    const retrySurface = vi.fn();
    renderPanel({
      referenceStates: {
        masters: {
          uoms: { status: "ready", refreshErrorMessage: "Refresh unavailable", onRetry: retryUom },
          surfaces: { status: "ready", refreshErrorMessage: "Refresh unavailable", onRetry: retrySurface }
        }
      }
    });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveDisplayValue(squareFoot.name);
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeEnabled();
    expect(screen.getByText("UOM options may be out of date.")).toBeVisible();
    expect(screen.getByText("Surface options may be out of date.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry UOM" }));
    expect(retryUom).toHaveBeenCalledOnce();
    await user.click(within(screen.getByRole("region", { name: "Surfaces" })).getByRole("button", { name: "Retry" }));
    expect(retrySurface).toHaveBeenCalledOnce();
  });

  it("allows existing-value edits without quick-add permission", () => {
    renderPanel({ canQuickAdd: false });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Add Unit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument();
  });

  it("locks configuration controls during a save and shows Surface save progress", () => {
    renderPanel({ saving: true, surfacesDirty: true });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeDisabled();
    expect(screen.getByText("Saving…")).toBeVisible();
  });

  it("keeps read-only Surface inspection accessible while preventing Overview changes", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ editable: false });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add Unit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Applicable surfaces" }));
    expect(screen.getByRole("listbox", { name: "Surface options" })).toHaveAttribute("aria-readonly", "true");
    await user.click(screen.getByRole("option", { name: "Floor" }));
    expect(props.onOverviewPayloadChange).not.toHaveBeenCalled();
    expect(props.onOverviewDirty).not.toHaveBeenCalled();

    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(result.violations).toEqual([]);
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
