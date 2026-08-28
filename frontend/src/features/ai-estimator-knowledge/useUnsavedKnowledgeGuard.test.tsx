import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMemoryRouter, Link, RouterProvider, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeUnsavedChangesDialog } from "./KnowledgeUnsavedChangesDialog";
import { useUnsavedKnowledgeGuard } from "./useUnsavedKnowledgeGuard";

function GuardHarness({ onSave }: { readonly onSave: () => Promise<boolean> }) {
  const [dirty, setDirty] = useState(true);
  const [destination, setDestination] = useState("editing");
  const guard = useUnsavedKnowledgeGuard({
    hasUnsavedChanges: dirty,
    onSave: async () => {
      const saved = await onSave();
      if (saved) setDirty(false);
      return saved;
    },
    onDiscard: () => setDirty(false)
  });

  return (
    <>
      <p>{destination}</p>
      <button
        type="button"
        onClick={() => guard.requestNavigation(() => setDestination("pricing"))}
      >
        Open pricing
      </button>
      {guard.dialogOpen ? (
        <KnowledgeUnsavedChangesDialog
          onSave={() => void guard.saveAndContinue()}
          onDiscard={guard.discardAndContinue}
          onStay={guard.stayHere}
          busy={guard.busy}
          error={guard.error}
        />
      ) : null}
    </>
  );
}

describe("useUnsavedKnowledgeGuard", () => {
  it("blocks router Link navigation and restores focus when the user stays", async () => {
    const user = userEvent.setup();
    function RoutedHarness() {
      const location = useLocation();
      const guard = useUnsavedKnowledgeGuard({ hasUnsavedChanges: true, onSave: async () => true, onDiscard: () => undefined });
      return <><p>{location.pathname}</p><Link to="/outside">Outside</Link>{guard.dialogOpen ? <KnowledgeUnsavedChangesDialog onSave={() => void guard.saveAndContinue()} onDiscard={guard.discardAndContinue} onStay={guard.stayHere} busy={guard.busy} error={guard.error} /> : null}</>;
    }
    const router = createMemoryRouter([{ path: "*", element: <RoutedHarness /> }], { initialEntries: ["/workspace"] });
    render(<RouterProvider router={router} />);
    const link = screen.getByRole("link", { name: "Outside" });
    await user.click(link);
    expect(screen.getByText("/workspace")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stay here" }));
    await waitFor(() => expect(link).toHaveFocus());
  });

  it("blocks in-app navigation until save succeeds", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(true);
    render(<GuardHarness onSave={save} />);

    await user.click(screen.getByRole("button", { name: "Open pricing" }));
    expect(screen.getByText("editing")).toBeVisible();
    expect(screen.getByRole("alertdialog")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(save).toHaveBeenCalledOnce();
    expect(await screen.findByText("pricing")).toBeVisible();
  });

  it("keeps the user in place after a failed save", async () => {
    const user = userEvent.setup();
    render(<GuardHarness onSave={vi.fn().mockResolvedValue(false)} />);

    await user.click(screen.getByRole("button", { name: "Open pricing" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your changes were not saved."
    );
    expect(screen.getByText("editing")).toBeVisible();
  });

  it("registers native unload protection only while dirty", () => {
    render(<GuardHarness onSave={vi.fn().mockResolvedValue(true)} />);
    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
