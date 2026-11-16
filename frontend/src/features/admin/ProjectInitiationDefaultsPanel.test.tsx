import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProjectInitiationDefaultsPanel } from "./ProjectInitiationDefaultsPanel";
import { projectInitiationDefaultsKeys } from "./projectInitiationDefaultsApi";

const manager = { id: "pm-a", name: "Manager A", email: "manager-a@example.test" };
const second = { id: "pm-b", name: "Manager B", email: "manager-b@example.test" };
afterEach(() => vi.restoreAllMocks());

describe("ProjectInitiationDefaultsPanel", () => {
  it("lets Super Admin save an explicit selection and refreshes existing defaults queries", async () => {
    let body: unknown;
    const onClose = vi.fn();
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    server.use(
      http.get("/api/v1/admin/project-initiation-defaults", () => HttpResponse.json({ data: { version: 0, status: "unconfigured", projectManager: null } })),
      http.get("/api/v1/admin/program-managers", () => HttpResponse.json({ data: { items: [manager, second], total: 2, limit: 50, offset: 0 } })),
      http.put("/api/v1/admin/project-initiation-defaults", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { version: 1, status: "ready", projectManager: { id: second.id, name: second.name } } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProjectInitiationDefaultsPanel actorId="super-admin" onClose={onClose} />);
    await screen.findByText("No default Project Manager is configured.");
    expect(screen.getByRole("button", { name: "Save defaults" })).toBeDisabled();
    const picker = screen.getByRole("combobox", { name: "Default Project Manager" });
    await user.click(picker);
    await user.click(await screen.findByRole("option", { name: /Manager B/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save defaults" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save defaults" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(body).toEqual({ expectedVersion: 0, projectManagerId: second.id });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectInitiationDefaultsKeys.all });
  });

  it("refreshes the current version after a conflicting save and retains the chosen manager", async () => {
    let version = 1;
    const requests: unknown[] = [];
    const onClose = vi.fn();
    server.use(
      http.get("/api/v1/admin/project-initiation-defaults", () => HttpResponse.json({ data: { version, status: "ready", projectManager: { id: manager.id, name: manager.name } } })),
      http.get("/api/v1/admin/program-managers", () => HttpResponse.json({ data: { items: [second], total: 1, limit: 50, offset: 0 } })),
      http.put("/api/v1/admin/project-initiation-defaults", async ({ request }) => {
        requests.push(await request.json());
        if (requests.length === 1) {
          version = 2;
          return HttpResponse.json({ error: { code: "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT", message: "Project defaults changed. Review and retry." } }, { status: 409 });
        }
        return HttpResponse.json({ data: { version: 3, status: "ready", projectManager: { id: second.id, name: second.name } } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProjectInitiationDefaultsPanel actorId="super-admin" onClose={onClose} />);
    await screen.findByText("Current default: Manager A");
    const picker = screen.getByRole("combobox", { name: "Default Project Manager" });
    await user.click(picker);
    await user.click(await screen.findByRole("option", { name: /Manager B/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save defaults" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save defaults" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Project defaults changed.");
    expect(picker).toHaveValue("Manager B");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save defaults" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save defaults" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(requests).toEqual([{ expectedVersion: 1, projectManagerId: second.id }, { expectedVersion: 2, projectManagerId: second.id }]);
  });

  it("keeps loading/error states blocked and provides an accessible retry", async () => {
    let failed = true;
    server.use(
      http.get("/api/v1/admin/project-initiation-defaults", () => failed
        ? HttpResponse.json({ error: { code: "FAILED", message: "Unavailable" } }, { status: 503 })
        : HttpResponse.json({ data: { version: 1, status: "unavailable", projectManager: null } })),
      http.get("/api/v1/admin/program-managers", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } }))
    );
    const user = userEvent.setup();
    renderWithQuery(<ProjectInitiationDefaultsPanel actorId="super-admin" onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load project defaults.");
    expect(screen.getByRole("button", { name: "Save defaults" })).toBeDisabled();
    failed = false;
    await user.click(screen.getByRole("button", { name: "Retry project defaults" }));
    expect(await screen.findByText(/configured Project Manager is unavailable/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save defaults" })).toBeDisabled();
  });
});
