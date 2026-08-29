import { useState } from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
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

function PricingEditorHarness({ initialPayload }: { readonly initialPayload: KnowledgeJsonObject }) {
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
        readOnly={false}
        canQuickAdd={false}
        resetKey="pricing-1"
        validationAttempt={validationAttempt}
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

  it("formats immutable amounts in INR and preserves replacement lineage", async () => {
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
              specificationId: null,
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
