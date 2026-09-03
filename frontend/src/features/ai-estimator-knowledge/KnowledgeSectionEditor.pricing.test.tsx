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
  vendors: [{ id: "vendor-1", masterType: "vendors", code: "ACME", name: "Acme Vendor", description: null, displayOrder: 0, status: "active", ...actorMetadata }],
  uoms: [{ id: "uom-1", masterType: "uoms", code: "SQFT", name: "Square foot", description: null, displayOrder: 0, status: "active", ...actorMetadata }],
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

const savedBudget = {
  operation: "reference",
  priceEntryId: "price-entry-1",
  priceVersionId: "price-version-1",
  priceVersion: {
    id: "price-version-1",
    priceEntryId: "price-entry-1",
    versionNumber: 7,
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
    effectiveTo: null,
    status: "active"
  }
} as const;

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

function currentBudget(): Record<string, unknown> {
  const payload = JSON.parse(screen.getByTestId("pricing-payload").textContent ?? "{}") as {
    priceEntries?: Array<Record<string, unknown>>;
  };
  return payload.priceEntries?.[0] ?? {};
}

describe("knowledge Budgeting editor", () => {
  it("keeps Specifications and Vendors while presenting saved prices as collapsed Budgets", async () => {
    const user = userEvent.setup();
    render(
      <PricingEditorHarness
        initialPayload={{
          technicalDescription: "Preserved compatibility value",
          specifications: [{ id: "specification-1", name: "Plywood", description: "Structured description" }],
          brands: [{ id: "brand-1", name: "Preferred vendor", description: "Retained description" }],
          priceEntries: [savedBudget]
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Specifications" })).toBeVisible();
    const vendors = screen.getByRole("region", { name: "Vendors" });
    expect(vendors).toBeVisible();
    /* Stable IDs are storage detail. The author edits the Vendor by name, and
       the row's own ID never reaches the screen. */
    expect(within(vendors).getByRole("textbox", { name: "Vendor name" })).toHaveValue("Preferred vendor");
    expect(within(vendors).queryByRole("textbox", { name: "Stable ID" })).not.toBeInTheDocument();
    expect(vendors).not.toHaveTextContent("brand-1");
    expect(screen.getByRole("heading", { name: "Budgets" })).toBeVisible();
    expect(screen.getByText("Set the unit budget used by the estimator. Complete the details, then Save Mode.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: /price versions/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Technical description" })).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: /₹\s?120\.00 per Square foot · Acme Vendor/iu });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: /₹\s?120\.00 per Square foot/iu })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByRole("group", { name: "Saved budget details" });
    expect(details).toBeVisible();
    expect(screen.getByText(/₹\s?141\.60/u)).toBeVisible();
    expect(screen.queryByLabelText(/price operation|price entry|price version|tax version|tax treatment|version status|mode/iu)).not.toBeInTheDocument();
    const budgets = screen.getByRole("region", { name: "Budgets" });
    expect(within(budgets).queryByRole("button", { name: /move .* (up|down)/iu })).not.toBeInTheDocument();
  });

  it("creates a business-only budget draft, opens it, and focuses Vendor", async () => {
    const user = userEvent.setup();
    render(<PricingEditorHarness initialPayload={{ priceEntries: [] }} />);

    await user.click(screen.getByRole("button", { name: "Set budget" }));

    const vendor = screen.getByRole("combobox", { name: "Vendor" });
    await waitFor(() => expect(vendor).toHaveFocus());
    expect(screen.getByRole("button", { name: "New budget" })).toHaveAttribute("aria-expanded", "true");
    expect(currentBudget()).toMatchObject({
      operation: "set_budget",
      effectiveTo: null
    });
    expect(new Date(String(currentBudget().effectiveFrom)).toString()).not.toBe("Invalid Date");
    expect(Object.keys(currentBudget()).sort()).toEqual(["effectiveFrom", "effectiveTo", "operation"]);

    expect(screen.getByRole("combobox", { name: "Unit of measure" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Tax" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(?:Add|Configure) Tax$/iu })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Unit budget (₹, before GST)" })).toBeVisible();
    expect(screen.getByText("GST is fixed at 18% and is added when you save.")).toBeVisible();
    expect(screen.getByLabelText(/Starts on/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Schedule options" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Ends on (optional)")).not.toBeVisible();
  });

  it("retains editable rupee text, stores paise only when valid, and focuses the error", async () => {
    const user = userEvent.setup();
    render(<PricingEditorHarness initialPayload={{ priceEntries: [] }} />);
    await user.click(screen.getByRole("button", { name: "Set budget" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Vendor" }), "vendor-1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure" }), "uom-1");

    const amount = screen.getByRole("textbox", { name: "Unit budget (₹, before GST)" });
    await user.type(amount, "0.01");
    await waitFor(() => expect(currentBudget().inputAmountPaise).toBe(1));

    await user.type(amount, "1");
    expect(amount).toHaveValue("0.011");
    await waitFor(() => expect(currentBudget()).not.toHaveProperty("inputAmountPaise"));
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Enter a non-negative rupee amount with up to two decimal places.").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Attempt save" }));
    await waitFor(() => expect(amount).toHaveFocus());
    expect(screen.getByTestId("pricing-validity")).toHaveTextContent("invalid");
  });

  it("shows only server-returned totals and turns Update budget into a strict business draft", async () => {
    const user = userEvent.setup();
    render(<PricingEditorHarness initialPayload={{ priceEntries: [savedBudget] }} />);

    const trigger = screen.getByRole("button", { name: /₹\s?120\.00 per Square foot · Acme Vendor/iu });
    await user.click(trigger);
    const savedDetails = screen.getByRole("group", { name: "Saved budget details" });
    expect(within(savedDetails).getByText(/₹\s?120\.00/u)).toBeVisible();
    expect(within(savedDetails).getByText(/₹\s?21\.60/u)).toBeVisible();
    expect(within(savedDetails).getByText(/₹\s?141\.60/u)).toBeVisible();
    expect(within(savedDetails).getByText("Amount before GST")).toBeVisible();
    expect(within(savedDetails).getByText("GST")).toBeVisible();
    expect(within(savedDetails).getByText("Total including GST")).toBeVisible();
    expect(within(savedDetails).queryByText("Tax")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update budget" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Vendor" })).toHaveFocus());
    expect(currentBudget()).toEqual({
      operation: "set_budget",
      sourcePriceVersionId: "price-version-1",
      vendorId: "vendor-1",
      uomId: "uom-1",
      inputAmountPaise: 12_000,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: null
    });
    expect(screen.queryByRole("group", { name: "Saved budget details" })).not.toBeInTheDocument();
    expect(screen.queryByText(/₹\s?141\.60/u)).not.toBeInTheDocument();
  });

  it("prefills a historical inclusive Update from the authoritative base amount", async () => {
    const user = userEvent.setup();
    const historicalInclusive = {
      ...savedBudget,
      priceVersion: {
        ...savedBudget.priceVersion,
        inputAmountPaise: 11_800,
        baseAmountPaise: 10_000,
        taxAmountPaise: 1_800,
        totalAmountPaise: 11_800,
        treatment: "inclusive"
      }
    };
    render(<PricingEditorHarness initialPayload={{ priceEntries: [historicalInclusive] }} />);

    await user.click(screen.getByRole("button", { name: /₹\s?100\.00 per Square foot/iu }));
    await user.click(screen.getByRole("button", { name: "Update budget" }));

    expect(screen.getByRole("textbox", { name: "Unit budget (₹, before GST)" })).toHaveValue("100.00");
    expect(currentBudget()).not.toHaveProperty("taxRuleId");
    expect(currentBudget().inputAmountPaise).toBe(10_000);
  });

  it("keeps saved summaries readable while omitting every mutation action in read-only mode", async () => {
    const user = userEvent.setup();
    render(<PricingEditorHarness initialPayload={{ priceEntries: [savedBudget] }} readOnly />);

    expect(screen.queryByRole("button", { name: "Set budget" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /₹\s?120\.00 per Square foot · Acme Vendor/iu });
    await user.click(trigger);
    expect(screen.getByRole("group", { name: "Saved budget details" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Update budget" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove .* from this Draft/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add vendor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add tax" })).not.toBeInTheDocument();
  });

  it("uses business terminology in validation summaries", () => {
    render(
      <PricingEditorHarness
        initialPayload={{ priceEntries: [{ operation: "set_budget", effectiveFrom: "invalid" }] }}
        serverIssues={[{
          path: "priceEntries.0",
          message: "The stored GST policy does not match the system GST 18% policy. Contact support."
        }]}
      />
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent?.includes("Budgets → Budget 1"))).toBe(true);
    expect(alerts.some((alert) => alert.textContent?.includes("system GST 18% policy"))).toBe(true);
    expect(alerts.every((alert) => !/priceEntries|taxRuleId|inputAmountPaise/iu.test(alert.textContent ?? ""))).toBe(true);
  });
});
