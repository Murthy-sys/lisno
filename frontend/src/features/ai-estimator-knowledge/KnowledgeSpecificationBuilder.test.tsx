import { useState, type ComponentProps } from "react";
import axe from "axe-core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  KnowledgeSpecificationBuilder,
  type KnowledgeSpecificationChange
} from "./KnowledgeSpecificationBuilder";
import {
  KNOWLEDGE_MAX_BRANDS,
  type KnowledgeSpecificationIssue
} from "./knowledgeSpecificationConfiguration";
import type { KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeSpecificationBrandPrefill } from "./knowledgeTypes";
import type { KnowledgeSpecificationItemNameLookup } from "./knowledgeEditorDataSource";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";

function Harness({
  initialValue = [],
  initialBrands = [],
  savedValue,
  savedBrands,
  validationAttempt = 0,
  issues,
  priceEntries = [],
  referencedSpecificationIds = [],
  slabReferencedSpecificationIds = [],
  readOnly = false,
  itemNameLookup,
  onValue = vi.fn()
}: {
  readonly initialValue?: KnowledgeJsonValue;
  readonly initialBrands?: KnowledgeJsonValue;
  readonly savedValue?: KnowledgeJsonValue;
  readonly savedBrands?: KnowledgeJsonValue;
  readonly validationAttempt?: number;
  readonly issues?: readonly KnowledgeSpecificationIssue[];
  readonly priceEntries?: KnowledgeJsonValue;
  readonly referencedSpecificationIds?: readonly string[];
  readonly slabReferencedSpecificationIds?: readonly string[];
  readonly readOnly?: boolean;
  readonly itemNameLookup?: KnowledgeSpecificationItemNameLookup;
  readonly onValue?: (value: KnowledgeSpecificationChange) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [brands, setBrands] = useState(initialBrands);
  return (
    <main>
      <KnowledgeSpecificationBuilder
        itemNameLookup={itemNameLookup}
        value={value}
        brands={brands}
        savedValue={savedValue}
        savedBrands={savedBrands}
        validationAttempt={validationAttempt}
        priceEntries={priceEntries}
        referencedSpecificationIds={referencedSpecificationIds}
        slabReferencedSpecificationIds={slabReferencedSpecificationIds}
        readOnly={readOnly}
        issues={issues}
        onDirty={() => undefined}
        onChange={(next) => {
          setValue(next.specifications);
          setBrands(next.brands);
          onValue(next);
        }}
      />
      <output data-testid="specifications-payload">{JSON.stringify(value)}</output>
      <output data-testid="brands-payload">{JSON.stringify(brands)}</output>
    </main>
  );
}

const savedSpecifications: KnowledgeJsonValue = [
  { id: "spec-plywood", name: "Plywood", brandId: "brand-century", description: "18 mm BWP-grade plywood." },
  { id: "spec-hardware", name: "Hardware", brandId: "brand-hettich", description: "Soft-close hinges." }
];

const savedBrands: KnowledgeJsonValue = [
  { id: "brand-century", name: "Century Green" },
  { id: "brand-hettich", name: "Hettich" }
];

describe("KnowledgeSpecificationBuilder", () => {
  it("renders an accessible compact summary with resolved Brand labels and no raw IDs", async () => {
    render(<Harness
      initialValue={savedSpecifications}
      initialBrands={savedBrands}
      savedValue={savedSpecifications}
      savedBrands={savedBrands}
    />);

    const table = screen.getByRole("table", { name: "Configured Specifications" });
    expect(within(table).getByRole("columnheader", { name: "Item name" })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: "Brands" })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: "Brief description" })).toBeVisible();
    expect(within(table).getAllByText("Saved")).toHaveLength(2);
    expect(within(table).getByText("Century Green")).toBeVisible();
    expect(within(table).queryByText("brand-century")).not.toBeInTheDocument();
    const actionCells = table.querySelectorAll("td.knowledge-specification-table__actions");
    expect(actionCells).toHaveLength(2);
    expect(actionCells[0]?.querySelector(":scope > div")).not.toBeNull();
    expect(actionCells[0]?.firstElementChild).toContainElement(
      within(actionCells[0] as HTMLElement).getByRole("button", { name: "Edit Specification 1" })
    );
    expect(screen.queryByRole("textbox", { name: "Item name" })).not.toBeInTheDocument();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("adds one stable draft, edits it in the panel, and Done returns an Unsaved summary without saving", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness savedValue={[]} savedBrands={[]} onValue={onValue} />);

    const add = screen.getByRole("button", { name: "Add Specification" });
    await user.click(add);
    const panel = await screen.findByRole("dialog", { name: "Add Specification" });
    const item = within(panel).getByRole("textbox", { name: "Item name" });
    await waitFor(() => expect(item).toHaveFocus());
    await user.type(item, "Plywood");
    await user.type(within(panel).getByRole("textbox", { name: "Brief description" }), "18 mm BWP grade");

    const draft = specificationsPayload()[0]!;
    expect(draft.id).toEqual(expect.stringMatching(/^knowledge-specification-/u));
    expect(draft).toEqual(expect.objectContaining({ name: "Plywood", description: "18 mm BWP grade" }));
    expect(within(panel).queryByRole("button", { name: /Save/u })).not.toBeInTheDocument();
    const callCountBeforeDone = onValue.mock.calls.length;
    await user.click(within(panel).getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog", { name: "Add Specification" })).not.toBeInTheDocument();
    expect(screen.getByText("Unsaved")).toBeVisible();
    expect(onValue).toHaveBeenCalledTimes(callCountBeforeDone);
    await waitFor(() => expect(add).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    expect(screen.getByRole("dialog", { name: "Edit Specification" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Add Specification" })).not.toBeInTheDocument();
  });

  it("uses the saved baseline and marks only changed stable-ID rows Unsaved", async () => {
    const user = userEvent.setup();
    render(<Harness
      initialValue={savedSpecifications}
      initialBrands={savedBrands}
      savedValue={savedSpecifications}
      savedBrands={savedBrands}
    />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Saved")).toBeVisible();
    expect(within(rows[1]!).getByText("Saved")).toBeVisible();

    await user.click(within(rows[1]!).getByRole("button", { name: "Edit Specification 2" }));
    const panel = screen.getByRole("dialog", { name: "Edit Specification" });
    const description = within(panel).getByRole("textbox", { name: "Brief description" });
    await user.clear(description);
    await user.type(description, "Premium soft-close hinges.");
    await user.click(within(panel).getByRole("button", { name: "Done" }));

    const updatedRows = screen.getAllByRole("row").slice(1);
    expect(within(updatedRows[0]!).getByText("Saved")).toBeVisible();
    expect(within(updatedRows[1]!).getByText("Unsaved")).toBeVisible();
    expect(specificationsPayload()[1]).toEqual(expect.objectContaining({ id: "spec-hardware", name: "Hardware" }));
  });

  it("marks every row selecting a renamed Brand Unsaved and preserves hidden Brand fields", async () => {
    const user = userEvent.setup();
    const initialValue: KnowledgeJsonValue = [
      { id: "spec-plywood", name: "Plywood", brandIds: ["brand-hettich", "brand-century"] },
      { id: "spec-laminate", name: "Laminate", brandId: "brand-century" }
    ];
    const initialBrands: KnowledgeJsonValue = [{ id: "brand-hettich", name: "Hettich" }, {
      id: "brand-century",
      name: "Century Green",
      description: "Keep this hidden Brand detail."
    }];
    render(<Harness
      initialValue={initialValue}
      initialBrands={initialBrands}
      savedValue={initialValue}
      savedBrands={initialBrands}
    />);

    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await user.click(screen.getByRole("button", { name: "Brands" }));
    await user.click(screen.getByRole("button", { name: "Edit Century Green" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Brand" });
    const name = within(dialog).getByRole("textbox", { name: "Brand name" });
    await user.clear(name);
    await user.type(name, "Century Green Pro");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await user.click(within(screen.getByRole("dialog", { name: "Edit Specification" })).getByRole("button", { name: "Done" }));

    expect(screen.getAllByText("Unsaved")).toHaveLength(2);
    expect(brandsPayload()).toEqual([{ id: "brand-hettich", name: "Hettich" }, {
      id: "brand-century",
      name: "Century Green Pro",
      description: "Keep this hidden Brand detail."
    }]);
  });

  it("edits by stable Specification ID, preserves hidden typed fields, and restores row focus", async () => {
    const user = userEvent.setup();
    render(<Harness
      initialValue={[
        { id: "spec-first", name: "First" },
        { id: "typed-spec", name: "Old name", type: "dropdown", options: ["BWP", "BWR"], value: "BWP" }
      ]}
      savedValue={[
        { id: "spec-first", name: "First" },
        { id: "typed-spec", name: "Old name", type: "dropdown", options: ["BWP", "BWR"], value: "BWP" }
      ]}
      savedBrands={[]}
    />);

    const edit = screen.getByRole("button", { name: "Edit Specification 2" });
    await user.click(edit);
    const name = within(screen.getByRole("dialog", { name: "Edit Specification" })).getByRole("textbox", { name: "Item name" });
    await user.clear(name);
    await user.type(name, "Plywood");
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(specificationsPayload()[1]).toEqual({
      id: "typed-spec",
      name: "Plywood",
      type: "dropdown",
      options: ["BWP", "BWR"],
      value: "BWP"
    });
    await waitFor(() => expect(edit).toHaveFocus());
  });

  it("shows View-only fields and no add or remove controls in read-only mode", async () => {
    const user = userEvent.setup();
    render(<Harness
      initialValue={savedSpecifications}
      initialBrands={savedBrands}
      savedValue={savedSpecifications}
      savedBrands={savedBrands}
      readOnly
    />);

    expect(screen.queryByRole("button", { name: "Add Specification" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Specification 1" }));
    const panel = screen.getByRole("dialog", { name: "View Specification" });
    expect(within(panel).getByRole("textbox", { name: "Item name" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "Brands" })).toBeDisabled();
    expect(within(panel).queryByRole("button", { name: "Add brand" })).not.toBeInTheDocument();
    expect(within(panel).getAllByRole("button")).toHaveLength(3);
  });

  it("disables protected removal with its accessible reason and restores focus after a removable row is removed", async () => {
    const user = userEvent.setup();
    render(<Harness
      initialValue={[
        { id: "spec-history", name: "Historical plywood" },
        { id: "spec-draft", name: "Draft laminate" }
      ]}
      savedValue={[]}
      referencedSpecificationIds={["spec-history"]}
    />);

    const removes = screen.getAllByRole("button", { name: /^Remove Specification/u });
    expect(removes[0]).toBeDisabled();
    expect(removes[0]).toHaveAccessibleDescription(
      "This Specification is retained by saved configuration or immutable price history and cannot be removed."
    );
    await user.click(removes[1]!);
    expect(screen.queryByText("Draft laminate")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Specification" })).toHaveFocus());
  });

  it("gives each multi-row Remove action a unique descriptive accessible name", () => {
    render(<Harness
      initialValue={[
        { id: "spec-plywood", name: "Plywood" },
        { id: "spec-empty", name: "" }
      ]}
      savedValue={[]}
    />);

    expect(screen.getByRole("button", { name: "Remove Specification 1: Plywood" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Specification 2: Item not named" })).toBeVisible();
  });

  it("opens the first invalid row on a new validation attempt and focuses the exact invalid field", async () => {
    const issues: readonly KnowledgeSpecificationIssue[] = [{
      path: "specifications.1.description",
      message: "Brief description needs review."
    }];
    const { rerender } = render(<Harness
      initialValue={savedSpecifications}
      initialBrands={savedBrands}
      savedValue={savedSpecifications}
      savedBrands={savedBrands}
      issues={issues}
      validationAttempt={0}
    />);

    expect(screen.queryByRole("dialog", { name: "Edit Specification" })).not.toBeInTheDocument();
    rerender(<Harness
      initialValue={savedSpecifications}
      initialBrands={savedBrands}
      savedValue={savedSpecifications}
      savedBrands={savedBrands}
      issues={issues}
      validationAttempt={1}
    />);

    const panel = await screen.findByRole("dialog", { name: "Edit Specification" });
    const description = within(panel).getByRole("textbox", { name: "Brief description" });
    await waitFor(() => expect(description).toHaveFocus());
    expect(description).toHaveAccessibleDescription(expect.stringContaining("Brief description needs review."));
    expect(screen.getByText("Needs review")).toBeVisible();
  });

  it("maps Brand validation to the first row selecting that stable Brand and focuses its dropdown", async () => {
    render(<Harness
      initialValue={savedSpecifications}
      initialBrands={savedBrands}
      savedValue={savedSpecifications}
      savedBrands={savedBrands}
      issues={[{ path: "brands.1.name", message: "Brand names must be unique." }]}
      validationAttempt={1}
    />);

    const panel = await screen.findByRole("dialog", { name: "Edit Specification" });
    expect(within(panel).getByRole("textbox", { name: "Item name" })).toHaveValue("Hardware");
    const brand = within(panel).getByRole("button", { name: "Brands" });
    await waitFor(() => expect(brand).toHaveFocus());
    expect(brand).toHaveAccessibleDescription(expect.stringContaining("Brand names must be unique."));
  });

  it("creates a Brand atomically, selects it for the initiating draft, and resolves its summary label", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness
      initialValue={[{ id: "spec-plywood", name: "Plywood" }]}
      initialBrands={savedBrands}
      savedValue={[]}
      savedBrands={savedBrands}
      onValue={onValue}
    />);

    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await openAddBrand(user);
    const dialog = screen.getByRole("dialog", { name: "Add Brand" });
    await user.type(within(dialog).getByRole("textbox", { name: "Brand name" }), "Blum");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    const latest = onValue.mock.calls.at(-1)?.[0] as KnowledgeSpecificationChange;
    const newBrand = latest.brands[2] as Record<string, unknown>;
    expect(newBrand).toMatchObject({ name: "Blum" });
    expect(latest.specifications[0]).toMatchObject({ id: "spec-plywood", brandId: newBrand.id });
    await user.click(within(screen.getByRole("dialog", { name: "Edit Specification" })).getByRole("button", { name: "Done" }));
    expect(screen.getByText("Blum")).toBeVisible();
  });

  it("cancels Brand creation without writing and restores the dropdown focus", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness
      initialValue={[{ id: "spec-plywood", name: "Plywood", brandId: "brand-century" }]}
      initialBrands={savedBrands}
      savedValue={[{ id: "spec-plywood", name: "Plywood", brandId: "brand-century" }]}
      savedBrands={savedBrands}
      onValue={onValue}
    />);

    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    const select = screen.getByRole("button", { name: "Brands" });
    await openAddBrand(user);
    const dialog = await screen.findByRole("dialog", { name: "Add Brand" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(select).toHaveFocus());
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Century Green");
    expect(onValue).not.toHaveBeenCalled();
  });

  it("validates inline Brand creation and keeps existing Brands selectable at the 200 limit", async () => {
    const user = userEvent.setup();
    const brands = Array.from({ length: KNOWLEDGE_MAX_BRANDS }, (_, index) => ({
      id: `brand-${index}`,
      name: `Brand ${index}`
    }));
    render(<Harness
      initialValue={[{ id: "spec-plywood", name: "Plywood" }]}
      initialBrands={brands}
      savedValue={[]}
      savedBrands={brands}
    />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    const select = screen.getByRole("button", { name: "Brands" });
    expect(select).toHaveAccessibleDescription(
      `Maximum ${KNOWLEDGE_MAX_BRANDS} Brands reached. Existing Brands remain selectable. Not configured`
    );
    await user.click(select);
    expect(screen.getByRole("button", { name: "Add brand (maximum 200 reached)" })).toBeDisabled();
    await user.click(screen.getByRole("option", { name: "Brand 17" }));
    expect(specificationsPayload()[0]).toMatchObject({ brandId: "brand-17" });
  });

  it("reports blank, duplicate, and oversized Brand names without changing the draft", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness
      initialValue={[{ id: "spec-plywood", name: "Plywood" }]}
      initialBrands={[{ id: "brand-century", name: "Century Green" }]}
      savedValue={[]}
      savedBrands={[{ id: "brand-century", name: "Century Green" }]}
      onValue={onValue}
    />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await openAddBrand(user);
    let dialog = screen.getByRole("dialog", { name: "Add Brand" });
    let input = within(dialog).getByRole("textbox", { name: "Brand name" });
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(input).toHaveAccessibleDescription("Brand name is required.");
    await user.type(input, "CENTURY   GREEN");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(input).toHaveAccessibleDescription(expect.stringContaining("Brand names must be unique."));
    await user.clear(input);
    fireEvent.change(input, { target: { value: "B".repeat(241) } });
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    dialog = screen.getByRole("dialog", { name: "Add Brand" });
    input = within(dialog).getByRole("textbox", { name: "Brand name" });
    expect(input).toHaveAccessibleDescription("Brand name must be 240 characters or fewer.");
    expect(onValue).not.toHaveBeenCalled();
  });

  it("associates a dangling Brand issue with the editor without showing the raw ID in the summary", async () => {
    const user = userEvent.setup();
    render(<Harness
      initialValue={[{ id: "spec-plywood", name: "Plywood", brandId: "private-missing-id" }]}
      initialBrands={[]}
      savedValue={[]}
      savedBrands={[]}
    />);

    const table = screen.getByRole("table", { name: "Configured Specifications" });
    expect(within(table).getByText("Unavailable Brand")).toBeVisible();
    expect(within(table).queryByText("private-missing-id")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    const brand = screen.getByRole("button", { name: "Brands" });
    expect(brand).toHaveAttribute("aria-invalid", "true");
    expect(brand).toHaveAccessibleDescription(expect.stringContaining("Choose a configured Brand."));
  });

  it("closes Brand creation without writing if the editor becomes read-only", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    const props = {
      value: [{ id: "spec-plywood", name: "Plywood" }],
      brands: [],
      savedValue: [],
      savedBrands: [],
      priceEntries: [],
      onDirty: vi.fn(),
      onChange: onValue
    } satisfies Omit<ComponentProps<typeof KnowledgeSpecificationBuilder>, "readOnly">;
    const { rerender } = render(<KnowledgeSpecificationBuilder {...props} readOnly={false} />);

    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await openAddBrand(user);
    expect(screen.getByRole("dialog", { name: "Add Brand" })).toBeInTheDocument();
    rerender(<KnowledgeSpecificationBuilder {...props} readOnly />);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Brand" })).not.toBeInTheDocument());
    expect(onValue).not.toHaveBeenCalled();
    expect(props.onDirty).not.toHaveBeenCalled();
  });

  it("selects multiple brands in selection order, reopens them, and removes or clears without losing typed fields", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={[{ id: "typed-spec", name: "Plywood", type: "dropdown", options: ["BWP"], value: "BWP" }]} initialBrands={savedBrands} />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await user.click(screen.getByRole("button", { name: "Brands" }));
    expect(screen.getByRole("listbox", { name: "Brand options" })).toHaveAttribute("aria-multiselectable", "true");
    await user.click(screen.getByRole("option", { name: "Hettich" }));
    await user.click(screen.getByRole("option", { name: "Century Green" }));
    expect(screen.getByRole("option", { name: "Century Green" })).toHaveAttribute("aria-selected", "true");
    expect(specificationsPayload()[0]).toEqual({ id: "typed-spec", name: "Plywood", type: "dropdown", options: ["BWP"], value: "BWP", brandIds: ["brand-hettich", "brand-century"] });
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("table")).toHaveTextContent("Hettich, Century Green");
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await user.click(screen.getByRole("button", { name: "Brands" }));
    await user.click(screen.getByRole("option", { name: "Hettich" }));
    expect(specificationsPayload()[0]).toMatchObject({ brandId: "brand-century", type: "dropdown", value: "BWP" });
    expect(specificationsPayload()[0]).not.toHaveProperty("brandIds");
    await user.click(screen.getByRole("option", { name: "Not configured" }));
    expect(specificationsPayload()[0]).not.toHaveProperty("brandId");
    expect(specificationsPayload()[0]).not.toHaveProperty("brandIds");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Brands" })).toHaveFocus();
  });

  it("keeps the closed dropdown compact and retains Add and Edit inside its popup", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={[{ id: "spec-one", name: "Plywood", brandId: "brand-century" }]} initialBrands={savedBrands} />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    const trigger = screen.getByRole("button", { name: "Brands" });
    expect(trigger).toHaveClass("ui-control", "ui-select");
    expect(trigger).toHaveTextContent("Century Green");
    expect(trigger).toHaveAccessibleDescription("Century Green");
    const selection = screen.getByRole("group", { name: "Brand selection" });
    expect(within(selection).getAllByRole("button")).toEqual([trigger]);
    expect(screen.queryByRole("list", { name: "Selected brands" })).not.toBeInTheDocument();
    expect(screen.queryByText("Optional. Select one or more brands.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add brand|Edit selected brand|Remove Brand|Clear brands/u })).not.toBeInTheDocument();

    await user.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Brand options" });
    const edit = screen.getByRole("button", { name: "Edit selected brand Century Green" });
    const add = screen.getByRole("button", { name: "Add brand" });
    expect(edit).toHaveTextContent("Edit selected brand");
    expect(selection).toContainElement(edit);
    expect(selection).toContainElement(add);
    expect(listbox).not.toContainElement(edit);
    expect(listbox).not.toContainElement(add);
    expect(screen.getByRole("option", { name: "Not configured" })).toHaveAttribute("aria-selected", "false");
    await user.click(edit);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Edit Brand" });
    expect(within(dialog).getByRole("textbox", { name: "Brand name" })).toHaveValue("Century Green");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("appends a created brand after all selections and returns focus to the dropdown", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={[{ id: "spec-one", name: "Plywood", brandIds: ["brand-century", "brand-hettich"] }]} initialBrands={savedBrands} />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    const trigger = screen.getByRole("button", { name: "Brands" });
    await openAddBrand(user);
    const dialog = screen.getByRole("dialog", { name: "Add Brand" });
    await user.type(within(dialog).getByRole("textbox", { name: "Brand name" }), "Blum");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(specificationsPayload()[0]?.brandIds).toEqual(["brand-century", "brand-hettich", brandsPayload()[2]?.id]);
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    const edit = screen.getByRole("button", { name: "Edit Hettich" });
    await user.click(edit);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "Edit Specification" })).toBeVisible();
  });

  it("supports search, keyboard selection, Home/End and Escape without closing the specification panel", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={[{ id: "spec-one", name: "Plywood" }]} initialBrands={savedBrands} />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    const trigger = screen.getByRole("button", { name: "Brands" });
    await user.click(trigger);
    const search = screen.getByRole("searchbox", { name: "Search brands" });
    expect(search).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("option", { name: "Not configured" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Century Green" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{End} ");
    expect(screen.getByRole("option", { name: "Hettich" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}{ArrowDown}{Enter}");
    expect(specificationsPayload()[0]?.brandIds).toEqual(["brand-hettich", "brand-century"]);
    await user.click(search);
    await user.type(search, "not found");
    expect(within(screen.getByRole("dialog", { name: "Edit Specification" })).getByRole("status")).toHaveTextContent("No brands match your search.");
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Hettich");
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit Specification" })).toBeVisible();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "Hettich" })).toHaveFocus();
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
    await user.tab();
    expect(screen.getByRole("button", { name: "Edit Hettich" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps unavailable references visible during search and removes only that association", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={[{ id: "spec-one", name: "Plywood", brandIds: ["brand-century", "private-missing"] }]} initialBrands={savedBrands} />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    const trigger = screen.getByRole("button", { name: "Brands" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    await user.click(trigger);
    await user.type(screen.getByRole("searchbox"), "Hettich");
    expect(screen.getByRole("option", { name: "Unavailable Brand" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Edit Century Green" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Edit selected brand/u })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Brands" })).not.toHaveTextContent("private-missing");
    await user.click(screen.getByRole("option", { name: "Unavailable Brand" }));
    expect(specificationsPayload()[0]).toMatchObject({ brandId: "brand-century" });
    expect(trigger).not.toHaveAttribute("aria-invalid");
  });

  it.each<KnowledgeJsonObject>([
    { brandId: "brand-century", brandIds: ["brand-hettich"] },
    { brandIds: ["brand-century", null] }
  ])("preserves malformed association evidence through unrelated edits until explicit repair: %j", async (association) => {
    const user = userEvent.setup();
    render(<Harness initialValue={[{ id: "spec-one", name: "Plywood", ...association }]} initialBrands={savedBrands} />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await user.type(screen.getByRole("textbox", { name: "Brief description" }), "Guidance");
    expect(specificationsPayload()[0]).toMatchObject({ ...association, description: "Guidance" });
    expect(screen.getByRole("button", { name: "Brands" })).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Brands" }));
    await user.click(screen.getByRole("option", { name: "Not configured" }));
    expect(specificationsPayload()[0]).not.toHaveProperty("brandId");
    expect(specificationsPayload()[0]).not.toHaveProperty("brandIds");
  });

  it("focuses indexed brand errors and closes an open picker when access becomes read-only", async () => {
    const user = userEvent.setup();
    const props = { value: [{ id: "spec-one", name: "Plywood", brandIds: ["brand-century", "brand-hettich"] }], brands: savedBrands, priceEntries: [], onDirty: vi.fn(), onChange: vi.fn(), validationAttempt: 1, issues: [{ path: "specifications.0.brandIds.1", message: "Brand needs correction." }] };
    const { rerender } = render(<KnowledgeSpecificationBuilder {...props} readOnly={false} />);
    const trigger = await screen.findByRole("button", { name: "Brands" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAccessibleDescription(expect.stringContaining("Brand needs correction."));
    await user.click(trigger);
    rerender(<KnowledgeSpecificationBuilder {...props} readOnly />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toBeDisabled();
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Century Green, Hettich");
    expect(trigger).toHaveAccessibleDescription("Brand needs correction. Century Green, Hettich");
    expect(screen.queryByRole("button", { name: "Add brand" })).not.toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
  });

});

describe("copy previous Specification on Add", () => {
  it("prefills the last named row in a new editable panel with a fresh identity", async () => {
    const user = userEvent.setup();
    const source = { id: "source-board", name: "Gypsum Board", brandIds: ["brand-hettich", "brand-century"],
      description: "Previous work guidance.", type: "text", value: "Hidden value" };
    const rows: KnowledgeJsonObject[] = [{ id: "earlier", name: "Earlier item", brandId: "brand-century" }, source, { id: "blank", name: "" }];
    const onValue = vi.fn();
    render(<Harness initialValue={rows} initialBrands={savedBrands} onValue={onValue}
      referencedSpecificationIds={[source.id]} priceEntries={[{ id: "price-source", specificationId: source.id }]} />);

    await user.click(screen.getByRole("button", { name: "Add Specification" }));

    const panel = screen.getByRole("dialog", { name: "Add Specification" });
    const name = within(panel).getByRole("textbox", { name: "Item name" });
    expect(name).toHaveValue("Gypsum Board");
    expect(name).toBeEnabled();
    expect(name).toHaveAccessibleDescription("Copied previous details. Choose a different item name before saving.");
    expect(within(panel).getByRole("button", { name: "Brands" })).toHaveTextContent("Hettich, Century Green");
    expect(within(panel).getByRole("button", { name: "Brands" })).toBeEnabled();
    expect(within(panel).getByRole("textbox", { name: "Brief description" })).toHaveValue("Previous work guidance.");
    const copy = specificationsPayload().at(-1)!;
    expect(copy).toEqual({ id: expect.stringMatching(/^knowledge-specification-/u), name: source.name,
      brandIds: source.brandIds, description: source.description });
    expect(copy.id).not.toBe(source.id);
    expect(specificationsPayload().slice(0, 3)).toEqual(rows);
    expect(brandsPayload()).toEqual(savedBrands);
    expect(onValue).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(name).toHaveFocus());
    expect((await axe.run(panel, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);

    await user.clear(name);
    await user.type(name, "Copied board");
    expect(name).not.toHaveAttribute("aria-invalid");
    await user.clear(within(panel).getByRole("textbox", { name: "Brief description" }));
    await user.click(within(panel).getByRole("button", { name: "Brands" }));
    await user.click(screen.getByRole("option", { name: "Not configured" }));
    await user.keyboard("{Escape}");
    await user.click(within(panel).getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Add Specification" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Edit Specification 4" }));
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("Copied board");
    expect(screen.getByRole("textbox", { name: "Brief description" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Not configured");
    expect(specificationsPayload()[1]).toEqual(source);
    expect(brandsPayload()).toEqual(savedBrands);
  });

  it("copies current unsaved details and an intentionally empty Brand selection", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={savedSpecifications} initialBrands={savedBrands}
      savedValue={savedSpecifications} savedBrands={savedBrands} />);
    await user.click(screen.getByRole("button", { name: "Edit Specification 2" }));
    const description = screen.getByRole("textbox", { name: "Brief description" });
    await user.clear(description);
    await user.type(description, "Unsaved hinge guidance.");
    await user.click(screen.getByRole("button", { name: "Brands" }));
    await user.click(screen.getByRole("option", { name: "Not configured" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("Hardware");
    expect(screen.getByRole("textbox", { name: "Brief description" })).toHaveValue("Unsaved hinge guidance.");
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Not configured");
    expect(specificationsPayload()[2]).not.toHaveProperty("brandId");
    expect(specificationsPayload()[2]).not.toHaveProperty("brandIds");
    expect(brandsPayload()).toEqual(savedBrands);
  });

  it("keeps blank Add available so an existing unnamed Brand can be repaired when no source exists", async () => {
    const user = userEvent.setup();
    const legacyBrands = [{ id: "legacy-brand", name: "" }];
    render(<Harness initialValue={[]} initialBrands={legacyBrands} />);
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    const panel = screen.getByRole("dialog", { name: "Add Specification" });
    expect(within(panel).getByRole("textbox", { name: "Item name" })).toHaveValue("");
    expect(within(panel).getByRole("button", { name: "Brands" })).toHaveTextContent("Not configured");
    expect(brandsPayload()).toEqual(legacyBrands);
    await user.click(within(panel).getByRole("button", { name: "Brands" }));
    await user.click(screen.getByRole("option", { name: "Unnamed Brand 1" }));
    await user.click(screen.getByRole("button", { name: "Edit selected brand Unnamed Brand 1" }));
    const brandDialog = screen.getByRole("dialog", { name: "Edit Brand" });
    await user.type(within(brandDialog).getByRole("textbox", { name: "Brand name" }), "Repaired Brand");
    await user.click(within(brandDialog).getByRole("button", { name: "Save" }));
    expect(brandsPayload()).toEqual([{ id: "legacy-brand", name: "Repaired Brand" }]);
    expect(specificationsPayload()[0]).toHaveProperty("brandId", "legacy-brand");
    expect(within(panel).getByRole("button", { name: "Brands" })).toHaveTextContent("Repaired Brand");
  });

  it.each([null, { id: "not-a-list" }] as KnowledgeJsonValue[])("preserves non-array Brands when no previous item exists: %j", async (brands) => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness initialValue={[]} initialBrands={brands} onValue={onValue} />);
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(onValue).not.toHaveBeenCalled();
    expect(brandsPayload()).toEqual(brands);
  });

  it.each([
    { label: "missing Brand", extra: { brandId: "missing" } },
    { label: "mixed associations", extra: { brandId: "brand-century", brandIds: ["brand-hettich"] } },
    { label: "non-string association", extra: { brandIds: [42] } },
    { label: "repeated association", extra: { brandIds: ["brand-century", "brand-century"] } },
    { label: "non-string description", extra: { description: 42 } },
    { label: "oversized description", extra: { description: "x".repeat(4_001) } },
    { label: "oversized name", extra: { name: "x".repeat(241) } },
    { label: "non-string name", extra: { name: 42 } },
    { label: "unknown property", extra: { unknown: "retain me" } }
  ] as { label: string; extra: KnowledgeJsonObject }[])("rejects $label in the previous source without copying an older row", async ({ extra }) => {
    const user = userEvent.setup();
    const rows: KnowledgeJsonObject[] = [{ id: "older", name: "Valid older item" },
      { id: "previous", name: "Previous item", ...extra }];
    const onValue = vi.fn();
    render(<Harness initialValue={rows} initialBrands={savedBrands} onValue={onValue} />);
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Review the previous item's details and Brands before adding a copy.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onValue).not.toHaveBeenCalled();
    expect(specificationsPayload()).toEqual(rows);
    expect(brandsPayload()).toEqual(savedBrands);
  });

  it.each([
    null,
    { id: "not-a-list" },
    [{ id: "brand-century", name: "" }],
    [{ id: "brand-century", name: "Century" }, { id: "brand-century", name: "Other" }]
  ] as KnowledgeJsonValue[])("does not replace invalid Brand definitions while copying: %j", async (brands) => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness initialValue={[{ id: "previous", name: "Previous item" }]} initialBrands={brands} onValue={onValue} />);
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Review the previous item's details");
    expect(onValue).not.toHaveBeenCalled();
    expect(brandsPayload()).toEqual(brands);
  });

  it("does not drop malformed specification rows when Add is requested", async () => {
    const user = userEvent.setup();
    const rows: KnowledgeJsonValue = [42, { id: "previous", name: "Previous item" }];
    const onValue = vi.fn();
    render(<Harness initialValue={rows} onValue={onValue} />);
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(onValue).not.toHaveBeenCalled();
    expect(specificationsPayload()).toEqual(rows);
  });

  it("uses the currently supplied scope after the caller changes Main Line or tier", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props: ComponentProps<typeof KnowledgeSpecificationBuilder> = {
      value: [{ id: "scope-first", name: "Signature board", brandId: "local-brand" }],
      brands: [{ id: "local-brand", name: "Signature brand" }],
      priceEntries: [], readOnly: false, onDirty: vi.fn(), onChange
    };
    const mounted = render(<KnowledgeSpecificationBuilder {...props} />);
    mounted.rerender(<KnowledgeSpecificationBuilder {...props}
      value={[{ id: "scope-second", name: "Functional board", brandId: "local-brand", description: "Functional guidance" }]}
      brands={[{ id: "local-brand", name: "Functional brand" }]} />);
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      specifications: [
        { id: "scope-second", name: "Functional board", brandId: "local-brand", description: "Functional guidance" },
        { id: expect.stringMatching(/^knowledge-specification-/u), name: "Functional board", brandId: "local-brand", description: "Functional guidance" }
      ], brands: [{ id: "local-brand", name: "Functional brand" }]
    });
  });

  it("keeps Add unavailable when the existing specification limit is reached", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness initialValue={Array.from({ length: 50 }, (_, index) => ({ id: `spec-${index}`, name: `Item ${index}` }))} onValue={onValue} />);
    const add = screen.getByRole("button", { name: "Add Specification" });
    expect(add).toBeDisabled();
    await user.click(add);
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

function renderPrefill({ metadata = { status: "ready", names: ["Gyproc", "Saint Gobain"] },
  brands = [{ id: "local-gyproc", name: "Gyproc", description: "Keep this detail" }],
  row = { id: "spec-prefill", name: "Before", description: "Keep this guidance" }, readOnly = false
}: { metadata?: KnowledgeSpecificationBrandPrefill | null; brands?: KnowledgeJsonValue; row?: KnowledgeJsonObject | null; readOnly?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onValue = vi.fn();
  const lookup: KnowledgeSpecificationItemNameLookup = { queryKey: knowledgeQueryKeys.specificationItemNameList,
    list: vi.fn(async () => ({ items: [{ name: "Gypsum Board", ...(metadata ? { brandPrefill: metadata } : {}) }],
      pagination: { offset: 0, limit: 20, total: 1, hasMore: false }, exactMatch: null, similarItems: [] })) };
  render(<QueryClientProvider client={client}><Harness initialValue={row ? [row] : []} initialBrands={brands} itemNameLookup={lookup} onValue={onValue} readOnly={readOnly} /></QueryClientProvider>);
  return { client, lookup, onValue, user: userEvent.setup() };
}

async function chooseSavedGypsum(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Item name" }));
  await user.click(await screen.findByRole("option", { name: "Gypsum Board" }));
}

describe("saved item Brand selection", () => {
  it("automatically selects saved Brands in a new Add Specification panel before Done", async () => {
    const { user, onValue } = renderPrefill({ row: null, brands: [] });
    await user.click(screen.getByRole("button", { name: "Add Specification" }));
    const panel = screen.getByRole("dialog", { name: "Add Specification" });
    const originalId = specificationsPayload()[0]!.id;
    expect(within(panel).getByRole("button", { name: "Brands" })).toHaveTextContent("Not configured");
    onValue.mockClear();

    await chooseSavedGypsum(user);

    expect(within(panel).getByRole("button", { name: "Item name" })).toHaveTextContent("Gypsum Board");
    expect(within(panel).getByRole("button", { name: "Brands" })).toHaveTextContent("Gyproc, Saint Gobain");
    expect(onValue).toHaveBeenCalledTimes(1);
    const imported = brandsPayload();
    expect(imported.map(brand => brand.name)).toEqual(["Gyproc", "Saint Gobain"]);
    expect(specificationsPayload()[0]).toEqual(expect.objectContaining({
      id: originalId, name: "Gypsum Board", brandIds: imported.map(brand => brand.id)
    }));
    await user.click(within(panel).getByRole("button", { name: "Done" }));
    expect(onValue).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Gyproc, Saint Gobain");
  });

  it("fills the screenshot's saved item Brands in one draft update and keeps a deliberate clear until reselection", async () => {
    const { user, onValue, client } = renderPrefill();
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await chooseSavedGypsum(user);
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Gyproc");
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Saint Gobain");
    const imported = brandsPayload().find(brand => brand.name === "Saint Gobain")!;
    expect(specificationsPayload()[0]).toEqual({ id: "spec-prefill", name: "Gypsum Board", description: "Keep this guidance", brandIds: ["local-gyproc", imported.id] });
    expect(brandsPayload()[0]).toEqual({ id: "local-gyproc", name: "Gyproc", description: "Keep this detail" });
    await user.click(screen.getByRole("button", { name: "Brands" }));
    await user.click(screen.getByRole("option", { name: "Not configured" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await client.invalidateQueries({ queryKey: knowledgeQueryKeys.specificationItemNames() });
    expect(screen.getByRole("button", { name: "Brands" })).toHaveTextContent("Not configured");
    await chooseSavedGypsum(user);
    expect(brandsPayload()).toHaveLength(2);
    expect(specificationsPayload()[0]?.brandIds).toEqual(["local-gyproc", imported.id]);
    expect((await axe.run(screen.getByRole("dialog", { name: "Edit Specification" }), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("preserves an existing Brand choice when selecting a different saved item", async () => {
    const { user } = renderPrefill({ row: { id: "spec-prefill", name: "Before", brandId: "local-gyproc" } });
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await chooseSavedGypsum(user);
    expect(specificationsPayload()[0]).toEqual({ id: "spec-prefill", name: "Gypsum Board", brandId: "local-gyproc" });
    expect(brandsPayload()).toHaveLength(1);
  });

  it.each([null, { status: "unavailable", reason: "invalid_source" }] as const)("shows incomplete saved metadata without inventing choices: %j", async metadata => {
    const { user } = renderPrefill({ metadata });
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await chooseSavedGypsum(user);
    expect(screen.getByRole("button", { name: "Brands" })).toHaveAccessibleDescription(expect.stringContaining("Saved Brands could not be filled"));
    expect(specificationsPayload()[0]?.name).toBe("Gypsum Board");
    expect(specificationsPayload()[0]).not.toHaveProperty("brandId");
    expect(brandsPayload()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Brands" }));
    await user.click(screen.getByRole("option", { name: "Gyproc" }));
    expect(screen.queryByText("Saved Brands could not be filled. Choose Brands manually.")).not.toBeInTheDocument();
  });

  it("keeps the entire prior draft when the complete Brand set will not fit", async () => {
    const { user, onValue } = renderPrefill({ brands: Array.from({ length: 200 }, (_, index) => ({ id: `brand-${index}`, name: `Existing ${index}` })) });
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await chooseSavedGypsum(user);
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Item name" })).toHaveTextContent("Before");
    expect(screen.getByRole("button", { name: "Brands" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Brands" })).toHaveAccessibleDescription(expect.stringContaining("200-Brand limit"));
    expect(brandsPayload()).toHaveLength(200);
  });

  it("does not read or prefill Brands from a read-only panel", async () => {
    const { user, onValue, lookup } = renderPrefill({ readOnly: true });
    await user.click(screen.getByRole("button", { name: "View Specification 1" }));
    expect(screen.getByRole("button", { name: "Item name" })).toBeDisabled();
    expect(lookup.list).not.toHaveBeenCalled();
    expect(onValue).not.toHaveBeenCalled();
  });
});

async function openAddBrand(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Brands" }));
  await user.click(screen.getByRole("button", { name: "Add brand" }));
  await screen.findByRole("dialog", { name: "Add Brand" });
}

function specificationsPayload(): Array<Record<string, unknown>> {
  return JSON.parse(screen.getByTestId("specifications-payload").textContent ?? "[]") as Array<Record<string, unknown>>;
}

function brandsPayload(): Array<Record<string, unknown>> {
  return JSON.parse(screen.getByTestId("brands-payload").textContent ?? "[]") as Array<Record<string, unknown>>;
}
