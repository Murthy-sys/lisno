import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { ProposalMetadataDialog } from "./ProposalMetadataDialog";

describe("proposal metadata preservation", () => {
  it("keeps the existing Main Basket fields and submits from the name input", async () => {
    const save = vi.fn(); const user = userEvent.setup();
    renderWithQuery(<ProposalMetadataDialog title="Edit Main Basket" initial={{ name: "Stone", description: "Existing specification", displayOrder: 7 }} busy={false} error="" onClose={vi.fn()} onSave={save} />);
    const dialog = screen.getByRole("dialog", { name: "Edit Main Basket" });
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    expect(within(dialog).getByRole("textbox", { name: "Description" })).toHaveValue("Existing specification");
    expect(within(dialog).getByRole("spinbutton", { name: "Display order" })).toHaveValue(7);
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    const submit = within(dialog).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(submit.form).toBe((name as HTMLInputElement).form);
    await user.clear(name);
    await user.type(name, "Polished stone{Enter}");
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ name: "Polished stone", description: "Existing specification", displayOrder: 7 });
  });

  it.each(["Sub-Basket", "Main Line"])("renames a %s without changing hidden saved metadata", async kind => {
    const save = vi.fn(); const user = userEvent.setup();
    renderWithQuery(<ProposalMetadataDialog title={`Edit ${kind}`} initial={{ name: "Stone", description: "Stored description", displayOrder: 17 }} showDescription={false} showOrder={false} busy={false} error="" onClose={vi.fn()} onSave={save} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Display order")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Description")).not.toBeInTheDocument();
    await user.clear(within(dialog).getByRole("textbox", { name: "Name" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "New stone");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith({ name: "New stone", description: "Stored description", displayOrder: 17 });
  });
  it("uses the caller's deterministic order for a new node without exposing it", async () => {
    const save = vi.fn(); const user = userEvent.setup();
    renderWithQuery(<ProposalMetadataDialog title="Add Main Line" showDescription={false} showOrder={false} defaultOrder={9} busy={false} error="" onClose={vi.fn()} onSave={save} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Finish");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith({ name: "Finish", description: null, displayOrder: 9 });
  });
});
