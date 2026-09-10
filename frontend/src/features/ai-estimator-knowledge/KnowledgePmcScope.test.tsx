import { useState } from "react";
import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeModeConfigurationBuilder } from "./KnowledgeModeConfigurationBuilder";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import { parseKnowledgeModeConfigurations, withKnowledgeModeConfigurations } from "./knowledgeModeConfiguration";
import { projectKnowledgeOverviewSummary } from "./knowledgeOverviewSummary";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

function Harness({ initial = {}, readOnly = false, onChange = vi.fn() }: {
  initial?: KnowledgeJsonObject;
  readOnly?: boolean;
  onChange?: (payload: KnowledgeJsonObject) => void;
}) {
  const [payload, setPayload] = useState(initial);
  return <main><KnowledgeModeConfigurationBuilder
    mainLineName="Wall panelling"
    payload={payload} modes={[]} readOnly={readOnly} validationAttempt={0}
    onChange={(next) => { setPayload(next); onChange(next); }}
    onDirty={vi.fn()} onValidationChange={vi.fn()}
  /></main>;
}

const saved: KnowledgeJsonObject = { modeConfigurations: [{
  id: "pmc-saved", modeKind: "pmc", fields: [],
  inclusions: [{ id: "transport-in", name: "Transport", selected: true }],
  exclusions: [{ id: "transport-out", name: "Transport", selected: true }, { id: "custom", name: "Night unloading", selected: false }]
}] };

describe("Sub-Vendor Inclusions and Exclusions", () => {
  it("keeps the lists out of PMC and In-house while retaining Sub-Vendor selections across Mode switches", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByRole("region", { name: "PMC components" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    expect(screen.queryByText("No components configured for PMC.")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getByRole("region", { name: "Sub-Vendor scope" })).toBeVisible();
    for (const title of ["Inclusions", "Exclusions"]) {
      const list = screen.getByRole("group", { name: title });
      const boxes = within(list).getAllByRole("checkbox");
      expect(boxes).toHaveLength(6);
      for (const name of ["Transport", "Shifting", "Unloading", "ESIC/ PF", "Mathadi", "Damage during"]) {
        expect(within(list).getByRole("checkbox", { name })).not.toBeChecked();
      }
      await user.click(within(list).getByRole("checkbox", { name: "Transport" }));
    }
    expect(onChange).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.getByRole("button", { name: "Add component" })).toBeEnabled();
    for (const title of ["Inclusions", "Exclusions"]) {
      expect(within(screen.getByRole("group", { name: title })).getByRole("checkbox", { name: "Transport" })).toBeChecked();
    }
    await user.click(screen.getByRole("radio", { name: "In-house" }));
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.getByRole("checkbox", { name: "PMC" })).toBeChecked();
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Sub-Vendor" }));
    expect(screen.getAllByRole("group", { name: "Inclusions" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Exclusions" })).toHaveLength(1);
    for (const title of ["Inclusions", "Exclusions"]) {
      expect(within(screen.getByRole("group", { name: title })).getByRole("checkbox", { name: "Transport" })).toBeChecked();
    }
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("adds custom entries independently, supports Enter, and rejects blanks and duplicates within a list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    for (const singular of ["Inclusion", "Exclusion"]) {
      const list = screen.getByRole("group", { name: `${singular}s` });
      expect(within(list).queryByRole("textbox")).not.toBeInTheDocument();
      await user.click(within(list).getByRole("button", { name: `Add ${singular}` }));
      const name = within(list).getByRole("textbox", { name: `${singular} name` });
      expect(name).toHaveFocus();
      await user.click(within(list).getByRole("button", { name: "Save" }));
      expect(name).toHaveAttribute("aria-invalid", "true");
      await user.type(name, "Night unloading{Enter}");
      expect(within(list).getByRole("checkbox", { name: "Night unloading" })).not.toBeChecked();
      expect(within(list).queryByRole("textbox")).not.toBeInTheDocument();
      expect(within(list).getByRole("button", { name: `Add ${singular}` })).toHaveFocus();
      await user.click(within(list).getByRole("button", { name: `Add ${singular}` }));
      const nextName = within(list).getByRole("textbox", { name: `${singular} name` });
      expect(nextName).toHaveValue("");
      await user.type(nextName, " NIGHT   UNLOADING ");
      await user.click(within(list).getByRole("button", { name: "Save" }));
      expect(nextName).toHaveAccessibleDescription(`This ${singular.toLowerCase()} already exists.`);
      expect(within(list).getAllByRole("checkbox")).toHaveLength(7);
    }
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("opens each add form independently and cancels without changing the checklists", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    const inclusions = screen.getByRole("group", { name: "Inclusions" });
    const exclusions = screen.getByRole("group", { name: "Exclusions" });
    await user.click(within(inclusions).getByRole("button", { name: "Add Inclusion" }));
    expect(within(exclusions).queryByRole("textbox")).not.toBeInTheDocument();
    await user.type(within(inclusions).getByRole("textbox", { name: "Inclusion name" }), "Temporary name");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(within(inclusions).getByRole("button", { name: "Cancel" }));
    expect(within(inclusions).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(inclusions).getByRole("button", { name: "Add Inclusion" })).toHaveFocus();
    await user.click(within(inclusions).getByRole("button", { name: "Add Inclusion" }));
    const name = within(inclusions).getByRole("textbox", { name: "Inclusion name" });
    expect(name).toHaveValue("");
    await user.type(name, "Another name{Escape}");
    expect(within(inclusions).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(inclusions).getAllByRole("checkbox")).toHaveLength(6);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reopens saved checklists and disables authoring for read-only revisions", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={saved} readOnly onChange={onChange} />);
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getAllByRole("checkbox", { name: "Transport" }).every((box) => (box as HTMLInputElement).checked)).toBe(true);
    for (const box of within(screen.getByRole("region", { name: "Sub-Vendor scope" })).getAllByRole("checkbox")) {
      expect(box).toBeDisabled();
      await user.click(box);
    }
    expect(screen.queryByRole("button", { name: "Add Inclusion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Exclusion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete (inclusion|exclusion) / })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    for (const title of ["Inclusions", "Exclusions"]) {
      for (const box of within(screen.getByRole("group", { name: title })).getAllByRole("checkbox")) expect(box).toBeDisabled();
    }
    expect(screen.queryByRole("button", { name: "Add Inclusion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Exclusion" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["inclusion", "exclusion"] as const)("deletes default %s entries independently and moves keyboard focus to another row", async (kind) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    const chosen = screen.getByRole("group", { name: kind === "inclusion" ? "Inclusions" : "Exclusions" });
    const other = screen.getByRole("group", { name: kind === "inclusion" ? "Exclusions" : "Inclusions" });
    const remove = within(chosen).getByRole("button", { name: `Delete ${kind} Transport` });
    remove.focus();
    await user.keyboard("{Enter}");
    expect(within(chosen).queryByRole("checkbox", { name: "Transport" })).not.toBeInTheDocument();
    expect(within(other).getByRole("checkbox", { name: "Transport" })).not.toBeChecked();
    expect(within(chosen).getByRole("button", { name: `Delete ${kind} Shifting` })).toHaveFocus();
    await user.click(within(chosen).getByRole("button", { name: `Delete ${kind} Damage during` }));
    expect(within(chosen).getByRole("button", { name: `Delete ${kind} Mathadi` })).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(within(chosen).getAllByRole("checkbox")).toHaveLength(4);
    expect(within(other).getAllByRole("checkbox")).toHaveLength(6);
  });

  it("keeps a deleted last item absent on reload and preserves the other list and stable IDs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(<Harness initial={saved} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    const inclusions = screen.getByRole("group", { name: "Inclusions" });
    await user.click(within(inclusions).getByRole("button", { name: "Delete inclusion Transport" }));
    expect(within(inclusions).getByText("No inclusions added.")).toBeVisible();
    expect(within(inclusions).getByRole("button", { name: "Add Inclusion" })).toHaveFocus();
    const next = onChange.mock.calls.at(-1)![0] as KnowledgeJsonObject;
    expect(next.modeConfigurations).toEqual([{ ...(saved.modeConfigurations as KnowledgeJsonObject[])[0], inclusions: [] }]);
    view.unmount();
    render(<Harness initial={next} readOnly />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(within(screen.getByRole("group", { name: "Inclusions" })).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Exclusions" })).getByRole("checkbox", { name: "Transport" })).toBeChecked();
  });

  it.each(["Save", "Cancel"] as const)("clears deleted custom entries from an open paragraph and supports %s", async (action) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initial = { modeDescription: "Custom installation. Inclusions: Lift service, Night unloading. Exclusions: Lift service.",
      modeConfigurations: [{ id: "pmc-custom", modeKind: "pmc", fields: [],
        inclusions: [{ id: "lift-in", name: "Lift service", selected: true }, { id: "night-in", name: "Night unloading", selected: true }],
        exclusions: [{ id: "lift-out", name: "Lift service", selected: true }]
      }] };
    render(<Harness initial={initial} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    const text = screen.getByRole("textbox", { name: "Mode paragraph" });
    await user.type(text, " Keep this edit.");
    await user.click(screen.getByRole("button", { name: "Delete inclusion Lift service" }));
    expect(screen.getByRole("region", { name: "Paragraph preview" }))
      .toHaveTextContent("Custom installation. Inclusions: Night unloading. Exclusions: Lift service. Keep this edit.");
    await user.click(screen.getByRole("button", { name: "Delete inclusion Night unloading" }));
    const expected = "Custom installation. Inclusions: none. Exclusions: Lift service.";
    expect(text).toHaveValue(`${expected} Keep this edit.`);
    expect(screen.getByRole("region", { name: "Paragraph preview" })).toHaveTextContent(`${expected} Keep this edit.`);
    await user.click(screen.getByRole("button", { name: action }));
    const savedDescription = action === "Save" ? `${expected} Keep this edit.` : expected;
    expect(screen.getByText(savedDescription)).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ modeDescription: savedDescription }));
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("preserves saved PMC components when editing the visible checklists", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [{ id: "legacy-field", type: "text", label: "Saved PMC input", options: [], value: "Retained value" }];
    render(<Harness initial={{ modeConfigurations: [{ id: "pmc", modeKind: "pmc", fields }] }} onChange={onChange} />);
    expect(screen.queryByRole("region", { name: "PMC components" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Component label" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ modeConfigurations: [expect.objectContaining({ fields })] }));
  });

  it("preserves checklist IDs and checkbox states through serialization and Overview projection", () => {
    const parsed = parseKnowledgeModeConfigurations(saved.modeConfigurations);
    expect(parsed.issues).toEqual([]);
    expect(withKnowledgeModeConfigurations({}, parsed.configurations)).toEqual(saved);
    const summary = projectKnowledgeOverviewSummary({ sections: { advanced: saved }, masters: {} });
    expect(summary.modeOptions).toEqual([expect.objectContaining({ id: "pmc", label: "PMC" })]);
    expect(summary.modeDetails[0]?.pmcScope).toEqual({
      inclusions: [{ id: "transport-in", name: "Transport", selected: true }],
      exclusions: [{ id: "transport-out", name: "Transport", selected: true }, { id: "custom", name: "Night unloading", selected: false }]
    });
  });

  it("shows saved checklist names and states during conflict review", () => {
    render(<KnowledgeConflictReview
      sectionKey="advanced" localVersion={2} serverVersion={3} payload={saved}
      masters={{}} relationshipBaskets={[]} relationshipItems={[]}
    />);
    expect(screen.getByText("PMC · Inclusion · Transport").nextElementSibling).toHaveTextContent("Selected");
    expect(screen.getByText("PMC · Exclusion · Transport").nextElementSibling).toHaveTextContent("Selected");
    expect(screen.getByText("PMC · Exclusion · Night unloading").nextElementSibling).toHaveTextContent("Not selected");
    expect(document.body).not.toHaveTextContent("transport-in");
  });
});
