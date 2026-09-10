import { useState } from "react";
import axe from "axe-core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeModeConfigurationBuilder } from "./KnowledgeModeConfigurationBuilder";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

function Harness({ initial = {}, readOnly = false, onChange = vi.fn() }: {
  initial?: KnowledgeJsonObject;
  readOnly?: boolean;
  onChange?: (payload: KnowledgeJsonObject) => void;
}) {
  const [payload, setPayload] = useState(initial);
  return <main><KnowledgeModeConfigurationBuilder payload={payload} mainLineName="TV Unit" modes={[]}
    readOnly={readOnly} validationAttempt={0} onDirty={vi.fn()} onValidationChange={vi.fn()}
    onChange={(next) => { setPayload(next); onChange(next); }}
  /></main>;
}

const generated = "Providing, Supplying, Fixing, testing and commissioning of TV Unit, inclusions none and exclusions none.";

describe("shared Mode paragraph", () => {
  it("generates one paragraph from independent checklist selections for either or both Modes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText(generated)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    for (const list of ["Inclusions", "Exclusions"]) {
      await user.click(within(screen.getByRole("group", { name: list })).getByRole("checkbox", { name: "Transport" }));
    }
    const expected = generated.replace("inclusions none and exclusions none", "inclusions Transport and exclusions Transport");
    expect(screen.getByText(expected)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getByText(expected)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getAllByText(expected)).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Edit Mode paragraph" })).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.getByText(expected)).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "In-house" }));
    expect(screen.getByText(expected)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getByText(expected)).not.toBeVisible();
  });

  it("cancels edits and keeps custom wording synchronized with checkbox selections after save and reload", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    const text = screen.getByRole("textbox", { name: "Mode paragraph" });
    expect(text).toHaveFocus();
    expect(text).toHaveValue(generated);
    await user.clear(text);
    await user.type(text, "Cancelled wording");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(generated)).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit Mode paragraph" })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    const nextText = screen.getByRole("textbox", { name: "Mode paragraph" });
    await user.clear(nextText);
    await user.type(nextText, "Custom work for both Modes.\nKeep this wording.");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("textbox", { name: "Mode paragraph" })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ modeDescription: "Custom work for both Modes.\nKeep this wording." });
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Shifting" }));
    expect(screen.getByText("Custom work for both Modes. Keep this wording. Inclusions: Shifting.")).toBeVisible();
    const saved = onChange.mock.calls.at(-1)![0] as KnowledgeJsonObject;
    view.unmount();
    render(<Harness initial={saved} readOnly />);
    expect(screen.getByText("Custom work for both Modes. Keep this wording. Inclusions: Shifting.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit Mode paragraph" })).not.toBeInTheDocument();
  });

  it("keeps checked items in the live preview during typing, deletion, and saving", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    for (const list of ["Inclusions", "Exclusions"]) {
      await user.click(within(screen.getByRole("group", { name: list })).getByRole("checkbox", { name: "Transport" }));
    }
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    const text = screen.getByRole("textbox", { name: "Mode paragraph" });
    const preview = screen.getByRole("region", { name: "Paragraph preview" });
    await user.clear(text);
    expect(text).toHaveValue("");
    expect(preview).toHaveTextContent("Inclusions: Transport. Exclusions: Transport.");
    await user.type(text, "Custom fixing. Inclusions: none. Exclusions: none.");
    expect(text).toHaveFocus();
    expect(preview).toHaveTextContent("Custom fixing. Inclusions: Transport. Exclusions: Transport.");
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Shifting" }));
    expect(preview).toHaveTextContent("Custom fixing. Inclusions: Shifting. Exclusions: Transport.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const expected = "Custom fixing. Inclusions: Shifting. Exclusions: Transport.";
    expect(screen.getByText(expected)).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ modeDescription: expected }));
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    expect(screen.getByRole("textbox", { name: "Mode paragraph" })).toHaveValue(expected);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getAllByText(expected)).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.getAllByText(expected)).toHaveLength(1);
    expect(screen.getByText(expected)).toBeVisible();
  });

  it("validates the complete paragraph length after inserting selected items", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    const text = screen.getByRole("textbox", { name: "Mode paragraph" });
    fireEvent.change(text, { target: { value: "a".repeat(3_995) } });
    onChange.mockClear();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(text).toHaveAttribute("aria-invalid", "true");
    expect(text).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects blank edits and supports cancelling with Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    const text = screen.getByRole("textbox", { name: "Mode paragraph" });
    expect(text).toHaveAttribute("maxlength", "4000");
    await user.clear(text);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(text).toHaveAttribute("aria-invalid", "true");
    expect(text).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByText(generated)).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("labels the shared paragraph in conflict review", () => {
    render(<KnowledgeConflictReview sectionKey="advanced" payload={{ modeDescription: "Server wording" }}
      localVersion={1} serverVersion={2} masters={{}} relationshipBaskets={[]} relationshipItems={[]}
    />);
    expect(screen.getByText("Mode paragraph").nextElementSibling).toHaveTextContent("Server wording");
  });
});
