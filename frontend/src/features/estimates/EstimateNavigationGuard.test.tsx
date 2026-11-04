import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { EstimateNavigationGuard } from "./EstimateNavigationGuard";

function setup(onSave = vi.fn(async () => true), saveDisabled = false) {
  const router = createMemoryRouter([
    { path: "/estimate", element: <><h1>Working estimate</h1><Link to="/project">Back to project</Link>
      <EstimateNavigationGuard dirty busy={false} saveDisabled={saveDisabled} onSave={onSave} /></> },
    { path: "/project", element: <h1>Project overview</h1> }
  ], { initialEntries: ["/estimate"] });
  render(<RouterProvider router={router} />);
  return { router, onSave, user: userEvent.setup() };
}

describe("EstimateNavigationGuard", () => {
  it("keeps unsaved work in place when the user chooses Keep editing", async () => {
    const { user, router, onSave } = setup();
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    expect(await screen.findByRole("alertdialog", { name: "Leave estimate with unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/estimate");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("allows explicit discard without invoking the save operation", async () => {
    const { user, router, onSave } = setup();
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    await user.click(await screen.findByRole("button", { name: "Discard and leave" }));
    expect(await screen.findByRole("heading", { name: "Project overview" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/project");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("waits for a single confirmed save before leaving and locks competing dialog actions", async () => {
    let finish!: (confirmed: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const { user, router } = setup(save);
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    await user.dblClick(await screen.findByRole("button", { name: "Save and leave" }));
    expect(save).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe("/estimate");
    expect(screen.getByRole("button", { name: "Discard and leave" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeDisabled();
    await act(async () => finish(true));
    expect(await screen.findByRole("heading", { name: "Project overview" })).toBeVisible();
  });

  it("stays on the estimate when save confirmation fails and allows returning to edit", async () => {
    const { user, router, onSave } = setup(vi.fn(async () => false));
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    await user.click(await screen.findByRole("button", { name: "Save and leave" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The save could not be confirmed");
    expect(router.state.location.pathname).toBe("/estimate");
    expect(onSave).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Working estimate" })).toBeVisible();
  });

  it("does not let invalid input use Save and leave", async () => {
    const { user, onSave } = setup(vi.fn(async () => true), true);
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    expect(await screen.findByRole("button", { name: "Save and leave" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeEnabled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
