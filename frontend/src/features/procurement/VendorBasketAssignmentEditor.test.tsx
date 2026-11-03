import axe from "axe-core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient } from "../../api/client";
import { renderWithQuery } from "../../test/render";
import * as knowledgeApi from "../ai-estimator-knowledge/knowledgeApi";
import type { KnowledgeMaster, ProcurementVendorDetail } from "../ai-estimator-knowledge/knowledgeTypes";
import { VendorBasketAssignmentEditor } from "./VendorBasketAssignmentEditor";
import * as vendorApi from "./vendorProfileApi";
import { completeVendor, vendorBasket, vendorSubBasket } from "./vendorProfile.fixtures";

const auth = vi.hoisted(() => ({ role: "super_admin", read: true, update: true, lifecycle: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "classification-actor", role: auth.role }, authorization: {} }) }));
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: (_: unknown, permission: string) => permission === "procurement.vendor_directory.read" ? auth.read : permission === "procurement.vendor_directory.update" ? auth.update : permission === "ai_estimator_knowledge.configuration.lifecycle" ? auth.lifecycle : false }));
vi.mock("./vendorProfileApi", async (original) => ({ ...await original<typeof import("./vendorProfileApi")>(), getVendorDetail: vi.fn(), updateVendorClassification: vi.fn() }));
vi.mock("../ai-estimator-knowledge/knowledgeApi", async (original) => ({ ...await original<typeof import("../ai-estimator-knowledge/knowledgeApi")>(), listKnowledgeBaskets: vi.fn(), listKnowledgeSubBaskets: vi.fn() }));

const secondBasket = { ...vendorBasket, id: "basket-two", name: "Electrical" };
const secondSub = { ...vendorSubBasket, id: "sub-two", basketId: secondBasket.id, name: "Lighting" };
const thirdSub = { ...vendorSubBasket, id: "sub-three", basketId: secondBasket.id, name: "Wiring" };
const page = <T,>(items: T[]) => ({ items, pagination: { offset: 0, limit: 100, total: items.length, hasMore: false } });
let stored: ProcurementVendorDetail;
function safe(vendor: ProcurementVendorDetail): KnowledgeMaster {
  const { procurementProfile: _profile, geoTaggedPicture: _photo, msmeCertificate: _certificate, ...summary } = vendor;
  return summary;
}
function start(props: Partial<Parameters<typeof VendorBasketAssignmentEditor>[0]> = {}) {
  const onClose = vi.fn(); const onSaved = vi.fn();
  return { onClose, onSaved, ...renderWithQuery(<VendorBasketAssignmentEditor vendorId={stored.id} canUpdate onClose={onClose} onSaved={onSaved} {...props} />) };
}
async function mainChoice(name: string) {
  const trigger = await screen.findByRole("button", { name: /^Main Baskets,/ });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  return screen.findByRole("checkbox", { name });
}
async function subChoice(name: string) {
  const trigger = await screen.findByRole("button", { name: /^Sub Baskets,/ });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  return screen.findByRole("checkbox", { name });
}
async function removeFirstGroup() {
  const choice = await mainChoice("Carpentry");
  await waitFor(() => expect(choice).toBeEnabled());
  fireEvent.click(choice);
  fireEvent.change(screen.getByRole("textbox", { name: "Correction reason" }), { target: { value: "Remove old category" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save assignments" })).toBeEnabled());
}

beforeEach(() => {
  vi.clearAllMocks(); auth.role = "super_admin"; auth.read = true; auth.update = true; auth.lifecycle = true;
  stored = structuredClone(completeVendor);
  stored.procurementProfile!.mainBasketIds = [vendorBasket.id, secondBasket.id];
  stored.procurementProfile!.subBasketIds = [vendorSubBasket.id, secondSub.id, thirdSub.id];
  stored.procurementSummary.mainBaskets.push({ id: secondBasket.id, name: secondBasket.name, status: "active" });
  stored.procurementSummary.subBaskets.push(...[secondSub, thirdSub].map(({ id, basketId, name }) => ({ id, basketId, name })));
  vi.mocked(vendorApi.getVendorDetail).mockImplementation(async () => structuredClone(stored));
  vi.mocked(vendorApi.updateVendorClassification).mockImplementation(async () => ({ ...safe(stored), version: stored.version + 1 }));
  vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue(page([vendorBasket, secondBasket]));
  vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockImplementation(async (id) => page(id === vendorBasket.id ? [vendorSubBasket] : [secondSub, thirdSub]));
});

describe("basket assignment correction", () => {
  it("removes a parent and its children while preserving an unequal second group", async () => {
    const view = start({ origin: { basketId: vendorBasket.id } });
    expect(await screen.findByText(/Review Main Basket Carpentry/)).toBeInTheDocument();
    await removeFirstGroup();
    fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    await waitFor(() => expect(view.onSaved).toHaveBeenCalledOnce());
    expect(vendorApi.updateVendorClassification).toHaveBeenCalledWith(stored.id, {
      expectedVersion: stored.version, mainBasketIds: [secondBasket.id], subBasketIds: [thirdSub.id, secondSub.id],
      reason: "Remove old category", idempotencyKey: expect.any(String)
    });
    expect(screen.getByText(/Basket assignments saved/)).toBeInTheDocument();
  });

  it("removes only the selected child and keeps its parent and sibling", async () => {
    start();
    const child = await subChoice("Lighting in Electrical");
    await waitFor(() => expect(child).toBeEnabled()); fireEvent.click(child);
    fireEvent.change(screen.getByRole("textbox", { name: "Correction reason" }), { target: { value: "Adjust services" } });
    fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    await waitFor(() => expect(vendorApi.updateVendorClassification).toHaveBeenCalledOnce());
    expect(vi.mocked(vendorApi.updateVendorClassification).mock.calls[0][1]).toMatchObject({ mainBasketIds: [vendorBasket.id, secondBasket.id], subBasketIds: [vendorSubBasket.id, thirdSub.id] });
  });

  it("requires a replacement for the final pair and keeps the required reason", async () => {
    stored = structuredClone(completeVendor); start();
    const first = await mainChoice("Carpentry");
    await waitFor(() => expect(first).toBeEnabled()); fireEvent.click(first);
    fireEvent.change(screen.getByRole("textbox", { name: "Correction reason" }), { target: { value: "Replace assignment" } });
    expect(screen.getByText(/At least one Main Basket\/Sub Basket pair/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save assignments" })).toBeDisabled();
    fireEvent.click(await mainChoice("Electrical"));
    fireEvent.click(await subChoice("Lighting in Electrical"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save assignments" })).toBeEnabled());
  });

  it("allows authorized archived correction without exposing profile/status controls", async () => {
    stored = { ...stored, status: "archived" }; const view = start();
    expect(await screen.findByText(/This vendor remains archived/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Entity Name" })).not.toBeInTheDocument();
    await removeFirstGroup(); fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    await waitFor(() => expect(view.onSaved).toHaveBeenCalledOnce());
    expect(view.onSaved.mock.calls[0][0].status).toBe("archived");
    expect(Object.keys(vi.mocked(vendorApi.updateVendorClassification).mock.calls[0][1]).sort()).toEqual(["expectedVersion", "idempotencyKey", "mainBasketIds", "reason", "subBasketIds"]);
  });

  it.each(["procurement", "super_admin"])("denies archived corrections without the extra authority for %s", async (role) => {
    stored = { ...stored, status: "archived" }; auth.role = role; auth.lifecycle = false; start();
    expect(await screen.findByText("You do not have permission to change these assignments.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save assignments" })).toBeDisabled();
    expect(vendorApi.updateVendorClassification).not.toHaveBeenCalled();
  });

  it("freezes an uncertain save and retries the identical command", async () => {
    vi.mocked(vendorApi.updateVendorClassification).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Connection interrupted"));
    const view = start(); await removeFirstGroup(); fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    const retry = await screen.findByRole("button", { name: "Retry same save" });
    expect(screen.getByRole("textbox", { name: "Correction reason" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(retry); await waitFor(() => expect(view.onSaved).toHaveBeenCalledOnce());
    expect(vi.mocked(vendorApi.updateVendorClassification).mock.calls[1]).toEqual(vi.mocked(vendorApi.updateVendorClassification).mock.calls[0]);
  });

  it("keeps a conflicted draft until explicitly reloaded", async () => {
    vi.mocked(vendorApi.updateVendorClassification).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Vendor changed"));
    start(); await removeFirstGroup(); fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    const reload = await screen.findByRole("button", { name: "Discard draft and reload assignments" });
    expect(screen.getByRole("textbox", { name: "Correction reason" })).toHaveValue("Remove old category");
    expect(vendorApi.getVendorDetail).toHaveBeenCalledTimes(1);
    stored = { ...stored, version: 4 };
    fireEvent.click(reload);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Correction reason" })).toHaveValue(""));
    await removeFirstGroup(); fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    await waitFor(() => expect(vendorApi.updateVendorClassification).toHaveBeenCalledTimes(2));
    expect(vi.mocked(vendorApi.updateVendorClassification).mock.calls[1][1].expectedVersion).toBe(4);
  });

  it("preserves a conflicted selection when reloading fails", async () => {
    vi.mocked(vendorApi.updateVendorClassification).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Vendor changed"));
    start(); await removeFirstGroup(); fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    const reload = await screen.findByRole("button", { name: "Discard draft and reload assignments" });
    vi.mocked(vendorApi.getVendorDetail).mockRejectedValueOnce(new Error("Reload unavailable")); fireEvent.click(reload);
    expect(await screen.findByText("Reload unavailable")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Correction reason" })).toHaveValue("Remove old category");
    expect(screen.getByRole("button", { name: "Save assignments" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Discard draft and reload assignments" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Correction reason" })).toHaveValue(""));
  });

  it("shows server selection errors and permits correcting a rejected command", async () => {
    vi.mocked(vendorApi.updateVendorClassification).mockRejectedValueOnce(new ApiError(422, "VALIDATION_ERROR", "Review assignments", { "procurementProfile.subBasketIds": "This Sub Basket is no longer available." }));
    start(); await removeFirstGroup(); fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    expect(await screen.findByText("This Sub Basket is no longer available.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Correction reason" })).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Correction reason" }), { target: { value: "Reviewed selection" } });
    fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    await waitFor(() => expect(vendorApi.updateVendorClassification).toHaveBeenCalledTimes(2));
    expect(vi.mocked(vendorApi.updateVendorClassification).mock.calls[1][1].idempotencyKey).not.toEqual(vi.mocked(vendorApi.updateVendorClassification).mock.calls[0][1].idempotencyKey);
  });

  it("blocks route navigation until a dirty assignment draft is discarded", async () => {
    const router = createMemoryRouter([{ path: "/vendor", element: <VendorBasketAssignmentEditor vendorId={stored.id} canUpdate onClose={vi.fn()} onSaved={vi.fn()} /> }, { path: "/configuration", element: <p>Configuration destination</p> }], { initialEntries: ["/vendor"] });
    renderWithQuery(<RouterProvider router={router} />); await removeFirstGroup();
    await act(async () => { await router.navigate("/configuration"); });
    expect(await screen.findByRole("alertdialog", { name: "Leave basket assignments?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/vendor");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await act(async () => { await router.navigate("/configuration"); });
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByText("Configuration destination")).toBeInTheDocument();
  });

  it("confirms discarding on cancel and retains the draft when staying", async () => {
    const user = userEvent.setup(); const view = start(); await removeFirstGroup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const prompt = await screen.findByRole("alertdialog", { name: "Leave basket assignments?" });
    await user.click(within(prompt).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: "Correction reason" })).toHaveValue("Remove old category");
    expect(view.onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    expect(view.onClose).toHaveBeenCalledOnce();
  });

  it("separates a confirmed save from refresh retry", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("Refresh unavailable")).mockResolvedValue(undefined);
    start({ onSaved: refresh }); await removeFirstGroup(); fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry vendor refresh" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(vendorApi.updateVendorClassification).toHaveBeenCalledOnce();
  });

  it("shows load failure and retry without fetching when directory access is denied", async () => {
    auth.read = false; const view = start();
    expect(screen.getByText(/You do not have permission to view this vendor/)).toBeInTheDocument();
    expect(vendorApi.getVendorDetail).not.toHaveBeenCalled(); view.unmount(); auth.read = true;
    vi.mocked(vendorApi.getVendorDetail).mockRejectedValueOnce(new Error("Catalog unavailable")); start();
    fireEvent.click(await screen.findByRole("button", { name: "Retry vendor assignments" }));
    expect(await screen.findByRole("textbox", { name: "Correction reason" })).toBeInTheDocument();
  });

  it("hides private selections after a denied save", async () => {
    vi.mocked(vendorApi.updateVendorClassification).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Access changed"));
    start(); await removeFirstGroup(); fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    expect(await screen.findByText(/Your access to these assignments has changed/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Correction reason" })).not.toBeInTheDocument();
    expect(screen.queryByText(stored.name)).not.toBeInTheDocument();
  });

  it("keeps pending saves locked and exposes accessible selection controls", async () => {
    let resolve!: (value: KnowledgeMaster) => void;
    vi.mocked(vendorApi.updateVendorClassification).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    start(); await removeFirstGroup();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Save assignments" }));
    await waitFor(() => expect(vendorApi.updateVendorClassification).toHaveBeenCalledOnce());
    expect(screen.getByRole("textbox", { name: "Correction reason" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => resolve(safe(stored)));
  });

  it("checks the classification response identity before accepting it", async () => {
    const actual = await vi.importActual<typeof import("./vendorProfileApi")>("./vendorProfileApi");
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValueOnce({ ...safe(stored), id: "unrelated-vendor" });
    await expect(actual.updateVendorClassification(stored.id, { expectedVersion: 1, mainBasketIds: [vendorBasket.id], subBasketIds: [vendorSubBasket.id], reason: "Correct category", idempotencyKey: "classification-command" })).rejects.toThrow("different vendor");
    patch.mockRestore();
  });
});
