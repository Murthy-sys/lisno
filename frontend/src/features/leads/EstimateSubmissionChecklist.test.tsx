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
  it.each(["submit", "send"] as const)("keeps %s confirmation actionable and focuses each missing statement", async action => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness action={action} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Submit estimate" }));
    const dialog = screen.getByRole("dialog", { name: "Before submitting your estimate" });
    expect(dialog).toHaveAccessibleDescription("Confirm all three statements to continue.");
    const checkboxes = statements.map(name => within(dialog).getByRole("checkbox", { name }));
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(3);
    for (const checkbox of checkboxes) expect(checkbox).not.toBeChecked();
    await waitFor(() => expect(checkboxes[0]).toHaveFocus());
    const confirm = within(dialog).getByRole("button", { name: `Confirm and ${action}` });
    expect(confirm).toBeEnabled();
    confirm.focus();
    await user.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Confirm the 3 unchecked statements before continuing.");
    expect(checkboxes[0]).toHaveFocus();
    expect(checkboxes[0]).toHaveAccessibleDescription("Confirm the 3 unchecked statements before continuing.");
    for (let index = 0; index < 2; index++) {
      await user.click(checkboxes[index]!);
      expect(confirm).toBeEnabled();
      await user.click(confirm);
      expect(checkboxes[index + 1]).toHaveFocus();
      expect(onConfirm).not.toHaveBeenCalled();
    }
    await user.click(screen.getByText(statements[2]!));
    expect(confirm).toBeEnabled();
    await user.click(checkboxes[1]!);
    confirm.focus();
    await user.keyboard(" ");
    expect(checkboxes[1]).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Confirm the 1 unchecked statement before continuing.");
    expect(onConfirm).not.toHaveBeenCalled();
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
    expect(screen.getByRole("button", { name: "Confirm and submit" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses the send action and respects changing eligibility even after all checks", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const props = { action: "send" as const, busy: false, onConfirm, onClose: vi.fn() };
    const { rerender } = render(<EstimateSubmissionChecklist {...props} canConfirm />);
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    expect(screen.getByRole("button", { name: "Confirm and send" })).toBeEnabled();
    rerender(<EstimateSubmissionChecklist {...props} canConfirm={false}
      blockingReason="Reload the latest estimate before submitting. Your edits are preserved." />);
    const confirm = screen.getByRole("button", { name: "Confirm and send" });
    expect(confirm).toBeEnabled();
    expect(confirm).not.toHaveAttribute("aria-disabled");
    await user.click(confirm);
    const feedback = screen.getByRole("alert");
    expect(feedback).toHaveTextContent("Reload the latest estimate before submitting. Your edits are preserved.");
    expect(feedback).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<EstimateSubmissionChecklist {...props} canConfirm />);
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("explains unavailable eligibility without inventing an assignment restriction", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<EstimateSubmissionChecklist action="submit" busy={false} canConfirm={false}
      onConfirm={onConfirm} onClose={vi.fn()} />);
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    const confirm = screen.getByRole("button", { name: "Confirm and submit" });
    confirm.focus();
    await user.keyboard("{Enter}");
    expect(confirm).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("The estimate is not ready for submission. Close this checklist and review the latest estimate updates.");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each(["submit", "send"] as const)("keeps busy %s actionable while blocking repeat activation and dismissal", async action => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    function BusyHarness() {
      const [busy, setBusy] = useState(false);
      return <EstimateSubmissionChecklist action={action} busy={busy} canConfirm
        onConfirm={() => { onConfirm(); setBusy(true); }} onClose={onClose} />;
    }
    render(<BusyHarness />);
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    const confirm = screen.getByRole("button", { name: `Confirm and ${action}` });
    await user.dblClick(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveAccessibleName(action === "send" ? "Sending…" : "Submitting…");
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(confirm).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("status")).toHaveTextContent(action === "send"
      ? "Your estimate is being sent. Please wait." : "Your estimate is being submitted. Please wait.");
    confirm.focus();
    await user.keyboard("{Enter} ");
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    for (const close of screen.getAllByRole("button", { name: "Close Before submitting your estimate" })) await user.click(close);
    expect(onClose).not.toHaveBeenCalled();
  });
});
