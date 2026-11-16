import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../../test/server";
import { authorizationFor } from "../../test/authFixtures";
import type { Role } from "../../api/types";
import { PMNotifications } from "./PMNotifications";
import { PMTargetRecord } from "./PMTargetRecord";

const state = vi.hoisted(() => ({ role: "site_manager" as Role, permitted: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "assigned-user", role: state.role }, authorization: authorizationFor(state.role, state.permitted ? ["pm.notifications.read"] : []) }) }));
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
function mount(children: React.ReactNode, initial = "/execution") {
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter></QueryClientProvider>);
}
describe("PM notification destinations", () => {
  beforeEach(() => { state.role = "site_manager"; state.permitted = true; });

  it("shows Super Admin updates across projects and records only the clicked notice before refreshing its unread count", async () => {
    state.role = "super_admin";
    const readIds: string[] = [];
    const notices = [
      { id: "event-a", projectId: "project-a", entityId: "selection-a", family: "selection_request", action: "remind", title: "Finish decision", at: "2026-10-27T08:00:00Z" },
      { id: "event-b", projectId: "project-b", entityId: "request-b", family: "purchase_request", action: "submitted", title: "Review procurement request", at: "2026-10-27T09:00:00Z" }
    ];
    const receiptBodies: string[] = [];
    server.use(
      http.get("/api/v1/project-manager/notifications", () => HttpResponse.json({ data: {
        items: notices.map(notice => ({ ...notice, read: readIds.includes(notice.id) })), total: 2, unreadTotal: 2 - readIds.length
      } })),
      http.post("/api/v1/project-manager/notifications/:notificationId/read", async ({ params, request }) => {
        readIds.push(String(params.notificationId));
        receiptBodies.push(await request.text());
        return HttpResponse.json({ data: { read: true } });
      })
    );
    const user = userEvent.setup();
    mount(<><PMNotifications /><Location /></>, "/admin");
    await user.click(await screen.findByRole("button", { name: "Project updates, 2 unread" }));
    const dialog = screen.getByRole("dialog", { name: "Project updates" });
    expect(within(dialog).getByText("All projects")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Finish decision" })).toHaveAttribute("href", "/admin/projects/project-a");
    const target = within(dialog).getByRole("link", { name: "Review procurement request" });
    expect(target).toHaveAttribute("href", "/admin/projects/project-b");
    await user.click(target);
    await waitFor(() => expect(readIds).toEqual(["event-b"]));
    expect(receiptBodies).toEqual([""]);
    expect(screen.getByRole("status")).toHaveTextContent("/admin/projects/project-b");
    expect(screen.queryByRole("dialog", { name: "Project updates" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Project updates, 1 unread" })).toBeVisible();
  });

  it("keeps the Project Manager notification deep link targeted to its record", async () => {
    server.use(http.get("/api/v1/project-manager/notifications", () => HttpResponse.json({ data: {
      items: [{ id: "event", projectId: "project-a", entityId: "selection-a", family: "selection_request", action: "remind", title: "Finish decision", at: "2026-10-27T08:00:00Z", read: false }], total: 1, unreadTotal: 1
    } })));
    mount(<PMNotifications />);
    await userEvent.click(await screen.findByRole("button", { name: "Project updates, 1 unread" }));
    const dialog = screen.getByRole("dialog", { name: "Project updates" });
    expect(within(dialog).getByText("Your assignments")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Finish decision" })).toHaveAttribute("href", "/projects/project-a/execution?tab=selections&entity=selection-a&locate=1");
  });

  it.each(["super_admin", "site_manager"] as const)("keeps notification reads permission-gated for %s", async role => {
    state.role = role;
    state.permitted = false;
    let reads = 0;
    server.use(http.get("/api/v1/project-manager/notifications", () => {
      reads += 1;
      return HttpResponse.json({ data: { items: [], total: 0, unreadTotal: 0 } });
    }));
    mount(<PMNotifications />);
    await userEvent.tab();
    expect(screen.queryByRole("button", { name: /Project updates/ })).not.toBeInTheDocument();
    expect(reads).toBe(0);
  });

  it.each(["super_admin", "site_manager"] as const)("explains the notification scope when the %s inbox is empty", async role => {
    state.role = role;
    server.use(http.get("/api/v1/project-manager/notifications", () => HttpResponse.json({ data: { items: [], total: 0, unreadTotal: 0 } })));
    mount(<PMNotifications />);
    await userEvent.click(await screen.findByRole("button", { name: "Project updates" }));
    expect(await screen.findByRole("heading", { name: "No project updates" })).toBeVisible();
    expect(screen.getByText(role === "super_admin"
      ? "Project updates and review reminders across projects appear here."
      : "Requests and review reminders for your current assignments appear here.")).toBeVisible();
  });

  it.each(["designer", "client"] as const)("opens the existing %s selection approval surface", async role => {
    state.role = role;
    server.use(http.get("/api/v1/project-manager/notifications", () => HttpResponse.json({data:{items:[{id:"event",projectId:"project-a",entityId:"selection-a",family:"selection_request",action:"remind",title:"Finish decision",at:"2026-10-27T08:00:00Z",read:false}],total:1,unreadTotal:1}})));
    mount(<PMNotifications/>);
    await userEvent.click(await screen.findByRole("button",{name:/Project updates/}));
    expect(await screen.findByRole("link",{name:"Finish decision"})).toHaveAttribute("href",`/${role}/projects/project-a#design-requirements`);
  });
  it("locates an updated target beyond the first page before opening its record", async () => {
    state.role = "site_manager"; const offsets:string[]=[];
    server.use(http.get("/api/v1/projects/project-a/pm/selections", ({request}) => {
      const offset=new URL(request.url).searchParams.get("offset")??"0"; offsets.push(offset);
      return HttpResponse.json({data:{items:offset==="0"?Array.from({length:100},(_,i)=>({id:`prior-${i}`})):[{id:"target"}],total:101}});
    }));
    mount(<><PMTargetRecord projectId="project-a" tab="selections"><p>Target panel</p></PMTargetRecord><Location/></>,"/execution?tab=selections&entity=target&locate=1");
    expect(await screen.findByText("Target panel")).toBeVisible();
    expect(offsets).toEqual(["0","100"]);
    expect(screen.getByRole("status")).toHaveTextContent("tabOffset=100");
  });
  it("explains a removed target and allows opening the current records", async () => {
    state.role = "site_manager";
    server.use(http.get("/api/v1/projects/project-a/pm/quality", () => HttpResponse.json({data:{items:[],total:0}})));
    mount(<PMTargetRecord projectId="project-a" tab="quality"><p>Current quality</p></PMTargetRecord>,"/execution?entity=missing&locate=1");
    await userEvent.click(await screen.findByRole("button",{name:"View current records"}));
    await waitFor(()=>expect(screen.getByText("Current quality")).toBeVisible());
  });
});
