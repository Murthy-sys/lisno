import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { basketDeletionState, CONFIGURATION_PATH, readBasketDeletionContext, useOpenBasketVendor } from "./basketDeletionNavigation";
import { KnowledgeUnsavedChangesDialog } from "./KnowledgeUnsavedChangesDialog";
import { useUnsavedKnowledgeGuard } from "./useUnsavedKnowledgeGuard";

const target = { path: CONFIGURATION_PATH, basketId: "basket-one", subBasketId: "sub-one" };
const workspacePath = `${CONFIGURATION_PATH}/items/item-one`;

describe("basket deletion navigation context", () => {
  it("reads only stable target fields from supported local routes", () => {
    expect(readBasketDeletionContext({ ...target, confirmationName: "Confirmed earlier", delete: true })).toEqual(target);
    expect(readBasketDeletionContext({ path: workspacePath, basketId: "basket-one", subBasketId: "sub-one" })).toEqual({ ...target, path: workspacePath });
    expect(readBasketDeletionContext({ path: CONFIGURATION_PATH, basketId: "basket-one" })).toEqual({ path: CONFIGURATION_PATH, basketId: "basket-one" });
    expect(basketDeletionState({ basketDeletionReturn: target }, "basketDeletionReturn")).toEqual(target);
    expect(basketDeletionState({ basketDeletionTarget: target }, "basketDeletionTarget")).toEqual(target);
  });

  it.each([
    null, [], "outside", {}, { ...target, basketId: "" }, { ...target, basketId: "\u0000bad" },
    { ...target, subBasketId: "" }, { ...target, subBasketId: "\u007fbad" },
    { ...target, basketId: "a".repeat(241) }, { ...target, path: "https://example.invalid" },
    { ...target, path: "//example.invalid/path" }, { ...target, path: "/procurement/vendors" },
    { ...target, path: `${CONFIGURATION_PATH}?redirect=https://example.invalid` },
    { ...target, path: `${CONFIGURATION_PATH}/items/../outside` },
    { ...target, path: `${CONFIGURATION_PATH}/items/%2e%2e` },
    { ...target, path: `${CONFIGURATION_PATH}/items/%2foutside` },
    { ...target, path: `${CONFIGURATION_PATH}/items/%5coutside` },
    { ...target, path: `${CONFIGURATION_PATH}/items/%00` },
    { ...target, path: `${CONFIGURATION_PATH}/items/%E0%A4%A` },
    { ...target, path: `${CONFIGURATION_PATH}/items/item-one#outside` },
    { ...target, path: workspacePath, subBasketId: undefined }
  ])("rejects malformed or external context %#", (value) => {
    expect(readBasketDeletionContext(value)).toBeNull();
    expect(basketDeletionState({ basketDeletionTarget: value }, "basketDeletionTarget")).toBeNull();
  });
});

function NavigationHarness({ save, discard, dirtyInitially = true }: {
  save: () => Promise<boolean>; discard: () => void; dirtyInitially?: boolean;
}) {
  const [draft, setDraft] = useState("Unsaved Main Line draft");
  const [dirty, setDirty] = useState(dirtyInitially);
  const openVendor = useOpenBasketVendor();
  const guard = useUnsavedKnowledgeGuard({
    hasUnsavedChanges: dirty,
    onSave: async () => { const saved = await save(); if (saved) setDirty(false); return saved; },
    onDiscard: () => { discard(); setDirty(false); }
  });
  return <>
    <label>Main Line draft<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
    <button onClick={() => openVendor("vendor/one", "basket-one", "sub-one")}>Open duplicate vendor A</button>
    <button onClick={() => openVendor("vendor/two", "basket-one", "sub-one")}>Open duplicate vendor B</button>
    {guard.dialogOpen ? <KnowledgeUnsavedChangesDialog onSave={() => void guard.saveAndContinue()}
      onDiscard={guard.discardAndContinue} onStay={guard.stayHere} busy={guard.busy} error={guard.error} /> : null}
  </>;
}

function start(dirtyInitially = true, save = vi.fn().mockResolvedValue(true)) {
  const discard = vi.fn();
  const router = createMemoryRouter([
    { path: workspacePath, element: <NavigationHarness dirtyInitially={dirtyInitially} save={save} discard={discard} /> },
    { path: "/admin/procurement/vendors/:vendorId", element: <h1>Exact vendor destination</h1> }
  ], { initialEntries: [workspacePath] });
  render(<RouterProvider router={router} />);
  return { router, save, discard };
}

describe("opening blocker vendors through ordinary router navigation", () => {
  it("navigates in the same router to the encoded exact vendor ID with typed return context", async () => {
    const { router } = start(false); await userEvent.setup().click(screen.getByRole("button", { name: "Open duplicate vendor B" }));
    expect(await screen.findByRole("heading", { name: "Exact vendor destination" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/admin/procurement/vendors/vendor%2Ftwo");
    expect(router.state.location.state).toEqual({ basketDeletionReturn: { ...target, path: workspacePath } });
  });

  it("Stay preserves the draft and restores focus without changing the route", async () => {
    const { router, save, discard } = start(); const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Open duplicate vendor A" });
    await user.click(trigger); expect(await screen.findByRole("alertdialog")).toBeVisible();
    expect(router.state.location.pathname).toBe(workspacePath);
    await user.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("textbox", { name: "Main Line draft" })).toHaveValue("Unsaved Main Line draft");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(save).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled();
  });

  it.each(["Discard changes", "Save changes"])("%s continues the blocked exact-vendor navigation", async (choice) => {
    const { router, save, discard } = start(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open duplicate vendor A" }));
    await user.click(await screen.findByRole("button", { name: choice }));
    expect(await screen.findByRole("heading", { name: "Exact vendor destination" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/admin/procurement/vendors/vendor%2Fone");
    expect(router.state.location.state).toEqual({ basketDeletionReturn: { ...target, path: workspacePath } });
    expect(choice === "Save changes" ? save : discard).toHaveBeenCalledOnce();
  });

  it("a failed save keeps the draft and vendor navigation pending", async () => {
    const { router } = start(true, vi.fn().mockResolvedValue(false)); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open duplicate vendor A" }));
    await user.click(await screen.findByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your changes were not saved");
    expect(router.state.location.pathname).toBe(workspacePath);
    expect(screen.getByRole("textbox", { name: "Main Line draft" })).toHaveValue("Unsaved Main Line draft");
  });
});
