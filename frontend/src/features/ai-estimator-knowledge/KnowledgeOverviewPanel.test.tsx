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
  it("explains Configuration visibility accurately when the keyboard changes the client choice", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ presentation: "configuration", showDimensions: true, showApplicableTiers: true });
    const visibility = screen.getByRole("radiogroup", { name: "Is this main line needed for the client?" });
    expect(visibility).toHaveAccessibleDescription("Include this main line in the client estimate screen.");
    within(visibility).getByRole("radio", { name: "Yes" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(props.onOverviewDirty).toHaveBeenCalledExactlyOnceWith("clientVisible");
    expect(props.onOverviewPayloadChange).toHaveBeenCalledExactlyOnceWith({ ...overviewPayload, clientVisible: false });

    props.rerender(<main><KnowledgeOverviewPanel {...props} overviewPayload={{ ...overviewPayload, clientVisible: false }} /></main>);
    expect(visibility).toHaveAccessibleDescription("No keeps this main line internal on the client estimate screen. It remains included in the total and PDF/quotation.");
    expect(within(visibility).getByRole("radio", { name: "No" })).toBeChecked();
  });

  it("uses the saved metric unit in Configuration guidance and preserves an explicit empty tier choice", async () => {
    const user = userEvent.setup();
    const metricPayload = { ...overviewPayload, uomId: squareMetre.id, applicableTiers: [] };
    const props = renderPanel({
      presentation: "configuration", showDimensions: true, showApplicableTiers: true,
      overviewPayload: metricPayload,
      masters: { ...masters, uoms: [{ ...squareMetre, code: "SQM", decimalScale: 2 }] }
    });
    const dimensions = screen.getByRole("radiogroup", { name: "Dimensions mandatory?" });
    expect(dimensions).toHaveAccessibleDescription("Require Length, Width and Height from Sales or the client. If Yes, requires Length, Width and Height in m. Quantity = Length × Width in Square metre. Height is recorded separately.");
    await user.click(within(dimensions).getByRole("radio", { name: "Yes" }));
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({ ...metricPayload, dimensionsMandatory: true });
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("dimensionsMandatory");

    const tiers = screen.getByRole("group", { name: "Applicable tiers" });
    expect(tiers).toHaveAccessibleDescription("Save Overview to update the Mode tabs. Hiding a tier keeps its saved configuration.");
    within(tiers).getAllByRole("checkbox").forEach(checkbox => expect(checkbox).not.toBeChecked());
    within(tiers).getByRole("checkbox", { name: "Functional" }).focus();
    await user.keyboard(" ");
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({ ...metricPayload, applicableTiers: ["functional"] });
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("applicableTiers");

    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it.each([{ editable: false }, { saving: true }])("locks all Configuration settings while preserving their descriptions (%j)", state => {
    renderPanel({ presentation: "configuration", showDimensions: true, showApplicableTiers: true, ...state,
      masters: { ...masters, uoms: [{ ...squareFoot, code: "SQFT", decimalScale: 2 }] } });
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    screen.getAllByRole("radio").forEach(radio => expect(radio).toBeDisabled());
    screen.getAllByRole("checkbox").forEach(checkbox => expect(checkbox).toBeDisabled());
    expect(screen.getByRole("radiogroup", { name: "Dimensions mandatory?" })).toHaveAccessibleDescription(/Length, Width and Height in ft/u);
  });

  it("retains incompatible dimension warnings in Configuration and allows clearing the requirement", async () => {
    const payload = { ...overviewPayload, dimensionsMandatory: true };
    const props = renderPanel({ presentation: "configuration", showDimensions: true, overviewPayload: payload,
      masters: { ...masters, uoms: [{ ...squareFoot, code: "RFT", name: "Running feet", decimalScale: 2 }] } });
    const dimensions = screen.getByRole("radiogroup", { name: "Dimensions mandatory?" });
    expect(within(dimensions).getByRole("radio", { name: "Yes" })).toBeDisabled();
    expect(dimensions).toHaveAccessibleDescription(/Select a supported area UOM/u);
    expect(within(dimensions).getByRole("alert")).toHaveTextContent("The saved dimensions setting needs a supported area UOM");
    await userEvent.setup().click(within(dimensions).getByRole("radio", { name: "No" }));
    expect(props.onOverviewPayloadChange).toHaveBeenCalledExactlyOnceWith({ ...payload, dimensionsMandatory: false });
  });

  it("keeps legacy dimensions optional and enables the requirement using the configured area unit", async () => {
    const props = renderPanel({ showDimensions: true, masters: { ...masters, uoms: [{ ...squareFoot, decimalScale: 2 }] } });
    const group = screen.getByRole("radiogroup", { name: "Dimensions mandatory?" });
    expect(within(group).getByRole("radio", { name: "No" })).toBeChecked();
    expect(group).toHaveTextContent("Length, Width and Height in ft");
    expect(group).toHaveTextContent("Height is recorded separately");
    expect(props.onOverviewDirty).not.toHaveBeenCalled();
    await userEvent.setup().click(within(group).getByRole("radio", { name: "Yes" }));
    expect(props.onOverviewDirty).toHaveBeenCalledExactlyOnceWith("dimensionsMandatory");
    expect(props.onOverviewPayloadChange).toHaveBeenCalledExactlyOnceWith({ ...overviewPayload, dimensionsMandatory: true });
  });

  it("prevents enabling area calculations for a running-feet UOM but permits removing an obsolete requirement", async () => {
    const props = renderPanel({ showDimensions: true, overviewPayload: { ...overviewPayload, dimensionsMandatory: true },
      masters: { ...masters, uoms: [{ ...squareFoot, code: "RFT", name: "Running feet", decimalScale: 2 }] } });
    const group = screen.getByRole("radiogroup", { name: "Dimensions mandatory?" });
    expect(within(group).getByRole("radio", { name: "Yes" })).toBeDisabled();
    expect(within(group).getByRole("alert")).toHaveTextContent("supported area UOM");
    await userEvent.setup().click(within(group).getByRole("radio", { name: "No" }));
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({ ...overviewPayload, dimensionsMandatory: false });
  });

  it.each([{ editable: false }, { saving: true }])("locks the dimensions setting when Overview cannot be edited (%j)", state => {
    renderPanel({ showDimensions: true, ...state, masters: { ...masters, uoms: [{ ...squareFoot, decimalScale: 2 }] } });
    const group = screen.getByRole("radiogroup", { name: "Dimensions mandatory?" });
    within(group).getAllByRole("radio").forEach(radio => expect(radio).toBeDisabled());
  });

  it("defaults Configuration tiers to Signature and saves an explicit empty selection without changing other fields", async () => {
    const user = userEvent.setup(); const props = renderPanel({ showApplicableTiers: true });
    const tiers = screen.getByRole("group", { name: "Applicable tiers" });
    expect(within(tiers).getByRole("checkbox", { name: "Signature" })).toBeChecked();
    expect(within(tiers).getByRole("checkbox", { name: "Premium" })).not.toBeChecked();
    expect(within(tiers).getByRole("checkbox", { name: "Functional" })).not.toBeChecked();
    expect(props.onOverviewDirty).not.toHaveBeenCalled();
    await user.click(within(tiers).getByRole("checkbox", { name: "Signature" }));
    expect(props.onOverviewDirty).toHaveBeenCalledExactlyOnceWith("applicableTiers");
    expect(props.onOverviewPayloadChange).toHaveBeenCalledExactlyOnceWith({ ...overviewPayload, applicableTiers: [] });
    props.rerender(<main><KnowledgeOverviewPanel {...props} overviewPayload={{ ...overviewPayload, applicableTiers: [] }} /></main>);
    expect(within(tiers).getByRole("checkbox", { name: "Signature" })).not.toBeChecked();
    await user.click(within(tiers).getByRole("checkbox", { name: "Premium" }));
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({ ...overviewPayload, applicableTiers: ["premium"] });
  });

  it.each([{ editable: false }, { saving: true }])("locks applicable tier choices when Overview is not editable (%j)", async state => {
    const user = userEvent.setup(); const props = renderPanel({ showApplicableTiers: true, ...state });
    const tiers = screen.getByRole("group", { name: "Applicable tiers" });
    within(tiers).getAllByRole("checkbox").forEach(checkbox => expect(checkbox).toBeDisabled());
    await user.click(within(tiers).getByRole("checkbox", { name: "Premium" }));
    expect(props.onOverviewPayloadChange).not.toHaveBeenCalled();
  });

  it("keeps tier choices out of generic and proposal Overview panels", () => {
    renderPanel({ proposalActions: true, presentation: "procurement-basket" });
    expect(screen.queryByRole("group", { name: "Applicable tiers" })).not.toBeInTheDocument();
  });
  it("defaults client visibility to Yes without changing legacy Overview payloads", () => {
    const props = renderPanel();
    const visibility = screen.getByRole("radiogroup", { name: "Is this main line needed for the client?" });
    expect(within(visibility).getByRole("radio", { name: "Yes" })).toBeChecked();
    expect(within(visibility).getByRole("radio", { name: "No" })).not.toBeChecked();
    expect(visibility).toHaveAccessibleDescription("No keeps this main line internal on the client estimate screen. It remains included in the total and PDF/quotation.");
    expect(props.onOverviewPayloadChange).not.toHaveBeenCalled();
    expect(props.onOverviewDirty).not.toHaveBeenCalled();
  });

  it("changes client visibility by keyboard while preserving every other Overview value", async () => {
    const user = userEvent.setup(); const props = renderPanel();
    screen.getByRole("radio", { name: "Yes" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(props.onOverviewDirty).toHaveBeenCalledExactlyOnceWith("clientVisible");
    expect(props.onOverviewPayloadChange).toHaveBeenCalledExactlyOnceWith({ ...overviewPayload, clientVisible: false });
    props.rerender(<main><KnowledgeOverviewPanel {...props} overviewPayload={{ ...overviewPayload, clientVisible: false }} /></main>);
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
    screen.getByRole("radio", { name: "No" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({ ...overviewPayload, clientVisible: true });
    expect(props.onOverviewDirty).toHaveBeenCalledTimes(2);
  });

  it.each([{ editable: false, saving: false }, { editable: true, saving: true }])("disables client visibility for readonly or saving Overview (%j)", async (state) => {
    const user = userEvent.setup(); const props = renderPanel({ ...state, overviewPayload: { ...overviewPayload, clientVisible: false } });
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
    for (const name of ["Yes", "No"]) expect(screen.getByRole("radio", { name })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    expect(props.onOverviewPayloadChange).not.toHaveBeenCalled();
    expect(props.onOverviewDirty).not.toHaveBeenCalled();
  });

  it("keeps the same client visibility control in shared proposal Overview", async () => {
    const user = userEvent.setup(); const props = renderPanel({ presentation: "procurement-basket", proposalActions: true,
      overviewPayload: { ...overviewPayload, clientVisible: false } });
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    expect(props.onOverviewPayloadChange).toHaveBeenCalledExactlyOnceWith({ ...overviewPayload, clientVisible: true });
    expect(props.onOverviewDirty).toHaveBeenCalledExactlyOnceWith("clientVisible");
  });

  it("offers named proposal actions and selects a proposed UOM without changing hidden fields", async () => {
    const user = userEvent.setup();
    const proposedUom = { id: "proposal-uom", name: "Panel bundle", decimalScale: 1 };
    const props = renderPanel({ proposedUoms: [proposedUom], quickAddUomLabel: "Add UOM", proposalActions: true });

    const addUom = screen.getByRole("button", { name: "Add UOM" });
    expect(addUom).toHaveTextContent("Add UOM");
    expect(screen.getAllByRole("button", { name: "Add Surface" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Create Surface" })).not.toBeInTheDocument();
    await user.click(addUom);
    expect(props.onQuickAddUom).toHaveBeenCalledOnce();
    const proposedOption = screen.getByRole("option", { name: "Panel bundle (Proposed)" });
    expect(proposedOption).toHaveValue(proposedUom.id);
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }), proposedUom.id);
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({ ...overviewPayload, uomId: proposedUom.id });
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("uomId");
    expect(masters.uoms.some(({ id }) => id === proposedUom.id)).toBe(false);
  });

  it("keeps proposed selections readable and mutation actions unavailable in a saved snapshot", async () => {
    const user = userEvent.setup();
    const proposedUom = { id: "proposal-uom", name: "Panel bundle", decimalScale: 1 };
    const proposedSurface = { id: "proposal-surface", name: "Acoustic panel", description: "Timber backing" };
    const props = renderPanel({
      editable: false, proposalActions: true, quickAddUomLabel: "Add UOM",
      proposedUoms: [proposedUom], proposedSurfaces: [proposedSurface],
      overviewPayload: { ...overviewPayload, uomId: proposedUom.id, surfaceIds: [proposedSurface.id] }
    });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveValue(proposedUom.id);
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add UOM" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Acoustic panel Proposed" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Acoustic panel from Main Line" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Applicable surfaces" }));
    await user.click(screen.getByRole("option", { name: "Acoustic panel (Proposed)" }));
    expect(props.onOverviewPayloadChange).not.toHaveBeenCalled();
  });

  it("uses Procurement headings and an actionable empty surface area only when requested", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ presentation: "procurement-basket", overviewPayload: { uomId: squareFoot.id }, canQuickAdd: false });
    expect(screen.getAllByRole("heading").map(heading => heading.textContent)).toEqual(["Unit of measure", "Applicable surfaces"]);
    expect(screen.getByText("No surfaces selected yet")).toBeVisible();
    expect(screen.getByText("Choose one or more surfaces from the dropdown above.")).toBeVisible();
    expect(screen.queryByRole("table", { name: "Selected surface details" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Applicable surfaces" }));
    await user.click(screen.getByRole("option", { name: "Floor" }));
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({ uomId: squareFoot.id, surfaceIds: [floor.id] });
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("surfaceIds");
  });

  it("preserves populated and unavailable saved surfaces in the Procurement table", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ presentation: "procurement-basket", overviewPayload: { ...overviewPayload, surfaceIds: [wall.id, "missing-surface"] }, canQuickAdd: false });
    const table = screen.getByRole("table", { name: "Selected surface details" });
    expect(within(table).getByRole("rowheader", { name: "Wall" })).toBeVisible();
    expect(within(table).getByRole("rowheader", { name: "Unavailable value" })).toBeVisible();
    expect(screen.queryByText("No surfaces selected yet")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Wall from Main Line" }));
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({ ...overviewPayload, surfaceIds: ["missing-surface"] });
    expect(screen.getByRole("button", { name: "Remove Unavailable value from Main Line" })).toBeDisabled();
  });

  it("shows UOM, client visibility and Surface configuration without context or saved section summaries", async () => {
    renderPanel();

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Surfaces" })).toBeVisible();
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["UOM", "Surfaces"]);
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create Surface" })).toBeVisible();
    const table = screen.getByRole("table", { name: "Selected surface details" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "#Number", "Surface name", "Description", "Actions"
    ]);
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByRole("radiogroup", { name: "Is this main line needed for the client?" })).toBeVisible();
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

  it.each(["default", "configuration"] as const)("changes or clears UOM while preserving Surface selections and hidden Overview values (%s)", async presentation => {
    const user = userEvent.setup();
    const props = renderPanel({ presentation });
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

  it.each(["default", "configuration"] as const)("selects returned quick-add IDs and marks only the corresponding configuration dirty (%s)", async presentation => {
    const user = userEvent.setup();
    const props = renderPanel({ presentation });

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

    await user.click(screen.getByRole("button", { name: "Create Surface" }));
    expect(props.onQuickAddSurface).toHaveBeenCalledTimes(2);
    vi.mocked(props.onQuickAddSurface!).mock.calls[1]?.[0](floor);
    expect(props.onOverviewPayloadChange).toHaveBeenLastCalledWith({
      ...overviewPayload,
      surfaceIds: [wall.id, floor.id]
    });
    expect(props.onOverviewDirty).toHaveBeenLastCalledWith("surfaceIds");
  });

  it("unselects a table row only from Overview and opens reusable editing without dirtying its draft", async () => {
    const user = userEvent.setup();
    const onEditSurface = vi.fn();
    const props = renderPanel({
      overviewPayload: { ...overviewPayload, surfaceIds: [floor.id, "unresolved-surface", wall.id] },
      onEditSurface
    });

    const edit = screen.getByRole("button", { name: "Edit reusable surface Wall" });
    edit.focus();
    await user.keyboard("{Enter}");
    expect(onEditSurface).toHaveBeenCalledExactlyOnceWith(wall);
    expect(props.onOverviewPayloadChange).not.toHaveBeenCalled();
    expect(props.onOverviewDirty).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove Floor from Main Line" }));
    expect(props.onOverviewDirty).toHaveBeenCalledExactlyOnceWith("surfaceIds");
    expect(props.onOverviewPayloadChange).toHaveBeenCalledExactlyOnceWith({
      ...overviewPayload,
      surfaceIds: ["unresolved-surface", wall.id]
    });
    expect(onEditSurface).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Remove Unavailable value from Main Line" })).toBeDisabled();
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
    expect(screen.queryByRole("button", { name: "Create Surface" })).not.toBeInTheDocument();
  });

  it("locks configuration controls during a save and shows Surface save progress", () => {
    renderPanel({ saving: true, surfacesDirty: true, onEditSurface: vi.fn() });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Surface" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Wall from Main Line" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit reusable surface Wall" })).toBeDisabled();
    expect(screen.getByText("Saving…")).toBeVisible();
  });

  it("keeps read-only Surface inspection accessible while preventing Overview changes", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ editable: false, onEditSurface: vi.fn() });

    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add Unit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Surface" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit reusable surface Wall" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Wall from Main Line" })).toBeDisabled();
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
