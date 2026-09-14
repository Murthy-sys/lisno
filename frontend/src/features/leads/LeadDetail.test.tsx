import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";

describe("Lead follow-ups", () => {
  it("retains a failed follow-up and retries against the same lead before refreshing history", async () => {
    tokenStorage.set("sales-token");
    const user = userEvent.setup();
    const posts: Array<{ url: string; payload: Record<string, unknown> }> = [];
    let historyReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: { id: "sales-1", name: "Sales", email: "sales@example.com", role: "estimator_sales" } });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor("estimator_sales") });
      if (url === "/api/v1/leads/lead-b") return Response.json({ data: {
        id: "lead-b", projectId: null, ownerId: "sales-1", clientName: "Cedar Homes", projectName: "Cedar Loft",
        clientEmail: "cedar@example.com", clientMobile: "9000000002", stage: "contacted", propertyType: "2BHK", location: "Mysuru",
        budgetMin: 1800000, budgetMax: 2400000, nextAction: "Schedule review"
      } });
      if (url === "/api/v1/leads/lead-b/activities" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push({ url, payload });
        if (posts.length === 1) return Response.json({ error: { code: "FAILED", message: "Try again" } }, { status: 500 });
        return Response.json({ data: { id: "activity-b", ...payload } });
      }
      if (url.startsWith("/api/v1/leads/lead-b/activities?")) {
        historyReads += 1;
        return Response.json({ data: { items: posts.length > 1 ? [{ id: "activity-b", ...posts[1]!.payload }] : [], pagination: { limit: 50, offset: 0, total: posts.length > 1 ? 1 : 0, hasMore: false } } });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    renderApp(["/estimator-sales/leads/lead-b"]);
    const note = await screen.findByRole("textbox", { name: "Follow-up note" });
    expect(screen.getByRole("button", { name: "Add follow-up" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Activity type" }), "call");
    await user.type(note, "Confirm the site visit on Friday.");
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Follow-up could not be saved.");
    expect(note).toHaveValue("Confirm the site visit on Friday.");
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));
    await waitFor(() => expect(note).toHaveValue(""));
    expect(await screen.findByText("Confirm the site visit on Friday.")).toBeVisible();
    expect(historyReads).toBeGreaterThan(1);
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.url).toBe("/api/v1/leads/lead-b/activities");
      expect(post.payload).toMatchObject({ type: "call", note: "Confirm the site visit on Friday.", occurredAt: expect.any(String) });
    }
  });
});
