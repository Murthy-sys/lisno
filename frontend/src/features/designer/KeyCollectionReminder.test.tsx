import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../../api/types";
import { ApiError } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { collectionFeed } from "../../test/keyCollectionFixtures";
import { KeyCollectionReminder } from "./KeyCollectionReminder";
import * as api from "./keyCollectionRemindersApi";

const auth = vi.hoisted(() => ({ user: { id: "designer-a", role: "designer" as Role }, reviewSession: null as { id: string } | null, allowed: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ ...auth, authorization: authorizationFor(auth.user.role, auth.allowed ? ["design.key_collection_reminders.read"] : []) }) }));
function page() { return { ...collectionFeed(), receivedAt: Date.now() }; }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
  return { ...render(<KeyCollectionReminder />, { wrapper }), client };
}
beforeEach(() => { auth.user = { id: "designer-a", role: "designer" }; auth.reviewSession = null; auth.allowed = true; });
afterEach(() => vi.useRealTimers());

describe("KeyCollectionReminder", () => {
  it("refreshes once at the scope-wide red boundary even when the urgent page was empty", async () => {
    vi.useFakeTimers(); vi.setSystemTime("2030-01-01T00:00:00Z");
    const empty = { ...page(), serverNow: "2026-11-26T20:59:55Z", nextRedAt: "2026-11-26T21:00:00Z", urgentCount: 0, items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } };
    const read = vi.spyOn(api, "getKeyCollectionReminders").mockResolvedValueOnce(empty).mockImplementation(async () => page());
    mount(); await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(read).toHaveBeenCalledTimes(1); expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); }); expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Key collection needs attention (2)" })).toBeVisible();
  });

  it("keeps project identity and count across pages, then clears the chip only after receipt refresh", async () => {
    let complete = false;
    const read = vi.spyOn(api, "getKeyCollectionReminders").mockImplementation(async offset => {
      if (complete) return { ...page(), urgentCount: 0, items: [], pagination: { limit: 20, offset, total: 0, hasMore: false } };
      return { ...page(), urgentCount: 21, items: [collectionFeed().items[offset ? 1 : 0]!], pagination: { limit: 20, offset, total: 21, hasMore: offset === 0 } };
    });
    const user = userEvent.setup(); const view = mount();
    await user.click(await screen.findByRole("button", { name: "Key collection needs attention (21)" }));
    await user.click(await screen.findByRole("button", { name: "Next reminders" }));
    expect(await screen.findByRole("link", { name: "Open key collection for Lakeside Home" })).toHaveAttribute("href", "/designer/projects/project-b#key-collection");
    expect(screen.queryByRole("heading", { name: "Courtyard Home" })).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledWith(20, expect.any(AbortSignal));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Key collection needs attention (21)" })).toBeVisible();
    complete = true; await act(() => view.client.invalidateQueries({ queryKey: api.keyCollectionReminderKeys.all }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Key collection needs attention/ })).not.toBeInTheDocument());
  });

  it("keeps the red chip visible while a later page is loading, without enabling duplicate paging", async () => {
    let finishPage!: (value: api.ReceivedCollectionReminders) => void;
    vi.spyOn(api, "getKeyCollectionReminders").mockImplementation(async offset => {
      if (offset === 20) return new Promise<api.ReceivedCollectionReminders>(resolve => { finishPage = resolve; });
      return { ...page(), urgentCount: 21, items: [collectionFeed().items[0]!], pagination: { limit: 20, offset: 0, total: 21, hasMore: true } };
    });
    mount(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Key collection needs attention (21)" }));
    await user.click(screen.getByRole("button", { name: "Next reminders" }));
    expect(await screen.findByText("Loading reminders… Showing the previous page.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next reminders" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous reminders" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Key collection needs attention (21)" })).toBeVisible();
    await act(async () => finishPage({ ...page(), urgentCount: 21, items: [collectionFeed().items[1]!], pagination: { limit: 20, offset: 20, total: 21, hasMore: false } }));
    expect(screen.getByRole("button", { name: "Key collection needs attention (21)" })).toBeVisible();
  });

  it("keeps stale reminders readable and removes them immediately after a forbidden response", async () => {
    const read = vi.spyOn(api, "getKeyCollectionReminders").mockImplementation(async () => page());
    const view = mount(); await screen.findByRole("button", { name: /Key collection needs attention/ });
    read.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(() => view.client.invalidateQueries({ queryKey: api.keyCollectionReminderKeys.all }));
    expect(await screen.findByRole("button", { name: /May be out of date/ })).toBeVisible();
    read.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
    await act(() => view.client.invalidateQueries({ queryKey: api.keyCollectionReminderKeys.all }));
    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
    read.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(() => view.client.invalidateQueries({ queryKey: api.keyCollectionReminderKeys.all }));
    const retry = await screen.findByRole("button", { name: "Key collection reminders · Retry" });
    await userEvent.click(retry);
    expect(screen.queryByText("Courtyard Home")).not.toBeInTheDocument();
    expect(screen.queryByText("Lakeside Home")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("clears the open dialog on actor/review-session switch and never shows the previous scope", async () => {
    const read = vi.spyOn(api, "getKeyCollectionReminders").mockImplementation(async () => page());
    const view = mount(); await userEvent.click(await screen.findByRole("button", { name: /Key collection needs attention/ }));
    expect(within(screen.getByRole("dialog")).getByText("Courtyard Home")).toBeVisible();
    read.mockImplementation(() => new Promise(() => {}));
    auth.user = { id: "designer-b", role: "designer" }; auth.reviewSession = { id: "review-b" };
    view.rerender(<KeyCollectionReminder />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Courtyard Home")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Key collection needs attention/ })).not.toBeInTheDocument();
  });

  it.each(["client", "site_manager", "super_admin"] as const)("does not read Designer obligations for %s", role => {
    auth.user = { id: "other", role };
    const read = vi.spyOn(api, "getKeyCollectionReminders"); mount();
    expect(read).not.toHaveBeenCalled(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("does not read without the operation permission", () => {
    auth.allowed = false; const read = vi.spyOn(api, "getKeyCollectionReminders"); mount();
    expect(read).not.toHaveBeenCalled(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
