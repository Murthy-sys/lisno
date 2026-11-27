import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { procurementNotificationApi, type ProcurementNotificationPage } from "./procurementNotificationApi";
import { notificationApi } from "./notificationApi";
import { NotificationProvider } from "./NotificationProvider";
import { NotificationBell } from "./NotificationBell";
import { ProcurementAttention } from "./ProcurementNotificationInbox";
const actor = vi.hoisted(() => ({ id: "buyer", permitted: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: actor.id, role: "procurement" }, authorization: authorizationFor("procurement", actor.permitted ? ["procurement.lifecycle.notifications.read"] : []) }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => "disabled" }));
const page: ProcurementNotificationPage = { items: [{ id: "overdue", projectId: "project-a", projectName: "Synthetic project", kind: "payment_overdue", entityId: "order-a", tab: "payments", title: "Vendor final payment", message: "Payment overdue", createdAt: "2026-11-27T04:00:00Z", readAt: null, localDate: "2026-11-27", status: "active", deepLink: "/procurement/projects/project-a?tab=payments&entityId=order-a", responsibleName: "Buyer", snapshot: { dueDate: "2026-11-26", remainingPaise: 320000, daysOverdue: 1, blockers: [] }, current: { dueDate: "2026-11-26", remainingPaise: 110000, daysOverdue: 1, blockers: [] } }], total: 1, unreadCount: 1, limit: 20, offset: 0, serverNow: "2026-11-27T04:00:00Z", health: { status: "healthy", channel: "internal_feed", cadenceSeconds: 60, targetDelaySeconds: 900, lastAttemptAt: null, lastSuccessAt: null, lastSweepAt: null, backlog: 0, failureCode: null } };
function Location() { const location = useLocation(); return <output aria-label="Current path">{location.pathname}{location.search}</output>; }
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const app = () => <QueryClientProvider client={client}><MemoryRouter><NotificationProvider><NotificationBell /><ProcurementAttention /><Location /></NotificationProvider></MemoryRouter></QueryClientProvider>; return { ...render(app()), app, client }; }
beforeEach(() => { actor.id = "buyer"; actor.permitted = true; tokenStorage.set("synthetic-notification-session"); Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"}); Object.defineProperty(navigator,"onLine",{configurable:true,value:true}); vi.spyOn(procurementNotificationApi,"list").mockResolvedValue(page); vi.spyOn(procurementNotificationApi,"read").mockResolvedValue({id:"overdue",readAt:"2026-11-27T05:00:00Z"}); vi.spyOn(notificationApi,"list").mockResolvedValue({items:[],unreadCount:0,pagination:{limit:20,offset:0,total:0,hasMore:false}}); });
describe("Procurement notifications", () => {
  it("works without chat and opens the exact payment after marking the alert read", async () => {
    setup(); await userEvent.click(await screen.findByRole("button", {name:"Notifications, 1 unread"}));
    expect(notificationApi.list).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", {name:"Vendor final payment, unread. Open project"}));
    await waitFor(() => expect(screen.getByLabelText("Current path")).toHaveTextContent("/procurement/projects/project-a?tab=payments&entityId=order-a"));
    expect(procurementNotificationApi.read).toHaveBeenCalledWith("overdue",expect.any(AbortSignal));
  });
  it("removes private content after a forbidden read, including dashboard content", async () => {
    vi.mocked(procurementNotificationApi.read).mockRejectedValue(new ApiError(403,"FORBIDDEN","private detail"));
    const view=setup(); await userEvent.click(await screen.findByRole("button", {name:"Notifications, 1 unread"}));
    await userEvent.click(screen.getByRole("button", {name:"Vendor final payment, unread. Open project"}));
    await waitFor(() => expect(screen.queryByText("Synthetic project · Payment overdue")).not.toBeInTheDocument());
    expect(view.client.getQueriesData({queryKey:["procurement-lifecycle-notifications"]}).every(([,data])=>data===undefined)).toBe(true);
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
});
