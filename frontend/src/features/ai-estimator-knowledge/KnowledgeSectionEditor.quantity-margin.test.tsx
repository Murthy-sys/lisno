import axe from "axe-core";
import { useState } from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
import type { KnowledgeUomCatalogState } from "./KnowledgeQuantitySlabBuilder";
import type { KnowledgeJsonObject, KnowledgeMaster } from "./knowledgeTypes";

const uom: KnowledgeMaster = {
  id: "uom-sq-foot",
  masterType: "uoms",
  code: "SQFT",
  name: "Square foot",
  description: null,
  displayOrder: 0,
  status: "active",
  decimalScale: 2,
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-09-02T08:00:00.000Z",
  updatedAt: "2026-09-02T08:00:00.000Z"
};

const specifications = [{ id: "spec-plywood", name: "Plywood" }] as const;

const quantityMarginPayload = {
  gapBehavior: "no_adjustment",
  startMarginBps: 100,
  bottomMarginBps: 200,
  pmcMarkupBps: 300,
  wastageBps: 400,
  quantitySlabs: [{
    id: "slab-1",
    minimumQuantity: "1",
    maximumQuantity: "10",
    adjustmentBps: 125
  }],
  previewInputs: {
    quantity: "5",
    quantityScale: 0
  }
} as const satisfies KnowledgeJsonObject;

function QuantityMarginEditorHarness({
  initialPayload = quantityMarginPayload,
  readOnly = false,
  availableUoms = [uom],
  availableSpecifications = specifications,
  uomCatalogState,
  validationAttempt = 0
}: {
  readonly initialPayload?: KnowledgeJsonObject;
  readonly readOnly?: boolean;
  readonly availableUoms?: readonly KnowledgeMaster[];
  readonly availableSpecifications?: KnowledgeJsonObject[] | typeof specifications;
  readonly uomCatalogState?: KnowledgeUomCatalogState;
  readonly validationAttempt?: number;
}) {
  const [payload, setPayload] = useState<KnowledgeJsonObject>(initialPayload);

  return (
    <main>
      <KnowledgeSectionEditor
        sectionKey="quantity-margin"
        payload={payload}
        masters={{ uoms: availableUoms }}
        relationshipBaskets={[]}
        relationshipItems={[]}
        currentMainLineId="line-1"
        readOnly={readOnly}
        canQuickAdd={false}
        resetKey={`quantity-margin-${readOnly ? "readonly" : "editable"}`}
        pricingSpecifications={availableSpecifications}
        uomCatalogState={uomCatalogState}
        validationAttempt={validationAttempt}
        onChange={setPayload}
        onDirty={() => undefined}
        onValidationChange={() => undefined}
        onQuickAdd={() => undefined}
      />
      <output data-testid="quantity-margin-payload">{JSON.stringify(payload)}</output>
    </main>
  );
}

describe("knowledge quantity and margin editor", () => {
  it("keeps focus in a margin field while typing after a failed save attempt", async () => {
    const user = userEvent.setup();
    /* validationAttempt stays non-zero once a save has been rejected. Typing
       changes the issue count, which must not move focus away from the field. */
    render(<QuantityMarginEditorHarness validationAttempt={1} />);

    const startMargin = screen.getByRole("spinbutton", { name: "Start margin (basis points)" });
    await user.clear(startMargin);
    await user.type(startMargin, "20000");

    expect(startMargin).toHaveFocus();
    expect(startMargin).toHaveValue(20_000);

    const wastage = screen.getByRole("spinbutton", { name: "Wastage (basis points)" });
    await user.clear(wastage);
    await user.type(wastage, "45000");

    expect(wastage).toHaveFocus();
    expect(wastage).toHaveValue(45_000);
  });


  it("removes Gap behavior while preserving the remaining controls and hidden payload data", async () => {
    const user = userEvent.setup();
    render(<QuantityMarginEditorHarness />);

    expect(screen.queryByLabelText("Gap behavior")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Gap behavior" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Start margin (basis points)" })).toHaveValue(100);
    expect(screen.getByRole("spinbutton", { name: "Bottom margin (basis points)" })).toHaveValue(200);
    expect(screen.getByRole("spinbutton", { name: "PMC markup (basis points)" })).toHaveValue(300);
    expect(screen.getByRole("spinbutton", { name: "Wastage (basis points)" })).toHaveValue(400);
    expect(screen.getByRole("heading", { name: "Quantity slabs" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Quantity slab" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Legacy adjustment slabs" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Minimum quantity" })).toHaveValue("1");
    expect(screen.getByRole("textbox", { name: "Maximum quantity" })).toHaveValue("10");
    expect(screen.getByRole("spinbutton", { name: "Adjustment (basis points)" })).toHaveValue(125);

    const startMargin = screen.getByRole("spinbutton", { name: "Start margin (basis points)" });
    await user.clear(startMargin);
    await user.type(startMargin, "250");

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("quantity-margin-payload").textContent ?? "{}"))
        .toEqual({
          ...quantityMarginPayload,
          startMarginBps: 250
        });
    });
  });

  it("does not expose Gap behavior in a read-only revision and keeps remaining fields read-only", () => {
    render(<QuantityMarginEditorHarness readOnly />);

    expect(screen.getByText("Read-only revision")).toBeVisible();
    expect(screen.queryByLabelText("Gap behavior")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Gap behavior" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Start margin (basis points)" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Bottom margin (basis points)" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "PMC markup (basis points)" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Wastage (basis points)" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Quantity slabs" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Quantity slab" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Minimum quantity" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Maximum quantity" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Adjustment (basis points)" })).toBeDisabled();
  });

  it("does not default gap behavior for a margin-only edit", async () => {
    const user = userEvent.setup();
    render(<QuantityMarginEditorHarness initialPayload={{}} />);

    await user.type(
      screen.getByRole("spinbutton", { name: "Start margin (basis points)" }),
      "75"
    );

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("quantity-margin-payload").textContent ?? "{}"))
        .toEqual({ startMarginBps: 75 });
    });
  });

  it("adds a priced slab without manufacturing legacy Gap behavior and derives its cost", async () => {
    const user = userEvent.setup();
    render(<QuantityMarginEditorHarness initialPayload={{}} />);

    expect(JSON.parse(screen.getByTestId("quantity-margin-payload").textContent ?? "{}"))
      .toEqual({});
    expect(screen.queryByLabelText("Gap behavior")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Quantity slab" }));

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("quantity-margin-payload").textContent ?? "{}"))
        .toEqual({
          slabRates: [{
            id: expect.stringMatching(/^knowledge-slabRates-/u)
          }]
        });
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "Specification" }), "spec-plywood");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure" }), "uom-sq-foot");
    await user.type(screen.getByRole("textbox", { name: "Quantity" }), "12.5");
    await user.type(screen.getByRole("textbox", { name: "Unit rate (₹)" }), "80");

    expect(screen.getByLabelText(/Estimated cost:/u)).toHaveTextContent(/₹\s?1,000\.00/u);
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("quantity-margin-payload").textContent ?? "{}"))
        .toEqual({
          slabRates: [{
            id: expect.stringMatching(/^knowledge-slabRates-/u),
            specificationId: "spec-plywood",
            uomId: "uom-sq-foot",
            quantity: "12.5",
            unitRatePaise: 8_000
          }]
        });
    });
    expect(screen.getByTestId("quantity-margin-payload")).not.toHaveTextContent("estimatedCostPaise");
    expect(screen.queryByLabelText("Gap behavior")).not.toBeInTheDocument();
  });

  it("adds a priced slab when crypto.randomUUID is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", {});

    try {
      render(<QuantityMarginEditorHarness initialPayload={{}} />);

      await expect(user.click(
        screen.getByRole("button", { name: "Add Quantity slab" })
      )).resolves.toBeUndefined();

      expect(await screen.findByRole("group", { name: "Quantity slab 1" })).toBeVisible();
      expect(JSON.parse(screen.getByTestId("quantity-margin-payload").textContent ?? "{}"))
        .toEqual({
          slabRates: [{
            id: expect.stringMatching(/^knowledge-slabRates-[a-z0-9]+-\d+$/u)
          }]
        });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves reject and every legacy adjustment row when a priced slab is added", async () => {
    const user = userEvent.setup();
    render(
      <QuantityMarginEditorHarness
        initialPayload={{
          gapBehavior: "reject",
          quantitySlabs: [{
            id: "slab-existing",
            minimumQuantity: "0",
            maximumQuantity: "10",
            adjustmentBps: 0
          }]
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add Quantity slab" }));

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("quantity-margin-payload").textContent ?? "{}"))
        .toEqual({
          gapBehavior: "reject",
          quantitySlabs: [{
            id: "slab-existing",
            minimumQuantity: "0",
            maximumQuantity: "10",
            adjustmentBps: 0
          }],
          slabRates: [{
            id: expect.stringMatching(/^knowledge-slabRates-/u)
          }]
        });
    });
  });

  it("adds a blank slab and offers Retry when the initial Unit catalog load fails", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <QuantityMarginEditorHarness
        initialPayload={{}}
        availableUoms={[]}
        uomCatalogState={{ status: "error", errorMessage: "Network unavailable.", onRetry }}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Units could not be loaded");
    expect(screen.getByRole("button", { name: "Add Quantity slab" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Add Quantity slab" }));
    expect(await screen.findByRole("group", { name: "Quantity slab 1" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Unit of measure" })).toBeDisabled();
    expect(JSON.parse(screen.getByTestId("quantity-margin-payload").textContent ?? "{}"))
      .toEqual({
        slabRates: [{ id: expect.stringMatching(/^knowledge-slabRates-/u) }]
      });
    await user.click(screen.getByRole("button", { name: "Retry Units" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("adds a blank slab before Specifications or Units are configured", async () => {
    const user = userEvent.setup();
    render(
      <QuantityMarginEditorHarness
        initialPayload={{}}
        availableSpecifications={[]}
        availableUoms={[]}
      />
    );

    const addButton = screen.getByRole("button", { name: "Add Quantity slab" });
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    expect(await screen.findByRole("group", { name: "Quantity slab 1" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Specification" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Unit of measure" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Quantity" })).toBeDisabled();
  });

  it("keeps cached Unit choices editable with stale-data guidance", () => {
    render(
      <QuantityMarginEditorHarness
        initialPayload={{
          slabRates: [{
            id: "slab-cached",
            specificationId: "spec-plywood",
            uomId: uom.id,
            quantity: "2",
            unitRatePaise: 100
          }]
        }}
        uomCatalogState={{ status: "ready", refreshErrorMessage: "Refresh failed." }}
      />
    );

    expect(screen.getByText("Units may be out of date")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Unit of measure" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Unit of measure" })).toHaveValue(uom.id);
  });

  it("retains an archived saved Unit without allowing it to be reselected or cleared", () => {
    const archivedUom = { ...uom, status: "archived" as const };
    render(
      <QuantityMarginEditorHarness
        initialPayload={{
          slabRates: [{
            id: "slab-archived",
            specificationId: "spec-plywood",
            uomId: archivedUom.id,
            quantity: "2",
            unitRatePaise: 100
          }]
        }}
        availableUoms={[archivedUom]}
      />
    );

    expect(screen.getByRole("combobox", { name: "Unit of measure" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Unit of measure" })).toHaveValue(archivedUom.id);
    expect(screen.getByRole("option", { name: /Square foot · SQFT · unavailable/u })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Quantity" })).toBeDisabled();
    expect(screen.getByTestId("quantity-margin-payload")).toHaveTextContent(`"uomId":"${archivedUom.id}"`);
  });

  it("keeps a configured priced slab free of automated accessibility violations", async () => {
    render(
      <QuantityMarginEditorHarness
        initialPayload={{
          slabRates: [{
            id: "slab-accessible",
            specificationId: "spec-plywood",
            uomId: uom.id,
            quantity: "12.5",
            unitRatePaise: 8_000
          }]
        }}
      />
    );

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });
});
