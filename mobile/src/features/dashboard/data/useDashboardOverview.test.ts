import { dashboardEndpoint, dashboardQueryKey } from "./query";

describe("dashboard query identity", () => {
  const scope = { environmentId: "local-development", userId: "super-admin" };

  it.each([7, 30, 90] as const)("builds the canonical %d-day endpoint", (period) => {
    expect(dashboardEndpoint(period)).toBe(`/admin/dashboard/overview?periodDays=${period}`);
  });

  it("isolates periods, users, and environments in private cache keys", () => {
    const seven = dashboardQueryKey(scope, 7);
    const thirty = dashboardQueryKey(scope, 30);

    expect(seven).toEqual(["local-development", "super-admin", "dashboard", "overview", 7]);
    expect(thirty).not.toEqual(seven);
    expect(dashboardQueryKey({ ...scope, userId: "another-user" }, 7)).not.toEqual(seven);
    expect(dashboardQueryKey({ ...scope, environmentId: "remote" }, 7)).not.toEqual(seven);
  });
});
