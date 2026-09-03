import { useState } from "react";
import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeSpecificationBuilder } from "./KnowledgeSpecificationBuilder";
import type { KnowledgeJsonValue } from "./knowledgeTypes";

function Harness({
  initialValue = [],
  priceEntries = [],
  referencedSpecificationIds = [],
  slabReferencedSpecificationIds = [],
  readOnly = false,
  onValue = vi.fn()
}: {
  readonly initialValue?: KnowledgeJsonValue;
  readonly priceEntries?: KnowledgeJsonValue;
  readonly referencedSpecificationIds?: readonly string[];
  readonly slabReferencedSpecificationIds?: readonly string[];
  readonly readOnly?: boolean;
  readonly onValue?: (value: readonly KnowledgeJsonValue[]) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <main>
      <KnowledgeSpecificationBuilder
        value={value}
        priceEntries={priceEntries}
        referencedSpecificationIds={referencedSpecificationIds}
        slabReferencedSpecificationIds={slabReferencedSpecificationIds}
        readOnly={readOnly}
        onDirty={() => undefined}
        onChange={(next) => {
          setValue(next);
          onValue(next);
        }}
      />
      <output data-testid="specifications-payload">{JSON.stringify(value)}</output>
    </main>
  );
}

const descriptiveSpecifications: KnowledgeJsonValue = [
  { id: "spec-plywood", name: "Plywood", description: "18 mm BWP-grade plywood." },
  { id: "spec-laminate", name: "Inner Laminate", description: "White matte internal faces." },
  { id: "spec-hardware", name: "Hardware", description: "Soft-close hinges." }
];

describe("KnowledgeSpecificationBuilder", () => {
  it("renders only descriptive Specification controls with accessible guidance", async () => {
    render(<Harness initialValue={descriptiveSpecifications} />);

    expect(screen.getAllByRole("textbox", { name: "Specification name" }))
      .toHaveLength(3);
    expect(screen.getAllByRole("textbox", { name: "Brief description" }))
      .toHaveLength(3);
    expect(screen.getByDisplayValue("Plywood")).toBeVisible();
    expect(screen.getByDisplayValue("Inner Laminate")).toBeVisible();
    expect(screen.getByDisplayValue("Hardware")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Component type" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Allowed options")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Plywood" }))
      .not.toBeInTheDocument();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("adds, edits, reorders, and removes descriptive rows without typed keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    for (const [name, description] of [
      ["Plywood", "18 mm BWP-grade plywood."],
      ["Inner Laminate", "White matte internal faces."],
      ["Hardware", ""]
    ] as const) {
      await user.click(screen.getByRole("button", { name: "Add Specification" }));
      const names = screen.getAllByRole("textbox", { name: "Specification name" });
      const descriptions = screen.getAllByRole("textbox", { name: "Brief description" });
      await user.type(names.at(-1)!, name);
      if (description) await user.type(descriptions.at(-1)!, description);
    }

    expect(payload()).toEqual([
      expect.objectContaining({ name: "Plywood", description: "18 mm BWP-grade plywood." }),
      expect.objectContaining({ name: "Inner Laminate", description: "White matte internal faces." }),
      expect.objectContaining({ name: "Hardware" })
    ]);
    expect(payload()[2]).not.toHaveProperty("description");
    for (const row of payload()) {
      expect(row).not.toHaveProperty("type");
      expect(row).not.toHaveProperty("options");
      expect(row).not.toHaveProperty("value");
    }

    await user.click(screen.getByRole("button", { name: "Move Specifications entry 3 up" }));
    await user.click(screen.getByRole("button", { name: "Remove Specifications entry 2" }));
    expect(payload().map((row) => row.name)).toEqual(["Plywood", "Inner Laminate"]);
  });

  it("preserves hidden typed compatibility fields through visible edits", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={[{
      id: "typed-spec",
      name: "Old name",
      description: "Old help",
      type: "dropdown",
      options: ["BWP", "BWR"],
      value: "BWP"
    }]} />);

    const name = screen.getByRole("textbox", { name: "Specification name" });
    const description = screen.getByRole("textbox", { name: "Brief description" });
    await user.clear(name);
    await user.type(name, "Plywood");
    await user.clear(description);
    await user.type(description, "Updated guidance");

    expect(payload()[0]).toEqual({
      id: "typed-spec",
      name: "Plywood",
      description: "Updated guidance",
      type: "dropdown",
      options: ["BWP", "BWR"],
      value: "BWP"
    });
    expect(screen.queryByRole("combobox", { name: "Component type" }))
      .not.toBeInTheDocument();
  });

  it("shows immutable-history guidance and prevents removing referenced rows", () => {
    render(<Harness
      initialValue={[{ id: "spec-history", name: "Historical plywood" }]}
      priceEntries={[{
        operation: "reference",
        priceVersion: { specificationId: "spec-history" }
      }]}
      referencedSpecificationIds={["spec-history"]}
    />);

    const remove = screen.getByRole("button", { name: "Remove Specifications entry 1" });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(
      "This Specification is retained by saved configuration or immutable price history and cannot be removed."
    );
    expect(screen.getByText(/saved configuration or immutable price history/u)).toBeVisible();
  });

  it("uses slab-specific guidance for live priced-slab references", () => {
    render(<Harness
      initialValue={[{ id: "spec-slab", name: "Slab plywood" }]}
      slabReferencedSpecificationIds={["spec-slab"]}
    />);

    const remove = screen.getByRole("button", { name: "Remove Specifications entry 1" });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(
      "Remove this Specification from Quantity slabs and save Quantity & margin before removing it from Budgeting."
    );
  });

  it("keeps descriptive values visible and disables controls in read-only mode", () => {
    render(<Harness initialValue={descriptiveSpecifications} readOnly />);

    const region = screen.getByRole("region", { name: "Specifications" });
    expect(within(region).queryByRole("button", { name: /Add|Move|Remove/u }))
      .not.toBeInTheDocument();
    for (const control of within(region).getAllByRole("textbox")) {
      expect(control).toBeDisabled();
    }
    expect(within(region).getByDisplayValue("Plywood")).toBeVisible();
  });
});

function payload(): Array<Record<string, unknown>> {
  return JSON.parse(
    screen.getByTestId("specifications-payload").textContent ?? "[]"
  ) as Array<Record<string, unknown>>;
}
