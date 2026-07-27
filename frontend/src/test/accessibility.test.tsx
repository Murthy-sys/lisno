import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import { renderApp } from "./render";

const userFor = (role: "designer" | "design_manager" | "design_head" | "client") => ({ id: `${role}-1`, name: "Accessible Person", email: `${role}@lisno.example`, role });

function fixtureFetch(user: ReturnType<typeof userFor>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return Response.json({ data: user });
    if (url.startsWith("/api/v1/projects?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url === "/api/v1/client/latest-approved-versions") return Response.json({ data: [] });
    if (url === "/api/v1/organization/team") return Response.json({ data: [] });
    if (url === "/api/v1/organization/tree") return Response.json({ data: [] });
    if (url.startsWith("/api/v1/kpis/users/") && url.endsWith("/tasks?from=2000-01-01T00%3A00%3A00.000Z&to=2100-01-01T00%3A00%3A00.000Z&limit=20&offset=0")) return Response.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } });
    if (url.startsWith("/api/v1/kpis/users/")) return Response.json({ data: { userId: user.id, periodStartAt: "2000-01-01T00:00:00.000Z", periodEndAt: "2100-01-01T00:00:00.000Z", score: 0, components: [], aggregates: { taskCounts: { total: 0, completed: 0, active: 0 }, riskCounts: { gray: 0, green: 0, yellow: 0, red: 0 }, effort: { planned: 0, completed: 0, remaining: 0, workloadPercentage: 0 }, projects: [], recentActivity: [] }, tasks: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } } });
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("accessibility smoke coverage", () => {
  it("keeps login fields labeled and password visibility keyboard-operable", async () => {
    renderApp(["/login"]);
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    const toggle = screen.getByRole("button", { name: "Show password" });
    toggle.focus();
    expect(toggle).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["designer", "/designer", "Good morning, Accessible."],
    ["design_manager", "/manager", "Team delivery pulse"],
    ["design_head", "/head", "Organization delivery health"],
    ["client", "/client", "Your design plans"]
  ] as const)("renders an accessible %s home", async (role, path, heading) => {
    tokenStorage.set(`${role}-token`);
    fixtureFetch(userFor(role));
    renderApp([path]);
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});
