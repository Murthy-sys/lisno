import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { procurementProjectIdentityKeys } from "./procurementProjectIdentityApi";
import { ProcurementProjectIdentityPanel } from "./ProcurementProjectIdentityPanel";

describe("ProcurementProjectIdentityPanel", () => {
  it("loads the scoped project identity and saves its city and Project Manager with a version", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const received: unknown[] = [];
    server.use(
      http.get("/api/v1/admin/projects/project-a/procurement-identity", () => HttpResponse.json({
        data: { projectId: "project-a", city: null, programManagerId: null, version: 1 }
      })),
      http.get("/api/v1/admin/program-managers", ({ request }) => {
        expect(new URL(request.url).searchParams.get("limit")).toBe("50");
        return HttpResponse.json({ data: { items: [{ id: "pm-a", name: "Mira", email: "mira@example.test" }],
          total: 1, limit: 50, offset: 0 } });
      }),
      http.patch("/api/v1/admin/projects/project-a/procurement-identity", async ({ request }) => {
        received.push(await request.json());
        return HttpResponse.json({ data: { projectId: "project-a", city: { name: "Pune", key: "pune" },
          programManagerId: "pm-a", version: 2 } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementProjectIdentityPanel projectId="project-a" />);
    const section = screen.getByRole("region", { name: "Project Manager & city" });
    await user.click(within(section).getByRole("button", { name: /Project Manager & city/ }));
    await user.type(await within(section).findByLabelText("Project city"), "Pune");
    await user.selectOptions(await within(section).findByLabelText("Project Manager"), "pm-a");
    await user.click(within(section).getByRole("button", { name: "Save Project Manager & city" }));
    expect(await within(section).findByRole("status")).toHaveTextContent("saved");
    expect(received).toEqual([{ expectedVersion: 1, cityName: "Pune", programManagerId: "pm-a" }]);
    for (const key of ["admin-projects", "project-workflow", "assigned-projects", "project-manager", "execution", "procurement", "project-chat"]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
    expect(within(section).queryByText(/above ₹50,000/)).not.toBeInTheDocument();
    invalidate.mockRestore();
  });

  it("holds an unsaved assignment when a newer project identity arrives until the admin reloads it", async () => {
    let version = 1;
    let writes = 0;
    server.use(
      http.get("/api/v1/admin/projects/project-a/procurement-identity", () => HttpResponse.json({ data: {
        projectId: "project-a", city: { name: version === 1 ? "Pune" : "Mumbai", key: version === 1 ? "pune" : "mumbai" },
        programManagerId: version === 1 ? "pm-a" : "pm-b", version
      } })),
      http.get("/api/v1/admin/program-managers", () => HttpResponse.json({ data: { items: [
        { id: "pm-a", name: "Mira", email: "mira@example.test" },
        { id: "pm-b", name: "Arun", email: "arun@example.test" }
      ], total: 2, limit: 50, offset: 0 } })),
      http.patch("/api/v1/admin/projects/project-a/procurement-identity", () => {
        writes += 1; return HttpResponse.json({ data: null });
      })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><FeedbackProvider>
      <ProcurementProjectIdentityPanel projectId="project-a" />
    </FeedbackProvider></QueryClientProvider>);
    const section = screen.getByRole("region", { name: "Project Manager & city" });
    await user.click(within(section).getByRole("button", { name: /Project Manager & city/ }));
    const city = await within(section).findByLabelText("Project city");
    expect(city).toHaveValue("Pune");
    await user.clear(city);
    await user.type(city, "Unsaved city");
    version = 2;
    await act(async () => { await queryClient.invalidateQueries({ queryKey: procurementProjectIdentityKeys.detail("project-a") }); });
    expect(await within(section).findByText(/changed while you were editing/)).toBeVisible();
    expect(city).toHaveValue("Unsaved city");
    expect(within(section).getByRole("button", { name: "Save Project Manager & city" })).toBeDisabled();
    await user.click(within(section).getByRole("button", { name: "Load latest details" }));
    expect(city).toHaveValue("Mumbai");
    expect(within(section).getByLabelText("Project Manager")).toHaveValue("pm-b");
    expect(writes).toBe(0);
  });
});

describe("ProcurementProjectIdentityPanel assignment-only presentation", () => {
  it("saves only the selected manager and current version while keeping the existing city", async () => {
    let identity = { projectId: "project-a", city: { name: "Pune", key: "pune" }, programManagerId: "pm-a", version: 7 };
    const received: unknown[] = [];
    server.use(
      http.get("/api/v1/admin/projects/project-a/procurement-identity", () => HttpResponse.json({ data: identity })),
      http.get("/api/v1/admin/program-managers", () => HttpResponse.json({ data: { items: [
        { id: "pm-a", name: "Mira", email: "mira@example.test" },
        { id: "pm-b", name: "Arun", email: "arun@example.test" }
      ], total: 2, limit: 50, offset: 0 } })),
      http.patch("/api/v1/admin/projects/project-a/procurement-identity", async ({ request }) => {
        received.push(await request.json());
        identity = { ...identity, programManagerId: "pm-b", version: 8 };
        return HttpResponse.json({ data: identity });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementProjectIdentityPanel projectId="project-a" assignmentOnly defaultOpen />);
    const section = screen.getByRole("region", { name: "Project Manager" });
    await within(section).findByRole("option", { name: "Arun · arun@example.test" });
    expect(within(section).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    const save = within(section).getByRole("button", { name: "Save Project Manager" });
    expect(save).toBeDisabled();
    await user.selectOptions(within(section).getByRole("combobox", { name: "Project Manager" }), "pm-b");
    await user.click(save);
    expect(await within(section).findByText("Project Manager saved.")).toBeVisible();
    expect(received).toEqual([{ expectedVersion: 7, programManagerId: "pm-b" }]);
    expect(identity.city).toEqual({ name: "Pune", key: "pune" });
  });

  it("loads managers beyond the first page and retries a failed page without losing the draft", async () => {
    const offsets: number[] = [];
    let laterPageAttempts = 0;
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `pm-${index + 1}`, name: `Manager ${index + 1}`, email: `manager${index + 1}@example.test`
    }));
    server.use(
      http.get("/api/v1/admin/projects/project-a/procurement-identity", () => HttpResponse.json({ data: {
        projectId: "project-a", city: null, programManagerId: "pm-1", version: 1
      } })),
      http.get("/api/v1/admin/program-managers", ({ request }) => {
        const params = new URL(request.url).searchParams;
        const offset = Number(params.get("offset"));
        offsets.push(offset);
        expect(params.get("limit")).toBe("50");
        expect(params.get("q")).toBe("");
        if (offset === 50 && laterPageAttempts++ === 0) return HttpResponse.json({ message: "Try again" }, { status: 503 });
        return HttpResponse.json({ data: { items: offset === 0 ? firstPage : [
          { id: "pm-51", name: "Last Manager", email: "last@example.test" }
        ], total: 51, limit: 50, offset } });
      })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const singlePage = { items: [{ id: "single-page", name: "Single page", email: "single@example.test" }], total: 1, limit: 50, offset: 0 };
    queryClient.setQueryData(procurementProjectIdentityKeys.managers(""), singlePage);
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><FeedbackProvider>
      <ProcurementProjectIdentityPanel projectId="project-a" assignmentOnly defaultOpen />
    </FeedbackProvider></QueryClientProvider>);
    const section = screen.getByRole("region", { name: "Project Manager" });
    await within(section).findByRole("option", { name: "Manager 2 · manager2@example.test" });
    const select = within(section).getByRole("combobox", { name: "Project Manager" });
    const save = within(section).getByRole("button", { name: "Save Project Manager" });
    await user.selectOptions(select, "pm-2");
    await user.click(within(section).getByRole("button", { name: "Load more Project Managers" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("Your selection has been kept");
    expect(select).toHaveValue("pm-2");
    expect(save).toBeDisabled();
    await user.click(within(section).getByRole("button", { name: "Retry more Project Managers" }));
    await within(section).findByRole("option", { name: "Last Manager · last@example.test" });
    expect(select).toHaveValue("pm-2");
    await user.selectOptions(select, "pm-51");
    expect(save).toBeEnabled();
    expect(within(section).queryByRole("button", { name: "Load more Project Managers" })).not.toBeInTheDocument();
    expect(offsets).toEqual([0, 50, 50]);
    expect(queryClient.getQueryData(procurementProjectIdentityKeys.managers(""))).toEqual(singlePage);
    expect(within(section).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps an unavailable current manager on directory errors and blocks invalid assignments", async () => {
    let attempts = 0;
    server.use(
      http.get("/api/v1/admin/projects/project-a/procurement-identity", () => HttpResponse.json({ data: {
        projectId: "project-a", city: null, programManagerId: "pm-unavailable", version: 1
      } })),
      http.get("/api/v1/admin/program-managers", () => {
        if (attempts++ === 0) return HttpResponse.json({ message: "Try again" }, { status: 503 });
        return HttpResponse.json({ data: { items: [
          { id: "pm-b", name: "Arun", email: "arun@example.test" }
        ], total: 1, limit: 50, offset: 0 } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementProjectIdentityPanel projectId="project-a" assignmentOnly defaultOpen />);
    const section = screen.getByRole("region", { name: "Project Manager" });
    expect(await within(section).findByRole("alert")).toHaveTextContent("Retry before saving an assignment");
    const select = within(section).getByRole("combobox", { name: "Project Manager" });
    const save = within(section).getByRole("button", { name: "Save Project Manager" });
    expect(select).toHaveValue("pm-unavailable");
    expect(within(select).getByRole("option", { name: "Current assignment · pm-unavailable" })).toBeDisabled();
    expect(save).toBeDisabled();
    await user.click(within(section).getByRole("button", { name: "Retry Project Managers" }));
    await within(section).findByRole("option", { name: "Arun · arun@example.test" });
    expect(select).toHaveValue("pm-unavailable");
    expect(save).toBeDisabled();
    await user.selectOptions(select, "pm-b");
    expect(save).toBeEnabled();
  });

  it("preserves a manager draft and requires reloading when the project version changes", async () => {
    let version = 1;
    let writes = 0;
    server.use(
      http.get("/api/v1/admin/projects/project-a/procurement-identity", () => HttpResponse.json({ data: {
        projectId: "project-a", city: { name: "Pune", key: "pune" }, programManagerId: version === 1 ? "pm-a" : "pm-c", version
      } })),
      http.get("/api/v1/admin/program-managers", () => HttpResponse.json({ data: { items: [
        { id: "pm-a", name: "Mira", email: "mira@example.test" },
        { id: "pm-b", name: "Arun", email: "arun@example.test" },
        { id: "pm-c", name: "Lee", email: "lee@example.test" }
      ], total: 3, limit: 50, offset: 0 } })),
      http.patch("/api/v1/admin/projects/project-a/procurement-identity", () => {
        writes += 1; return HttpResponse.json({ data: null });
      })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><FeedbackProvider>
      <ProcurementProjectIdentityPanel projectId="project-a" assignmentOnly defaultOpen />
    </FeedbackProvider></QueryClientProvider>);
    const section = screen.getByRole("region", { name: "Project Manager" });
    await within(section).findByRole("option", { name: "Arun · arun@example.test" });
    const select = within(section).getByRole("combobox", { name: "Project Manager" });
    await user.selectOptions(select, "pm-b");
    version = 2;
    await act(async () => { await queryClient.invalidateQueries({ queryKey: procurementProjectIdentityKeys.detail("project-a") }); });
    expect(await within(section).findByRole("alert")).toHaveTextContent("changed while you were editing");
    expect(select).toHaveValue("pm-b");
    const save = within(section).getByRole("button", { name: "Save Project Manager" });
    expect(save).toBeDisabled();
    await user.click(within(section).getByRole("button", { name: "Load latest details" }));
    await waitFor(() => expect(select).toHaveValue("pm-c"));
    expect(save).toBeDisabled();
    expect(writes).toBe(0);
    expect(within(section).queryByRole("textbox")).not.toBeInTheDocument();
  });
});
