import { useState } from "react";
import axe from "axe-core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeModeConfigurationBuilder } from "./KnowledgeModeConfigurationBuilder";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import { KnowledgeModeDescriptionEditor } from "./KnowledgeModeDescriptionEditor";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

const savedLists: KnowledgeJsonObject = { modeConfigurations: [{ id: "saved-scope", modeKind: "pmc", fields: [],
  inclusions: [{ id: "transport-in", name: "Transport", selected: false }, { id: "shifting-in", name: "Shifting", selected: false }],
  exclusions: [{ id: "unloading-out", name: "Unloading", selected: false }]
}] };

function Harness({ initial = savedLists, readOnly = false, onChange = vi.fn(), onDirty = vi.fn(), presentation, onSaveDescription }: {
  initial?: KnowledgeJsonObject;
  readOnly?: boolean;
  onChange?: (payload: KnowledgeJsonObject) => void;
  onDirty?: () => void;
  presentation?: "standard" | "inline";
  onSaveDescription?: (value: string) => Promise<boolean>;
}) {
  const [payload, setPayload] = useState(initial);
  return <main><KnowledgeModeConfigurationBuilder payload={payload} mainLineName="TV Unit" modes={[]}
    basketContext={{ basketId: "basket-carpentry", basketName: "Carpentry" }}
    readOnly={readOnly} validationAttempt={0} onDirty={onDirty} onValidationChange={vi.fn()}
    descriptionPresentation={presentation} onSaveDescription={onSaveDescription}
    onChange={(next) => { setPayload(next); onChange(next); }}
  /></main>;
}

const generated = "Providing, Supplying, Fixing, testing and commissioning of TV Unit, inclusions none and exclusions none.";

function InlineHarness({ initial = "", readOnly = false, onSave = vi.fn(), onPending = vi.fn() }: {
  initial?: string; readOnly?: boolean; onSave?: (value: string) => void; onPending?: (pending: boolean) => void;
}) {
  const [description, setDescription] = useState(initial);
  return <main><KnowledgeModeDescriptionEditor presentation="inline" description={description}
    readOnly={readOnly} validationAttempt={0} onPendingChange={onPending}
    onSave={(value) => { setDescription(value); onSave(value); }} /></main>;
}

function AsyncInlineHarness({ onSave, onPending = vi.fn() }: {
  onSave: (value: string) => Promise<boolean>; onPending?: (pending: boolean) => void;
}) {
  const [description, setDescription] = useState("Previous saved description");
  return <KnowledgeModeDescriptionEditor presentation="inline" description={description}
    readOnly={false} validationAttempt={0} onPendingChange={onPending}
    onSave={async (value) => {
      if (!await onSave(value)) return false;
      setDescription(value);
      return true;
    }} />;
}

describe("inline tier description", () => {
  it("waits for acknowledgement, prevents duplicate saves and keeps the entered text pending", async () => {
    let resolveSave!: (saved: boolean) => void;
    const response = new Promise<boolean>((resolve) => { resolveSave = resolve; });
    const onSave = vi.fn(() => response);
    const onPending = vi.fn();
    render(<AsyncInlineHarness onSave={onSave} onPending={onPending} />);
    const input = screen.getByRole("textbox", { name: "Description" });
    fireEvent.change(input, { target: { value: "Signature description" } });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Signature description");
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(input).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.change(input, { target: { value: "Unsubmitted replacement" } });
    expect(input).toHaveValue("Signature description");
    expect(onPending).toHaveBeenLastCalledWith(true);
    await act(async () => { resolveSave(true); });
    expect(input).toHaveValue("Signature description");
    expect(input).not.toHaveAttribute("readonly");
    expect(input).toHaveFocus();
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(save).not.toHaveAttribute("aria-busy");
  });

  it.each(["false", "rejection"])("retains text after a %s response and supports retry and explicit clearing", async (failure) => {
    const user = userEvent.setup();
    const onSave = vi.fn<(value: string) => Promise<boolean>>();
    if (failure === "false") onSave.mockResolvedValueOnce(false);
    else onSave.mockRejectedValueOnce(new Error("Request failed"));
    onSave.mockResolvedValue(true);
    const onPending = vi.fn();
    render(<AsyncInlineHarness onSave={onSave} onPending={onPending} />);
    const input = screen.getByRole("textbox", { name: "Description" });
    fireEvent.change(input, { target: { value: "Premium description" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(input).toHaveValue("Premium description");
    expect(input).toHaveFocus();
    expect(onPending).toHaveBeenLastCalledWith(true);
    expect(screen.getByText("Unable to save the description. Please try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Unable to save the description. Please try again.")).not.toBeInTheDocument();
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenLastCalledWith("");
    expect(input).toHaveValue("");
    expect(onPending).toHaveBeenLastCalledWith(false);
  });

  it("delegates an inline Save directly to persistence without changing the local draft", async () => {
    const user = userEvent.setup();
    const onSaveDescription = vi.fn().mockResolvedValue(false);
    const onDirty = vi.fn();
    const onChange = vi.fn();
    render(<Harness presentation="inline" onSaveDescription={onSaveDescription} onDirty={onDirty} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "Functional description" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveDescription).toHaveBeenCalledExactlyOnceWith("Functional description");
    expect(onDirty).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Functional description");
  });

  it("keeps the synchronous local draft callback when no inline persistence callback is supplied", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDirty = vi.fn();
    render(<Harness presentation="inline" onChange={onChange} onDirty={onDirty} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "Local description" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modeDescription: "Local description" }));
    expect(onDirty).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Local description");
  });

  it("shows one textarea immediately without stealing focus or marking the draft dirty", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onPending = vi.fn();
    render(<InlineHarness initial="Previously saved wording" onSave={onSave} onPending={onPending} />);
    const input = screen.getByRole("textbox", { name: "Description" });
    expect(input).toHaveValue("Previously saved wording");
    expect(input).not.toHaveFocus();
    expect(screen.queryByRole("button", { name: "Edit Description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Description preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "Signature work\nSecond line");
    expect(onPending).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Signature work\nSecond line");
    expect(screen.getByRole("textbox", { name: "Description" })).toBe(input);
    expect(input).toHaveValue("Signature work\nSecond line");
    expect(input).toHaveFocus();
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("restores saved text on Cancel and Escape, including newly saved text and explicit clearing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<InlineHarness initial="Premium wording" onSave={onSave} />);
    const input = screen.getByRole("textbox", { name: "Description" });
    await user.clear(input);
    await user.type(input, "Cancelled wording");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(input).toHaveValue("Premium wording");
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "Another cancelled value");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("Premium wording");
    expect(onSave).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "New premium wording");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("New premium wording");
    await user.clear(input);
    await user.type(input, "Cancelled replacement");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(input).toHaveValue("New premium wording");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith("");
    expect(input).toBeVisible();
    expect(input).toHaveValue("");
  });

  it("rejects oversized text and leaves unchanged wording out of the save flow", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onPending = vi.fn();
    render(<InlineHarness initial="Functional wording" onSave={onSave} onPending={onPending} />);
    const input = screen.getByRole("textbox", { name: "Description" });
    fireEvent.change(input, { target: { value: " Functional wording " } });
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(input).toHaveValue("Functional wording");
    fireEvent.change(input, { target: { value: "a".repeat(4_001) } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps read-only tier text readable with no enabled edit actions", () => {
    render(<InlineHarness initial={"Saved specification\nSecond line"} readOnly />);
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Saved specification\nSecond line");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("retains saved wording when editable or read-only tiers reopen without making a write", () => {
    const onSave = vi.fn();
    const onPending = vi.fn();
    const view = render(<InlineHarness initial="Saved tier wording" onSave={onSave} onPending={onPending} />);
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Saved tier wording");
    view.rerender(<InlineHarness initial="Saved tier wording" readOnly onSave={onSave} onPending={onPending} />);
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Saved tier wording");
    view.unmount();
    render(<InlineHarness initial="Saved tier wording" onSave={onSave} onPending={onPending} />);
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Saved tier wording");
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("shared Mode paragraph", () => {
  it("starts empty and keeps checklist changes from creating a description", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("No description added.")).toBeVisible();
    expect(screen.queryByText(generated)).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    expect(screen.getByText("No description added.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit Description" }));
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("");
  });

  it("cancels edits and preserves saved wording through checkbox changes and reload", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(<Harness initial={{ ...savedLists, modeDescription: generated }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Edit Description" }));
    const text = screen.getByRole("textbox", { name: "Description" });
    expect(text).toHaveFocus();
    expect(text).toHaveValue(generated);
    await user.clear(text);
    await user.type(text, "Cancelled wording");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(generated)).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit Description" })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Edit Description" }));
    const nextText = screen.getByRole("textbox", { name: "Description" });
    await user.clear(nextText);
    await user.type(nextText, "Custom work for both Modes.\nKeep this wording.");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ modeDescription: "Custom work for both Modes.\nKeep this wording." }));
    expect(screen.getByRole("checkbox", { name: "Execution" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Shifting" }));
    expect(screen.getByText("Custom work for both Modes. Keep this wording.")).toBeVisible();
    const saved = onChange.mock.calls.at(-1)![0] as KnowledgeJsonObject;
    expect(saved.modeDescription).toBe("Custom work for both Modes.\nKeep this wording.");
    view.unmount();
    render(<Harness initial={saved} readOnly />);
    expect(screen.getByText("Custom work for both Modes. Keep this wording.").textContent)
      .toBe("Custom work for both Modes.\nKeep this wording.");
    expect(screen.queryByRole("button", { name: "Edit Description" })).not.toBeInTheDocument();
  });

  it("preserves authored scope wording in preview and save when checklist selections change or disappear", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole("checkbox", { name: "Execution" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    for (const list of ["Inclusions", "Exclusions"]) {
      await user.click(within(screen.getByRole("group", { name: list })).getByRole("checkbox", { name: list === "Inclusions" ? "Transport" : "Unloading" }));
    }
    await user.click(screen.getByRole("button", { name: "Edit Description" }));
    const text = screen.getByRole("textbox", { name: "Description" });
    const preview = screen.getByRole("region", { name: "Description preview" });
    await user.clear(text);
    expect(text).toHaveValue("");
    expect(preview).toHaveTextContent("No description added.");
    await user.type(text, "Custom fixing. Inclusions: none. Exclusions: none.");
    expect(text).toHaveFocus();
    expect(preview).toHaveTextContent("Custom fixing. Inclusions: none. Exclusions: none.");
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Shifting" }));
    expect(preview).toHaveTextContent("Custom fixing. Inclusions: none. Exclusions: none.");
    fireEvent.change(text, { target: { value: "Custom fixing. Inclusions: Shifting. Exclusions: bespoke finishing." } });
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("button", { name: "Delete inclusion Shifting" }));
    const expected = "Custom fixing. Inclusions: Shifting. Exclusions: bespoke finishing.";
    expect(text).toHaveValue(expected);
    expect(preview).toHaveTextContent(expected);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(expected)).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ modeDescription: expected }));
    await user.click(screen.getByRole("button", { name: "Edit Description" }));
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(expected);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getAllByText(expected)).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.getAllByText(expected)).toHaveLength(1);
    expect(screen.getByText(expected)).toBeVisible();
  });

  it("accepts a full-length authored paragraph without appending selected checklist items", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole("checkbox", { name: "Execution" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    await user.click(screen.getByRole("button", { name: "Edit Description" }));
    const text = screen.getByRole("textbox", { name: "Description" });
    const description = "a".repeat(4_000);
    fireEvent.change(text, { target: { value: description } });
    onChange.mockClear();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ modeDescription: description }));
  });

  it("allows clearing a saved description and keeps it blank after reload", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(<Harness initial={{ ...savedLists, modeDescription: generated }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Edit Description" }));
    const text = screen.getByRole("textbox", { name: "Description" });
    expect(text).toHaveAttribute("maxlength", "4000");
    await user.clear(text);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ modeDescription: "" }));
    expect(screen.getByText("No description added.")).toBeVisible();
    const saved = onChange.mock.calls.at(-1)![0] as KnowledgeJsonObject;
    view.unmount();
    render(<Harness initial={saved} />);
    expect(screen.getByText("No description added.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit Description" }));
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Cancelled wording");
    await user.keyboard("{Escape}");
    expect(screen.getByText("No description added.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit Description" })).toHaveFocus();
  });

  it("labels the shared paragraph in conflict review", () => {
    render(<KnowledgeConflictReview sectionKey="advanced" payload={{ modeDescription: "Server wording" }}
      localVersion={1} serverVersion={2} masters={{}} relationshipBaskets={[]} relationshipItems={[]}
    />);
    expect(screen.getByText("Description").nextElementSibling).toHaveTextContent("Server wording");
  });
});
