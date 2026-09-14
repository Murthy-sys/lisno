import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ContextPanel } from "./ContextPanel";

it("recovers the original workspace after nested discard removes both overlays and their trigger", async () => {
  function RemovedEditor() {
    const [open, setOpen] = useState(false);
    const [hasRecord, setHasRecord] = useState(true);
    return <main tabIndex={-1} aria-label="Project list">
      {hasRecord ? <button onClick={() => setOpen(true)}>Edit project</button> : null}
      <ContextPanel open={open} title="Edit project" dirty onClose={() => setOpen(false)}>
        <button onClick={() => setHasRecord(false)}>Simulate record removal</button>
      </ContextPanel>
    </main>;
  }
  const user = userEvent.setup();
  render(<RemovedEditor />);
  await user.click(screen.getByRole("button", { name: "Edit project" }));
  await user.click(screen.getByRole("button", { name: "Simulate record removal" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("main", { name: "Project list" })).toHaveFocus();
});

function Editor({ onClose = vi.fn(), busy = false }: { onClose?: () => void; busy?: boolean }) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");
  return (
    <ContextPanel
      open={open}
      title="Edit project"
      dirty={name !== ""}
      busy={busy}
      onClose={() => { onClose(); setOpen(false); }}
      footer={({ requestClose }) => <button type="button" onClick={requestClose}>Cancel</button>}
    >
      <label>Project name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
    </ContextPanel>
  );
}

describe("ContextPanel dismissal", () => {
  it.each(["Escape", "Close", "Backdrop", "Cancel"])("guards dirty changes dismissed by %s and preserves edits when staying", async (method) => {
    const onClose = vi.fn();
    render(<Editor onClose={onClose} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Project name" }), "North project");

    if (method === "Escape") await userEvent.keyboard("{Escape}");
    else if (method === "Cancel") await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    else if (method === "Close") await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close edit project" }));
    else await userEvent.click(screen.getAllByRole("button", { name: "Close edit project" })[0]!);

    const confirmation = screen.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await waitFor(() => expect(within(confirmation).getByRole("button", { name: "Keep editing" })).toHaveFocus());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit project" }).parentElement).toHaveAttribute("inert");
    await userEvent.click(within(confirmation).getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue("North project");
    expect(screen.getByRole("dialog", { name: "Edit project" }).parentElement).not.toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Edit project" })).toContainElement(document.activeElement as HTMLElement);
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("closes a dirty panel only after explicit discard and releases its overlays", async () => {
    const onClose = vi.fn();
    document.documentElement.style.overflow = "auto";
    const { container } = render(<Editor onClose={onClose} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Project name" }), "North project");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute("inert");
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("closes clean panels without a confirmation", async () => {
    const onClose = vi.fn();
    render(<Editor onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("lets Escape from the nested confirmation return to editing", async () => {
    render(<Editor />);
    const field = screen.getByRole("textbox", { name: "Project name" });
    await userEvent.type(field, "North project");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(field).toHaveValue("North project");
  });

  it("blocks all close paths, including render-prop Cancel, while busy", async () => {
    const onClose = vi.fn();
    render(<Editor busy onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    for (const button of screen.getAllByRole("button", { name: "Close edit project" })) {
      fireEvent.click(button);
    }
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("blocks discard if the form becomes busy while confirmation is open", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Editor onClose={onClose} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Project name" }), "North project");
    await userEvent.keyboard("{Escape}");
    rerender(<Editor busy onClose={onClose} />);

    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("clears a discard prompt across an externally controlled close and reopen", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<ContextPanel title="Edit" dirty onClose={onClose}><p>Form</p></ContextPanel>);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    rerender(<ContextPanel title="Edit" open={false} dirty onClose={onClose}><p>Form</p></ContextPanel>);
    rerender(<ContextPanel title="Edit" open dirty onClose={onClose}><p>Form</p></ContextPanel>);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit" })).toBeInTheDocument();
  });
});
