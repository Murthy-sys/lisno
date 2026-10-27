import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { server } from "../../test/server";
import { PMClientPanel } from "./PMClientPanel";
import type { PMPanel } from "./projectManagerTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "pm-one", role: "site_manager" }, authorization: { role: "site_manager", permissions: ["pm.workspace.read", "pm.snags.manage"] } }) }));
const panel = (overrides: Partial<PMPanel> = {}): PMPanel => ({ tab: "snagging", availability: "available", calculatedAt: "2026-10-27T09:00:00Z", items: [], total: 0, issues: [], sources: [], people: [{ id: "site-one", name: "Site owner", role: "site_manager" }], actions: [{ id: "create_snag", label: "Log snag" }],
  snagFilters: { rooms: [{ id: "room-one", label: "Bedroom" }, { id: "room-two", label: "Bedroom" }], trades: [{ id: "trade-one", label: "Carpentry" }], vendors: [{ id: "vendor-one", label: "Joinery partner" }] }, ...overrides });
function mount(path = "/projects/project-one/execution?tab=snagging", tab: "client" | "snagging" = "snagging") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><FeedbackProvider><PMClientPanel projectId="project-one" tab={tab} /></FeedbackProvider></MemoryRouter></QueryClientProvider>) };
}

describe("Project Manager snag sources and ownership", () => {
  it("paginates past the first hundred work assignments and persists the chosen work and owner", async () => {
    const reads: URL[] = []; const writes: Record<string, unknown>[] = [];
    server.use(http.get("/api/v1/projects/project-one/pm/snagging", () => HttpResponse.json({ data: panel() })),
      http.get("/api/v1/projects/project-one/execution", ({ request }) => {
        const url = new URL(request.url); reads.push(url); const offset = Number(url.searchParams.get("offset"));
        const items = Array.from({ length: Math.min(25, 101 - offset) }, (_, index) => ({ id: `work-${offset + index + 1}`, itemName: `Cabinet ${offset + index + 1}`, roomName: "Bedroom", vendorName: "Joinery partner", status: "not_started", sourceAvailable: true }));
        return HttpResponse.json({ data: { items, total: 101, limit: 25, offset } });
      }), http.post("/api/v1/projects/project-one/pm/snags", async ({ request }) => { writes.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: {} }); }));
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole("button", { name: "Log snag" }));
    const dialog = screen.getByRole("dialog", { name: "Log snag" });
    await within(dialog).findByRole("radio", { name: /Cabinet 1\b/ });
    for (const offset of [25, 50, 75, 100]) {
      await user.click(within(dialog).getByRole("button", { name: "Next work" }));
      await within(dialog).findByRole("radio", { name: new RegExp(`Cabinet ${offset + 1}\\b`) });
    }
    await user.click(within(dialog).getByRole("radio", { name: /Cabinet 101\b/ }));
    expect(within(dialog).getByRole("button", { name: "Next work" })).toBeDisabled();
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Responsible person" }), "site-one");
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Cabinet hinge defect");
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Repair the damaged hinge before handover.");
    await user.click(within(dialog).getByRole("button", { name: "Log snag" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ assignmentId: "work-101", ownerId: "site-one", expectedVersion: 0 });
    expect(reads.some(url => url.searchParams.get("offset") === "100")).toBe(true);
  });
  it("sends stable filter IDs and resets a later page before displaying filtered totals", async () => {
    const reads: URL[] = [];
    server.use(http.get("/api/v1/projects/project-one/pm/snagging", ({ request }) => { const url = new URL(request.url); reads.push(url); return HttpResponse.json({ data: panel({ total: url.searchParams.has("roomId") ? 0 : 52 }) }); }));
    const user = userEvent.setup(); mount("/projects/project-one/execution?tab=snagging&tabOffset=50");
    const rooms = await screen.findByRole("combobox", { name: "Room" });
    expect(within(rooms).getAllByRole("option", { name: "Bedroom" })).toHaveLength(2);
    await user.selectOptions(rooms, "room-two");
    await waitFor(() => expect(reads.at(-1)?.searchParams.get("roomId")).toBe("room-two"));
    expect(reads.at(-1)?.searchParams.get("offset")).toBe("0");
    await user.selectOptions(screen.getByRole("combobox", { name: "Trade" }), "trade-one");
    await user.selectOptions(screen.getByRole("combobox", { name: "Vendor" }), "vendor-one");
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "resolved");
    await waitFor(() => expect(reads.at(-1)?.searchParams.get("status")).toBe("resolved"));
    expect(Object.fromEntries(reads.at(-1)!.searchParams)).toMatchObject({ roomId: "room-two", tradeId: "trade-one", vendorId: "vendor-one", status: "resolved", offset: "0" });
    expect(await screen.findByText("0 records")).toBeVisible();
  });
  it("closes a stale command dialog when project access is revoked", async () => {
    let denied = false;
    server.use(http.get("/api/v1/projects/project-one/pm/snagging", () => denied ? HttpResponse.json({ error: { code: "FORBIDDEN", message: "Assignment changed" } }, { status: 403 }) : HttpResponse.json({ data: panel() })),
      http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: { items: [], total: 0 } })));
    const user = userEvent.setup(); const { client } = mount();
    await user.click(await screen.findByRole("button", { name: "Log snag" }));
    expect(screen.getByRole("dialog", { name: "Log snag" })).toBeVisible();
    denied = true;
    await act(async () => { await client.invalidateQueries({ queryKey: ["project-manager"] }); });
    expect(await screen.findByRole("heading", { name: "Project access unavailable" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("uses only the server-provided addressed WhatsApp compose link", async () => {
    const href = "https://wa.me/919000000000?text=Project%20update";
    server.use(http.get("/api/v1/projects/project-one/pm/client", () => HttpResponse.json({ data: panel({ tab: "client", actions: [{ id: "whatsapp", label: "WhatsApp", href }] }) })));
    mount("/projects/project-one/execution?tab=client", "client");
    expect(await screen.findByRole("link", { name: /Compose a WhatsApp update/ })).toHaveAttribute("href", href);
  });
});
