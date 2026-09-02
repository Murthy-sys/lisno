import { useState } from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  KnowledgeBudgetBuilder,
  type KnowledgeBudgetBuilderProps,
  type KnowledgeBudgetCatalogState
} from "./KnowledgeBudgetBuilder";
import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster
} from "./knowledgeTypes";

const metadata = {
  version: 1,
  createdById: "admin-1",
  updatedById: "admin-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
} as const;

const vendors = [master("vendors", "vendor-1", "Acme Vendor")];
const uoms = [master("uoms", "uom-1", "Square foot")];

const savedOne = savedBudget("price-1", "version-1", 12_000, "2026-09-02T04:30:00.000Z");
const savedTwo = savedBudget("price-2", "version-2", 25_000, "2026-10-02T04:30:00.000Z");

function BuilderHarness({
  initialValue = [],
  availableVendors = vendors,
  availableUoms = uoms,
  readOnly = false,
  saving = false,
  vendorState,
  uomState,
  issues = [],
  onRetrySavedDetails,
  onQuickAdd = () => undefined
}: {
  readonly initialValue?: readonly KnowledgeJsonValue[];
  readonly availableVendors?: readonly KnowledgeMaster[];
  readonly availableUoms?: readonly KnowledgeMaster[];
  readonly readOnly?: boolean;
  readonly saving?: boolean;
  readonly vendorState?: KnowledgeBudgetCatalogState;
  readonly uomState?: KnowledgeBudgetCatalogState;
  readonly issues?: KnowledgeBudgetBuilderProps["issues"];
  readonly onRetrySavedDetails?: () => void;
  readonly onQuickAdd?: KnowledgeBudgetBuilderProps["onQuickAdd"];
}) {
  const [value, setValue] = useState(initialValue);
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      <KnowledgeBudgetBuilder
        value={value}
        vendors={availableVendors}
        uoms={availableUoms}
        vendorCatalogState={vendorState}
        uomCatalogState={uomState}
        issues={issues}
        validationAttempt={attempt}
        readOnly={readOnly}
        saving={saving}
        canQuickAdd
        resetKey="budget-test"
        onRetrySavedDetails={onRetrySavedDetails}
        onQuickAdd={onQuickAdd}
        onChange={setValue}
        onDirty={() => undefined}
      />
      <output data-testid="budgets-value">{JSON.stringify(value)}</output>
      <button type="button" onClick={() => setAttempt((current) => current + 1)}>Validate budgets</button>
    </>
  );
}

describe("KnowledgeBudgetBuilder", () => {
  it("keeps Set budget unavailable while a required catalog is loading", async () => {
    const user = userEvent.setup();
    render(<BuilderHarness vendorState={{ status: "loading" }} />);

    expect(screen.getByText(/Loading Vendor options/u)).toBeVisible();
    const action = screen.getByRole("button", { name: "Set budget" });
    expect(action).toBeDisabled();
    await user.click(action);
    expect(screen.getByText("No budgets set.")).toBeVisible();
    expect(screen.getByTestId("budgets-value")).toHaveTextContent("[]");
  });

  it("opens the budget form and explains missing prerequisites when catalogs are loaded but empty", async () => {
    const user = userEvent.setup();
    render(
      <BuilderHarness
        availableVendors={[]}
        availableUoms={[]}
      />
    );

    const action = screen.getByRole("button", { name: "Set budget" });
    expect(action).toBeEnabled();
    expect(screen.getByText("No active Vendor is available. Add a Vendor before setting a budget.")).toBeVisible();
    expect(screen.getByText("No active Unit of measure is available. Add a Unit before setting a budget.")).toBeVisible();
    expect(screen.queryByText(/Tax options|No active Tax|Add a Tax/iu)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeEnabled();

    await user.click(action);

    const disclosure = screen.getByRole("button", { name: "New budget" });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(disclosure).toHaveFocus());
    expect(screen.getByRole("combobox", { name: "Vendor" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Unit of measure" })).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Tax" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add vendor" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add Unit" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Add tax/iu })).not.toBeInTheDocument();
    expect(screen.getByTestId("budgets-value")).toHaveTextContent('"operation":"set_budget"');
  });

  it("keeps stale choices visible and exposes a working Retry action", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <BuilderHarness
        vendorState={{
          status: "ready",
          refreshErrorMessage: "network unavailable",
          onRetry: retry
        }}
      />
    );

    expect(screen.getByText("Showing saved budget options")).toBeVisible();
    expect(screen.getByText("Latest updates could not be loaded.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Set budget" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("allows only one saved budget disclosure to remain open", async () => {
    const user = userEvent.setup();
    render(<BuilderHarness initialValue={[savedOne, savedTwo]} />);

    const first = screen.getByRole("button", { name: /₹\s?120\.00 per Square foot/iu });
    const second = screen.getByRole("button", { name: /₹\s?250\.00 per Square foot/iu });
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "false");

    await user.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");
    await user.click(second);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("region", { name: /₹/u })).toHaveLength(1);
  });

  it("opens Schedule options and focuses Ends on for a validation error", async () => {
    const user = userEvent.setup();
    render(
      <BuilderHarness
        initialValue={[{
          operation: "set_budget",
          vendorId: "vendor-1",
          uomId: "uom-1",
          inputAmountPaise: 100,
          effectiveFrom: "2026-09-02T04:30:00.000Z",
          effectiveTo: "2026-09-01T04:30:00.000Z"
        }]}
        issues={[{ path: "priceEntries.0.effectiveTo", message: "Ends on must be later than Starts on." }]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Validate budgets" }));
    const schedule = await screen.findByRole("button", { name: "Schedule options" });
    expect(schedule).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByLabelText("Ends on (optional)")).toHaveFocus());
  });

  it("focuses the budget disclosure when validation targets an unavailable Vendor", async () => {
    const user = userEvent.setup();
    render(
      <BuilderHarness
        initialValue={[{
          operation: "set_budget",
          uomId: "uom-1",
          inputAmountPaise: 100,
          effectiveFrom: "2026-09-02T04:30:00.000Z",
          effectiveTo: null
        }]}
        availableVendors={[]}
        issues={[{ path: "priceEntries.0.vendorId", message: "Select a Vendor." }]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Validate budgets" }));
    const disclosure = screen.getByRole("button", { name: "New budget" });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(disclosure).toHaveFocus());
  });

  it("focuses the budget disclosure when Update has no active Vendor option", async () => {
    const user = userEvent.setup();
    render(<BuilderHarness initialValue={[savedOne]} availableVendors={[]} />);

    await user.click(screen.getByRole("button", { name: "Budget needs attention" }));
    await user.click(screen.getByRole("button", { name: "Update budget" }));

    const disclosure = screen.getByRole("button", { name: "New budget" });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(disclosure).toHaveFocus());
  });

  it("restores focus to Set budget after a contextual removal", async () => {
    const user = userEvent.setup();
    render(<BuilderHarness initialValue={[savedOne]} />);

    await user.click(screen.getByRole("button", { name: /₹\s?120\.00 per Square foot/iu }));
    const remove = screen.getByRole("button", {
      name: "Remove Acme Vendor Square foot budget from this Draft"
    });
    await user.click(remove);

    expect(screen.getByText("No budgets set.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Set budget" })).toHaveFocus());
    expect(screen.getByTestId("budgets-value")).toHaveTextContent("[]");
  });

  it("keeps unresolved saved history readable and blocks Update until retry succeeds", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <BuilderHarness
        initialValue={[{
          operation: "reference",
          priceEntryId: "price-1",
          priceVersionId: "version-1"
        }]}
        onRetrySavedDetails={retry}
      />
    );

    await user.click(screen.getByRole("button", { name: "Budget needs attention" }));
    expect(screen.getByText("Saved budget details are unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Update budget" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows Needs review as text without exposing the raw saved status", async () => {
    const user = userEvent.setup();
    const needsReview = {
      ...savedOne,
      priceVersion: {
        ...(savedOne.priceVersion as KnowledgeJsonObject),
        status: "superseded"
      }
    };
    render(<BuilderHarness initialValue={[needsReview]} />);

    const trigger = screen.getByRole("button", { name: /Needs review/iu });
    expect(trigger).toBeVisible();
    await user.click(trigger);
    const details = screen.getByLabelText("Saved budget details");
    expect(within(details).getByText("Needs review")).toBeVisible();
    expect(details).not.toHaveTextContent("superseded");
  });

  it("disables Update when the server did not return an authoritative before-GST amount", async () => {
    const user = userEvent.setup();
    const savedWithoutBase = {
      ...savedOne,
      priceVersion: {
        ...(savedOne.priceVersion as KnowledgeJsonObject),
        baseAmountPaise: null
      }
    };
    render(<BuilderHarness initialValue={[savedWithoutBase]} />);

    await user.click(screen.getByRole("button", { name: "Budget needs attention" }));
    expect(screen.getByText("Update is unavailable because the saved before-GST amount could not be loaded.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Update budget" })).toBeDisabled();
  });
});

function savedBudget(
  priceEntryId: string,
  priceVersionId: string,
  inputAmountPaise: number,
  effectiveFrom: string
): KnowledgeJsonObject {
  return {
    operation: "reference",
    priceEntryId,
    priceVersionId,
    priceVersion: {
      id: priceVersionId,
      priceEntryId,
      versionNumber: 1,
      vendorId: "vendor-1",
      uomId: "uom-1",
      taxRuleId: "tax-1",
      taxVersionId: "tax-version-1",
      inputAmountPaise,
      baseAmountPaise: inputAmountPaise,
      taxAmountPaise: inputAmountPaise === 12_000 ? 2_160 : 4_500,
      totalAmountPaise: inputAmountPaise === 12_000 ? 14_160 : 29_500,
      treatment: "exclusive",
      effectiveFrom,
      effectiveTo: null,
      status: "active"
    }
  };
}

function master(
  masterType: "vendors" | "uoms" | "taxes",
  id: string,
  name: string
): KnowledgeMaster {
  return {
    id,
    masterType,
    code: id.toUpperCase(),
    name,
    description: null,
    displayOrder: 0,
    status: "active",
    ...metadata
  };
}
