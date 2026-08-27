import { describe, expect, it } from "vitest";

import { grantCanSupplyProjectModuleScope } from "../src/domain/project-access.js";

describe("project access grant source policy", () => {
  it("keeps direct assignment dormant in Prompt 1", () => {
    expect(
      grantCanSupplyProjectModuleScope("designer", {
        module: "design",
        source: "direct_assignment",
        active: true
      })
    ).toBe(false);
  });

  it("allows only an Admin projects initiator grant", () => {
    expect(
      grantCanSupplyProjectModuleScope("admin", {
        module: "projects",
        source: "admin_initiator",
        active: true
      })
    ).toBe(true);
    expect(
      grantCanSupplyProjectModuleScope("admin", {
        module: "design",
        source: "admin_initiator",
        active: true
      })
    ).toBe(false);
    expect(
      grantCanSupplyProjectModuleScope("designer", {
        module: "projects",
        source: "admin_initiator",
        active: true
      })
    ).toBe(false);
  });

  it("accepts active access-request grants only for the current role's exact requestable module", () => {
    expect(
      grantCanSupplyProjectModuleScope("designer", {
        module: "design",
        source: "access_request",
        active: true
      })
    ).toBe(true);
    expect(
      grantCanSupplyProjectModuleScope("designer", {
        module: "finance",
        source: "access_request",
        active: true
      })
    ).toBe(false);
    expect(
      grantCanSupplyProjectModuleScope("finance_head", {
        module: "finance",
        source: "access_request",
        active: false
      })
    ).toBe(false);
  });
});
