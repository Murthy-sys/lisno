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
  it("lets keyboard users reach a read-only contextual scroll region and its footer", async () => {
    const user = userEvent.setup();
    render(<Drawer id="read-only" open variant="contextual" title="Record details" onClose={vi.fn()}
      footer={<button type="button">Open record</button>}><p>Read-only record information</p></Drawer>);
    const panel = screen.getByRole("dialog", { name: "Record details" });
    const close = within(panel).getByRole("button", { name: "Close record details" });
    const body = panel.querySelector(".ui-drawer__body");
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab();
    expect(body).toHaveFocus();
    await user.tab();
    expect(within(panel).getByRole("button", { name: "Open record" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it("portals contextual content with a visible title, description, metadata, and footer", () => {
    const { container } = render(
      <Drawer
        id="project-details"
        open
        variant="contextual"
        width="wide"
        title="Project details"
        eyebrow="Project"
        description="Review this project before opening the workspace."
        metadata={<span>In progress</span>}
        footer={<button type="button">Open workspace</button>}
        onClose={vi.fn()}
      >
        <p>Project information</p>
      </Drawer>
    );

    const panel = screen.getByRole("dialog", { name: "Project details" });
    expect(container).not.toContainElement(panel);
    expect(panel.parentElement?.parentElement).toBe(document.body);
    expect(within(panel).getByRole("heading", { name: "Project details" })).not.toHaveClass("sr-only");
    expect(panel).toHaveAccessibleDescription("Review this project before opening the workspace.");
    expect(within(panel).getByText("In progress")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Open workspace" })).toBeInTheDocument();
  });

  it("keeps navigation within its theme ancestry while isolating the surrounding workspace", () => {
    const { container, unmount } = render(
      <div data-testid="shell" data-role="designer">
        <main data-testid="workspace"><button type="button">Workspace action</button></main>
        <section data-testid="navigation-owner">
          <button type="button">Open navigation</button>
          <Drawer id="navigation" open title="Navigation" onClose={vi.fn()}>
            <a href="/home">Home</a>
          </Drawer>
        </section>
      </div>
    );
    const panel = screen.getByRole("dialog", { name: "Navigation" });
    expect(container).toContainElement(panel);
    expect(panel).toHaveClass("ui-drawer--left");
    expect(panel.querySelector(".ui-drawer__body")).not.toHaveAttribute("tabindex");
    expect(screen.getByTestId("shell")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("navigation-owner")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("workspace")).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("inert");
    expect(panel.closest("[inert]")).toBeNull();
    unmount();
    expect(container).not.toHaveAttribute("inert");
  });

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

  it("falls back when the explicit initial focus target is hidden", async () => {
    function Harness() {
      const hiddenRef = useRef<HTMLButtonElement>(null);
      return (
        <Drawer
          id="filters"
          open
          title="Filters"
          onClose={vi.fn()}
          initialFocusRef={hiddenRef}
        >
          <button ref={hiddenRef} type="button" hidden>Hidden preference</button>
          <button type="button">Available filter</button>
        </Drawer>
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Available filter" })).toHaveFocus());
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

  it.each(["hidden", "disabled"] as const)("ignores an %s return target", async (unavailable) => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const returnRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open details</button>
          <button ref={returnRef} hidden={unavailable === "hidden"} disabled={unavailable === "disabled"}>Unavailable return</button>
          <Drawer id="details" variant="contextual" open={open} title="Details" returnFocusRef={returnRef} onClose={() => setOpen(false)}>
            <p>Details</p>
          </Drawer>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open details" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("restores the explicit fallback when the opening record is removed", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const fallbackRef = useRef<HTMLHeadingElement>(null);
      return (
        <>
          <h1 ref={fallbackRef} tabIndex={-1}>Projects</h1>
          {!open ? <button type="button" onClick={() => setOpen(true)}>Open project</button> : null}
          <Drawer id="details" variant="contextual" open={open} title="Details" fallbackFocusRef={fallbackRef} onClose={() => setOpen(false)}>
            <p>Project no longer available</p>
          </Drawer>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open project" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("heading", { name: "Projects" })).toHaveFocus();
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

  it("presents a Drawer above a legacy Dialog when Drawer is logically topmost", () => {
    render(
      <>
        <Dialog title="Editor" onClose={vi.fn()}><p>Editor body</p></Dialog>
        <Drawer id="filters" open title="Filters" onClose={vi.fn()}><p>Filter body</p></Drawer>
      </>
    );

    const dialogLayer = screen.getByRole("dialog", { name: "Editor" }).parentElement!;
    const drawerLayer = screen.getByRole("dialog", { name: "Filters" }).parentElement!;
    expect(dialogLayer).toHaveClass("modal-layer");
    expect(dialogLayer).toHaveAttribute("data-overlay-layer", "0");
    expect(drawerLayer).toHaveAttribute("data-overlay-layer", "1");
    expect(dialogLayer.style.zIndex).toBe(
      "calc(var(--z-modal) + var(--ui-overlay-stack-order))"
    );
    expect(drawerLayer.style.zIndex).toBe(
      "calc(var(--z-modal) + var(--ui-overlay-stack-order))"
    );
    expect(dialogLayer.style.getPropertyValue("--ui-overlay-stack-order")).toBe("0");
    expect(drawerLayer.style.getPropertyValue("--ui-overlay-stack-order")).toBe("1");
  });

  it("presents a Dialog above a Drawer when Dialog is logically topmost", () => {
    render(
      <>
        <Drawer id="filters" open title="Filters" onClose={vi.fn()}><p>Filter body</p></Drawer>
        <Dialog title="Editor" onClose={vi.fn()}><p>Editor body</p></Dialog>
      </>
    );

    const drawerLayer = screen.getByRole("dialog", { name: "Filters" }).parentElement!;
    const dialogLayer = screen.getByRole("dialog", { name: "Editor" }).parentElement!;
    expect(drawerLayer).toHaveAttribute("data-overlay-layer", "0");
    expect(dialogLayer).toHaveAttribute("data-overlay-layer", "1");
    expect(drawerLayer.style.getPropertyValue("--ui-overlay-stack-order")).toBe("0");
    expect(dialogLayer.style.getPropertyValue("--ui-overlay-stack-order")).toBe("1");
  });
});

describe("shared overlay ownership", () => {
  it("returns to the captured workspace when a contextual trigger disappears", async () => {
    function RemovedRecord() {
      const [open, setOpen] = useState(false);
      const [hasRecord, setHasRecord] = useState(true);
      return <main tabIndex={-1} aria-label="Project list">
        {hasRecord ? <button onClick={() => setOpen(true)}>Review project</button> : null}
        <Drawer id="removed-project" open={open} variant="contextual" title="Project" onClose={() => setOpen(false)}>
          <button onClick={() => setHasRecord(false)}>Simulate record removal</button>
        </Drawer>
      </main>;
    }
    const user = userEvent.setup();
    render(<RemovedRecord />);
    await user.click(screen.getByRole("button", { name: "Review project" }));
    await user.click(screen.getByRole("button", { name: "Simulate record removal" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("main", { name: "Project list" })).toHaveFocus();
  });

  it("isolates new background nodes and restores each original inert attribute", async () => {
    const existing = document.createElement("section");
    existing.setAttribute("inert", "original");
    const background = document.createElement("section");
    document.body.append(existing, background);
    const { unmount } = render(
      <Drawer id="details" open variant="contextual" title="Details" onClose={vi.fn()}><p>Details</p></Drawer>
    );
    const later = document.createElement("button");
    later.textContent = "Later background action";
    document.body.append(later);
    await waitFor(() => expect(later).toHaveAttribute("inert"));
    expect(background).toHaveAttribute("inert");

    unmount();
    expect(existing).toHaveAttribute("inert", "original");
    expect(background).not.toHaveAttribute("inert");
    expect(later).not.toHaveAttribute("inert");
    existing.remove();
    background.remove();
    later.remove();
  });

  it("gives a nested body portal focus and isolation even when it mounts with its parent", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <Drawer id="details" open variant="contextual" title="Details" onClose={outerClose}>
        <button type="button" data-dialog-initial-focus>Outer preferred action</button>
        <Dialog title="Confirmation" onClose={innerClose}>
          <button type="button" data-dialog-initial-focus>Inner preferred action</button>
        </Dialog>
      </Drawer>
    );

    const outer = screen.getByRole("dialog", { name: "Details" });
    const inner = screen.getByRole("dialog", { name: "Confirmation" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Inner preferred action" })).toHaveFocus());
    expect(outer.parentElement).toHaveAttribute("inert");
    expect(inner.closest("[inert]")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
  });

  it("does not let a lower layer's initial-focus timer or close control overtake a newer panel", async () => {
    const lowerClose = vi.fn();
    render(
      <>
        <Drawer id="first" open variant="contextual" title="First" onClose={lowerClose}>
          <button type="button" data-dialog-initial-focus>First action</button>
        </Drawer>
        <Dialog title="Second" onClose={vi.fn()}>
          <button type="button" data-dialog-initial-focus>Second action</button>
        </Dialog>
      </>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Second action" })).toHaveFocus());
    fireEvent.click(within(screen.getByRole("dialog", { name: "First" })).getByRole("button", { name: "Close first" }));
    expect(lowerClose).not.toHaveBeenCalled();
  });

  it("keeps scroll locked when Drawer and Dialog close out of order", () => {
    document.documentElement.style.overflow = "scroll";
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
    expect(document.documentElement.style.overflow).toBe("hidden");

    unmount();
    expect(document.documentElement.style.overflow).toBe("scroll");
  });

  it("does not underflow the shared lock in StrictMode", () => {
    document.documentElement.style.overflow = "clip";
    const { unmount } = render(<StrictMode>{drawer()}</StrictMode>);

    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("clip");
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
