import axe from "axe-core";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeSurfaceMultiSelect } from "./KnowledgeSurfaceMultiSelect";
import type { KnowledgeMaster, KnowledgeMasterStatus } from "./knowledgeTypes";

const floor = surface("surface-floor", "Floor", 10);
const wall = surface("surface-wall", "Wall", 20);
const ceiling = surface(
  "surface-ceiling",
  "Ceiling finish with a deliberately long presentation label that must remain fully readable",
  30
);

function ControlledSurfaces({
  initialSelectedIds = [],
  masters = [wall, ceiling, floor],
  label,
  placeholder,
  searchable = false,
  describedBy,
  invalid = false,
  disabled = false,
  readOnly = false,
  onChange = vi.fn()
}: {
  readonly initialSelectedIds?: readonly string[];
  readonly masters?: readonly KnowledgeMaster[];
  readonly label?: string;
  readonly placeholder?: string;
  readonly searchable?: boolean;
  readonly describedBy?: string;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly onChange?: (selectedIds: readonly string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);

  return (
    <KnowledgeSurfaceMultiSelect
      selectedIds={selectedIds}
      masters={masters}
      label={label}
      placeholder={placeholder}
      searchable={searchable}
      describedBy={describedBy}
      invalid={invalid}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(nextSelectedIds) => {
        setSelectedIds([...nextSelectedIds]);
        onChange(nextSelectedIds);
      }}
    />
  );
}

describe("KnowledgeSurfaceMultiSelect", () => {
  it("selects and deselects without modifier keys and returns IDs in normalized-name order", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledSurfaces onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Surfaces" });
    expect(trigger).toHaveAccessibleName("Surfaces");
    expect(trigger).toHaveAccessibleDescription("Not configured");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    const listbox = screen.getByRole("listbox", { name: "Surface options" });
    expect(listbox).toHaveAttribute("aria-multiselectable", "true");
    expect(trigger).toHaveAttribute("aria-controls", listbox.id);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      ceiling.name,
      "Floor",
      "Wall"
    ]);

    await user.click(screen.getByRole("option", { name: "Wall" }));
    expect(onChange).toHaveBeenLastCalledWith([wall.id]);
    expect(screen.getByRole("option", { name: "Wall" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(trigger).toHaveAccessibleDescription("Wall");

    await user.click(screen.getByRole("option", { name: "Floor" }));
    expect(onChange).toHaveBeenLastCalledWith([floor.id, wall.id]);
    expect(trigger).toHaveAccessibleDescription("Floor, Wall");

    await user.click(screen.getByRole("option", { name: "Wall" }));
    expect(onChange).toHaveBeenLastCalledWith([floor.id]);
    expect(screen.getByRole("option", { name: "Wall" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("retains selected inactive and unresolved values while excluding inactive unselected values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const inactiveWall = { ...wall, status: "inactive" as const };
    const inactiveRoof = surface("surface-roof", "Roof", 40, "inactive");
    const missingSurfaceId = "surface-missing";
    render(
      <ControlledSurfaces
        initialSelectedIds={[missingSurfaceId, inactiveWall.id]}
        masters={[inactiveRoof, inactiveWall, floor]}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole("button", { name: "Surfaces" });
    expect(trigger).toHaveAccessibleDescription("Wall, Unavailable value");
    expect(document.body).not.toHaveTextContent(missingSurfaceId);
    await user.click(trigger);

    expect(screen.queryByRole("option", { name: "Roof (Inactive)" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Wall (Inactive)" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const unavailable = screen.getByRole("option", { name: "Unavailable value" });
    expect(unavailable).toHaveAttribute("aria-selected", "true");
    expect(unavailable).toHaveAttribute("aria-disabled", "true");

    await user.click(screen.getByRole("option", { name: "Floor" }));
    expect(onChange).toHaveBeenLastCalledWith([floor.id, inactiveWall.id, missingSurfaceId]);
    expect(document.body).not.toHaveTextContent(missingSurfaceId);

    await user.click(screen.getByRole("option", { name: "Wall (Inactive)" }));
    expect(onChange).toHaveBeenLastCalledWith([floor.id, missingSurfaceId]);
    expect(screen.queryByRole("option", { name: "Wall (Inactive)" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unavailable value" })).toBeInTheDocument();
  });

  it("prevents disabled and read-only mutation while retaining readable values", async () => {
    const user = userEvent.setup();
    const disabledChange = vi.fn();
    const { rerender } = render(
      <ControlledSurfaces disabled onChange={disabledChange} />
    );

    const disabledTrigger = screen.getByRole("button", { name: "Surfaces" });
    expect(disabledTrigger).toBeDisabled();
    await user.click(disabledTrigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(disabledChange).not.toHaveBeenCalled();

    const readOnlyChange = vi.fn();
    rerender(
      <ControlledSurfaces
        key="read-only"
        initialSelectedIds={[ceiling.id]}
        readOnly
        onChange={readOnlyChange}
      />
    );
    const readOnlyTrigger = screen.getByRole("button", { name: "Surfaces" });
    expect(readOnlyTrigger).toHaveAccessibleDescription(ceiling.name);
    expect(readOnlyTrigger).not.toBeDisabled();

    await user.click(readOnlyTrigger);
    const longOption = screen.getByRole("option", { name: ceiling.name });
    expect(longOption).toHaveAttribute("aria-selected", "true");
    expect(longOption).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-readonly", "true");
    await user.click(longOption);
    expect(readOnlyChange).not.toHaveBeenCalled();
  });

  it("supports keyboard disclosure, selection, focus movement, Escape, Tab, and outside close", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ControlledSurfaces />
        <button type="button">Outside action</button>
      </>
    );

    await user.tab();
    const trigger = screen.getByRole("button", { name: "Surfaces" });
    expect(trigger).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    const ceilingOption = screen.getByRole("option", { name: ceiling.name });
    expect(ceilingOption).toHaveFocus();
    await user.keyboard(" ");
    expect(ceilingOption).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    const floorOption = screen.getByRole("option", { name: "Floor" });
    expect(floorOption).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(floorOption).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(screen.getByRole("option", { name: "Wall" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(ceilingOption).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: ceiling.name })).toHaveFocus();
    await user.keyboard("{Escape}");

    await user.click(trigger);
    expect(screen.getByRole("option", { name: ceiling.name })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Outside action" })).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside action" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows an explicit empty summary and empty option state", async () => {
    const user = userEvent.setup();
    render(<ControlledSurfaces masters={[]} />);

    const trigger = screen.getByRole("button", { name: "Surfaces" });
    expect(trigger).toHaveAccessibleDescription("Not configured");
    await user.click(trigger);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No surfaces have been added.");
    expect(trigger).toHaveAttribute("aria-controls", status.id);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    const results = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
        "region": { enabled: false }
      }
    });
    expect(results.violations).toEqual([]);
  });

  it("has no automated semantic accessibility violations when expanded", async () => {
    const user = userEvent.setup();
    render(<main><ControlledSurfaces initialSelectedIds={[wall.id]} /></main>);

    await user.click(screen.getByRole("button", { name: "Surfaces" }));
    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });

    expect(results.violations).toEqual([]);
  });

  it("supports searchable Surface summaries without exposing stable IDs", async () => {
    const user = userEvent.setup();
    const counter = surface("surface-counter", "Counter surface", 1);
    render(
      <ControlledSurfaces
        initialSelectedIds={[counter.id]}
        masters={[counter, wall]}
        label="Applicable surfaces"
        placeholder="Select surfaces"
        searchable
      />
    );

    const trigger = screen.getByRole("button", { name: "Applicable surfaces" });
    expect(trigger).toHaveAccessibleDescription("Counter surface");
    expect(document.body).not.toHaveTextContent(counter.id);
    await user.click(trigger);

    const search = screen.getByRole("searchbox", { name: "Search surfaces" });
    expect(search).toHaveFocus();
    await user.type(search, "wall");
    expect(screen.getByRole("option", { name: "Wall" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Counter surface/u })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "nothing here");
    expect(screen.getByRole("status")).toHaveTextContent("No surfaces match your search.");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("option", { name: "Counter surface" })).toBeVisible();
  });

  it("associates an external validation message with the trigger", () => {
    render(
      <>
        <p id="surface-error">Choose at least one Surface.</p>
        <ControlledSurfaces describedBy="surface-error" invalid />
      </>
    );

    const trigger = screen.getByRole("button", { name: "Surfaces" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger.getAttribute("aria-describedby")?.split(" ")).toContain("surface-error");
    expect(trigger).toHaveAccessibleDescription(/Choose at least one Surface\./u);
  });
});

function surface(
  id: string,
  name: string,
  displayOrder: number,
  status: KnowledgeMasterStatus = "active"
): KnowledgeMaster {
  return {
    id,
    masterType: "surfaces",
    code: id,
    name,
    description: null,
    displayOrder,
    status,
    version: 1,
    createdById: "actor-created",
    updatedById: "actor-updated",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z"
  };
}
