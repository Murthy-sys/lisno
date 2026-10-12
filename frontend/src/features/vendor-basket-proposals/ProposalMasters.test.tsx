import axe from "axe-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import "../../test/render";
import { server } from "../../test/server";
import { ProposalWorkspace } from "./ProposalWorkspace";
import { proposalKeys } from "./proposalApi";
import { proposalFixture, proposalHierarchyFixture, proposalSectionFixture } from "./proposal.fixtures";
import type { KnowledgeJsonObject } from "../ai-estimator-knowledge/knowledgeTypes";
import type { ProposalDetail, ProposalMasterResource } from "./proposalTypes";

let actor = "procurement-one";
let role: Role = "procurement";
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: actor, role }, authorization: authorizationFor(role, role === "procurement" ? ["procurement.vendor_basket_proposal.read", "procurement.vendor_basket_proposal.update"] : undefined) }) }));
const base = "/api/v1/procurement/vendor-basket-proposals";
const admin = "/api/v1/admin/ai-estimator-knowledge/basket-proposals";
const data = (value: unknown) => HttpResponse.json({ data: value });
const page = (items: unknown[]) => data({ items, pagination: { total: items.length, limit: 100, offset: 0, hasMore: false } });
const error = (status: number, code: string, message: string) => HttpResponse.json({ error: { code, message } }, { status });
let detail: ProposalDetail;
let overview: KnowledgeJsonObject;
let masters: ProposalMasterResource[];
let sectionWrites: Record<string, unknown>[];
let masterWrites: Record<string, unknown>[];
let overviewVersion: number;
function increment() { detail = { ...detail, version: detail.version + 1, head: { ...detail.head, version: detail.head.version + 1 }, requestVersion: detail.requestVersion === null ? null : detail.requestVersion + 1 }; }
function resource(kind: "uom" | "surface", id: string, name: string): ProposalMasterResource {
  return { proposalId: detail.id, resourceId: id, kind, parentId: null, version: 1, headId: detail.head.id,
    payload: { name, code: name.toLowerCase().replaceAll(" ", "_"), description: null, ...(kind === "uom" ? { decimalScale: 2 } : {}) }, digest: id, savedById: actor, savedAt: detail.updatedAt };
}
function setup(id = "proposal-one") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui = (proposalId = id) => <QueryClientProvider client={client}><ProposalWorkspace proposalId={proposalId} scope={role === "super_admin" ? "admin" : "procurement"} onClose={vi.fn()} /></QueryClientProvider>;
  const rendered = render(ui());
  return { ...rendered, client, update: (proposalId = id) => rendered.rerender(ui(proposalId)) };
}
async function add(kind: "UOM" | "Surface", name: string) {
  const user = userEvent.setup();
  const button = await screen.findByRole("button", { name: `Add ${kind}` });
  await waitFor(() => expect(button).toBeEnabled()); await user.click(button);
  const dialog = screen.getByRole("dialog", { name: `Add ${kind}` });
  await user.type(within(dialog).getByRole("textbox", { name: "Name" }), name);
  return { user, dialog, button };
}
beforeEach(() => {
  actor = "procurement-one"; role = "procurement"; detail = proposalFixture(); overview = { uomId: "shared-uom", surfaceIds: ["shared-surface"], hiddenRule: { note: "preserve" } }; masters = []; masterWrites = []; sectionWrites = []; overviewVersion = 1;
  for (const prefix of [base, admin]) server.use(
    http.get(`${prefix}/references`, ({ request }) => { const kind = new URL(request.url).searchParams.get("kind"); return page(kind === "uoms" || kind === "surfaces" ? [{ id: kind === "uoms" ? "shared-uom" : "shared-surface", masterType: kind, name: kind === "uoms" ? "Metre" : "Wall", code: kind, decimalScale: 2, status: "active", displayOrder: 0 }] : []); }),
    http.get(`${prefix}/:id`, () => data(detail)),
    http.get(`${prefix}/:id/hierarchy`, () => page(proposalHierarchyFixture(detail))),
    http.get(`${prefix}/:id/readiness`, () => data({ head: detail.head, version: detail.version, requestVersion: detail.requestVersion, ready: true, findings: [] })),
    http.get(`${prefix}/:id/changes`, () => page([])),
    http.get(`${prefix}/:id/masters/:kind`, ({ params }) => page(masters.filter(value => value.kind === (params.kind === "uoms" ? "uom" : "surface")))),
    http.get(`${prefix}/:id/resources/:resourceId`, ({ params }) => data({ ...proposalSectionFixture(String(params.resourceId).replace("resource-", "") as "overview", overview, detail), version: overviewVersion })),
    http.post(`${prefix}/:id/masters/:kind`, async ({ request, params }) => {
      const input = await request.json() as Record<string, unknown>; masterWrites.push(input);
      if (input.expectedVersion !== detail.version) return error(409, "VERSION_CONFLICT", "Another editor saved this proposal.");
      const value = resource(params.kind === "uoms" ? "uom" : "surface", `private-${masters.length + 1}`, String(input.name));
      value.payload = { ...value.payload, ...input } as ProposalMasterResource["payload"];
      masters.push(value); increment(); return data({ detail, resource: value });
    }),
    http.patch(`${prefix}/:id/masters/:kind/:resourceId`, async ({ params, request }) => { const input = await request.json() as Record<string, unknown>; masterWrites.push(input); const value = masters.find(entry => entry.resourceId === params.resourceId)!; value.payload = { ...value.payload, ...input }; increment(); return data({ detail, resource: value }); }),
    http.delete(`${prefix}/:id/masters/:kind/:resourceId`, ({ params }) => { masters = masters.filter(entry => entry.resourceId !== params.resourceId); increment(); return data({ detail, resource: null }); }),
    http.put(`${prefix}/:id/main-lines/line-proposal/sections/overview`, async ({ request }) => { const input = await request.json() as Record<string, unknown>; sectionWrites.push(input); overview = input.payload as KnowledgeJsonObject; overviewVersion++; increment(); return data({ detail, resource: { ...proposalSectionFixture("overview", overview, detail), version: overviewVersion } }); })
  );
});

describe("proposal-only UOM and Surface editing", () => {
  it.each(["new_main_basket", "new_sub_basket"] as const)("adds both kinds in %s, keeps unrelated draft fields, and uses the new aggregate only after its own command", async target => {
    detail.target = target === "new_sub_basket" ? { kind: target, basketId: detail.basketId } : { kind: target };
    const view = setup(); const uom = await add("UOM", "Length unit");
    await uom.user.selectOptions(within(uom.dialog).getByRole("combobox", { name: "Quantity decimal places" }), "3");
    await uom.user.click(within(uom.dialog).getByRole("button", { name: "Save UOM" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add UOM" })).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveValue("private-1");
    expect(screen.getByRole("option", { name: "Length unit (Proposed)" })).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByText("Proposed value saved and selected. Save changes to keep this Main Line selection.")).toHaveAttribute("role", "status");
    await waitFor(() => expect(uom.button).toHaveFocus());
    expect(sectionWrites).toEqual([]);
    const surface = await add("Surface", "Ceiling board");
    await surface.user.click(within(surface.dialog).getByRole("button", { name: "Save Surface" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Surface" })).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveValue("private-1");
    await waitFor(() => expect(surface.button).toHaveFocus());
    expect(screen.getByText("Proposed value saved and selected. Save changes to keep this Main Line selection.")).toBeInTheDocument();
    await surface.user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(sectionWrites).toHaveLength(1));
    expect(sectionWrites[0]).toEqual({ expectedVersion: 3, applicability: "configured", payload: { ...overview, uomId: "private-1", surfaceIds: ["shared-surface", "private-2"] } });
    expect((sectionWrites[0].payload as KnowledgeJsonObject).hiddenRule).toEqual({ note: "preserve" });
    expect(masterWrites.map(value => value.expectedVersion)).toEqual([1, 2]);
    expect(masterWrites[0].decimalScale).toBe(3);
    const globalRefs = view.client.getQueryData([...proposalKeys.actor(actor), "procurement", "editor-references"]);
    expect(JSON.stringify(globalRefs)).not.toContain("Length unit");
    expect(view.client.getQueriesData({ queryKey: ["ai-estimator-knowledge"] })).toEqual([]);
    await screen.findByText("Section saved.");
    expect((await axe.run(screen.getByRole("dialog", { name: target === "new_sub_basket" ? "Configure Sub-Basket" : "Configure Main Basket" }), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps input and unsaved Overview after a duplicate, then saves a corrected value", async () => {
    let calls = 0;
    server.use(http.post(`${base}/proposal-one/masters/surfaces`, async ({ request }) => { calls++; const input = await request.json() as Record<string, unknown>; if (calls === 1) return error(409, "MASTER_NAME_CONFLICT", "A Surface with this name already exists."); const value = resource("surface", "private-corrected", String(input.name)); masters.push(value); increment(); return data({ detail, resource: value }); }));
    setup(); const form = await add("Surface", "Wall");
    await form.user.click(within(form.dialog).getByRole("button", { name: "Save Surface" }));
    await within(form.dialog).findByText("A Surface with this name already exists.");
    expect(within(form.dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Wall");
    expect(within(form.dialog).getByRole("button", { name: "Save Surface" })).toBeEnabled();
    await form.user.clear(within(form.dialog).getByRole("textbox", { name: "Name" })); await form.user.type(within(form.dialog).getByRole("textbox", { name: "Name" }), "Sloping wall");
    await form.user.click(within(form.dialog).getByRole("button", { name: "Save Surface" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Surface" })).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveValue("shared-uom"); expect(sectionWrites).toHaveLength(0);
  });

  it("blocks uncertain creation retry until a saved-state check confirms no command committed", async () => {
    let calls = 0;
    server.use(http.post(`${base}/proposal-one/masters/uoms`, () => { calls++; return error(503, "TEMPORARY", "Service unavailable"); }));
    setup(); const form = await add("UOM", "Preserved value"); await form.user.click(within(form.dialog).getByRole("button", { name: "Save UOM" }));
    await within(form.dialog).findByText("Service unavailable");
    expect(within(form.dialog).getByRole("button", { name: "Save UOM" })).toBeDisabled();
    await form.user.click(within(form.dialog).getByRole("button", { name: "Check saved proposal" }));
    await waitFor(() => expect(within(form.dialog).getByRole("button", { name: "Save UOM" })).toBeEnabled());
    expect(within(form.dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Preserved value"); expect(calls).toBe(1);
  });

  it("never rebases a draft across an external head change", async () => {
    const view = setup(); const form = await add("Surface", "Raked wall");
    increment();
    await act(async () => { await view.client.invalidateQueries({ queryKey: proposalKeys.detail(actor, "procurement", "proposal-one") }); });
    await form.user.click(within(form.dialog).getByRole("button", { name: "Save Surface" }));
    await within(form.dialog).findByText("The saved proposal changed. Your entries are preserved. Refresh before saving this value.");
    expect(masterWrites).toEqual([]); expect(within(form.dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Raked wall");
    expect(within(form.dialog).getByRole("button", { name: "Save Surface" })).toBeDisabled();
  });

  it("supports editing and removing unused private values, while protecting unsaved references", async () => {
    masters = [resource("surface", "unused", "Unused wall")]; setup(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit proposed Unused wall" }));
    const dialog = screen.getByRole("dialog", { name: "Edit proposed Surface" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Name" })); await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Unused ceiling");
    await user.click(within(dialog).getByRole("button", { name: "Save Surface" }));
    await user.click(await screen.findByRole("button", { name: "Remove proposed Unused ceiling" }));
    await user.click(screen.getByRole("button", { name: "Remove proposed value" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Proposed UOMs and surfaces" })).not.toBeInTheDocument());
    const form = await add("UOM", "Selected private unit"); await form.user.click(within(form.dialog).getByRole("button", { name: "Save UOM" }));
    await user.click(await screen.findByRole("button", { name: "Remove proposed Selected private unit" }));
    await user.click(screen.getByRole("button", { name: "Remove proposed value" }));
    await screen.findByText("This value is selected in this Main Line's unsaved Overview. Remove that selection and save Overview first.");
    expect(masters).toHaveLength(1); expect(sectionWrites).toEqual([]);
  });

  it.each(["procurement", "super_admin"] as const)("keeps proposed masters editable after %s removes the last Main Line", async currentRole => {
    role = currentRole;
    detail.target = { kind: "new_sub_basket", basketId: detail.basketId };
    if (role === "super_admin") { detail.status = "pending"; detail.requestVersion = 6; detail.capabilities = { edit: true, submit: false, review: true, decide: true, revise: false }; }
    masters = [resource("surface", "unused-after-line", "Remaining surface")];
    const prefix = role === "super_admin" ? admin : base;
    let removedLine = false;
    server.use(
      http.get(`${prefix}/proposal-one/hierarchy`, () => page(proposalHierarchyFixture(detail).filter(value => !removedLine || value.kind !== "main_line"))),
      http.delete(`${prefix}/proposal-one/main-lines/line-proposal`, () => { removedLine = true; increment(); detail.counts.mainLines = 0; return data({ detail, resource: null }); }),
      http.get(`${prefix}/proposal-one/inherited-quality`, () => data({ basketId: detail.basketId, basketName: detail.name, basketStatus: "active", version: 1, revisionId: null, revisionNumber: 0, contentDigest: null, parameters: [], updatedAt: null }))
    );
    setup(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Remove Main Line" }));
    await user.click(within(screen.getByRole("dialog", { name: "Remove Stone installation?" })).getByRole("button", { name: "Remove" }));
    await screen.findByText(/Main Lines are optional for this Sub-Basket request/);
    expect(screen.queryByRole("button", { name: "Add UOM" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Edit proposed Remaining surface" }));
    const form = screen.getByRole("dialog", { name: "Edit proposed Surface" });
    await user.clear(within(form).getByRole("textbox", { name: "Name" }));
    await user.type(within(form).getByRole("textbox", { name: "Name" }), "Reviewed remaining surface");
    await user.click(within(form).getByRole("button", { name: "Save Surface" }));
    await user.click(await screen.findByRole("button", { name: "Remove proposed Reviewed remaining surface" }));
    await user.click(screen.getByRole("button", { name: "Remove proposed value" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Proposed UOMs and surfaces" })).not.toBeInTheDocument());
    expect(masters).toHaveLength(0); expect(sectionWrites).toEqual([]);
    expect(masterWrites[0].expectedVersion).toBe(2);
    if (role === "super_admin") expect(masterWrites[0].expectedRequestVersion).toBe(7);
  });

  it("shows server reference protection without dismissing the removal dialog", async () => {
    masters = [resource("uom", "saved-reference", "Saved unit")];
    server.use(http.delete(`${base}/proposal-one/masters/uoms/saved-reference`, () => error(409, "MASTER_REFERENCED", "Saved unit is used by Stone installation.")));
    setup(); const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Remove proposed Saved unit" })); await user.click(screen.getByRole("button", { name: "Remove proposed value" }));
    expect(await screen.findByText("Saved unit is used by Stone installation.")).toBeVisible(); expect(masters).toHaveLength(1);
  });

  it("exposes proposed provenance in submitted snapshots without mutation actions", async () => {
    masters = [resource("uom", "submitted-unit", "Submitted unit")]; overview = { ...overview, uomId: "submitted-unit" };
    detail.capabilities.edit = false; detail.status = "pending";
    setup(); const select = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(select).toBeDisabled(); await screen.findByRole("option", { name: "Submitted unit (Proposed)" });
    expect(screen.queryByRole("button", { name: "Add UOM" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Edit proposed Submitted unit" })).not.toBeInTheDocument();
  });

  it("uses snapshot identity once when the approved master also appears in the shared catalog", async () => {
    masters = [resource("uom", "shared-uom", "Approved snapshot unit")]; overview = { ...overview, uomId: "shared-uom" };
    detail.status = "fulfilled"; detail.capabilities.edit = false;
    const view = setup(); await screen.findByRole("option", { name: "Approved snapshot unit (Proposed)" });
    expect(screen.queryByRole("option", { name: "Metre" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveValue("shared-uom");
    expect(JSON.stringify(view.client.getQueryData([...proposalKeys.actor(actor), "procurement", "editor-references"]))).toContain("Metre");
  });

  it("includes the request CAS when Super Admin adds a review value and reads submitted masters separately", async () => {
    role = "super_admin"; detail.status = "pending"; detail.requestVersion = 6; detail.capabilities = { edit: true, submit: false, review: true, decide: true, revise: false };
    const snapshots: string[] = [];
    server.use(http.get(`${admin}/proposal-one/masters/:kind`, ({ request, params }) => { const snapshot = new URL(request.url).searchParams.get("snapshot")!; snapshots.push(snapshot); return page(snapshot === "submitted" ? [] : masters.filter(value => value.kind === (params.kind === "uoms" ? "uom" : "surface"))); }));
    setup(); const form = await add("Surface", "Review surface"); await form.user.click(within(form.dialog).getByRole("button", { name: "Save Surface" }));
    await waitFor(() => expect(masterWrites).toHaveLength(1)); expect(masterWrites[0].expectedRequestVersion).toBe(6);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Surface" })).not.toBeInTheDocument());
    await form.user.click(screen.getByRole("button", { name: "View original submission" }));
    await form.user.click(screen.getByRole("button", { name: "Discard changes" }));
    await screen.findByText("Original submission. Read-only."); await waitFor(() => expect(snapshots).toContain("submitted"));
    expect(screen.queryByRole("button", { name: "Add UOM" })).not.toBeInTheDocument();
  });

  it("discards an unsaved form only after confirmation and returns keyboard focus", async () => {
    setup(); const form = await add("Surface", "Unsaved surface");
    await form.user.keyboard("{Escape}"); const discard = screen.getByRole("dialog", { name: "Discard unsaved value?" });
    await form.user.click(within(discard).getByRole("button", { name: "Keep editing" })); expect(within(form.dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Unsaved surface");
    await form.user.click(within(form.dialog).getByRole("button", { name: "Cancel" })); await form.user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(form.button).toHaveFocus()); expect(masterWrites).toEqual([]);
  });

  it("does not apply a delayed old-identity creation to another actor or proposal", async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    server.use(http.post(`${base}/proposal-one/masters/uoms`, async () => { const value = resource("uom", "old-private", "Old private unit"); await gate; return data({ detail: { ...detail, version: 2, head: { ...detail.head, version: 2 } }, resource: value }); }));
    const view = setup(); const form = await add("UOM", "Old private unit"); await form.user.click(within(form.dialog).getByRole("button", { name: "Save UOM" }));
    actor = "procurement-two"; detail = proposalFixture({ id: "proposal-two", requesterId: actor }); view.update("proposal-two");
    release(); await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add UOM" })).not.toBeInTheDocument());
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(screen.queryByRole("option", { name: "Old private unit (Proposed)" })).not.toBeInTheDocument(); expect(view.client.getQueriesData({ queryKey: proposalKeys.actor("procurement-one") })).toEqual([]);
  });

  it("keeps Add actions disabled and reports unavailable private references", async () => {
    server.use(http.get(`${base}/proposal-one/masters/uoms`, () => error(503, "TEMPORARY", "Private values unavailable")));
    setup(); await screen.findByText("UOM options unavailable."); expect(screen.getByRole("button", { name: "Add UOM" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Add Surface" })).toBeDisabled();
  });
});
