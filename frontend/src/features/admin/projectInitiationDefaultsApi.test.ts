import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../test/server";
import { getProjectInitiationDefaults, projectInitiationDefaultsQuery, updateProjectInitiationDefaults } from "./projectInitiationDefaultsApi";

describe("project initiation defaults API", () => {
  it("keeps actor cache identities separate and always refreshes a displayed default", () => {
    const a = projectInitiationDefaultsQuery("actor-a");
    const b = projectInitiationDefaultsQuery("actor-b");
    expect(a.queryKey).not.toEqual(b.queryKey);
    expect(a.staleTime).toBe(0);
    expect(a.refetchOnMount).toBe("always");
    expect(a.refetchOnWindowFocus).toBe("always");
  });

  it("reads missing configuration without synthesizing a manager and writes the observed version", async () => {
    let input: unknown;
    server.use(
      http.get("/api/v1/admin/project-initiation-defaults", () => HttpResponse.json({ data: { version: 0, status: "unconfigured", projectManager: null } })),
      http.put("/api/v1/admin/project-initiation-defaults", async ({ request }) => {
        input = await request.json();
        return HttpResponse.json({ data: { version: 1, status: "ready", projectManager: { id: "pm-a", name: "Manager A" } } });
      })
    );
    await expect(getProjectInitiationDefaults()).resolves.toEqual({ version: 0, status: "unconfigured", projectManager: null });
    await expect(updateProjectInitiationDefaults({ expectedVersion: 0, projectManagerId: "pm-a" })).resolves.toMatchObject({ version: 1, status: "ready" });
    expect(input).toEqual({ expectedVersion: 0, projectManagerId: "pm-a" });
  });
});
