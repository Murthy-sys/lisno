import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { vendorBasketRequestKeys } from "../procurement/vendorBasketRequestApi";
import { OwnProposalList } from "./OwnProposalList";
import { proposalFixture } from "./proposal.fixtures";
import { proposalKeys } from "./proposalApi";
import type { ProposalDetail } from "./proposalTypes";

let actor = "procurement-one";
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: actor, role: "procurement" }, authorization: authorizationFor("procurement") }) }));
vi.mock("./ProposalIntakeWorkspace", () => ({ ProposalIntakeWorkspace: ({ proposalId, scope, onClose, onSubmitted, onBusyChange }: { proposalId: string; scope: string; onClose: () => void; onSubmitted: (proposal: ProposalDetail) => void; onBusyChange?: (busy: boolean) => void }) => <section role="dialog" aria-label="Basket request"><p>{proposalId}</p><p>{scope}</p><button onClick={onClose}>Close request</button><button onClick={() => onBusyChange?.(true)}>Start saving request</button><button onClick={() => { onBusyChange?.(false); onSubmitted(proposalFixture({ name: "Requested finishes", requestMode: "hierarchy_intake", status: "pending" })); }}>Submit request</button></section> }));
const data = (value: unknown) => HttpResponse.json({ data: value });
const page = (items: unknown[], more = false, offset = 0) => data({ items, pagination: { total: more ? 21 : items.length, limit: 20, offset, hasMore: more } });
let rows: ProposalDetail[];
let params: URLSearchParams[];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = <QueryClientProvider client={client}><OwnProposalList onClose={vi.fn()} /></QueryClientProvider>;
  return { ...render(view), getClient: () => client, view: () => <QueryClientProvider client={client}><OwnProposalList onClose={vi.fn()} /></QueryClientProvider> };
}
beforeEach(() => {
  actor = "procurement-one"; rows = [proposalFixture()]; params = [];
  server.use(http.get("/api/v1/procurement/vendor-basket-proposals/mine", ({ request }) => { params.push(new URL(request.url).searchParams); return page(rows); }),
    http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one", () => data(rows[0])),
    http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/hierarchy", () => page([])),
    http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/masters/:kind", () => page([])),
    http.get("/api/v1/procurement/vendor-basket-proposals/references", () => page([])),
    http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/readiness", () => data({ head: rows[0].head, version: 1, requestVersion: null, ready: false, findings: [] })));
});

it("resumes saved drafts and filters the own requests list using backend status", async () => {
  const user = userEvent.setup(); setup();
  await user.click(await screen.findByRole("button", { name: "Resume draft" }));
  expect(await screen.findByRole("dialog", { name: "Configure Main Basket" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Close" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Request status" }), "pending");
  await waitFor(() => expect(params.at(-1)?.get("status")).toBe("pending"));
});

it("refreshes live basket consumers when another session approves an own request", async () => {
  rows = [proposalFixture({ status: "pending" })]; const view = setup();
  await screen.findByText(/Awaiting Super Admin ·/);
  view.getClient().setQueryData(["ai-estimator-knowledge", "baskets", "vendor-active-catalog"], { items: [] });
  rows = [proposalFixture({ status: "fulfilled", publishedBasketId: "basket-proposal" })];
  try { await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); }); await screen.findByText(/Approved and active ·/); }
  finally { focusManager.setFocused(undefined); }
  expect(view.getClient().getQueryState(["ai-estimator-knowledge", "baskets", "vendor-active-catalog"])?.isInvalidated).toBe(true);
});

it("does not retain another actor's cached list after an identity change", async () => {
  const view = setup(); await screen.findByRole("button", { name: "Resume draft" });
  actor = "procurement-two"; rows = []; view.rerender(view.view());
  await screen.findByText(/No basket requests in this view/);
  expect(screen.queryByText("Stone finishes")).not.toBeInTheDocument();
  expect(view.getClient().getQueryCache().findAll({ queryKey: proposalKeys.actor("procurement-one") })).toEqual([]);
});

it("loads saved drafts using the backend draft filter without a submitted-request selector", async () => {
  rows = [proposalFixture({ vendorName: null })];
  renderWithQuery(<OwnProposalList draftsOnly onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "Resume draft" });
  expect(params.at(-1)?.get("status")).toBe("draft");
  expect(screen.getByRole("dialog", { name: "Saved drafts" })).toBeVisible();
  expect(screen.queryByRole("combobox", { name: "Request status" })).not.toBeInTheDocument();
  expect(screen.queryByText("Synthetic Vendor")).not.toBeInTheDocument();
});

it("reopens an intake draft in the compact workspace and preserves submission callbacks and cache refresh", async () => {
  rows = [proposalFixture({ requestMode: "hierarchy_intake" })];
  const user = userEvent.setup(); const onClose = vi.fn(); const onSubmitted = vi.fn(); const onBusyChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const requestKey = vendorBasketRequestKeys.minePage(actor, {}, 10, 0);
  client.setQueryData(requestKey, { items: [] });
  render(<QueryClientProvider client={client}><OwnProposalList draftsOnly onClose={onClose} onSubmitted={onSubmitted} onBusyChange={onBusyChange} /></QueryClientProvider>);
  const resume = await screen.findByRole("button", { name: "Resume draft" });
  resume.focus(); await user.keyboard("{Enter}");
  const detail = screen.getByRole("dialog", { name: "Basket request" });
  expect(detail).toHaveTextContent("proposal-one"); expect(detail).toHaveTextContent("procurement");
  expect(screen.queryByRole("dialog", { name: "Configure Main Basket" })).not.toBeInTheDocument();
  await user.click(within(detail).getByRole("button", { name: "Start saving request" }));
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  expect(onClose).not.toHaveBeenCalled(); expect(onSubmitted).not.toHaveBeenCalled();
  const before = params.length;
  await user.click(within(detail).getByRole("button", { name: "Submit request" }));
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", requestMode: "hierarchy_intake" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "Basket request" })).not.toBeInTheDocument();
  expect(client.getQueryState(requestKey)?.isInvalidated).toBe(true);
  await waitFor(() => expect(params.length).toBeGreaterThan(before));
});

it("keeps intake decisions and feedback distinct from legacy configuration history", async () => {
  rows = [
    proposalFixture({ id: "intake-approved", name: "Requested finishes", requestMode: "hierarchy_intake", status: "fulfilled" }),
    proposalFixture({ id: "intake-sent-back", name: "Requested stone", requestMode: "hierarchy_intake", status: "rejected", reason: "Clarify the stone types." }),
    proposalFixture({ id: "full-approved", name: "Configured finishes", requestMode: "full_configuration", status: "fulfilled" }),
    proposalFixture({ id: "old-rejected", name: "Historical stone", status: "rejected" })
  ];
  const user = userEvent.setup(); setup();
  const approved = (await screen.findByRole("heading", { name: "Requested finishes" })).closest("li")!;
  const sentBack = screen.getByRole("heading", { name: "Requested stone" }).closest("li")!;
  const legacyApproved = screen.getByRole("heading", { name: "Configured finishes" }).closest("li")!;
  const legacyRejected = screen.getByRole("heading", { name: "Historical stone" }).closest("li")!;
  expect(approved).toHaveTextContent("Approved ·"); expect(approved).not.toHaveTextContent("active");
  expect(sentBack).toHaveTextContent("Sent back ·"); expect(sentBack).toHaveTextContent("Reason: Clarify the stone types.");
  expect(legacyApproved).toHaveTextContent("Approved and active ·"); expect(legacyRejected).toHaveTextContent("Rejected ·");
  expect(within(legacyApproved).getByRole("button", { name: "View configuration" })).toBeVisible();
  await user.click(within(sentBack).getByRole("button", { name: "View request" }));
  expect(screen.getByRole("dialog", { name: "Basket request" })).toHaveTextContent("intake-sent-back");
  await user.click(screen.getByRole("button", { name: "Close request" }));
  expect(sentBack).toHaveTextContent("Reason: Clarify the stone types.");
  await user.selectOptions(screen.getByRole("combobox", { name: "Request status" }), "rejected");
  await waitFor(() => expect(params.at(-1)?.get("status")).toBe("rejected"));
  expect(screen.getByRole("option", { name: "Sent back / Rejected" })).toBeInTheDocument();
});


it("closes the resumed workspace and containing draft list only after confirmed submission", async () => {
  const user = userEvent.setup(); const onClose = vi.fn(); const onSubmitted = vi.fn();
  let resolveSubmit!: () => void; const submitted = new Promise<void>(resolve => { resolveSubmit = resolve; });
  server.use(
    http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/readiness", () => data({ head: rows[0].head, version: 1, requestVersion: null, ready: true, findings: [] })),
    http.post("/api/v1/procurement/vendor-basket-proposals/proposal-one/submit", async () => { await submitted; return data(proposalFixture({ status: "pending", vendorName: null })); })
  );
  renderWithQuery(<OwnProposalList draftsOnly onClose={onClose} onSubmitted={onSubmitted} />);
  await user.click(await screen.findByRole("button", { name: "Resume draft" }));
  const submit = await screen.findByRole("button", { name: "Send for approval and activation" });
  await waitFor(() => expect(submit).toBeEnabled()); await user.click(submit);
  expect(onClose).not.toHaveBeenCalled(); expect(onSubmitted).not.toHaveBeenCalled();
  resolveSubmit();
  await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", vendorName: null })));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "Configure Main Basket" })).not.toBeInTheDocument();
});
