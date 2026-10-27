import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/server";
import { authorizationFor } from "../../test/authFixtures";
import type { Role } from "../../api/types";
import { PMNotifications } from "./PMNotifications";
import { PMTargetRecord } from "./PMTargetRecord";

const state = vi.hoisted(() => ({ role: "site_manager" as Role }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "assigned-user", role: state.role }, authorization: authorizationFor(state.role, ["pm.notifications.read"]) }) }));
function Location() { return <output>{useLocation().search}</output>; }
function mount(children: React.ReactNode, initial = "/execution") {
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter></QueryClientProvider>);
}
describe("PM notification destinations", () => {
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
