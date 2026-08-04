import { createRef, StrictMode, useRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";
import { Drawer } from "./Drawer";

function drawer(onClose = vi.fn()) {
  return (
    <Drawer id="filters" open title="Filters" onClose={onClose}>
      <button type="button">Apply filters</button>
    </Drawer>
  );
}

describe("Drawer accessibility contract", () => {
  it("renders a labelled modal without hiding its title or adding another main", () => {
    render(
      <>
        <main>Workspace</main>
        {drawer()}
      </>
    );

    const panel = screen.getByRole("dialog", { name: "Filters" });
    const title = screen.getByRole("heading", { name: "Filters" });
    expect(panel).toHaveAttribute("id", "filters");
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAttribute("data-overlay-root");
    expect(panel).toHaveAttribute("aria-labelledby", title.id);
    expect(title).not.toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("returns null while closed", () => {
    render(<Drawer id="filters" open={false} title="Filters" onClose={vi.fn()}><p>Hidden</p></Drawer>);

    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("prioritizes an explicit initial focus ref", async () => {
    function Harness() {
      const preferredRef = useRef<HTMLButtonElement>(null);
      return (
        <Drawer
          id="filters"
          open
          title="Filters"
          onClose={vi.fn()}
          initialFocusRef={preferredRef}
        >
          <button type="button">First child</button>
          <button ref={preferredRef} type="button">Preferred child</button>
        </Drawer>
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Preferred child" })).toHaveFocus());
  });

  it("restores connected explicit focus before the element active at open", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const returnRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open filters</button>
          <button ref={returnRef} type="button">Return target</button>
          <Drawer
            id="filters"
            open={open}
            title="Filters"
            onClose={() => setOpen(false)}
            returnFocusRef={returnRef}
          >
            <button type="button">Apply filters</button>
          </Drawer>
        </>
      );
    }

    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open filters" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Filters" })).getByRole("button", {
        name: "Close filters"
      })
    );

    expect(screen.getByRole("button", { name: "Return target" })).toHaveFocus();
  });

  it("falls back to connected prior focus when the explicit target disconnects", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const disconnectedRef = useRef<HTMLButtonElement | null>(document.createElement("button"));
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open filters</button>
          <Drawer
            id="filters"
            open={open}
            title="Filters"
            onClose={() => setOpen(false)}
            returnFocusRef={disconnectedRef}
          >
            <button type="button">Apply filters</button>
          </Drawer>
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open filters" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");

    expect(trigger).toHaveFocus();
  });

  it("blocks Escape, backdrop, and close controls while busy", async () => {
    const onClose = vi.fn();
    render(
      <Drawer id="filters" open title="Filters" busy onClose={onClose}>
        <button type="button">Apply filters</button>
      </Drawer>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    for (const control of screen.getAllByRole("button", { name: "Close filters" })) {
      await userEvent.click(control);
    }
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets only the topmost overlay trap focus and handle Escape", () => {
    const dialogClose = vi.fn();
    const drawerClose = vi.fn();
    render(
      <>
        <Dialog title="Editor" showCloseButton={false} onClose={dialogClose}>
          <button type="button">Editor action</button>
        </Dialog>
        <Drawer id="filters" open title="Filters" onClose={drawerClose}>
          <button type="button">First filter</button>
          <button type="button">Last filter</button>
        </Drawer>
      </>
    );

    screen.getByRole("button", { name: "Editor action" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    const drawerPanel = screen.getByRole("dialog", { name: "Filters" });
    expect(within(drawerPanel).getByRole("button", { name: "Close filters" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(drawerClose).toHaveBeenCalledOnce();
    expect(dialogClose).not.toHaveBeenCalled();
  });
});

describe("shared overlay ownership", () => {
  it("keeps scroll locked when Drawer and Dialog close out of order", () => {
    document.body.style.overflow = "scroll";
    const { rerender, unmount } = render(
      <>
        {drawer()}
        <Dialog title="Editor" onClose={vi.fn()}><p>Body</p></Dialog>
      </>
    );

    rerender(
      <>
        <Drawer id="filters" open={false} title="Filters" onClose={vi.fn()}><p>Hidden</p></Drawer>
        <Dialog title="Editor" onClose={vi.fn()}><p>Body</p></Dialog>
      </>
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("does not underflow the shared lock in StrictMode", () => {
    document.body.style.overflow = "clip";
    const { unmount } = render(<StrictMode>{drawer()}</StrictMode>);

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("ignores a disconnected explicit return target after close", async () => {
    const returnFocusRef = createRef<HTMLButtonElement>();
    const disconnected = document.createElement("button");
    returnFocusRef.current = disconnected;
    const onClose = vi.fn();
    const { rerender } = render(
      <Drawer
        id="filters"
        open
        title="Filters"
        onClose={onClose}
        returnFocusRef={returnFocusRef}
      >
        <button type="button">Apply</button>
      </Drawer>
    );

    rerender(
      <Drawer
        id="filters"
        open={false}
        title="Filters"
        onClose={onClose}
        returnFocusRef={returnFocusRef}
      >
        <button type="button">Apply</button>
      </Drawer>
    );

    await waitFor(() => expect(disconnected).not.toHaveFocus());
  });
});
