import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { server } from "../../test/server";
import { PMRequestsPanel } from "./PMRequestsPanel";
import type { PMItem, PMPanel } from "./projectManagerTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "pm-one", role: "site_manager" } }) }));
const sourceToken = "a".repeat(64);
const sourceId = "selection:line-one:finish";
const item = (overrides: Partial<PMItem> = {}): PMItem => ({ id: sourceId, kind: "selection_request", title: "Living room paint finish", status: "acknowledgement_required", severity: "neutral", version: 0, sourceId, sourceToken, facts: [{ label: "Design decision", value: "Pending client" }], actions: [{ id: "acknowledge", label: "Acknowledge" }, { id: "remind", label: "Remind owner" }], ...overrides });
const panel = (items: PMItem[], overrides: Partial<PMPanel> = {}): PMPanel => ({ tab: "selections", availability: "available", calculatedAt: "2026-10-27T10:00:00Z", items, total: items.length, issues: [], sources: [{ id: sourceId, label: "Living room paint finish", sourceToken }], people: [{ id: "client-one", name: "Project client", role: "client" }], actions: [], ...overrides });
const readPath = "/api/v1/projects/project-one/pm/selections";
const actionPath = "/api/v1/projects/project-one/pm/selection-requests/:id/actions";

function mount(tab: "procurement" | "selections" | "supply" = "selections") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><FeedbackProvider><PMRequestsPanel projectId="project-one" tab={tab} /></FeedbackProvider></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { window.localStorage.clear(); });

describe("Project Manager request and supply panels", () => {
  it("raises a material request with the selected quantity and source unit", async () => {
    const writes:Record<string,unknown>[]=[];
    server.use(http.get("/api/v1/projects/project-one/pm/procurement",()=>HttpResponse.json({data:panel([],{tab:"procurement",sources:[{id:sourceId,label:"Countertop",sourceToken,quantity:2,unit:"NOS"}],actions:[{id:"create_request",label:"Raise request"}]})})),http.post("/api/v1/projects/project-one/pm/procurement-requests",async({request})=>{writes.push(await request.json() as Record<string,unknown>);return HttpResponse.json({data:{}});}));
    const user=userEvent.setup();mount("procurement");
    await user.click(await screen.findByRole("button",{name:"Raise request"}));
    const dialog=screen.getByRole("dialog",{name:"Raise request"});
    const quantity=within(dialog).getByRole("spinbutton",{name:/Quantity/});
    await user.clear(quantity);await user.type(quantity,"1.25");
    await user.type(within(dialog).getByRole("textbox",{name:"Reason / note"}),"Required for first installation");
    await user.click(within(dialog).getByRole("button",{name:"Raise request"}));
    await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({quantity:1.25,unit:"NOS",sourceId,sourceToken});
  });
  it("records only PM acknowledgement with the exact source and version", async () => {
    let acknowledged = false; const writes: Record<string, unknown>[] = [];
    server.use(http.get(readPath, () => HttpResponse.json({ data: panel([item(acknowledged ? { status: "acknowledged", version: 1, actions: [{ id: "remind", label: "Remind owner" }] } : {})]) })),
      http.post(actionPath, async ({ request, params }) => { expect(params.id).toBe(sourceId); writes.push(await request.json() as Record<string, unknown>); acknowledged = true; return HttpResponse.json({ data: item({ status: "acknowledged", version: 1 }) }); }));
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole("button", { name: "Acknowledge: Living room paint finish" }));
    const dialog = screen.getByRole("dialog", { name: "Acknowledge" });
    expect(within(dialog).getByText(/responsible Designer or Client still makes/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Discussed with the client at site");
    await user.click(within(dialog).getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ action: "acknowledge", expectedVersion: 0, sourceToken, reason: "Discussed with the client at site", idempotencyKey: expect.any(String) });
    expect(screen.getByText("Acknowledge recorded.")).toHaveAttribute("role", "status");
  });

  it("retains the note after a stale version and requires an explicit refresh", async () => {
    let version = 3; const writes: Record<string, unknown>[] = [];
    server.use(http.get(readPath, () => HttpResponse.json({ data: panel([item({ version })]) })),
      http.post(actionPath, async ({ request }) => { const body = await request.json() as Record<string, unknown>; writes.push(body); if (writes.length === 1) { version = 4; return HttpResponse.json({ error: { code: "PM_CONFLICT", message: "This record changed." } }, { status: 409 }); } return HttpResponse.json({ data: item({ version: 5 }) }); }));
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole("button", { name: "Acknowledge: Living room paint finish" }));
    const dialog = screen.getByRole("dialog", { name: "Acknowledge" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Reviewed the updated finish");
    await user.click(within(dialog).getByRole("button", { name: "Acknowledge" }));
    await screen.findByText("This record changed.");
    expect(within(dialog).getByRole("textbox", { name: "Reason / note" })).toHaveValue("Reviewed the updated finish");
    expect(within(dialog).getByRole("button", { name: "Acknowledge" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Refresh record" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Acknowledge" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]).toMatchObject({ expectedVersion: 3, sourceToken });
    expect(writes[1]).toMatchObject({ expectedVersion: 4, sourceToken, reason: "Reviewed the updated finish" });
    expect(writes[1]?.idempotencyKey).not.toBe(writes[0]?.idempotencyKey);
  });

  it("reuses an idempotency key when retrying the unchanged payload", async () => {
    const writes: Record<string, unknown>[] = [];
    server.use(http.get(readPath, () => HttpResponse.json({ data: panel([item()]) })), http.post(actionPath, async ({ request }) => { writes.push(await request.json() as Record<string, unknown>); return writes.length === 1 ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Please retry the same request." } }, { status: 503 }) : HttpResponse.json({ data: item({ version: 1 }) }); }));
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole("button", { name: "Acknowledge: Living room paint finish" }));
    const dialog = screen.getByRole("dialog", { name: "Acknowledge" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Client visit confirmed");
    await user.click(within(dialog).getByRole("button", { name: "Acknowledge" }));
    await screen.findByText("Please retry the same request.");
    await user.click(within(dialog).getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]?.idempotencyKey).toBe(writes[1]?.idempotencyKey);
  });

  it("lets the receiving owner link a real approved order without claiming delivery", async () => {
    const writes: Record<string, unknown>[] = [];
    const request = item({ id: "request-one", kind: "procurement_request", title: "Countertop slab", version: 2, actions: [{ id: "fulfill", label: "Link fulfillment" }] });
    const order = item({ id: "order-one", kind: "purchase_order", title: "PO-028", status: "ordered", sourceToken: null, actions: [], facts: [{ label: "Delivery", value: "Receipt confirmation unavailable" }] });
    server.use(http.get("/api/v1/projects/project-one/pm/procurement", () => HttpResponse.json({ data: panel([request, order], { tab: "procurement" }) })), http.post("/api/v1/projects/project-one/pm/procurement-requests/request-one/actions", async ({ request }) => { writes.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: {} }); }));
    const user = userEvent.setup(); mount("procurement");
    await user.click(await screen.findByRole("button", { name: "Link fulfillment: Countertop slab" }));
    const dialog = screen.getByRole("dialog", { name: "Link fulfillment" });
    expect(within(dialog).getByText(/Ordering does not confirm physical delivery/)).toBeVisible();
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Current project order" }), "order-one");
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Approved order covers the slab");
    await user.click(within(dialog).getByRole("button", { name: "Link fulfillment" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "fulfill", expectedVersion: 2, artifact: { kind: "purchase_order", id: "order-one" } });
  });

  it("raises a selection request only for a source-authorized responsible person", async () => {
    const writes: Record<string, unknown>[] = [];
    const selectionPanel = panel([], { sources: [{ id: sourceId, label: "Living room paint finish", sourceToken, ownerIds: ["client-one"] }], people: [{ id: "client-one", name: "Project client", role: "client" }, { id: "designer-one", name: "Assigned designer", role: "designer" }], actions: [{ id: "create_request", label: "Raise request" }] });
    server.use(http.get(readPath, () => HttpResponse.json({ data: selectionPanel })), http.post("/api/v1/projects/project-one/pm/selection-requests", async ({ request }) => { writes.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: item() }); }));
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole("button", { name: "Raise request" }));
    const dialog = screen.getByRole("dialog", { name: "Raise request" });
    expect(within(dialog).getByText("Responsible owner: Project client")).toBeVisible();
    expect(within(dialog).queryByText("Assigned designer")).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Please confirm the selected finish");
    await user.click(within(dialog).getByRole("button", { name: "Raise request" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ expectedVersion: 0, sourceId, sourceToken, ownerId: "client-one", reason: "Please confirm the selected finish" });
  });

  it("records only the current supply reviewer's sign-off", async () => {
    const writes: Record<string, unknown>[] = [];
    const milestone = item({ id: "critical:sample:line-one", kind: "supply_milestone", title: "Cabinet finish sample", status: "awaiting_cosign", version: 4, actions: [{ id: "sign_off", label: "PM sign-off" }], facts: [{ label: "Designer", value: "Signed" }, { label: "Project Manager", value: "Pending" }] });
    server.use(http.get("/api/v1/projects/project-one/pm/supply", () => HttpResponse.json({ data: panel([milestone], { tab: "supply" }) })), http.post("/api/v1/projects/project-one/pm/supply-milestones/:id/actions", async ({ request }) => { writes.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: {} }); }));
    const user = userEvent.setup(); mount("supply");
    await user.click(await screen.findByRole("button", { name: "PM sign-off: Cabinet finish sample" }));
    const dialog = screen.getByRole("dialog", { name: "PM sign-off" });
    expect(within(dialog).getByText(/Each other required reviewer must sign separately/)).toBeVisible();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Sample checked against agreed finish");
    await user.click(within(dialog).getByRole("button", { name: "PM sign-off" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "sign_off", expectedVersion: 4, sourceToken, evidenceIds: [] });
    expect(writes[0]).not.toHaveProperty("signatures");
  });

  it("paginates current requirements and retained history using the server total", async () => {
    const offsets: string[] = [];
    server.use(http.get(readPath, ({ request }) => { const offset = new URL(request.url).searchParams.get("offset") ?? ""; offsets.push(offset); return HttpResponse.json({ data: panel([item({ id: `record-${offset}`, title: offset === "0" ? "Current finish" : "Prior source acknowledgement", actions: [] })], { total: 30 }) }); }));
    const user = userEvent.setup(); mount();
    expect(await screen.findByRole("heading", { name: "Current finish" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Prior source acknowledgement" })).toBeVisible();
    expect(offsets).toEqual(["0", "25"]);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("does not turn permission or source failure into fabricated successful rows", async () => {
    server.use(http.get(readPath, () => HttpResponse.json({ error: { code: "PM_NOT_FOUND", message: "Project assignment changed." } }, { status: 404 })));
    mount();
    expect(await screen.findByRole("heading", { name: "Project access unavailable" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Raise request" })).not.toBeInTheDocument();
    expect(screen.queryByText("No selection requirements")).not.toBeInTheDocument();
  });
});
