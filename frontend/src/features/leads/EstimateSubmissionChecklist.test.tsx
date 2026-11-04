import { useRef, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EstimateSubmissionChecklist } from "./EstimateSubmissionChecklist";

const statements = [
  "I confirm that I have mapped the items correctly according to the customer's requirements.",
  "I understand that Lisno promotes transparency in information shared with clients. I will not practise underselling to gain sales under any circumstances.",
  "I confirm that I have explained to the customer how to read and understand the estimate."
];

function Harness({ action = "submit", onConfirm = vi.fn() }: { action?: "submit" | "send"; onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} onClick={() => setOpen(true)}>Submit estimate</button>
    {open ? <EstimateSubmissionChecklist action={action} busy={false} canConfirm onConfirm={onConfirm}
      onClose={() => setOpen(false)} returnFocusRef={trigger} /> : null}
  </>;
}

describe("EstimateSubmissionChecklist", () => {
  it("requires each approved statement and blocks partial confirmation including Enter", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Submit estimate" }));
    const dialog = screen.getByRole("dialog", { name: "Before submitting your estimate" });
    expect(dialog).toHaveAccessibleDescription("Confirm all three statements to continue.");
    const checkboxes = statements.map(name => within(dialog).getByRole("checkbox", { name }));
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(3);
    for (const checkbox of checkboxes) expect(checkbox).not.toBeChecked();
    await waitFor(() => expect(checkboxes[0]).toHaveFocus());
    const confirm = within(dialog).getByRole("button", { name: "Confirm and submit" });
    expect(confirm).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    for (const name of statements.slice(0, 2)) {
      await user.click(screen.getByText(name));
      expect(confirm).toBeDisabled();
      await user.keyboard("{Enter}");
      expect(onConfirm).not.toHaveBeenCalled();
    }
    await user.click(screen.getByText(statements[2]!));
    expect(confirm).toBeEnabled();
    await user.click(checkboxes[1]!);
    expect(confirm).toBeDisabled();
    await user.click(checkboxes[1]!);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it.each(["Cancel", "close", "backdrop", "Escape"])("dismisses with %s without confirmation and resets on reopening", async method => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Submit estimate" });
    await user.click(trigger);
    await user.click(screen.getByRole("checkbox", { name: statements[0] }));
    const dialog = screen.getByRole("dialog", { name: "Before submitting your estimate" });
    if (method === "Cancel") await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    else if (method === "Escape") await user.keyboard("{Escape}");
    else if (method === "close") await user.click(within(dialog).getByRole("button", { name: "Close Before submitting your estimate" }));
    else await user.click(screen.getAllByRole("button", { name: "Close Before submitting your estimate" }).find(button => !dialog.contains(button))!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirm and submit" })).toBeDisabled();
  });

  it("uses the send action and respects changing eligibility even after all checks", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const props = { action: "send" as const, busy: false, onConfirm, onClose: vi.fn() };
    const { rerender } = render(<EstimateSubmissionChecklist {...props} canConfirm />);
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    expect(screen.getByRole("button", { name: "Confirm and send" })).toBeEnabled();
    rerender(<EstimateSubmissionChecklist {...props} canConfirm={false} />);
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<EstimateSubmissionChecklist {...props} canConfirm />);
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("blocks repeat activation and dismissal while the parent action is busy", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    function BusyHarness() {
      const [busy, setBusy] = useState(false);
      return <EstimateSubmissionChecklist action="submit" busy={busy} canConfirm
        onConfirm={() => { onConfirm(); setBusy(true); }} onClose={onClose} />;
    }
    render(<BusyHarness />);
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    const confirm = screen.getByRole("button", { name: "Confirm and submit" });
    await user.dblClick(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    for (const close of screen.getAllByRole("button", { name: "Close Before submitting your estimate" })) await user.click(close);
    expect(onClose).not.toHaveBeenCalled();
  });
});
