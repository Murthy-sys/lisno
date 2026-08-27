import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import {
  Link,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useNavigate
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "../ui/Dialog";
import { PageState } from "../ui/PageState";
import { RouteFocusManager } from "./RouteFocusManager";

class ControlledMutationObserver implements MutationObserver {
  static instances: ControlledMutationObserver[] = [];

  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  readonly takeRecords = vi.fn(() => [] as MutationRecord[]);

  constructor(private readonly callback: MutationCallback) {
    ControlledMutationObserver.instances.push(this);
  }

  flush() {
    this.callback([], this);
  }
}

type AsyncState = "loading" | "heading" | "error" | "empty";

function ImmediatePage({ title, routeLink }: { title: string; routeLink?: string }) {
  return (
    <main id="main-content" tabIndex={-1}>
      <h1>{title}</h1>
      {routeLink ? <Link to="/second">{routeLink}</Link> : null}
    </main>
  );
}

function AsyncPage({ state }: { state: AsyncState }) {
  return (
    <main id="main-content" tabIndex={-1}>
      {state === "heading" ? <h1>Async destination</h1> : null}
      {state === "loading" ? (
        <PageState state="loading" message="Loading destination" />
      ) : null}
      {state === "error" ? (
        <PageState state="error" message="Destination failed" />
      ) : null}
      {state === "empty" ? (
        <PageState state="empty" message="No destination" />
      ) : null}
    </main>
  );
}

function Harness({ asyncState = "loading" }: { asyncState?: AsyncState }) {
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <RouteFocusManager />
      <nav aria-label="Persistent navigation" data-revision={revision}>
        <Link to="/signup">Create account</Link>
        <Link to="/second">Second page</Link>
        <Link to="/route-link">Route-link page</Link>
        <Link to="/async">Async page</Link>
        <Link to="/redirect">Automatic redirect</Link>
        <button
          type="button"
          onClick={() => navigate("/replacement", { replace: true })}
        >
          Unmarked replacement
        </button>
        <button
          type="button"
          onClick={() =>
            navigate("/replacement", {
              replace: true,
              state: { routeFocus: true }
            })
          }
        >
          Marked replacement
        </button>
        <button type="button" onClick={() => navigate(-1)}>
          Back
        </button>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          Background refresh
        </button>
        <button type="button" onClick={() => setDialogOpen(true)}>
          Open editor
        </button>
      </nav>
      <Routes>
        <Route path="/login" element={<ImmediatePage title="Welcome back" />} />
        <Route path="/signup" element={<ImmediatePage title="Create your account" />} />
        <Route path="/second" element={<ImmediatePage title="Second page" />} />
        <Route
          path="/route-link"
          element={<ImmediatePage title="Route link" routeLink="Open second" />}
        />
        <Route path="/replacement" element={<ImmediatePage title="Replacement" />} />
        <Route path="/redirect" element={<Navigate to="/second" replace />} />
        <Route path="/async" element={<AsyncPage state={asyncState} />} />
      </Routes>
      {dialogOpen ? (
        <Dialog title="Editor" onClose={() => setDialogOpen(false)}>
          <button type="button">Save editor</button>
        </Dialog>
      ) : null}
    </>
  );
}

function renderHarness(
  initialEntries: string[] = ["/login"],
  asyncState: AsyncState = "loading"
) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={initialEntries}>
        <Harness asyncState={asyncState} />
      </MemoryRouter>
    </StrictMode>
  );
}

describe("RouteFocusManager", () => {
  beforeEach(() => {
    ControlledMutationObserver.instances = [];
    vi.stubGlobal("MutationObserver", ControlledMutationObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves initial hydration focus untouched", () => {
    const initialFocus = document.createElement("button");
    document.body.append(initialFocus);
    initialFocus.focus();

    renderHarness();

    expect(initialFocus).toHaveFocus();
    expect(ControlledMutationObserver.instances).toHaveLength(0);
    initialFocus.remove();
  });

  it("focuses an immediate PUSH destination heading without scrolling", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("link", { name: "Create account" }));

    const heading = screen.getByRole("heading", { name: "Create your account" });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("focuses only marked REPLACE navigation", async () => {
    const user = userEvent.setup();
    renderHarness();
    const unmarked = screen.getByRole("button", { name: "Unmarked replacement" });

    await user.click(unmarked);
    expect(screen.getByRole("heading", { name: "Replacement" })).not.toHaveFocus();
    expect(unmarked).toHaveFocus();

    await user.click(screen.getByRole("link", { name: "Create account" }));
    await user.click(screen.getByRole("button", { name: "Marked replacement" }));
    expect(screen.getByRole("heading", { name: "Replacement" })).toHaveFocus();
  });

  it("does not steal focus for an automatic unmarked redirect", async () => {
    const user = userEvent.setup();
    renderHarness();
    const redirect = screen.getByRole("link", { name: "Automatic redirect" });

    await user.click(redirect);

    expect(await screen.findByRole("heading", { name: "Second page" })).not.toHaveFocus();
    expect(redirect).toHaveFocus();
  });

  it("restores the exact connected element on POP", async () => {
    const user = userEvent.setup();
    renderHarness();
    const secondPage = screen.getByRole("link", { name: "Second page" });

    await user.click(secondPage);
    expect(screen.getByRole("heading", { name: "Second page" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(secondPage).toHaveFocus();
  });

  it("falls back to the restored heading on POP when saved focus disconnected", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("link", { name: "Route-link page" }));
    const routeLink = screen.getByRole("link", { name: "Open second" });
    await user.click(routeLink);
    expect(routeLink.isConnected).toBe(false);
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: "Route link" })).toHaveFocus();
  });

  it("does not move focus for an unchanged location key", async () => {
    const user = userEvent.setup();
    renderHarness();
    const refresh = screen.getByRole("button", { name: "Background refresh" });
    refresh.focus();

    await user.click(refresh);

    expect(refresh).toHaveFocus();
    expect(ControlledMutationObserver.instances).toHaveLength(0);
  });

  it("leaves dialog open and close focus ownership to the overlay", async () => {
    const user = userEvent.setup();
    renderHarness();
    const trigger = screen.getByRole("button", { name: "Open editor" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Editor" })).toContainElement(
      document.activeElement as HTMLElement
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "Editor" })).getByRole("button", {
        name: "Close Editor"
      })
    );

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("observes only main while loading, then focuses a delayed heading and disconnects", async () => {
    const user = userEvent.setup();
    const view = renderHarness(["/login"], "loading");

    await user.click(screen.getByRole("link", { name: "Async page" }));

    const observer = ControlledMutationObserver.instances.at(-1)!;
    const main = screen.getByRole("main");
    expect(observer.observe).toHaveBeenCalledWith(main, {
      childList: true,
      subtree: true
    });
    expect(observer.disconnect).not.toHaveBeenCalled();

    view.rerender(
      <StrictMode>
        <MemoryRouter initialEntries={["/async"]}>
          <Harness asyncState="heading" />
        </MemoryRouter>
      </StrictMode>
    );
    act(() => observer.flush());

    expect(screen.getByRole("heading", { name: "Async destination" })).toHaveFocus();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it.each(["error", "empty"] as const)(
    "focuses main and ends observation for a terminal %s state without a heading",
    async (terminalState) => {
      const user = userEvent.setup();
      const view = renderHarness(["/login"], "loading");

      await user.click(screen.getByRole("link", { name: "Async page" }));
      const observer = ControlledMutationObserver.instances.at(-1)!;
      view.rerender(
        <StrictMode>
          <MemoryRouter initialEntries={["/login"]}>
            <Harness asyncState={terminalState} />
          </MemoryRouter>
        </StrictMode>
      );
      act(() => observer.flush());

      expect(screen.getByRole("main")).toHaveFocus();
      expect(observer.disconnect).toHaveBeenCalledTimes(1);
    }
  );

  it("disconnects a pending observer when the route changes and on unmount", async () => {
    const user = userEvent.setup();
    const view = renderHarness();
    const asyncLink = screen.getByRole("link", { name: "Async page" });

    await user.click(asyncLink);
    const routeChangeObserver = ControlledMutationObserver.instances.at(-1)!;
    await user.click(screen.getByRole("link", { name: "Second page" }));
    expect(routeChangeObserver.disconnect).toHaveBeenCalledTimes(1);

    await user.click(asyncLink);
    const unmountObserver = ControlledMutationObserver.instances.at(-1)!;
    view.unmount();
    expect(unmountObserver.disconnect).toHaveBeenCalledTimes(1);
  });

  it("renders no wrapper, live region, or duplicate page heading", () => {
    const { container } = renderHarness();

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("[aria-live]")).not.toBeInTheDocument();
  });
});
