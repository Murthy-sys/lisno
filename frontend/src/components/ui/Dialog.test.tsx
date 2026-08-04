import { StrictMode, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";

function dialog(title: string, onClose = vi.fn()) {
  return (
    <Dialog title={title} onClose={onClose}>
      <button type="button">{title} action</button>
    </Dialog>
  );
}

function NestedDialogHarness({ discardAll = false }: { discardAll?: boolean }) {
  const [outerOpen, setOuterOpen] = useState(true);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  if (!outerOpen) return null;
  return (
    <>
      <Dialog title="Preview" onClose={() => setOuterOpen(false)}>
        <button type="button" onClick={() => setConfirmationOpen(true)}>
          Open confirmation
        </button>
      </Dialog>
      {confirmationOpen ? (
        <Dialog title="Confirmation" role="alertdialog" onClose={() => setConfirmationOpen(false)}>
          <button type="button" onClick={() => setConfirmationOpen(false)}>Keep editing</button>
          {discardAll ? (
            <button type="button" onClick={() => setOuterOpen(false)}>Discard all</button>
          ) : null}
        </Dialog>
      ) : null}
    </>
  );
}

describe("Dialog accessibility contract", () => {
  it("keeps alertdialog, description, inert content, and optional close controls compatible", () => {
    render(
      <Dialog
        title="Discard changes"
        description="This cannot be undone."
        role="alertdialog"
        contentInert
        showCloseButton={false}
        onClose={vi.fn()}
      >
        <p>Confirmation content</p>
      </Dialog>
    );

    const alert = screen.getByRole("alertdialog", { name: "Discard changes", hidden: true });
    expect(alert).toHaveAttribute("aria-modal", "true");
    expect(alert).toHaveAttribute("aria-describedby");
    expect(alert).toHaveAttribute("inert");
    expect(screen.getByText("This cannot be undone.")).toHaveAttribute(
      "id",
      alert.getAttribute("aria-describedby")
    );
    expect(screen.getAllByRole("button", { name: "Close Discard changes" })).toHaveLength(1);
  });

  it("focuses the marked initial target before other controls", async () => {
    render(
      <Dialog title="Choose" onClose={vi.fn()}>
        <button type="button">First action</button>
        <button type="button" data-dialog-initial-focus>Preferred action</button>
      </Dialog>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Preferred action" })).toHaveFocus());
  });

  it("falls back when a marked initial target is hidden", async () => {
    render(
      <Dialog title="Choose" showCloseButton={false} onClose={vi.fn()}>
        <button type="button" hidden data-dialog-initial-focus>Hidden preference</button>
        <button type="button">Available action</button>
      </Dialog>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Available action" })).toHaveFocus());
  });

  it("excludes hidden, aria-hidden, inert, disabled, and negative-tabindex candidates", async () => {
    render(
      <Dialog title="Choose" showCloseButton={false} onClose={vi.fn()}>
        <button type="button" hidden>Hidden action</button>
        <span aria-hidden="true"><button type="button">Aria-hidden action</button></span>
        <span inert><button type="button">Inert action</button></span>
        <button type="button" disabled>Disabled action</button>
        <button type="button" tabIndex={-2}>Negative action</button>
        <button type="button" style={{ display: "none" }}>Display-none action</button>
        <button type="button">Available action</button>
      </Dialog>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Available action" })).toHaveFocus());
  });

  it("orders positive tabindex before regular controls and wraps across additional focusables", async () => {
    render(
      <Dialog title="Choose" showCloseButton={false} onClose={vi.fn()}>
        <button type="button">Natural action</button>
        <button type="button" tabIndex={2}>Second priority</button>
        <button type="button" tabIndex={1}>First priority</button>
        <div contentEditable suppressContentEditableWarning>Editable notes</div>
        <button type="button" hidden>Hidden trailing action</button>
      </Dialog>
    );

    const first = screen.getByRole("button", { name: "First priority" });
    const editor = screen.getByText("Editable notes");
    await waitFor(() => expect(first).toHaveFocus());

    editor.focus();
    expect(editor).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(editor).toHaveFocus();
  });

  it("treats contenteditable as focusable without requiring a tabindex", async () => {
    render(
      <Dialog title="Notes" showCloseButton={false} onClose={vi.fn()}>
        <div contentEditable suppressContentEditableWarning>Editable notes</div>
      </Dialog>
    );

    await waitFor(() => expect(screen.getByText("Editable notes")).toHaveFocus());
  });

  it("focuses the first focusable descendant when no target is marked", async () => {
    render(
      <Dialog title="Choose" showCloseButton={false} onClose={vi.fn()}>
        <button type="button">First action</button>
        <button type="button">Second action</button>
      </Dialog>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "First action" })).toHaveFocus());
  });

  it("focuses the dialog container when it has no focusable descendants", async () => {
    render(
      <Dialog title="Read only" showCloseButton={false} onClose={vi.fn()}>
        <p>Nothing to operate</p>
      </Dialog>
    );

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Read only" })).toHaveFocus());
  });

  it("restores focus to the connected element active before opening", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open editor</button>
          {open ? <Dialog title="Editor" onClose={() => setOpen(false)}><p>Editor body</p></Dialog> : null}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open editor" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Editor" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("lets only the topmost overlay handle Tab and Shift+Tab", () => {
    render(
      <>
        <Dialog title="Outer" showCloseButton={false} onClose={vi.fn()}>
          <button type="button">Outer first</button>
          <button type="button">Outer last</button>
        </Dialog>
        <Dialog title="Inner" showCloseButton={false} onClose={vi.fn()}>
          <button type="button">Inner first</button>
          <button type="button">Inner last</button>
        </Dialog>
      </>
    );

    screen.getByRole("button", { name: "Outer last" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Inner first" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Inner last" })).toHaveFocus();
  });

  it("lets Escape close only the topmost dismissible overlay", () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <>
        <Dialog title="Outer" onClose={outerClose}><p>Outer body</p></Dialog>
        <Dialog title="Inner" onClose={innerClose}><p>Inner body</p></Dialog>
      </>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
  });

  it("blocks Escape, backdrop, and close controls while busy", async () => {
    const onClose = vi.fn();
    render(<Dialog title="Saving" busy onClose={onClose}><p>Saving content</p></Dialog>);

    fireEvent.keyDown(document, { key: "Escape" });
    for (const control of screen.getAllByRole("button", { name: "Close Saving" })) {
      await userEvent.click(control);
    }

    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the latest busy state and close callback without adding another listener", () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const addListener = vi.spyOn(document, "addEventListener");
    const { rerender } = render(<Dialog title="Mutable" busy onClose={firstClose}><p>Body</p></Dialog>);
    const keydownAddsAfterMount = addListener.mock.calls.filter(([type]) => type === "keydown").length;

    rerender(<Dialog title="Mutable" busy={false} onClose={latestClose}><p>Body</p></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
    expect(addListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(
      keydownAddsAfterMount
    );
  });
});

describe("Dialog body scroll ownership", () => {
  it("restores the original overflow after one dialog unmounts", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = render(dialog("Single"));

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("keeps the body locked after a nested confirmation continues editing", async () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<NestedDialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Open confirmation" }));
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog", { name: "Confirmation" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("restores the original overflow when Discard unmounts both dialogs together", async () => {
    document.body.style.overflow = "visible";
    render(<NestedDialogHarness discardAll />);
    await userEvent.click(screen.getByRole("button", { name: "Open confirmation" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard all" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("visible");
  });

  it("stays locked until the final dialog unmounts regardless of unmount order", () => {
    document.body.style.overflow = "clip";
    const { rerender } = render(
      <>
        <Dialog key="first" title="First" onClose={vi.fn()}><span>First content</span></Dialog>
        <Dialog key="second" title="Second" onClose={vi.fn()}><span>Second content</span></Dialog>
      </>
    );

    rerender(
      <Dialog key="second" title="Second" onClose={vi.fn()}><span>Second content</span></Dialog>
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<></>);
    expect(document.body.style.overflow).toBe("clip");
  });

  it("installs one key listener for a stack and removes it after the final overlay", () => {
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(
      <>
        {dialog("First")}
        {dialog("Second")}
      </>
    );

    expect(addListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    unmount();
    expect(removeListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
  });

  it("balances the scroll lock and listener across StrictMode effect remounts", () => {
    document.body.style.overflow = "overlay";
    const onClose = vi.fn();
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(
      <StrictMode>
        {dialog("Strict", onClose)}
      </StrictMode>
    );

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("overlay");
    expect(addListener.mock.calls.filter(([type]) => type === "keydown").length).toBe(
      removeListener.mock.calls.filter(([type]) => type === "keydown").length
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
