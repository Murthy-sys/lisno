import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, PermissionCode } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { CONFIGURATION_PATH } from "../ai-estimator-knowledge/basketDeletionNavigation";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import { syncVendorClassificationMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";
import { VendorKpiStaffPage } from "./VendorKpiStaffPage";
import { completeVendor } from "./vendorProfile.fixtures";

let role: Role = "super_admin";
let permissions: readonly PermissionCode[] | undefined;
let archived = true;
let client: QueryClient;
let latestOrigin: unknown;
const data = (value: unknown) => HttpResponse.json({ data: value });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "resolution-admin", role }, authorization: authorizationFor(role, permissions) }) }));
vi.mock("./VendorLoginAccessPanel", () => ({ VendorLoginAccessPanel: () => null }));
vi.mock("./VendorBasketAssignmentEditor", () => ({ VendorBasketAssignmentEditor: ({ vendorId, origin, onSaved }: {
  vendorId: string; origin?: unknown; onSaved: (value: unknown) => Promise<void>;
}) => { latestOrigin = origin; return <button onClick={() => void onSaved({ ...completeVendor, id: vendorId })}>Confirm test assignment save</button>; } }));

function Destination() {
  const location = useLocation();
  return <><h1>Configuration destination</h1><output aria-label="Return target">{JSON.stringify(location.state)}</output></>;
}
function Capture() { client = useQueryClient(); return null; }
function start(state?: unknown) {
  return renderWithQuery(<MemoryRouter initialEntries={[{ pathname: "/admin/procurement/vendors/vendor-one", state }]}>
    <Capture /><Routes><Route path="/admin/procurement/vendors/:vendorId" element={<VendorKpiStaffPage />} /><Route path={CONFIGURATION_PATH} element={<Destination />} /><Route path="/admin/procurement/vendors" element={<h1>Vendor directory</h1>} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => {
  role = "super_admin"; permissions = undefined; archived = true; latestOrigin = undefined;
  server.use(http.get("/api/v1/procurement/vendor-kpis/vendor-one", () => data({
    vendor: { id: "vendor-one", code: "DEMO", name: "Synthetic retained vendor", status: archived ? "archived" : "active", vendorType: "execution", workProfile: "Fixture", mainBasketNames: ["Carpentry"], subBasketNames: ["Cabinets"], emailAvailable: false },
    rubricVersion: 1, selfAssessment: null, procurementAssessment: null, officialScoreBps: null, request: null, requestEligibility: "missing_profile"
  })), http.get("/api/v1/procurement/vendor-inductions/vendor-one", () => data({
    vendor: { id: "vendor-one", name: "Synthetic retained vendor", vendorType: "execution", emailAvailable: false },
    activation: { lifecycleStatus: "archived", effectiveStatus: "archived", gates: { inductionApproved: false, vendorSelfKpiComplete: false, procurementKpiComplete: false, profileComplete: true, physicalAddressVerified: false } },
    draft: null, published: null, request: null, requestEligibility: "archived", submission: null, review: null, history: { submissions: [], reviews: [] }
  })));
});

describe("vendor details from basket deletion", () => {
  it("opens assignment correction for an archived Super Admin vendor and returns the exact target", async () => {
    const target = { path: CONFIGURATION_PATH, basketId: "basket-two", subBasketId: "sub-other" };
    start({ basketDeletionReturn: target });
    fireEvent.click(await screen.findByRole("button", { name: "Manage basket assignments" }));
    expect(latestOrigin).toEqual(target);
    expect(screen.queryByRole("button", { name: "Edit vendor" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm test assignment save" }));
    await screen.findByText(/Basket assignments saved/);
    fireEvent.click(screen.getByRole("link", { name: "Back to basket deletion" }));
    await screen.findByRole("heading", { name: "Configuration destination" });
    expect(JSON.parse(screen.getByLabelText("Return target").textContent!)).toEqual({ basketDeletionTarget: target });
  });

  it("rejects arbitrary return URLs and keeps normal directory navigation", async () => {
    start({ basketDeletionReturn: { path: "https://outside.invalid", basketId: "basket-two" } });
    await screen.findByRole("heading", { name: "Synthetic retained vendor" });
    expect(screen.queryByRole("link", { name: "Back to basket deletion" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to vendors" })).toHaveAttribute("href", "/admin/procurement/vendors");
  });

  it("does not expose archived corrections to Procurement", async () => {
    role = "procurement"; start();
    await screen.findByRole("heading", { name: "Synthetic retained vendor" });
    expect(screen.queryByRole("button", { name: "Manage basket assignments" })).not.toBeInTheDocument();
  });

  it("requires directory read and update access even when KPI details are readable", async () => {
    permissions = ["procurement.vendor_kpi.read"]; start();
    await screen.findByRole("heading", { name: "Synthetic retained vendor" });
    expect(screen.queryByRole("button", { name: "Manage basket assignments" })).not.toBeInTheDocument();
  });

  it("invalidates blocker lists and both impacts without placing private detail in catalogs", async () => {
    start(); await screen.findByRole("heading", { name: "Synthetic retained vendor" });
    const keys = [
      [...knowledgeQueryKeys.masterLists("vendors"), "blockers", "resolution-admin"],
      knowledgeQueryKeys.basketDeletionImpact("basket-two"),
      knowledgeQueryKeys.subBasketDeletionImpact("basket-two", "sub-other"),
      [...knowledgeQueryKeys.vendorDetails(), "resolution-admin", "vendor-one"]
    ];
    keys.forEach(key => client.setQueryData(key, { sentinel: key[0] }));
    await syncVendorClassificationMutation(client);
    await waitFor(() => keys.forEach(key => expect(client.getQueryState(key)?.isInvalidated).toBe(true)));
    expect(client.getQueryData(keys[0])).toEqual({ sentinel: keys[0][0] });
  });
});
