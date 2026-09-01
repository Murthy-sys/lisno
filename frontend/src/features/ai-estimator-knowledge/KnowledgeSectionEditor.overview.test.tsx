import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  KnowledgePrimaryUomEditor,
  KnowledgeSectionEditor
} from "./KnowledgeSectionEditor";
import type {
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeMasterType
} from "./knowledgeTypes";

const actorMetadata = {
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} as const;

function master(
  id: string,
  masterType: KnowledgeMasterType,
  name: string,
  status: KnowledgeMaster["status"] = "active"
): KnowledgeMaster {
  return {
    id,
    masterType,
    code: id.toUpperCase(),
    name,
    description: null,
    displayOrder: 0,
    status,
    ...actorMetadata
  };
}

function withoutUom(payload: KnowledgeJsonObject): string {
  return JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "uomId")));
}

const squareFoot = master("uom-square-foot", "uoms", "Square foot");
const squareMetre = master("uom-square-metre", "uoms", "Square metre");
const retiredUnit = master("uom-retired", "uoms", "Retired unit", "inactive");
const priority = master("priority-standard", "priorities", "Standard");
const mode = master("mode-labour", "modes", "Labour");
const surface = master("surface-wall", "surfaces", "Wall");

const masters = {
  uoms: [squareFoot, squareMetre, retiredUnit],
  priorities: [priority],
  modes: [mode],
  surfaces: [surface]
} as const;

describe("knowledge Overview and primary UOM editors", () => {
  it("omits every legacy Overview control without changing the compatibility payload", () => {
    const payload: KnowledgeJsonObject = {
      description: "Interior wall preparation",
      uomId: squareFoot.id,
      priorityId: priority.id,
      modeIds: [mode.id],
      surfaceIds: [surface.id],
      sectionApplicability: [{ id: "rule-1", sectionKey: "pricing", applicability: "configured" }]
    };
    const onChange = vi.fn();
    const onDirty = vi.fn();

    render(
      <KnowledgeSectionEditor
        sectionKey="overview"
        payload={payload}
        masters={masters}
        relationshipBaskets={[]}
        relationshipItems={[]}
        currentMainLineId="line-1"
        readOnly={false}
        canQuickAdd
        resetKey="overview-1"
        onChange={onChange}
        onDirty={onDirty}
        onValidationChange={() => undefined}
        onQuickAdd={() => undefined}
      />
    );

    expect(screen.getByRole("heading", { name: "Overview", level: 2 })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Priority" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Modes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Surfaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Section applicability rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Section applicability rule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "UOM" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add UOM" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(onDirty).not.toHaveBeenCalled();
    expect(payload).toEqual({
      description: "Interior wall preparation",
      uomId: squareFoot.id,
      priorityId: priority.id,
      modeIds: [mode.id],
      surfaceIds: [surface.id],
      sectionApplicability: [{ id: "rule-1", sectionKey: "pricing", applicability: "configured" }]
    });
  });

  it("retains structured description fields outside Overview", () => {
    const commonProps = {
      masters,
      relationshipBaskets: [],
      relationshipItems: [],
      currentMainLineId: "line-1",
      readOnly: false,
      canQuickAdd: true,
      resetKey: "specialized-descriptions",
      onChange: () => undefined,
      onDirty: () => undefined,
      onValidationChange: () => undefined,
      onQuickAdd: () => undefined
    } as const;

    render(
      <>
        <KnowledgeSectionEditor
          {...commonProps}
          sectionKey="pricing"
          payload={{
            technicalDescription: "Technical detail",
            specifications: [{ id: "spec-1", name: "Premium", description: "Specification detail" }],
            brands: [{ id: "brand-1", name: "Example brand", description: "Brand detail" }]
          }}
        />
        <KnowledgeSectionEditor
          {...commonProps}
          sectionKey="recommendations"
          payload={{ recommendations: [{
            id: "recommendation-1",
            targetBasketId: "basket-2",
            targetMainLineId: "line-2",
            type: "recommended",
            reason: "Recommendation reason",
            quantityRelationship: "same_quantity",
            dependency: false,
            active: true
          }] }}
        />
        <KnowledgeSectionEditor
          {...commonProps}
          sectionKey="execution"
          payload={{ steps: [{
            id: "step-1",
            order: 1,
            name: "Prepare",
            description: "Execution detail",
            dependencyStepIds: [],
            active: true
          }] }}
        />
        <KnowledgeSectionEditor
          {...commonProps}
          sectionKey="advanced"
          payload={{ modeOverrides: [{
            id: "override-1",
            modeId: mode.id,
            description: "Mode override detail",
            active: true
          }] }}
        />
      </>
    );

    const pricingEditor = screen.getByRole("region", { name: "Specifications" }).closest(".knowledge-section-editor");
    const recommendationsEditor = screen.getByRole("heading", { name: "Recommendations", level: 2 }).closest(".knowledge-section-editor");
    const executionEditor = screen.getByRole("heading", { name: "Execution", level: 2 }).closest(".knowledge-section-editor");
    const advancedEditor = screen.getByRole("heading", { name: "Advanced", level: 2 }).closest(".knowledge-section-editor");
    expect(pricingEditor).not.toBeNull();
    expect(recommendationsEditor).not.toBeNull();
    expect(executionEditor).not.toBeNull();
    expect(advancedEditor).not.toBeNull();

    expect(within(pricingEditor as HTMLElement).getByRole("textbox", { name: "Brief description" }))
      .toHaveValue("Specification detail");
    expect(within(pricingEditor as HTMLElement).getByRole("textbox", { name: "Description" }))
      .toHaveValue("Brand detail");
    expect(within(recommendationsEditor as HTMLElement).getByRole("textbox", { name: "Reason" })).toHaveValue("Recommendation reason");
    expect(within(executionEditor as HTMLElement).getByRole("textbox", { name: "Description" })).toHaveValue("Execution detail");
    expect(within(advancedEditor as HTMLElement).getByRole("textbox", { name: "Override description" })).toHaveValue("Mode override detail");
  });

  it("changes only the stable uomId and preserves the full Overview payload", async () => {
    const user = userEvent.setup();
    const nestedMetadata = { source: "approved-estimate", version: 4 } as const;
    const applicability = [{ id: "rule-1", sectionKey: "pricing", applicability: "configured" }] as const;
    const payload: KnowledgeJsonObject = {
      description: "Interior wall preparation",
      uomId: squareFoot.id,
      priorityId: priority.id,
      modeIds: [mode.id],
      surfaceIds: [surface.id],
      sectionApplicability: applicability,
      metadata: nestedMetadata,
      nullableValue: null,
      numericValue: 0
    };
    const onChange = vi.fn();
    const onDirty = vi.fn();

    render(
      <KnowledgePrimaryUomEditor
        payload={payload}
        masters={masters}
        readOnly={false}
        canQuickAdd={false}
        onChange={onChange}
        onDirty={onDirty}
        onQuickAdd={() => undefined}
      />
    );

    const select = screen.getByRole("combobox", { name: "UOM" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Not configured",
      "Square foot",
      "Square metre"
    ]);
    await user.selectOptions(select, squareMetre.id);

    expect(onDirty).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    const next = onChange.mock.calls[0]?.[0] as KnowledgeJsonObject;
    expect(next).toEqual({ ...payload, uomId: squareMetre.id });
    expect(withoutUom(next)).toBe(withoutUom(payload));
    expect(next.metadata).toBe(nestedMetadata);
    expect(next.sectionApplicability).toBe(applicability);
  });

  it("selects the stable ID returned by quick add without changing another Overview field", async () => {
    const user = userEvent.setup();
    const payload: KnowledgeJsonObject = {
      description: "Interior wall preparation",
      uomId: squareFoot.id,
      priorityId: priority.id
    };
    const onChange = vi.fn();
    const onDirty = vi.fn();
    const onQuickAdd = vi.fn((type: KnowledgeMasterType, select: (created: KnowledgeMaster) => void) => {
      expect(type).toBe("uoms");
      select(master("uom-created-id", "uoms", "Created unit"));
    });

    render(
      <KnowledgePrimaryUomEditor
        payload={payload}
        masters={masters}
        readOnly={false}
        canQuickAdd
        onChange={onChange}
        onDirty={onDirty}
        onQuickAdd={onQuickAdd}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add UOM" }));

    expect(onQuickAdd).toHaveBeenCalledOnce();
    expect(onDirty).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({
      description: "Interior wall preparation",
      uomId: "uom-created-id",
      priorityId: priority.id
    });
  });

  it("keeps UOM visible but disables selection and quick add for a read-only revision", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDirty = vi.fn();
    const onQuickAdd = vi.fn();

    render(
      <KnowledgePrimaryUomEditor
        payload={{ uomId: retiredUnit.id, description: "Archived overview" }}
        masters={masters}
        readOnly
        canQuickAdd
        onChange={onChange}
        onDirty={onDirty}
        onQuickAdd={onQuickAdd}
      />
    );

    expect(screen.getByRole("heading", { name: "UOM", level: 2 })).toBeVisible();
    expect(screen.getByText(/primary unit of measurement/u)).toBeVisible();
    expect(screen.getByText("Read-only revision")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "UOM" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "UOM" })).toHaveDisplayValue("Retired unit");
    const addButton = screen.getByRole("button", { name: "Add UOM" });
    expect(addButton).toBeDisabled();
    await user.click(addButton);
    expect(onChange).not.toHaveBeenCalled();
    expect(onDirty).not.toHaveBeenCalled();
    expect(onQuickAdd).not.toHaveBeenCalled();
  });
});
