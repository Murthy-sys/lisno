import axe from "axe-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, it, vi } from "vitest";
import type { PermissionCode, Role } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { proposalKeys } from "./proposalApi";
import { intakeProposalFixture } from "./proposal.fixtures";
import { ProposalIntakeWorkspace } from "./ProposalIntakeWorkspace";
import type { ProposalDetail, ProposalIntakeInput } from "./proposalTypes";

const session = vi.hoisted(() => ({ id: "procurement-one", role: "procurement" as Role, permissions: undefined as PermissionCode[] | undefined }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: session.id, role: session.role }, authorization: authorizationFor(session.role, session.permissions) }) }));
let saved: ProposalDetail;
let original: ProposalDetail;
let writes: ProposalIntakeInput[];
let actions: Record<string, unknown>[];
const response = (data: unknown) => HttpResponse.json({ data });
const failure = (status: number, message: string) => HttpResponse.json({ error: { code: status === 409 ? "VERSION_CONFLICT" : "UNAVAILABLE", message } }, { status });
const input = (name: string) => screen.getByRole("textbox", { name });
function renderWithClient(element: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...renderWithQuery(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>), queryClient };
}
function admin() {
  session.id = "super-admin-one"; session.role = "super_admin";
  saved = intakeProposalFixture({ status: "pending", version: 4, requestVersion: 2, requestId: "request-one", submittedHead: { id: "submitted-head", version: 2, digest: "submitted" }, capabilities: { edit: true, submit: false, review: true, decide: true, revise: false } });
  original = structuredClone(saved);
}
beforeEach(() => {
  session.id = "procurement-one"; session.role = "procurement"; session.permissions = undefined;
  saved = intakeProposalFixture(); original = structuredClone(saved); writes = []; actions = [];
  for (const base of ["/api/v1/procurement/vendor-basket-proposals", "/api/v1/admin/ai-estimator-knowledge/basket-proposals"]) {
    server.use(
      http.get(`${base}/:proposalId`, ({ request }) => response(new URL(request.url).searchParams.get("snapshot") === "submitted" ? { ...original, capabilities: { edit: false, submit: false, review: false, decide: false, revise: false } } : saved)),
      http.put(`${base}/:proposalId/intake`, async ({ request }) => {
        const body = await request.json() as ProposalIntakeInput; writes.push(body);
        saved = { ...saved, intake: body.intake, name: body.intake.basket?.name ?? body.intake.subBasket.name, version: saved.version + 1, requestVersion: saved.requestVersion === null ? null : saved.requestVersion + 1 };
        return response(saved);
      }),
      http.post(`${base}/:proposalId/submit`, async ({ request }) => {
        actions.push(await request.json() as Record<string, unknown>);
        saved = { ...saved, status: "pending", version: saved.version + 1, capabilities: { edit: false, submit: false, review: false, decide: false, revise: false } };
        return response(saved);
      }),
      http.post(`${base}/:proposalId/revise`, async ({ request }) => {
        actions.push(await request.json() as Record<string, unknown>);
        saved = intakeProposalFixture({ id: "revised-proposal", revisedFromId: "proposal-one" });
        return response(saved);
      }),
      http.post(`${base}/:proposalId/decision`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>; actions.push(body);
        saved = { ...saved, version: saved.version + 1, requestVersion: (saved.requestVersion ?? 0) + 1, status: body.decision === "approve" ? "fulfilled" : "rejected", capabilities: { edit: false, submit: false, review: false, decide: false, revise: false }, reason: body.reason as string | null };
        return response({ proposalId: saved.id, requestId: "request-one", status: saved.status, version: saved.version, requestVersion: saved.requestVersion, submittedDigest: "submitted", approvedDigest: body.decision === "approve" ? "approved" : null, reason: saved.reason, published: null });
      })
    );
  }
});
it("reopens an intake draft, saves all fields atomically with stable line IDs and refreshes requester/reviewer lists", async () => {
  const user = userEvent.setup();
  const { queryClient } = renderWithClient(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={vi.fn()} />);
  const invalidations = vi.spyOn(queryClient, "invalidateQueries");
  expect(await screen.findByRole("textbox", { name: "Main Basket name" })).toHaveValue("Stone finishes");
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  fireEvent.change(input("Sub Basket description"), { target: { value: "Changed room surfaces" } });
  fireEvent.change(input("Main Line 1 name"), { target: { value: "Changed installation" } });
  await user.click(screen.getByRole("button", { name: "Add Main Line" }));
  await user.type(input("Main Line 2 name"), "Polishing");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText("Draft saved. Reopen it from My Requests at any time.")).toBeVisible();
  expect(writes[0]).toEqual({ expectedVersion: 1, intake: { ...original.intake, subBasket: { ...original.intake!.subBasket, description: "Changed room surfaces" }, mainLines: [{ resourceId: "line-proposal", name: "Changed installation" }, { name: "Polishing" }] } });
  for (const key of [["vendor-basket-proposals", session.id, "mine"], ["vendor-basket-requests", "mine"], ["vendor-basket-requests", "review"]]) expect(invalidations).toHaveBeenCalledWith({ queryKey: key });
});
it("saves changed fields before sending using the returned version", async () => {
  const user = userEvent.setup(); const close = vi.fn(); const submitted = vi.fn();
  renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={close} onSubmitted={submitted} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Main Line 1 name" }), { target: { value: "New work" } });
  await user.click(screen.getByRole("button", { name: "Send to Super Admin" }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(1); expect(actions[0]).toEqual({ expectedVersion: 2, idempotencyKey: expect.any(String) });
  expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
});
it("preserves dirty fields across a background version change and requires explicit reload", async () => {
  const user = userEvent.setup(); const { queryClient } = renderWithClient(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={vi.fn()} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Main Line 1 name" }), { target: { value: "Unsaved local work" } });
  saved = { ...saved, version: 9, intake: { ...saved.intake!, mainLines: [{ resourceId: "line-proposal", name: "Remote work" }] } };
  await act(async () => { await queryClient.invalidateQueries({ queryKey: proposalKeys.detail(session.id, "procurement", "proposal-one") }); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled());
  expect(input("Main Line 1 name")).toHaveValue("Unsaved local work");
  await user.click(screen.getByRole("button", { name: "Reload saved request" }));
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(input("Main Line 1 name")).toHaveValue("Unsaved local work");
  await user.click(screen.getByRole("button", { name: "Reload saved request" }));
  await user.click(screen.getByRole("button", { name: "Discard and reload" }));
  await waitFor(() => expect(input("Main Line 1 name")).toHaveValue("Remote work")); expect(writes).toHaveLength(0);
});
it("retains inputs after a CAS conflict and blocks another write until refresh", async () => {
  server.use(http.put("/api/v1/procurement/vendor-basket-proposals/proposal-one/intake", () => failure(409, "Another editor changed this request.")));
  const user = userEvent.setup(); renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={vi.fn()} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Sub Basket name" }), { target: { value: "Local name" } });
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText("Another editor changed this request.")).toBeVisible();
  expect(input("Sub Basket name")).toHaveValue("Local name"); expect(screen.getByRole("button", { name: "Send to Super Admin" })).toBeDisabled();
});
it("reviews and corrects metadata, then approves using saved proposal/request versions without activation controls", async () => {
  admin(); const user = userEvent.setup(); const decision = vi.fn();
  const { queryClient } = renderWithClient(<ProposalIntakeWorkspace proposalId="proposal-one" scope="admin" onClose={vi.fn()} onDecision={decision} />);
  const invalidations = vi.spyOn(queryClient, "invalidateQueries");
  fireEvent.change(await screen.findByRole("textbox", { name: "Main Basket description" }), { target: { value: "Reviewed description" } });
  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(await screen.findByText("Request approved. Main Lines were created as drafts for Super Admin to configure.")).toBeVisible();
  expect(writes[0]).toMatchObject({ expectedVersion: 4, expectedRequestVersion: 2 });
  expect(actions[0]).toEqual({ decision: "approve", expectedVersion: 5, expectedRequestVersion: 3, reason: null, idempotencyKey: expect.any(String) });
  expect(decision).toHaveBeenCalledWith(expect.objectContaining({ status: "fulfilled" }));
  expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument();
  expect(invalidations).toHaveBeenCalledWith({ queryKey: ["ai-estimator-knowledge"] });
});
it("requires a send-back reason and retries an uncertain decision with the identical frozen command", async () => {
  admin(); let count = 0;
  server.use(http.post("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one/decision", async ({ request }) => {
    actions.push(await request.json() as Record<string, unknown>);
    return ++count === 1 ? failure(503, "Response unavailable") : response({ proposalId: saved.id, requestId: "request-one", status: "rejected", version: 5, requestVersion: 3, submittedDigest: "submitted", approvedDigest: null, reason: "Clarify the work", published: null });
  }));
  const user = userEvent.setup(); renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" scope="admin" onClose={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "Send back" }));
  const dialog = screen.getByRole("dialog", { name: "Send back request" });
  await user.click(within(dialog).getByRole("button", { name: "Send back request" }));
  const reason = within(dialog).getByRole("textbox", { name: "Send-back reason" });
  expect(reason).toHaveFocus(); expect(reason).toHaveAttribute("maxlength", "1000"); expect(actions).toHaveLength(0);
  await user.type(reason, "Clarify the work"); await user.click(within(dialog).getByRole("button", { name: "Send back request" }));
  await within(dialog).findByText("Response unavailable"); expect(reason).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "Retry same action" }));
  expect(await screen.findByText("Request sent back. The requester can edit and resubmit a new draft.")).toBeVisible();
  expect(actions).toHaveLength(2); expect(actions[1]).toEqual(actions[0]);
});
it("keeps pending requests and immutable original/approved views read-only", async () => {
  saved = intakeProposalFixture({ status: "fulfilled", submittedHead: { id: "s", version: 1, digest: "s" }, approvedHead: { id: "a", version: 2, digest: "a" }, capabilities: { edit: false, submit: false, review: false, decide: false, revise: false }, intake: { ...saved.intake!, basket: { name: "Approved stone", description: "Approved copy" } } });
  const user = userEvent.setup(); renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={vi.fn()} />);
  expect(await screen.findByRole("textbox", { name: "Main Basket name" })).toHaveValue("Approved stone");
  expect(input("Main Basket name")).toHaveAttribute("readonly");
  await user.click(screen.getByRole("button", { name: "View original submission" }));
  await waitFor(() => expect(input("Main Basket name")).toHaveValue("Stone finishes"));
  expect(screen.getByText("Original submission. Read-only.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  expect((await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
});
it("revises a sent-back request as a linked draft while preserving the original reason", async () => {
  saved = intakeProposalFixture({ status: "rejected", version: 7, requestVersion: 4, reason: "Clarify the work", capabilities: { edit: false, submit: false, review: false, decide: false, revise: true } });
  const user = userEvent.setup(); renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={vi.fn()} />);
  expect(await screen.findByText("Send-back reason: Clarify the work")).toBeVisible();
  expect(input("Main Line 1 name")).toHaveAttribute("readonly");
  await user.click(screen.getByRole("button", { name: "Edit and resubmit" }));
  expect(await screen.findByText("This draft is linked to the earlier submitted request.")).toBeVisible();
  expect(input("Main Line 1 name")).not.toHaveAttribute("readonly");
  expect(actions[0]).toMatchObject({ expectedVersion: 7, expectedRequestVersion: 4, idempotencyKey: expect.any(String) });
});
it("keeps an existing parent read-only and omits its metadata from saves", async () => {
  saved = intakeProposalFixture({ target: { kind: "new_sub_basket", basketId: "unequal-parent" }, intake: { subBasket: saved.intake!.subBasket, mainLines: saved.intake!.mainLines } });
  const user = userEvent.setup(); renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={vi.fn()} />);
  await screen.findByRole("textbox", { name: "Sub Basket name" });
  expect(screen.queryByRole("textbox", { name: "Main Basket name" })).not.toBeInTheDocument();
  fireEvent.change(input("Sub Basket name"), { target: { value: "New sub name" } });
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved. Reopen it from My Requests at any time."); expect(writes[0].intake).not.toHaveProperty("basket");
});
it("requires the lifecycle permission for admin decisions separately from update permission", async () => {
  admin(); session.permissions = ["ai_estimator_knowledge.configuration.read", "ai_estimator_knowledge.configuration.update"];
  renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" scope="admin" onClose={vi.fn()} />);
  await screen.findByRole("textbox", { name: "Main Basket name" });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Send back" })).not.toBeInTheDocument();
});
it("does not offer revision without create permission even if submit is permitted", async () => {
  session.permissions = ["procurement.vendor_basket_proposal.read", "procurement.vendor_basket_proposal.submit"];
  saved = intakeProposalFixture({ status: "rejected", capabilities: { edit: false, submit: false, review: false, decide: false, revise: true } });
  renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={vi.fn()} />);
  await screen.findByRole("textbox", { name: "Main Basket name" });
  expect(screen.queryByRole("button", { name: "Edit and resubmit" })).not.toBeInTheDocument();
});
it("shows retry for initial failures and hides content after access is revoked", async () => {
  let fail = true;
  server.use(http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one", () => fail ? failure(503, "Request temporarily unavailable") : failure(404, "Request unavailable")));
  const user = userEvent.setup(); renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={vi.fn()} />);
  await screen.findByText("Request temporarily unavailable"); fail = false;
  await user.click(screen.getByRole("button", { name: "Retry request" }));
  expect(await screen.findByText("This basket request is no longer available to your account.")).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it.each(["procurement", "admin"] as const)("reconciles a committed %s save after a lost PUT response and continues the original action once", async scope => {
  if (scope === "admin") admin();
  const basis = structuredClone(saved);
  const base = scope === "admin" ? "/api/v1/admin/ai-estimator-knowledge/basket-proposals" : "/api/v1/procurement/vendor-basket-proposals";
  let semanticActions = 0;
  const committed = new Map<string, unknown>();
  server.use(
    http.put(`${base}/proposal-one/intake`, async ({ request }) => {
      const body = await request.json() as ProposalIntakeInput; writes.push(body);
      saved = { ...saved, version: basis.version + 1, requestVersion: scope === "admin" ? basis.requestVersion! + 1 : basis.requestVersion,
        head: { ...basis.head, version: basis.head.version + 1, digest: "saved-intake-digest" },
        intake: { ...body.intake, mainLines: body.intake.mainLines.map((line, index) => ({ ...line, resourceId: line.resourceId ?? `new-line-${index}` })) }
      };
      return failure(503, "Save response unavailable");
    }),
    http.post(`${base}/proposal-one/${scope === "admin" ? "decision" : "submit"}`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>; actions.push(body);
      const key = String(body.idempotencyKey);
      if (!committed.has(key)) {
        semanticActions += 1;
        committed.set(key, scope === "admin" ? { proposalId: saved.id, requestId: "request-one", status: "fulfilled", version: saved.version + 1, requestVersion: saved.requestVersion! + 1, submittedDigest: "submitted", approvedDigest: "approved", reason: null, published: null } : { ...saved, status: "pending", version: saved.version + 1, capabilities: { edit: false, submit: false, review: false, decide: false, revise: false } });
        return failure(503, "Action response unavailable");
      }
      return response(committed.get(key));
    })
  );
  const user = userEvent.setup(); const close = vi.fn(); const decided = vi.fn();
  renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" scope={scope} onClose={close} onDecision={decided} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Main Line 1 name" }), { target: { value: "  ＡＢＣ   finish  " } });
  fireEvent.change(input("Sub Basket description"), { target: { value: "  Reviewed indoor scope  " } });
  await user.click(screen.getByRole("button", { name: "Add Main Line" }));
  fireEvent.change(input("Main Line 2 name"), { target: { value: "Additional work" } });
  await user.click(screen.getByRole("button", { name: scope === "admin" ? "Submit" : "Send to Super Admin" }));
  await screen.findByText("Save response unavailable");
  expect(actions).toHaveLength(0); expect(writes).toHaveLength(1);
  expect(input("Main Line 1 name")).toHaveValue("  ＡＢＣ   finish  ");
  await user.click(screen.getByRole("button", { name: "Retry same action" }));
  await screen.findByText("Action response unavailable");
  expect(writes).toHaveLength(1);
  expect(actions[0]).toMatchObject({ expectedVersion: basis.version + 1, ...(scope === "admin" ? { expectedRequestVersion: basis.requestVersion! + 1, decision: "approve" } : {}) });
  expect(saved.intake!.mainLines).toEqual([{ resourceId: "line-proposal", name: "ABC finish" }, { resourceId: "new-line-1", name: "Additional work" }]);
  await user.click(screen.getByRole("button", { name: "Retry same action" }));
  if (scope === "admin") await waitFor(() => expect(decided).toHaveBeenCalledWith(expect.objectContaining({ status: "fulfilled" })));
  else await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(actions).toHaveLength(2); expect(actions[1]).toEqual(actions[0]); expect(semanticActions).toBe(1); expect(writes).toHaveLength(1);
});

it("retries the same PUT only when the saved head and content are still the original basis", async () => {
  const basis = structuredClone(saved); let attempts = 0;
  server.use(http.put("/api/v1/procurement/vendor-basket-proposals/proposal-one/intake", async ({ request }) => {
    const body = await request.json() as ProposalIntakeInput; writes.push(body);
    if (++attempts === 1) return failure(503, "Save was unavailable");
    saved = { ...saved, version: basis.version + 1, intake: body.intake, head: { ...basis.head, version: basis.head.version + 1, digest: "retry-saved" } };
    return response(saved);
  }));
  const user = userEvent.setup(); const close = vi.fn();
  renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" onClose={close} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Main Line 1 name" }), { target: { value: "Retry work" } });
  await user.click(screen.getByRole("button", { name: "Send to Super Admin" }));
  await screen.findByText("Save was unavailable");
  await user.click(screen.getByRole("button", { name: "Retry same action" }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]); expect(actions).toHaveLength(1);
});

it.each(["content", "line identity", "later head", "head identity", "request version", "target", "mode"])("blocks uncertain-save reconciliation for a divergent %s without discarding local inputs", async divergence => {
  admin(); const basis = structuredClone(saved);
  server.use(http.put("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one/intake", async ({ request }) => {
    const body = await request.json() as ProposalIntakeInput; writes.push(body);
    saved = { ...saved, version: basis.version + 1, requestVersion: basis.requestVersion! + 1, intake: structuredClone(body.intake), head: { ...basis.head, version: basis.head.version + 1, digest: "other-save" } };
    if (divergence === "content") saved.intake!.subBasket.description = "Different scope";
    if (divergence === "line identity") saved.intake!.mainLines[0].resourceId = "different-existing-line";
    if (divergence === "later head") { saved.version += 1; saved.head.version += 1; }
    if (divergence === "head identity") saved.head.id = "different-head";
    if (divergence === "request version") saved.requestVersion = basis.requestVersion! + 2;
    if (divergence === "target") saved.target = { kind: "new_sub_basket", basketId: "different-parent" };
    if (divergence === "mode") saved.requestMode = "full_configuration";
    return failure(503, "Save response unavailable");
  }));
  const user = userEvent.setup(); renderWithQuery(<ProposalIntakeWorkspace proposalId="proposal-one" scope="admin" onClose={vi.fn()} />);
  fireEvent.change(await screen.findByRole("textbox", { name: "Main Line 1 name" }), { target: { value: "My intended work" } });
  await user.click(screen.getByRole("button", { name: "Submit" })); await screen.findByText("Save response unavailable");
  await user.click(screen.getByRole("button", { name: "Retry same action" }));
  expect(await screen.findByText("The saved request differs from this action. Your entries are preserved. Reload and review it before continuing.")).toBeVisible();
  expect(input("Main Line 1 name")).toHaveValue("My intended work");
  expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled(); expect(writes).toHaveLength(1); expect(actions).toHaveLength(0);
});
