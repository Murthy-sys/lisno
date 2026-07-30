import { StrictMode, useState } from "react";
import { render, screen } from "@testing-library/react";
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

  it("balances the scroll lock across StrictMode effect remounts", () => {
    document.body.style.overflow = "overlay";
    const { unmount } = render(
      <StrictMode>
        {dialog("Strict")}
      </StrictMode>
    );

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("overlay");
  });
});
