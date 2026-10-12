import axe from "axe-core";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, it, vi } from "vitest";
import type { PermissionCode } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import "../../test/render";
import { server } from "../../test/server";
import { proposalFixture } from "../vendor-basket-proposals/proposal.fixtures";
import type { ProposalDetail } from "../vendor-basket-proposals/proposalTypes";
import { ProcurementRequestsPage } from "./ProcurementRequestsPage";
import { vendorBasketRequestKeys, type VendorBasketRequest } from "./vendorBasketRequestApi";
let actor = "procurement-one";
let permissions: PermissionCode[];
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: actor, role: "procurement" }, authorization: authorizationFor("procurement", permissions) }) }));
vi.mock("../vendor-basket-proposals/ProposalWorkspace", () => ({ ProposalWorkspace: ({ proposalId, onClose, onSubmitted }: { proposalId: string; onClose: () => void; onSubmitted: (proposal: ProposalDetail) => void }) => <section role="dialog" aria-label="Basket configuration"><p>{proposalId}</p><button onClick={onClose}>Close configuration</button><button onClick={() => onSubmitted(proposalFixture({ name: "Revised stone", status: "pending" }))}>Submit configuration</button></section> }));
vi.mock("../vendor-basket-proposals/OwnProposalList", () => ({ OwnProposalList: ({ draftsOnly, onClose, onSubmitted }: { draftsOnly: boolean; onClose: () => void; onSubmitted: (proposal: ProposalDetail) => void }) => <section role="dialog" aria-label="Saved drafts"><p>{draftsOnly ? "Only saved drafts" : "All proposals"}</p><button onClick={onClose}>Close drafts</button><button onClick={() => onSubmitted(proposalFixture({ name: "Draft stone", status: "pending" }))}>Submit draft</button></section> }));
const row = (values: Partial<VendorBasketRequest> = {}): VendorBasketRequest => ({ id: "request-one", requesterId: actor, vendorId: null, vendorName: null, proposedName: "Stone finishes", status: "pending", version: 1, basketId: null, subBasketId: null, mainLineId: null, reason: null, createdAt: "2026-10-12T04:00:00.000Z", decidedAt: null, decidedById: null, kind: "configuration_proposal", proposalId: "proposal-one", ...values });
let rows: VendorBasketRequest[];
let requests: URLSearchParams[];
let responseStatus: number;
let total: number;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => <QueryClientProvider client={client}><ProcurementRequestsPage /></QueryClientProvider>;
  return { ...render(view()), client, view };
}
beforeEach(() => {
  actor = "procurement-one"; permissions = ["procurement.vendor_directory.read", "procurement.vendor_basket_proposal.read"]; rows = [row(), row({ id: "legacy", kind: "name_only", proposalId: null, proposedName: "Legacy painting", status: "rejected", reason: "A matching basket already exists.", target: { kind: "new_sub_basket", basketId: "main-one" }, targetParentName: "Painting" })]; requests = []; responseStatus = 200; total = rows.length;
  server.use(http.get("/api/v1/procurement/vendor-basket-requests/mine", ({ request }) => {
    const params = new URL(request.url).searchParams; requests.push(params);
    if (responseStatus !== 200) return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Requests unavailable" } }, { status: responseStatus });
    const limit = Number(params.get("limit")); const offset = Number(params.get("offset"));
    return HttpResponse.json({ data: { items: rows, pagination: { limit, offset, total, hasMore: offset + limit < total } } });
  }));
});
it("renders submitted requests and legacy detail with canonical status and Vendors styling", async () => {
  const user = userEvent.setup(); const view = setup();
  const table = await screen.findByRole("table", { name: "Your submitted basket requests and statuses" });
  expect(table).toHaveClass("vendor-directory__table"); expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(within(table).getByText("Awaiting Super Admin")).toBeVisible();
  expect(screen.queryByText("Vendor name")).not.toBeInTheDocument();
  expect(screen.getByText("Showing 1 to 2 of 2 requests")).toBeVisible();
  expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  await user.click(screen.getByRole("button", { name: "View request: Legacy painting" }));
  const detail = screen.getByRole("dialog", { name: "Legacy painting" });
  expect(within(detail).getByText("A matching basket already exists.")).toBeVisible(); expect(within(detail).getByText("Painting")).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Basket configuration" })).not.toBeInTheDocument();
});
it("sends filters before pagination and resets the page on filter and page-size changes", async () => {
  total = 30; const user = userEvent.setup(); setup(); await screen.findByText("Stone finishes");
  await user.click(screen.getByRole("button", { name: "Next" })); await waitFor(() => expect(requests.at(-1)?.get("offset")).toBe("10"));
  await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "rejected"); await waitFor(() => expect(requests.at(-1)?.get("status")).toBe("rejected")); expect(requests.at(-1)?.get("offset")).toBe("0");
  await user.selectOptions(screen.getByRole("combobox", { name: "Request type" }), "new_sub_basket");
  await user.type(screen.getByRole("searchbox", { name: "Search requests" }), " painting{Enter}");
  await waitFor(() => expect(requests.at(-1)?.get("search")).toBe("painting")); expect(requests.at(-1)?.get("targetKind")).toBe("new_sub_basket");
  await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "25"); await waitFor(() => expect(requests.at(-1)?.get("limit")).toBe("25")); expect(requests.at(-1)?.get("offset")).toBe("0");
  await user.click(screen.getByRole("button", { name: "Reset" })); await waitFor(() => expect(requests.at(-1)?.has("search")).toBe(false)); expect(requests.at(-1)?.has("status")).toBe(false); expect(requests.at(-1)?.has("requesterId")).toBe(false);
});
it("opens configurations and saved drafts and closes them after confirmed submission", async () => {
  const user = userEvent.setup(); setup(); await user.click(await screen.findByRole("button", { name: "View request: Stone finishes" }));
  expect(screen.getByRole("dialog", { name: "Basket configuration" })).toHaveTextContent("proposal-one"); const before = requests.length;
  await user.click(screen.getByRole("button", { name: "Submit configuration" })); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Revised stone submitted to Super Admin.")).toBeVisible(); await waitFor(() => expect(requests.length).toBeGreaterThan(before));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toHaveFocus());
  await user.click(screen.getByRole("button", { name: "Saved drafts" })); expect(screen.getByText("Only saved drafts")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Submit draft" })); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.getByText("Draft stone submitted to Super Admin.")).toBeVisible();
});
it("clears private rows and detail on identity or permission change", async () => {
  const user = userEvent.setup(); const view = setup(); await user.click(await screen.findByRole("button", { name: "View request: Stone finishes" }));
  actor = "procurement-two"; rows = []; total = 0; view.rerender(view.view()); await screen.findByText(/No requests submitted yet/);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(view.client.getQueryCache().findAll({ queryKey: vendorBasketRequestKeys.mineActor("procurement-one") })).toEqual([]);
  permissions = []; view.rerender(view.view()); expect(screen.getByText("You do not have permission to view these requests.")).toBeVisible(); expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("preserves stale statuses during refresh errors and clears them after a server denial", async () => {
  const user = userEvent.setup(); const view = setup(); await screen.findByText("Stone finishes"); responseStatus = 503;
  await user.click(screen.getByRole("button", { name: "Refresh" })); expect(await screen.findByText("Requests could not be refreshed. Showing the last loaded statuses.")).toBeVisible(); expect(screen.getByText("Stone finishes")).toBeVisible();
  responseStatus = 403; await user.click(screen.getByRole("button", { name: "Retry requests" })); await screen.findByText("You do not have permission to view these requests.");
  expect(screen.queryByText("Stone finishes")).not.toBeInTheDocument(); await waitFor(() => expect(view.client.getQueryCache().findAll({ queryKey: vendorBasketRequestKeys.mineActor(actor) }).every(query => query.state.data === undefined)).toBe(true));
});
it("refreshes decisions on focus and shows filtered empty and initial error states", async () => {
  const user = userEvent.setup(); const view = setup(); await screen.findByText("Stone finishes"); rows = [row({ status: "fulfilled" })]; total = 1;
  try { await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); }); await screen.findByText("Approved and active", { selector: "span" }); } finally { focusManager.setFocused(undefined); }
  rows = []; total = 0; await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "rejected"); await screen.findByText(/No requests match this view/);
  view.unmount(); responseStatus = 503; setup(); expect(await screen.findByRole("button", { name: "Retry requests" })).toBeVisible(); expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
