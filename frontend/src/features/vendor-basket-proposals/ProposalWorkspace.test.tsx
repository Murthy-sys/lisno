import axe from "axe-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import { server } from "../../test/server";
import "../../test/render";
import type { Role } from "../../api/authorization-contract";
import type { KnowledgeJsonObject, KnowledgeSectionKey } from "../ai-estimator-knowledge/knowledgeTypes";
import { ProposalWorkspace } from "./ProposalWorkspace";
import { proposalFixture, proposalHierarchyFixture, proposalSectionFixture } from "./proposal.fixtures";
import { proposalKeys } from "./proposalApi";
import type { ProposalDetail } from "./proposalTypes";

let role: Role = "procurement";
let actor = "procurement-one";
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: actor, role }, authorization: authorizationFor(role, role === "procurement" ? ["procurement.vendor_basket_proposal.read", "procurement.vendor_basket_proposal.create", "procurement.vendor_basket_proposal.update", "procurement.vendor_basket_proposal.submit"] : undefined) }) }));
const data = (value: unknown) => HttpResponse.json({ data: value });
const page = (items: unknown[]) => data({ items, pagination: { total: items.length, limit: 100, offset: 0, hasMore: false } });
const fail = (status = 503) => HttpResponse.json({ error: { code: status === 403 ? "FORBIDDEN" : "TEMPORARY", message: status === 403 ? "Access changed" : "Temporary service failure" } }, { status });
let detail: ProposalDetail;
let writes: { section: string; input: Record<string, unknown> }[];
let sections: Partial<Record<KnowledgeSectionKey, KnowledgeJsonObject>>;
let directReads: number;
let ready: boolean;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onDecision = vi.fn(); const onSubmitted = vi.fn(); const onClose = vi.fn();
  const view = () => <QueryClientProvider client={client}><ProposalWorkspace proposalId="proposal-one" scope={role === "super_admin" ? "admin" : "procurement"} onClose={onClose} onDecision={onDecision} onSubmitted={onSubmitted} /></QueryClientProvider>;
  return { ...render(view()), client, onDecision, onSubmitted, onClose, update: () => view() };
}
beforeEach(() => {
  role = "procurement"; actor = "procurement-one"; detail = proposalFixture(); writes = []; sections = { overview: { uomId: "uom-sqft" }, pricing: { specifications: [{ id: "spec-one", name: "Stone grade", description: "Saved description" }] } }; directReads = 0; ready = true;
  for (const prefix of ["/api/v1/procurement/vendor-basket-proposals", "/api/v1/admin/ai-estimator-knowledge/basket-proposals"]) server.use(
    http.get(`${prefix}/references`, ({ request }) => {
      const kind = new URL(request.url).searchParams.get("kind");
      return page(kind === "uoms" ? ["sqft", "sqm"].map((code, index) => ({ id: `uom-${code}`, masterType: "uoms", name: code, code, version: 1, status: "active", displayOrder: index, description: null, createdAt: detail.createdAt, updatedAt: detail.updatedAt, createdById: actor, updatedById: actor })) : []);
    }),
    http.get(`${prefix}/:proposalId/masters/:kind`, () => page([])),
    http.get(`${prefix}/proposal-one`, () => data(detail)),
    http.get(`${prefix}/proposal-one/hierarchy`, () => page(proposalHierarchyFixture(detail))),
    http.get(`${prefix}/proposal-one/readiness`, () => data({ head: detail.head, version: detail.version, requestVersion: detail.requestVersion, ready, findings: ready ? [] : [{ resourceId: "resource-overview", mainLineId: "line-proposal", sectionKey: "overview", code: "UOM_REQUIRED", message: "Choose a UOM before submitting." }] })),
    http.get(`${prefix}/proposal-one/resources/:resourceId`, ({ params }) => { const key = String(params.resourceId).replace("resource-", "") as KnowledgeSectionKey; return data(proposalSectionFixture(key, sections[key], detail)); }),
    http.put(`${prefix}/proposal-one/main-lines/line-proposal/sections/:section`, async ({ params, request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push({ section: String(params.section), input });
      sections[params.section as KnowledgeSectionKey] = input.payload as KnowledgeJsonObject;
      detail = { ...detail, version: detail.version + 1, head: { ...detail.head, version: detail.head.version + 1 } };
      return data({ detail, resource: proposalSectionFixture(params.section as KnowledgeSectionKey, input.payload as KnowledgeJsonObject, detail) });
    })
  );
  server.use(
    http.get("/api/v1/admin/ai-estimator-knowledge/main-lines/:id", () => { directReads++; return fail(403); }),
    http.get("/api/v1/admin/ai-estimator-knowledge/specification-item-names", () => { directReads++; return fail(403); })
  );
});

describe("isolated basket proposal workspace", () => {
  it("keeps specification names scoped and never reads the internal item-name list", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(await screen.findByRole("button", { name: "Edit Specification 1" }));
    const input = screen.getByRole("textbox", { name: "Item name" });
    await user.clear(input);
    await user.type(input, "Private proposal item");
    expect(input).toHaveValue("Private proposal item");
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(directReads).toBe(0);
    expect(client.getQueryCache().getAll().some((entry) => entry.queryKey.includes("specification-item-names"))).toBe(false);
  });
  it.each([undefined, { kind: "new_main_basket" as const }, { kind: "new_sub_basket" as const, basketId: "parent-paint" }])("uses the Procurement reference presentation with real proposal identity (%j)", async target => {
    detail = proposalFixture({ target });
    setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(screen.getByRole("dialog", { name: target?.kind === "new_sub_basket" ? "Configure Sub-Basket" : "Configure Main Basket" })).toHaveClass("basket-proposal--procurement-reference");
    expect(screen.getByRole("heading", { name: detail.name })).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.queryByText(detail.vendorName!)).not.toBeInTheDocument();
    expect(screen.queryByText("Define measurement units, applicable surfaces and settings for this main line.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unit of measure" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Applicable surfaces" })).toBeVisible();
    if (target?.kind === "new_sub_basket") {
      expect(screen.queryByRole("button", { name: "Edit basket" })).not.toBeInTheDocument();
      expect(screen.getByText(/New Sub-Basket under/)).toHaveTextContent(detail.basket.payload.name);
    } else expect(screen.getByRole("button", { name: "Edit basket" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh saved configuration" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add UOM" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Sub-Basket" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Main Line" })).toBeVisible();
    expect(await screen.findByText("No surfaces selected yet")).toBeVisible();
    const saved = await screen.findByText("Configuration saved");
    expect(saved.closest("[role=status]")?.querySelector("time")).toHaveAttribute("datetime", new Date(detail.updatedAt).toISOString());
    expect(screen.queryByText("Just now")).not.toBeInTheDocument();
  });

  it("preserves Super Admin review's original headings and actions", async () => {
    role = "super_admin"; actor = "super-admin-one";
    detail = proposalFixture({ status: "pending", requestId: "request-one", requestVersion: 2, capabilities: { edit: true, submit: false, review: true, decide: true, revise: false } });
    setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(screen.getByRole("dialog", { name: "Review basket configuration" })).not.toHaveClass("basket-proposal--procurement-reference");
    expect(screen.getByText("Synthetic Vendor · Awaiting Super Admin")).toBeVisible();
    expect(screen.getByRole("heading", { name: "UOM" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Surfaces" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit Main Basket" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Sub-Basket" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh saved configuration" })).toBeVisible();
    expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
  });

  it.each([
    { kind: "new_main_basket" as const, status: "pending" as const, label: "Awaiting Super Admin" },
    { kind: "new_sub_basket" as const, status: "pending" as const, label: "Awaiting Super Admin" },
    { kind: "new_main_basket" as const, status: "fulfilled" as const, label: "Approved and active" },
    { kind: "new_sub_basket" as const, status: "rejected" as const, label: "Rejected" }
  ])("shows the actual $status status for a read-only $kind", async ({ kind, status, label }) => {
    detail = proposalFixture({ status, target: kind === "new_sub_basket" ? { kind, basketId: "parent-paint" } : { kind }, capabilities: { edit: false, submit: false, decide: false, review: false, revise: false } });
    setup();
    expect(await screen.findByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.queryByText(detail.vendorName!)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Main Line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send for approval and activation" })).not.toBeInTheDocument();
  });

  it.each([{ kind: "new_main_basket" as const }, { kind: "new_sub_basket" as const, basketId: "parent-paint" }])("keeps Mode content under its selected tab and uses the saved section version (%j)", async target => {
    detail = proposalFixture({ target, version: 7 });
    const user = userEvent.setup(); setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(screen.queryByText("Section version 7")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    const panel = screen.getByRole("tabpanel", { name: "Mode" });
    expect((await within(panel).findAllByText("Section version 7")).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "false");
    expect(within(panel).getByRole("button", { name: "Edit Specification 1" })).toBeVisible();
    expect(writes).toEqual([]);
  });

  it("keeps the Procurement shell consistent while the target loads without inventing saved content", async () => {
    let release!: () => void;
    const delay = new Promise<void>(resolve => { release = resolve; });
    detail = proposalFixture({ target: { kind: "new_sub_basket", basketId: "parent-paint" } });
    server.use(http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one", async () => { await delay; return data(detail); }));
    setup();
    try {
      expect(await screen.findByText("Loading basket configuration…")).toBeVisible();
      expect(screen.getByRole("dialog")).toHaveClass("basket-proposal--procurement-reference");
      expect(screen.queryByRole("heading", { name: detail.name })).not.toBeInTheDocument();
      expect(screen.queryByText("Draft")).not.toBeInTheDocument();
      expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
    } finally { release(); }
    expect(await screen.findByRole("dialog", { name: "Configure Sub-Basket" })).toHaveClass("basket-proposal--procurement-reference");
  });

  it.each([{ kind: "new_main_basket" as const }, { kind: "new_sub_basket" as const, basketId: "parent-paint" }])("shows dirty, saving and saved states from the actual section save (%j)", async target => {
    detail = proposalFixture({ target });
    const user = userEvent.setup(); setup();
    await screen.findByText("Configuration saved");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }), "uom-sqm");
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
    let release!: () => void;
    const delay = new Promise<void>(resolve => { release = resolve; });
    server.use(http.put("/api/v1/procurement/vendor-basket-proposals/proposal-one/main-lines/line-proposal/sections/overview", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>;
      await delay;
      detail = { ...detail, version: 2, updatedAt: "2026-10-12T10:20:00.000Z", head: { ...detail.head, version: 2 } };
      sections.overview = input.payload as KnowledgeJsonObject;
      return data({ detail, resource: proposalSectionFixture("overview", sections.overview, detail) });
    }));
    try {
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      expect(await screen.findByText("Saving configuration…")).toBeVisible();
      expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    } finally { release(); }
    const saved = await screen.findByText("Configuration saved");
    expect(saved.closest("[role=status]")?.querySelector("time")).toHaveAttribute("datetime", "2026-10-12T10:20:00.000Z");
  });

  it.each([{ kind: "new_main_basket" as const }, { kind: "new_sub_basket" as const, basketId: "parent-paint" }])("never reports saved success while the visible section is loading or has failed (%j)", async target => {
    detail = proposalFixture({ target });
    let release!: () => void;
    const delay = new Promise<void>(resolve => { release = resolve; });
    server.use(http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/resources/resource-overview", async () => { await delay; return fail(); }));
    setup();
    try {
      await screen.findByText("Loading saved section…");
      expect(screen.getByText("Loading saved configuration…")).toBeVisible();
      expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
    } finally { release(); }
    await screen.findByRole("button", { name: "Retry section" });
    expect(screen.getByText("Configuration needs attention")).toBeVisible();
    expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
  });

  it("includes child Quality reference loading and failure in the configuration status", async () => {
    const user = userEvent.setup(); setup();
    await screen.findByText("Configuration saved");
    let release!: () => void;
    const delay = new Promise<void>(resolve => { release = resolve; });
    server.use(http.get("/api/v1/procurement/vendor-basket-proposals/references", async ({ request }) => {
      const kind = new URL(request.url).searchParams.get("kind");
      if (kind === "quality-frequencies" || kind === "quality-performers") { await delay; return fail(); }
      return page([]);
    }));
    try {
      await user.click(screen.getByRole("tab", { name: "Quality Parameter" }));
      expect(await screen.findByText("Loading saved configuration…")).toBeVisible();
      expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
    } finally { release(); }
    expect(await screen.findByText("Configuration needs attention")).toBeVisible();
    expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
  });

  it("omits an invalid saved timestamp and prioritizes a failed save over dirty state", async () => {
    detail = proposalFixture({ updatedAt: "invalid" });
    const user = userEvent.setup(); setup();
    const saved = await screen.findByText("Configuration saved");
    expect(saved.closest("[role=status]")?.querySelector("time")).toBeNull();
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit of measure (UOM)" }), "uom-sqm");
    server.use(http.put("/api/v1/procurement/vendor-basket-proposals/proposal-one/main-lines/line-proposal/sections/overview", () => fail(409)));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Configuration needs attention")).toBeVisible();
    expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Unit of measure (UOM)" })).toHaveValue("uom-sqm");
  });

  it("shows inherited read-only quality only after adding a Main Line to a Procurement Sub-Basket", async () => {
    detail = proposalFixture({ name: "Wall coating", basketId: "parent-paint", target: { kind: "new_sub_basket", basketId: "parent-paint" }, targetParentName: "Painting", counts: { subBaskets: 1, mainLines: 0 }, capabilities: { edit: true, submit: true, review: false, decide: false, revise: false, editParent: false, editQuality: false, manageSubBaskets: false } });
    detail.basket = { ...detail.basket, resourceId: "parent-paint", payload: { name: "Painting", description: "Original parent", displayOrder: 8 } };
    let qualityReads = 0;
    server.use(
      http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/hierarchy", () => page(proposalHierarchyFixture(detail).filter(node => node.kind === "sub_basket" || detail.counts.mainLines > 0))),
      http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/inherited-quality", () => { qualityReads++; return data({ basketId: "parent-paint", basketName: "Painting", basketStatus: "active", version: 7, revisionId: "quality-parent", revisionNumber: 3, contentDigest: "live-quality", parameters: [{ id: "quality-check", label: "Check cured surface", stage: "final-finish", type: "boolean", acceptanceCriteria: "Even finish" }], updatedAt: detail.updatedAt }); }),
      http.post("/api/v1/procurement/vendor-basket-proposals/proposal-one/sub-baskets/sub-proposal/main-lines", () => {
        detail = { ...detail, version: 2, counts: { subBaskets: 1, mainLines: 1 }, head: { ...detail.head, version: 2 } };
        return data({ detail, resource: proposalHierarchyFixture(detail)[1] });
      })
    );
    const user = userEvent.setup(); setup();
    await screen.findByRole("dialog", { name: "Configure Sub-Basket" });
    expect(screen.getByRole("dialog", { name: "Configure Sub-Basket" })).toHaveClass("basket-proposal--procurement-reference");
    expect(screen.getByRole("button", { name: "Refresh saved configuration" })).toBeVisible();
    expect(await screen.findByText("Configuration saved")).toBeVisible();
    expect(screen.getByText(/Main Lines are optional/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Quality Parameters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Quality Parameter" })).not.toBeInTheDocument();
    expect(qualityReads).toBe(0);
    expect(screen.queryByRole("button", { name: "Edit Main Basket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Sub-Basket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Interior stone" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Parameter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save shared checklist" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send for approval and activation" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Add Main Line" }));
    const lineDialog = screen.getByRole("dialog", { name: "Add Main Line" });
    await user.type(within(lineDialog).getByRole("textbox", { name: "Name" }), "Stone installation");
    await user.click(within(lineDialog).getByRole("button", { name: "Save" }));
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    expect(qualityReads).toBe(0);
    await user.click(screen.getByRole("tab", { name: "Quality Parameter" }));
    await screen.findByText("Check cured surface");
    expect(qualityReads).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Add Parameter" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View parameter 1: Check cured surface" }));
    const panel = screen.getByRole("dialog", { name: "Quality parameter details" });
    expect(within(panel).getByRole("textbox", { name: "Question / check" })).toBeDisabled();
    expect(directReads).toBe(0);
  });

  it("includes inherited quality loading and failure after opening an existing Main Line quality tab", async () => {
    detail = proposalFixture({ basketId: "parent-paint", target: { kind: "new_sub_basket", basketId: "parent-paint" } });
    let release!: () => void;
    const delay = new Promise<void>(resolve => { release = resolve; });
    server.use(
      http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/inherited-quality", async () => { await delay; return fail(); })
    );
    const user = userEvent.setup(); const view = setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    try {
      await user.click(screen.getByRole("tab", { name: "Quality Parameter" }));
      await screen.findByText("Loading inherited Quality Parameters…");
      await waitFor(() => expect(view.client.isFetching()).toBe(1));
      expect(screen.getByText("Loading saved configuration…")).toBeVisible();
      expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
    } finally { release(); }
    await screen.findByRole("button", { name: "Retry inherited quality" });
    expect(screen.getByText("Configuration needs attention")).toBeVisible();
    expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
  });

  it("preserves inherited quality in Super Admin review before a Main Line exists", async () => {
    role = "super_admin"; actor = "super-admin-one";
    detail = proposalFixture({ target: { kind: "new_sub_basket", basketId: "parent-paint" }, counts: { subBaskets: 1, mainLines: 0 } });
    server.use(
      http.get("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one/hierarchy", () => page(proposalHierarchyFixture(detail).filter(node => node.kind === "sub_basket"))),
      http.get("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one/inherited-quality", () => data({ basketId: "parent-paint", basketName: "Painting", basketStatus: "active", version: 7, revisionId: "quality-parent", revisionNumber: 3, contentDigest: "live-quality", parameters: [], updatedAt: detail.updatedAt }))
    );
    setup();
    expect(await screen.findByRole("region", { name: "Inherited Quality Parameters" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Quality Parameter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Parameter" })).not.toBeInTheDocument();
  });

  it("renders the Configuration UOM editor, saves only the proposal and exposes an accessible dialog", async () => {
    let submissions = 0;
    server.use(http.post("/api/v1/procurement/vendor-basket-proposals/proposal-one/submit", () => { submissions++; return data(detail); }));
    const user = userEvent.setup(); const view = setup();
    const uom = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await waitFor(() => expect(uom).toBeEnabled());
    await user.selectOptions(uom, "uom-sqm");
    expect(screen.getByRole("button", { name: "Send for approval and activation" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ section: "overview", input: { expectedVersion: 1, applicability: "configured", payload: { uomId: "uom-sqm" } } });
    expect(directReads).toBe(0);
    await screen.findByText("Section saved.");
    expect(submissions).toBe(0);
    expect(view.onSubmitted).not.toHaveBeenCalled();
    const result = await axe.run(screen.getByRole("dialog", { name: "Configure Main Basket" }), { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it("keeps the exact submitted snapshot read-only and navigates readiness findings", async () => {
    detail = proposalFixture({ status: "pending", capabilities: { edit: false, submit: false, decide: false, review: false, revise: false } });
    ready = false; const user = userEvent.setup(); setup();
    expect(await screen.findByRole("combobox", { name: "Unit of measure (UOM)" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add Sub-Basket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send for approval and activation" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose a UOM before submitting." }));
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("preserves dirty edits when changing sections and only discards after confirmation", async () => {
    const user = userEvent.setup(); setup();
    const uom = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" }); await waitFor(() => expect(uom).toBeEnabled());
    await user.selectOptions(uom, "uom-sqm"); await user.click(screen.getByRole("tab", { name: "Mode" }));
    const dialog = screen.getByRole("dialog", { name: "Save changes before continuing?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" })); expect(uom).toHaveValue("uom-sqm"); expect(writes).toEqual([]);
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(within(screen.getByRole("dialog", { name: "Save changes before continuing?" })).getByRole("button", { name: "Discard changes" }));
    await screen.findByRole("button", { name: "Edit Specification 1" }); expect(writes).toEqual([]); expect(directReads).toBe(0);
  });

  it("retains unsaved Pricing while Advanced commits and the hierarchy refresh is delayed", async () => {
    const user = userEvent.setup(); setup(); await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(await screen.findByRole("button", { name: "Edit Specification 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Brief description" }), { target: { value: "Unsaved stone requirement" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Min. PMC Margin (%)" }), { target: { value: "15" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" }), { target: { value: "15" } });
    let release!: () => void; const delay = new Promise<void>(resolve => { release = resolve; });
    server.use(http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one/hierarchy", async () => { await delay; return page(proposalHierarchyFixture(detail)); }),
      http.put("/api/v1/procurement/vendor-basket-proposals/proposal-one/main-lines/line-proposal/sections/pricing", async ({ request }) => { writes.push({ section: "pricing", input: await request.json() as Record<string, unknown> }); return fail(); }));
    try {
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(writes).toHaveLength(2));
      await waitFor(() => expect(screen.getByText("Configuration needs attention")).toBeVisible());
      expect(screen.queryByText("Configuration saved")).not.toBeInTheDocument();
      expect(writes.map(write => write.input.expectedVersion)).toEqual([1, 2]);
      expect(screen.getByRole("cell", { name: "Unsaved stone requirement" })).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
      expect(screen.getByRole("textbox", { name: "Brief description" })).toHaveValue("Unsaved stone requirement");
    } finally { release(); }
    expect(directReads).toBe(0);
  });

  it("keeps navigation and submission locked after refreshes finish while Pricing is still saving", async () => {
    const user = userEvent.setup(); const view = setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(await screen.findByRole("button", { name: "Edit Specification 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Brief description" }), { target: { value: "Pending stone requirement" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Min. PMC Margin (%)" }), { target: { value: "15" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" }), { target: { value: "15" } });
    let release!: () => void; const delay = new Promise<void>(resolve => { release = resolve; });
    server.use(http.put("/api/v1/procurement/vendor-basket-proposals/proposal-one/main-lines/line-proposal/sections/pricing", async ({ request }) => {
      const input = await request.json() as Record<string, unknown>; writes.push({ section: "pricing", input });
      await delay;
      sections.pricing = input.payload as KnowledgeJsonObject;
      detail = { ...detail, version: detail.version + 1, head: { ...detail.head, version: detail.head.version + 1 } };
      return data({ detail, resource: proposalSectionFixture("pricing", sections.pricing, detail) });
    }));
    try {
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(writes).toHaveLength(2));
      await waitFor(() => expect(view.client.isFetching({ queryKey: proposalKeys.proposal(actor, "procurement", "proposal-one") })).toBe(0));
      expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
      expect(screen.getByRole("tab", { name: "Overview" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Send for approval and activation" })).toBeDisabled();
      await user.keyboard("{Escape}");
      expect(view.onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog", { name: "Discard unsaved changes?" })).not.toBeInTheDocument();
    } finally { release(); }
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toBeEnabled());
    expect(screen.getByRole("tab", { name: "Overview" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send for approval and activation" })).toBeEnabled();
    expect(writes.map(write => write.input.expectedVersion)).toEqual([1, 2]);
  });

  it("clears discarded recommendation validation before saving a different section", async () => {
    const user = userEvent.setup(); setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.click(screen.getByRole("tab", { name: "Recommendations" }));
    await user.click(await screen.findByRole("button", { name: "Add Mandatory Item" }));
    await user.click(within(screen.getByRole("dialog", { name: "Edit scope rule 1" })).getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(within(screen.getByRole("dialog", { name: "Save changes before continuing?" })).getByRole("button", { name: "Discard changes" }));
    const uom = await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await waitFor(() => expect(uom).toBeEnabled());
    await user.selectOptions(uom, "uom-sqm");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Section saved.");
    expect(writes).toEqual([{ section: "overview", input: { expectedVersion: 1, applicability: "configured", payload: { uomId: "uom-sqm" } } }]);
  });

  it("only offers descriptions and display order for Main Baskets", async () => {
    const user = userEvent.setup(); setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    for (const label of ["Add Main Line", "Edit Interior stone", "Edit basket", "Edit Main Line"]) {
      await user.click(screen.getByRole("button", { name: label }));
      const title = label === "Edit Interior stone" ? "Edit Sub-Basket" : label === "Edit basket" ? "Edit Main Basket" : label;
      const dialog = screen.getByRole("dialog", { name: title });
      if (label === "Edit basket") {
        expect(within(dialog).getByRole("textbox", { name: "Description" })).toBeVisible();
        expect(within(dialog).getByRole("spinbutton", { name: "Display order" })).toBeVisible();
      } else {
        expect(within(dialog).queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
        expect(within(dialog).queryByRole("spinbutton", { name: "Display order" })).not.toBeInTheDocument();
      }
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    }
  });

  it("retries a lost submission response with the same frozen command", async () => {
    const commands: unknown[] = [];
    server.use(http.post("/api/v1/procurement/vendor-basket-proposals/proposal-one/submit", async ({ request }) => { commands.push(await request.json()); if (commands.length === 1) return fail(); detail = { ...detail, status: "pending", capabilities: { edit: false, submit: false, review: false, decide: false, revise: false } }; return data(detail); }));
    const user = userEvent.setup(); const view = setup();
    const send = await screen.findByRole("button", { name: "Send for approval and activation" }); await waitFor(() => expect(send).toBeEnabled()); await user.click(send);
    await user.click(await screen.findByRole("button", { name: "Retry same action" }));
    await waitFor(() => expect(view.onSubmitted).toHaveBeenCalledOnce()); expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
  });

  it("clears private proposal content immediately after access denial", async () => {
    const user = userEvent.setup(); const view = setup(); await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    server.use(http.get("/api/v1/procurement/vendor-basket-proposals/proposal-one", () => fail(403)));
    await user.click(screen.getByRole("button", { name: "Refresh saved configuration" }));
    await screen.findByText("This basket proposal is no longer available to your account.");
    expect(screen.queryByText("Stone installation")).not.toBeInTheDocument();
    expect(view.client.getQueryCache().findAll({ queryKey: proposalKeys.actor(actor) }).some(query => Boolean(query.state.data))).toBe(false);
  });

  it("keeps a confirmed approval visible if subsequent reads fail, with no second decision", async () => {
    role = "super_admin"; actor = "super-admin-one"; detail = proposalFixture({ status: "pending", requestId: "request-one", requestVersion: 2, capabilities: { edit: true, submit: false, review: true, decide: true, revise: false } });
    const commands: unknown[] = [];
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one/decision", async ({ request }) => { commands.push(await request.json()); server.use(http.get("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one", () => fail())); return data({ proposalId: detail.id, requestId: "request-one", status: "fulfilled", version: 2, requestVersion: 3, submittedDigest: "submitted", approvedDigest: "approved", reason: null, published: { basketId: detail.basketId, subBasketIds: ["sub-proposal"], mainLines: [{ mainLineId: "line-proposal", revisionId: "revision-active" }] } }); }));
    const user = userEvent.setup(); const view = setup();
    const approve = await screen.findByRole("button", { name: "Approve & activate" }); await waitFor(() => expect(approve).toBeEnabled()); await user.click(approve);
    await waitFor(() => expect(view.onDecision).toHaveBeenCalledOnce());
    expect(commands).toHaveLength(1); expect(commands[0]).toMatchObject({ expectedVersion: 1, expectedRequestVersion: 2, decision: "approve" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Approve & activate" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Retry same action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Submission readiness" })).not.toBeInTheDocument();
  });

  it("shows readable comparison scopes and removes approval readiness after successful publication", async () => {
    role = "super_admin"; actor = "super-admin-one";
    detail = proposalFixture({ status: "pending", requestId: "request-one", requestVersion: 2, capabilities: { edit: true, submit: false, review: true, decide: true, revise: false } });
    const mode = proposalSectionFixture("advanced");
    let postApprovalReadiness = 0;
    server.use(
      http.get("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one/changes", () => page([{ resourceId: mode.resourceId, kind: "section", change: "changed", before: mode, after: mode, fields: ["payload"] }])),
      http.post("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one/decision", () => {
        detail = { ...detail, status: "fulfilled", version: 2, requestVersion: 3, capabilities: { edit: false, submit: false, review: true, decide: false, revise: false } };
        server.use(http.get("/api/v1/admin/ai-estimator-knowledge/basket-proposals/proposal-one/readiness", () => {
          postApprovalReadiness++;
          return data({ head: detail.head, version: detail.version, requestVersion: detail.requestVersion, ready: false, findings: [{ resourceId: detail.basketId, code: "DUPLICATE_NAME", message: "A Main Basket already uses this name. Rename the proposal before approval." }] });
        }));
        return data({ proposalId: detail.id, requestId: "request-one", status: "fulfilled", version: 2, requestVersion: 3, submittedDigest: "submitted", approvedDigest: "approved", reason: null, published: { basketId: detail.basketId, subBasketIds: [], mainLines: [], prices: [], sections: [], qualityRevisionId: null } });
      })
    );
    const user = userEvent.setup(); const view = setup();
    await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.click(screen.getByRole("button", { name: "Compare with submission" }));
    const comparison = screen.getByRole("region", { name: "Changes from submission" });
    await within(comparison).findByText("Stone installation · Mode settings updated");
    expect(within(comparison).queryByText(/payload|Changed fields/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View original submission" })).toBeEnabled();
    const approve = screen.getByRole("button", { name: "Approve & activate" });
    await waitFor(() => expect(approve).toBeEnabled()); await user.click(approve);
    await waitFor(() => expect(view.onDecision).toHaveBeenCalledOnce());
    await waitFor(() => expect(view.client.isFetching({ queryKey: proposalKeys.proposal(actor, "admin", "proposal-one") })).toBe(0));
    expect(screen.queryByRole("region", { name: "Submission readiness" })).not.toBeInTheDocument();
    expect(screen.queryByText("A Main Basket already uses this name. Rename the proposal before approval.")).not.toBeInTheDocument();
    expect(postApprovalReadiness).toBe(0);
    expect(screen.getByRole("button", { name: "View original submission" })).toBeEnabled();
  });

  it("creates a new linked draft from a rejected proposal without reusing its visible hierarchy", async () => {
    detail = proposalFixture({ status: "rejected", requestId: "request-one", requestVersion: 4, reason: "Use a different finish specification", capabilities: { edit: false, submit: false, decide: false, review: false, revise: true } });
    const commands: unknown[] = [];
    const revised = proposalFixture({ id: "proposal-revised", name: "Revised stone", revisedFromId: detail.id, counts: { subBaskets: 0, mainLines: 0 } });
    server.use(http.post("/api/v1/procurement/vendor-basket-proposals/proposal-one/revise", async ({ request }) => { commands.push(await request.json()); return data(revised); }),
      http.get("/api/v1/procurement/vendor-basket-proposals/proposal-revised", () => data(revised)),
      http.get("/api/v1/procurement/vendor-basket-proposals/proposal-revised/hierarchy", () => page([])),
      http.get("/api/v1/procurement/vendor-basket-proposals/proposal-revised/readiness", () => data({ head: revised.head, version: revised.version, requestVersion: null, ready: false, findings: [] })));
    const user = userEvent.setup(); setup();
    await user.click(await screen.findByRole("button", { name: "Revise as new draft" }));
    await screen.findByRole("heading", { name: "Revised stone" });
    expect(commands[0]).toMatchObject({ expectedVersion: 1, expectedRequestVersion: 4, idempotencyKey: expect.any(String) });
    expect(screen.queryByRole("button", { name: "Stone installation" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Add Sub-Basket" })).toBeEnabled();
  });

  it("loads the shared basket quality editor through proposal-scoped references", async () => {
    const user = userEvent.setup(); setup(); await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    await user.click(screen.getByRole("tab", { name: "Quality Parameter" }));
    await screen.findByRole("button", { name: "Add Parameter" });
    expect(screen.queryByRole("tab", { name: "Saved summary" })).not.toBeInTheDocument();
    expect(directReads).toBe(0);
    expect(screen.queryByRole("button", { name: /Add frequency|Add performer/i })).not.toBeInTheDocument();
  });

  it("supports arrow and Home/End navigation across the four proposal tabs", async () => {
    const user = userEvent.setup(); setup(); await screen.findByRole("combobox", { name: "Unit of measure (UOM)" });
    const overview = screen.getByRole("tab", { name: "Overview" }); overview.focus();
    await user.keyboard("{End}");
    const quality = screen.getByRole("tab", { name: "Quality Parameter" });
    expect(quality).toHaveFocus(); expect(quality).toHaveAttribute("aria-selected", "true");
    expect(overview).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{Home}"); expect(overview).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveFocus();
  });
});
