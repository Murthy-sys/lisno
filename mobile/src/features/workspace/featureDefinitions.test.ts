import { projectDetailEndpoint } from "./featureDefinitions";

describe("feature endpoint contracts", () => {
  it("uses the canonical scoped project detail route for Clients", () => {
    expect(projectDetailEndpoint("client", "project/one")).toBe("/projects/project%2Fone");
  });

  it("keeps the administration detail route for Sales Managers and Super Admin", () => {
    expect(projectDetailEndpoint("admin", "project-1")).toBe("/admin/projects/project-1");
    expect(projectDetailEndpoint("super_admin", "project-1")).toBe("/admin/projects/project-1");
  });
});
