import { useState } from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
import type { KnowledgeValidationIssue } from "./knowledgeSectionValidation";
import type { KnowledgeJsonObject, KnowledgeMaster } from "./knowledgeTypes";

const actorMetadata = {
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} as const;

const masters = {
  vendors: [{ id: "vendor-1", masterType: "vendors", code: "VENDOR", name: "Vendor", description: null, displayOrder: 0, status: "active", ...actorMetadata }],
  uoms: [{ id: "uom-1", masterType: "uoms", code: "UNIT", name: "Unit", description: null, displayOrder: 0, status: "active", ...actorMetadata }],
  taxes: [{
    id: "tax-1",
    masterType: "taxes",
    code: "GST18",
    name: "GST 18%",
    description: null,
    displayOrder: 0,
    status: "active",
    taxVersions: [{ id: "tax-version-1", taxRuleId: "tax-1", versionNumber: 1, rateBps: 1_800, treatment: "exclusive", applicability: "materials", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: null, status: "active", ...actorMetadata }],
    ...actorMetadata
  }]
} as const satisfies Readonly<Partial<Record<"vendors" | "uoms" | "taxes", readonly KnowledgeMaster[]>>>;

function PricingEditorHarness({
  initialPayload,
  readOnly = false,
  serverIssues = []
}: {
  readonly initialPayload: KnowledgeJsonObject;
  readonly readOnly?: boolean;
  readonly serverIssues?: readonly KnowledgeValidationIssue[];
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [valid, setValid] = useState(true);
  const [validationAttempt, setValidationAttempt] = useState(0);

  return (
    <>
      <KnowledgeSectionEditor
        sectionKey="pricing"
        payload={payload}
        masters={masters}
        relationshipBaskets={[]}
        relationshipItems={[]}
        currentMainLineId="line-1"
        readOnly={readOnly}
        canQuickAdd={false}
        resetKey="pricing-1"
        validationAttempt={validationAttempt}
        serverIssues={serverIssues}
        onChange={setPayload}
        onDirty={() => undefined}
        onValidationChange={setValid}
        onQuickAdd={() => undefined}
      />
      <output data-testid="pricing-payload">{JSON.stringify(payload)}</output>
      <output data-testid="pricing-validity">{valid ? "valid" : "invalid"}</output>
      <button type="button" onClick={() => setValidationAttempt((attempt) => attempt + 1)}>Attempt save</button>
    </>
  );
}

function currentPriceEntry(): Record<string, unknown> {
  const payload = JSON.parse(screen.getByTestId("pricing-payload").textContent ?? "{}") as {
    priceEntries?: Array<Record<string, unknown>>;
  };
  return payload.priceEntries?.[0] ?? {};
}

const validAppendEntry = {
  operation: "append",
  priceEntryId: "price-entry-1",
  vendorId: "vendor-1",
  uomId: "uom-1",
  taxRuleId: "tax-1",
  taxVersionId: "tax-version-1",
  inputAmountPaise: 12_000,
  treatment: "exclusive",
  effectiveFrom: "2026-08-01T00:00:00.000Z",
  effectiveTo: null,
  status: "active"
} as const;

describe("knowledge pricing editor", () => {
  it("removes the introductory form while preserving structured pricing data and hidden payload keys", async () => {
    const user = userEvent.setup();
    render(
      <PricingEditorHarness
        initialPayload={{
          technicalDescription: "Existing technical detail",
          internalVendorNotes: "Existing vendor note",
          qualityLevel: "premium",
          specifications: [{ id: "specification-1", name: "Original specification", description: "Structured description" }],
          brands: [
            { id: "brand-1", name: "Existing vendor", description: "Preferred supplier" },
            { id: "brand-2", name: "Backup vendor", description: "Secondary supplier" }
          ],
          priceEntries: [validAppendEntry]
        }}
      />
    );

    expect(screen.queryByRole("heading", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Maintain specifications, immutable price-version commands/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Technical description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Internal vendor notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Quality level" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Specifications" })).toBeVisible();
    const vendors = screen.getByRole("region", { name: "Vendors" });
    expect(within(vendors).getByRole("heading", { name: "Vendors" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Brands" })).not.toBeInTheDocument();
    expect(within(vendors).getByRole("button", { name: "Add vendor" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /brand/iu })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Price versions" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Input amount (rupees)" })).toHaveValue("120.00");
    const vendorNames = screen.getAllByRole("textbox", { name: "Vendor name" });
    expect(vendorNames).toHaveLength(2);
    expect(vendorNames[0]).toHaveValue("Existing vendor");
    expect(vendorNames[1]).toHaveValue("Backup vendor");

    const specificationName = screen.getByRole("textbox", { name: "Specification name" });
    await user.clear(specificationName);
    await user.type(specificationName, "Updated specification");
    await user.clear(vendorNames[0]);
    await user.type(vendorNames[0], "Updated vendor");

    await waitFor(() => {
      const nextPayload = JSON.parse(screen.getByTestId("pricing-payload").textContent ?? "{}") as Record<string, unknown>;
      expect(nextPayload).toMatchObject({
        technicalDescription: "Existing technical detail",
        internalVendorNotes: "Existing vendor note",
        qualityLevel: "premium",
        specifications: [{ id: "specification-1", name: "Updated specification", description: "Structured description" }],
        brands: [
          { id: "brand-1", name: "Updated vendor", description: "Preferred supplier" },
          { id: "brand-2", name: "Backup vendor", description: "Secondary supplier" }
        ],
        priceEntries: [validAppendEntry]
      });
    });
    expect(screen.getByRole("textbox", { name: "Brief description" }))
      .toHaveValue("Structured description");
    expect(screen.queryByRole("combobox", { name: "Component type" }))
      .not.toBeInTheDocument();
  });

  it("uses Vendor terminology for the empty and read-only subsection states", () => {
    const emptyState = render(<PricingEditorHarness initialPayload={{ brands: [] }} />);

    expect(screen.getByRole("heading", { name: "Vendors" })).toBeVisible();
    expect(screen.getByText("No vendors configured.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add vendor" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Brands" })).not.toBeInTheDocument();

    emptyState.unmount();
    render(
      <PricingEditorHarness
        initialPayload={{ brands: [{ id: "brand-1", name: "Read-only vendor", description: "Retained description" }] }}
        readOnly
      />
    );

    expect(screen.getByRole("heading", { name: "Vendors" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Vendor name" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add vendor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove vendors/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Brands" })).not.toBeInTheDocument();
  });

  it("presents server validation paths with Vendor terminology", () => {
    render(
      <PricingEditorHarness
        initialPayload={{ brands: [{ id: "brand-1", name: "", description: null }] }}
        serverIssues={[{ path: "brands.0.name", message: "Name is required." }]}
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Vendors → 0 → name");
    expect(alert).not.toHaveTextContent(/brands/iu);
  });

  it("preserves editable rupee text and writes paise only for a valid amount", async () => {
    const user = userEvent.setup();
    render(<PricingEditorHarness initialPayload={{ priceEntries: [validAppendEntry] }} />);

    const amount = screen.getByRole("textbox", { name: "Input amount (rupees)" });
    expect(amount).toHaveValue("120.00");

    await user.clear(amount);
    await user.type(amount, "0");
    await waitFor(() => expect(currentPriceEntry().inputAmountPaise).toBe(0));

    await user.type(amount, ".");
    expect(amount).toHaveValue("0.");
    await waitFor(() => expect(currentPriceEntry()).not.toHaveProperty("inputAmountPaise"));
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Complete the rupee amount with one or two decimal places.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Input amount (rupees)");
    expect(screen.getByRole("alert")).not.toHaveTextContent("inputAmountPaise");
    expect(screen.getByTestId("pricing-validity")).toHaveTextContent("invalid");

    await user.type(amount, "01");
    expect(amount).toHaveValue("0.01");
    await waitFor(() => expect(currentPriceEntry().inputAmountPaise).toBe(1));
    expect(amount).not.toHaveAttribute("aria-invalid");
    expect(screen.getByTestId("pricing-validity")).toHaveTextContent("valid");

    await user.type(amount, "1");
    expect(amount).toHaveValue("0.011");
    await waitFor(() => expect(currentPriceEntry()).not.toHaveProperty("inputAmountPaise"));
    expect(amount).toHaveAccessibleDescription(/up to two decimal places/u);
    expect(amount).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Attempt save" }));
    await waitFor(() => expect(amount).toHaveFocus());
  });

  it("creates a new price append without a Specification selector or price scope", async () => {
    const user = userEvent.setup();
    render(<PricingEditorHarness initialPayload={{
      specifications: [{ id: "spec-plywood", name: "Plywood" }],
      priceEntries: []
    }} />);

    expect(screen.queryByRole("combobox", { name: "Specification" }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Price version" }));

    expect(currentPriceEntry()).toMatchObject({
      operation: "append",
      specificationId: null
    });
    expect(screen.queryByRole("combobox", { name: "Specification" }))
      .not.toBeInTheDocument();
  });

  it("formats immutable amounts in INR and replaces historical Specification scope with null", async () => {
    const user = userEvent.setup();
    render(
      <PricingEditorHarness
        initialPayload={{
          priceEntries: [{
            operation: "reference",
            priceEntryId: "price-entry-1",
            priceVersionId: "price-version-1",
            priceVersion: {
              id: "price-version-1",
              priceEntryId: "price-entry-1",
              versionNumber: 1,
              vendorId: "vendor-1",
              uomId: "uom-1",
              specificationId: "historical-specification",
              modeId: null,
              taxRuleId: "tax-1",
              taxVersionId: "tax-version-1",
              inputAmountPaise: 12_000,
              baseAmountPaise: 12_000,
              taxAmountPaise: 2_160,
              totalAmountPaise: 14_160,
              treatment: "exclusive",
              effectiveFrom: "2026-08-01T00:00:00.000Z",
              effectiveTo: "2026-09-01T00:00:00.000Z",
              status: "active"
            }
          }]
        }}
      />
    );

    const summary = screen.getByLabelText("Immutable saved price details");
    expect(within(summary).getByText(/₹\s?141\.60/u)).toBeVisible();
    expect(summary).not.toHaveTextContent("paise");

    await user.click(screen.getByRole("button", { name: "Replace price version" }));
    const amount = await screen.findByRole("textbox", { name: "Input amount (rupees)" });
    await waitFor(() => expect(amount).toHaveValue("120.00"));
    expect(currentPriceEntry()).toMatchObject({
      operation: "append",
      priceEntryId: "price-entry-1",
      vendorId: "vendor-1",
      uomId: "uom-1",
      specificationId: null,
      taxRuleId: "tax-1",
      taxVersionId: "tax-version-1",
      inputAmountPaise: 12_000,
      treatment: "exclusive",
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: "2026-09-01T00:00:00.000Z",
      status: "active"
    });
    expect(currentPriceEntry()).not.toHaveProperty("priceVersionId");
    expect(currentPriceEntry()).not.toHaveProperty("priceVersion");
  });
});
