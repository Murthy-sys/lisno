import axe from "axe-core";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { CreateProposalPanel } from "./CreateProposalPanel";
import { intakeProposalFixture } from "./proposal.fixtures";
import type { ProposalDetail } from "./proposalTypes";
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "procurement-one", role: "procurement" }, authorization: authorizationFor("procurement") }) }));
vi.mock("./ProposalIntakeWorkspace", () => ({ ProposalIntakeWorkspace: ({ onSubmitted, initialNotice }: { onSubmitted?: (proposal: ProposalDetail) => void; initialNotice?: string }) => <section aria-label="Saved basket request"><p>{initialNotice}</p><button onClick={() => onSubmitted?.(intakeProposalFixture({ status: "pending", vendorName: null }))}>Submit saved request</button></section> }));
let writes: Record<string, unknown>[];
let submissions: Record<string, unknown>[];
let fail: boolean;
beforeEach(() => { writes = []; submissions = []; fail = false; server.use(
  http.post("/api/v1/procurement/vendor-basket-proposals", async ({ request }) => {
    writes.push(await request.json() as Record<string, unknown>);
    return fail ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Temporarily unavailable" } }, { status: 503 }) : HttpResponse.json({ data: intakeProposalFixture({ vendorName: null }) });
  }),
  http.post("/api/v1/procurement/vendor-basket-proposals/proposal-one/submit", async ({ request }) => {
    submissions.push(await request.json() as Record<string, unknown>);
    return HttpResponse.json({ data: intakeProposalFixture({ status: "pending", version: 2 }) });
  })
); });
async function names(user: ReturnType<typeof userEvent.setup>, parent = false) {
  if (!parent) await user.type(screen.getByRole("textbox", { name: "Main Basket name" }), "  New  stone ");
  await user.type(screen.getByRole("textbox", { name: "Sub Basket name" }), "Interior stone");
  await user.type(screen.getByRole("textbox", { name: "Main Line 1 name" }), "Stone installation");
}
it.each([undefined, { id: "parent-pop", name: "POP / Gypsum" }])("saves the complete name-only hierarchy without vendor or pricing fields (%j)", async parentBasket => {
  const user = userEvent.setup(); const onSubmitted = vi.fn();
  renderWithQuery(<CreateProposalPanel parentBasket={parentBasket} activeBasketNames={[]} onClose={vi.fn()} onBusyChange={vi.fn()} onSubmitted={onSubmitted} />);
  const first = screen.getByRole("textbox", { name: parentBasket ? "Sub Basket name" : "Main Basket name" });
  const dialog = screen.getByRole("dialog", { name: parentBasket ? "Request Sub Basket" : "Request Main Basket" });
  expect(screen.getAllByRole("textbox")).toHaveLength(parentBasket ? 3 : 5);
  expect(screen.queryByRole("textbox", { name: "Vendor name" })).not.toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  expect(screen.queryByText(/Unit price|Mode settings|Quality Parameter/)).not.toBeInTheDocument();
  if (parentBasket) { expect(screen.getByText(parentBasket.name)).toBeVisible(); expect(screen.queryByRole("textbox", { name: "Main Basket name" })).not.toBeInTheDocument(); }
  await waitFor(() => expect(first).toHaveFocus());
  expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  await names(user, Boolean(parentBasket)); await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("button", { name: "Submit saved request" });
  expect(writes[0]).toMatchObject({ requestMode: "hierarchy_intake", name: parentBasket ? "Interior stone" : "New stone", vendorId: null, intake: { subBasket: { name: "Interior stone", description: null }, mainLines: [{ name: "Stone installation" }] } });
  expect(writes[0]).not.toHaveProperty("vendorName");
  if (parentBasket) { expect(writes[0].target).toEqual({ kind: "new_sub_basket", basketId: parentBasket.id }); expect(writes[0].intake).not.toHaveProperty("basket"); }
  else expect(writes[0].intake).toHaveProperty("basket", { name: "New stone", description: null });
  expect(submissions).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Submit saved request" })); expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", vendorName: null }));
});
it("requires descriptions and at least one named Main Line to send, then creates and submits using the saved version", async () => {
  const user = userEvent.setup(); const onSubmitted = vi.fn(); const close = vi.fn();
  renderWithQuery(<CreateProposalPanel activeBasketNames={[]} onClose={close} onBusyChange={vi.fn()} onSubmitted={onSubmitted} />);
  await names(user); await user.click(screen.getByRole("button", { name: "Send to Super Admin" }));
  expect(screen.getByRole("textbox", { name: "Main Basket description" })).toHaveFocus(); expect(writes).toHaveLength(0);
  await user.type(screen.getByRole("textbox", { name: "Main Basket description" }), "Natural stone finishes");
  await user.type(screen.getByRole("textbox", { name: "Sub Basket description" }), "Indoor work");
  await user.click(screen.getByRole("button", { name: "Remove Main Line 1" }));
  await user.click(screen.getByRole("button", { name: "Send to Super Admin" }));
  expect(screen.getByText("Add at least one Main Line name before sending it for approval.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Add Main Line" }));
  await user.type(screen.getByRole("textbox", { name: "Main Line 1 name" }), "Floor finish");
  await user.click(screen.getByRole("button", { name: "Send to Super Admin" }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(1); expect(submissions[0]).toEqual({ expectedVersion: 1, idempotencyKey: expect.any(String) });
  expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
});
it("keeps uncertain creation retry identical and retains entered values", async () => {
  fail = true; const user = userEvent.setup(); const close = vi.fn();
  renderWithQuery(<CreateProposalPanel vendorId="saved-vendor" activeBasketNames={[]} onClose={close} onBusyChange={vi.fn()} />);
  await names(user); await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("button", { name: "Retry same action" }); expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Main Basket name" })).toHaveValue("  New  stone "); expect(screen.getByRole("textbox", { name: "Main Line 1 name" })).toBeDisabled(); fail = false;
  await user.click(screen.getByRole("button", { name: "Retry same action" })); await screen.findByRole("button", { name: "Submit saved request" });
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]); expect(writes[0].vendorId).toBe("saved-vendor");
});
it("retries an uncertain submit without creating another proposal or changing command identity", async () => {
  let attempts = 0;
  server.use(http.post("/api/v1/procurement/vendor-basket-proposals/proposal-one/submit", async ({ request }) => {
    submissions.push(await request.json() as Record<string, unknown>);
    return ++attempts === 1 ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Response unavailable" } }, { status: 503 }) : HttpResponse.json({ data: intakeProposalFixture({ status: "pending" }) });
  }));
  const user = userEvent.setup(); const close = vi.fn(); renderWithQuery(<CreateProposalPanel activeBasketNames={[]} onClose={close} onBusyChange={vi.fn()} />);
  await names(user);
  fireEvent.change(screen.getByRole("textbox", { name: "Main Basket description" }), { target: { value: "Stone work" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Sub Basket description" }), { target: { value: "Indoor work" } });
  await user.click(screen.getByRole("button", { name: "Send to Super Admin" }));
  await user.click(await screen.findByRole("button", { name: "Retry same action" }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(1); expect(submissions).toHaveLength(2); expect(submissions[1]).toEqual(submissions[0]);
});
it("rejects an existing normalized Main Basket name without creating a request", async () => {
  const user = userEvent.setup(); renderWithQuery(<CreateProposalPanel activeBasketNames={["Stone finishes"]} onClose={vi.fn()} onBusyChange={vi.fn()} />);
  await user.type(screen.getByRole("textbox", { name: "Main Basket name" }), "STONE finishes"); await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.getByText("This Main Basket already exists. Select it in the vendor form.")).toBeVisible(); expect(writes).toEqual([]);
});
it("allows an incomplete description and zero Main Lines in a saved draft", async () => {
  const user = userEvent.setup(); renderWithQuery(<CreateProposalPanel parentBasket={{ id: "parent-b", name: "Paint" }} activeBasketNames={[]} onClose={vi.fn()} onBusyChange={vi.fn()} />);
  await user.type(screen.getByRole("textbox", { name: "Sub Basket name" }), "Walls"); await user.click(screen.getByRole("button", { name: "Remove Main Line 1" }));
  await user.click(screen.getByRole("button", { name: "Save draft" })); await screen.findByRole("button", { name: "Submit saved request" });
  expect(writes[0].intake).toEqual({ subBasket: { name: "Walls", description: null }, mainLines: [] });
});
