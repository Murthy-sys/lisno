import { describe, expect, it } from "vitest";

import {
  ACCOUNT_KINDS,
  RESERVED_DEMO_IDENTITIES,
  isReservedDemoEmail,
  isReservedDevelopmentDemoIdentity
} from "../src/domain/demo-identities.js";

const expectedIdentities = [
  ["user-super-admin", "super-admin@lisno.example"],
  ["user-admin", "admin@lisno.example"],
  ["user-estimator-sales", "sales@lisno.example"],
  ["user-designer-ananya", "ananya@lisno.example"],
  ["user-procurement", "procurement@lisno.example"],
  ["user-finance-head", "finance-head@lisno.example"],
  ["user-site-manager", "site-manager@lisno.example"],
  ["user-worker-electrician", "worker-electrician@lisno.example"],
  ["user-worker-plumber", "worker-plumber@lisno.example"],
  ["user-worker-carpenter", "worker-carpenter@lisno.example"],
  ["user-worker-painter", "worker-painter@lisno.example"],
  ["user-worker-civil", "worker-civil@lisno.example"],
  ["user-worker-other", "worker-other@lisno.example"],
  ["user-manager-aarav", "aarav@lisno.example"],
  ["user-head", "head@lisno.example"],
  ["user-client-aurora", "client@aurora.example"],
  ["user-manager-meera", "meera@lisno.example"],
  ["user-designer-kabir", "kabir@lisno.example"],
  ["user-designer-ishita", "ishita@lisno.example"],
  ["user-designer-vikram", "vikram@lisno.example"],
  ["user-client-celeste", "client@celeste.example"]
] as const;

describe("reserved demo identities", () => {
  it("publishes the complete immutable account-kind and identity registry", () => {
    expect(ACCOUNT_KINDS).toEqual(["standard", "development_demo"]);
    expect(RESERVED_DEMO_IDENTITIES).toEqual(
      expectedIdentities.map(([id, emailNormalized]) => ({ id, emailNormalized }))
    );
    expect(Object.isFrozen(RESERVED_DEMO_IDENTITIES)).toBe(true);
    expect(RESERVED_DEMO_IDENTITIES.every(Object.isFrozen)).toBe(true);
    expect(new Set(RESERVED_DEMO_IDENTITIES.map(({ id }) => id)).size).toBe(21);
    expect(
      new Set(RESERVED_DEMO_IDENTITIES.map(({ emailNormalized }) => emailNormalized)).size
    ).toBe(21);
  });

  it("normalizes only exact reserved email identities", () => {
    expect(isReservedDemoEmail("  AARAV@LISNO.EXAMPLE ")).toBe(true);
    expect(isReservedDemoEmail("aarav+test@lisno.example")).toBe(false);
    expect(isReservedDemoEmail("someone@lisno.example")).toBe(false);
    expect(isReservedDemoEmail("arbitrary.example@lisno.example")).toBe(false);
  });

  it.each([
    ["marker only", { id: "ordinary-user", emailNormalized: "ordinary@example.test", accountKind: "development_demo" }, true],
    ["ID only", { id: "user-head", emailNormalized: "ordinary@example.test", accountKind: "standard" }, true],
    ["email only", { id: "ordinary-user", emailNormalized: " HEAD@LISNO.EXAMPLE ", accountKind: "standard" }, true],
    ["matching pair", { id: "user-head", emailNormalized: "head@lisno.example", accountKind: "standard" }, true],
    ["arbitrary example address", { id: "ordinary-user", emailNormalized: "someone@example", accountKind: "standard" }, false]
  ] as const)("matches reserved identity by %s", (_name, identity, expected) => {
    expect(isReservedDevelopmentDemoIdentity(identity)).toBe(expected);
  });
});
