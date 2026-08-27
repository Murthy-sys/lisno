import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

function installDesigner(canCreate = true) {
  tokenStorage.set("designer-request-token");
  server.use(
    http.get("/api/v1/auth/me", () =>
      HttpResponse.json({ data: { id: "designer-1", name: "Designer", email: "designer@lisno.example", role: "designer" } })
    ),
    http.get("/api/v1/auth/authorization", () =>
      HttpResponse.json({
        data: authorizationFor("designer", [
          "identity.self.read",
          "identity.authorization.read",
          "access_request.self.read",
          ...(canCreate ? (["access_request.create"] as const) : [])
        ])
      })
    ),
    http.get("/api/v1/access-requests/mine", () =>
      HttpResponse.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } })
    )
  );
}

async function submit(dialog: HTMLElement, projectId: string, reason: string) {
  const user = userEvent.setup();
  await user.clear(within(dialog).getByRole("textbox", { name: "Project ID" }));
  await user.type(within(dialog).getByRole("textbox", { name: "Project ID" }), projectId);
  await user.clear(within(dialog).getByRole("textbox", { name: "Reason" }));
  if (reason) await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), reason);
  await user.click(within(dialog).getByRole("button", { name: "Create request" }));
}

describe("AccessRequestDialog", () => {
  it("valid submissions remain opaque and receive one identical receipt", async () => {
    installDesigner();
    const bodies: unknown[] = [];
    let mineCount = 0;
    server.use(
      http.get("/api/v1/access-requests/mine", () => {
        mineCount += 1;
        return HttpResponse.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } });
      }),
      http.post("/api/v1/access-requests", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { accepted: true } }, { status: 202 });
      })
    );
    const user = userEvent.setup();
    renderApp(["/access-requests/mine"]);

    for (const projectId of [
      "project-aurora-villa",
      "project-550e8400-e29b-41d4-a716-446655440000",
      "project-hidden-valid",
      "project-unknown-valid",
      "project-hidden-valid"
    ]) {
      await user.click(await screen.findByRole("button", { name: "Create request" }));
      const dialog = screen.getByRole("dialog", { name: "Request project access" });
      const announcement = screen.getByRole("status", {
        name: "Application announcements"
      });
      const duplicateAttempt = bodies.length === 4;
      const observedAnnouncements: string[] = [];
      const observer = duplicateAttempt
        ? new MutationObserver(() => {
            observedAnnouncements.push(announcement.textContent ?? "");
          })
        : null;
      if (observer) {
        await waitFor(() => expect(announcement).toBeEmptyDOMElement());
        observer.observe(announcement, { childList: true, subtree: true });
      }
      await submit(dialog, projectId, "Need design access.");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(announcement).toHaveTextContent(
        "Your access request was accepted for review."
      );
      if (observer) {
        await waitFor(() =>
          expect(observedAnnouncements).toContain(
            "Your access request was accepted for review."
          )
        );
        observer.disconnect();
      }
      expect(document.body).not.toHaveTextContent(/Aurora Villa|resolved|exists/i);
    }

    expect(bodies).toEqual([
      { projectId: "project-aurora-villa", module: "design", reason: "Need design access." },
      { projectId: "project-550e8400-e29b-41d4-a716-446655440000", module: "design", reason: "Need design access." },
      { projectId: "project-hidden-valid", module: "design", reason: "Need design access." },
      { projectId: "project-unknown-valid", module: "design", reason: "Need design access." },
      { projectId: "project-hidden-valid", module: "design", reason: "Need design access." }
    ]);
    expect(mineCount).toBeGreaterThan(5);
  });

  it.each([
    ["project/unsafe", "Need access", "Use an opaque project ID"],
    ["project unsafe", "Need access", "Use an opaque project ID"],
    ["p".repeat(129), "Need access", "Use an opaque project ID"],
    ["project-safe", "", "Explain why access is needed"],
    ["project-safe", "r".repeat(1001), "Keep the reason within 1000 characters"]
  ])("invalid submission %s never calls the API", async (projectId, reason, message) => {
    installDesigner();
    let postCount = 0;
    server.use(http.post("/api/v1/access-requests", () => { postCount += 1; return HttpResponse.json({ data: { accepted: true } }, { status: 202 }); }));
    const user = userEvent.setup();
    renderApp(["/access-requests/mine"]);
    await user.click(await screen.findByRole("button", { name: "Create request" }));
    const dialog = screen.getByRole("dialog", { name: "Request project access" });
    await submit(dialog, projectId, reason);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(postCount).toBe(0);
  });

  it("accepts only a validated eligible permitted prefill", async () => {
    installDesigner();
    renderApp(["/access-requests/mine?projectId=project-aurora-villa&module=design"]);
    const dialog = await screen.findByRole("dialog", { name: "Request project access" });
    expect(within(dialog).getByRole("textbox", { name: "Project ID" })).toHaveValue("project-aurora-villa");
    expect(within(dialog).getByRole("combobox", { name: "Module" })).toHaveValue("design");
  });

  it.each([
    ["/access-requests/mine?projectId=project/unsafe&module=design", true],
    ["/access-requests/mine?projectId=project-safe&module=finance", true],
    ["/access-requests/mine?projectId=project-safe&module=design", false]
  ])("leaves invalid or unauthorized prefill closed for %s", async (path, canCreate) => {
    installDesigner(canCreate);
    renderApp([path]);
    expect(await screen.findByRole("heading", { name: "My access requests" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Request project access" })).not.toBeInTheDocument();
  });
});
