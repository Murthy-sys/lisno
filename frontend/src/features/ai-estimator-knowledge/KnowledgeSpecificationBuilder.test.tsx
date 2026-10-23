import { useState, type ComponentProps } from "react";
import axe from "axe-core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  KnowledgeSpecificationBuilder,
  type KnowledgeSpecificationChange
} from "./KnowledgeSpecificationBuilder";
import {
  KNOWLEDGE_MAX_BRANDS,
  type KnowledgeSpecificationIssue
} from "./knowledgeSpecificationConfiguration";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

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
  readonly onValue?: (value: KnowledgeSpecificationChange) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [brands, setBrands] = useState(initialBrands);
  return (
    <main>
      <KnowledgeSpecificationBuilder
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
