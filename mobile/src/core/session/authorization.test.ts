import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import { parseAuthorizationSnapshot } from "./authorization";

describe("mobile authorization policy", () => {
  const current = {
    role: "designer",
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: ["projects.list", "unknown.future.permission"]
  };

  it("accepts the current policy and filters unknown permissions", () => {
    expect(parseAuthorizationSnapshot(current, "designer")).toEqual({
      role: "designer",
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      permissions: ["projects.list"]
    });
  });

  it("fails closed for a different policy or presentation role", () => {
    expect(parseAuthorizationSnapshot({ ...current, policyVersion: "future-policy" }, "designer")).toBeNull();
    expect(parseAuthorizationSnapshot(current, "client")).toBeNull();
  });
});
