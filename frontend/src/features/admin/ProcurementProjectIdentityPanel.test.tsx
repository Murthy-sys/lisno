import { act, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { procurementProjectIdentityKeys } from "./procurementProjectIdentityApi";
import { ProcurementProjectIdentityPanel } from "./ProcurementProjectIdentityPanel";

describe("ProcurementProjectIdentityPanel", () => {
  it("loads the scoped project identity and saves its city and Program Manager with a version", async () => {
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
    const section = screen.getByRole("region", { name: "Procurement project details" });
    await user.click(within(section).getByRole("button", { name: /Procurement project details/ }));
    await user.type(await within(section).findByLabelText("Project city"), "Pune");
    await user.selectOptions(await within(section).findByLabelText("Program Manager"), "pm-a");
    await user.click(within(section).getByRole("button", { name: "Save procurement details" }));
    expect(await within(section).findByRole("status")).toHaveTextContent("saved");
    expect(received).toEqual([{ expectedVersion: 1, cityName: "Pune", programManagerId: "pm-a" }]);
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
    const section = screen.getByRole("region", { name: "Procurement project details" });
    await user.click(within(section).getByRole("button", { name: /Procurement project details/ }));
    const city = await within(section).findByLabelText("Project city");
    expect(city).toHaveValue("Pune");
    await user.clear(city);
    await user.type(city, "Unsaved city");
    version = 2;
    await act(async () => { await queryClient.invalidateQueries({ queryKey: procurementProjectIdentityKeys.detail("project-a") }); });
    expect(await within(section).findByText(/changed while you were editing/)).toBeVisible();
    expect(city).toHaveValue("Unsaved city");
    expect(within(section).getByRole("button", { name: "Save procurement details" })).toBeDisabled();
    await user.click(within(section).getByRole("button", { name: "Load latest details" }));
    expect(city).toHaveValue("Mumbai");
    expect(within(section).getByLabelText("Program Manager")).toHaveValue("pm-b");
    expect(writes).toBe(0);
  });
});
