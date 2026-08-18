import { describe, expect, it } from "vitest";

import { ROLE_CODES } from "../src/domain/roles.js";
import {
  DEVELOPMENT_DEMO_ACCOUNTS,
  DEVELOPMENT_DEMO_PASSWORD,
  DEVELOPMENT_DEMO_PASSWORD_HASH
} from "../src/development/demo-account-catalog.js";
import { demoSeedData } from "../src/seed/data.js";

const HASH = "$2b$10$7EqJtq98hPqEX7fNZaFWoOhqP8D5iEyOH6v9mJEkjEBlrptHw28.O";

const expected = [
  ["user-super-admin", "Aditi Rao", "super-admin@lisno.example", "super_admin", "Super Admin", null, []],
  ["user-admin", "Arjun Patel", "admin@lisno.example", "admin", "Admin", null, []],
  ["user-estimator-sales", "Priya Sharma", "sales@lisno.example", "estimator_sales", "Estimator / Sales", null, []],
  ["user-designer-ananya", "Ananya Rao", "ananya@lisno.example", "designer", "Senior Designer", "user-manager-aarav", ["user-client-aurora", "user-client-celeste"]],
  ["user-procurement", "Nisha Verma", "procurement@lisno.example", "procurement", "Procurement", null, []],
  ["user-finance-head", "Rohan Gupta", "finance-head@lisno.example", "finance_head", "Finance Head", null, []],
  ["user-site-manager", "Imran Khan", "site-manager@lisno.example", "site_manager", "Site Manager", null, []],
  ["user-worker-electrician", "Aman Electrician", "worker-electrician@lisno.example", "worker_electrician", "Electrician", null, []],
  ["user-worker-plumber", "Bharat Plumber", "worker-plumber@lisno.example", "worker_plumber", "Plumber", null, []],
  ["user-worker-carpenter", "Charan Carpenter", "worker-carpenter@lisno.example", "worker_carpenter", "Carpenter", null, []],
  ["user-worker-painter", "Deepak Painter", "worker-painter@lisno.example", "worker_painter", "Painter", null, []],
  ["user-worker-civil", "Eshan Civil", "worker-civil@lisno.example", "worker_civil", "Civil Worker", null, []],
  ["user-worker-other", "Farah Worker", "worker-other@lisno.example", "worker_other", "Other Worker", null, []],
  ["user-manager-aarav", "Aarav Mehta", "aarav@lisno.example", "design_manager", "Design Manager", null, []],
  ["user-head", "Devika Menon", "head@lisno.example", "design_head", "Design Head", null, []],
  ["user-client-aurora", "Rhea Kapoor", "client@aurora.example", "client", "Aurora Living", null, []]
] as const;

describe("development demo account catalog", () => {
  it("defines every writable profile byte-for-byte in role order", () => {
    expect(DEVELOPMENT_DEMO_PASSWORD).toBe("LisnoDemo2026!");
    expect(DEVELOPMENT_DEMO_PASSWORD_HASH).toBe(HASH);
    expect(DEVELOPMENT_DEMO_ACCOUNTS).toEqual(
      expected.map(([id, name, email, role, title, managerId, authorizedClientIds]) => ({
        id,
        name,
        email,
        emailNormalized: email,
        passwordHash: HASH,
        role,
        active: true,
        accountKind: "development_demo",
        title,
        managerId,
        authorizedClientIds
      }))
    );
    expect(DEVELOPMENT_DEMO_ACCOUNTS.map(({ role }) => role)).toEqual(ROLE_CODES);
    expect(new Set(DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id)).size).toBe(16);
    expect(new Set(DEVELOPMENT_DEMO_ACCOUNTS.map(({ emailNormalized }) => emailNormalized)).size).toBe(16);
    expect(DEVELOPMENT_DEMO_ACCOUNTS.find(({ id }) => id === "user-designer-ananya")).toMatchObject({
      managerId: "user-manager-aarav",
      authorizedClientIds: ["user-client-aurora", "user-client-celeste"]
    });
    expect(DEVELOPMENT_DEMO_ACCOUNTS.find(({ id }) => id === "user-client-aurora")).toMatchObject({
      id: "user-client-aurora"
    });
    expect(Object.isFrozen(DEVELOPMENT_DEMO_ACCOUNTS)).toBe(true);
    expect(DEVELOPMENT_DEMO_ACCOUNTS.every(Object.isFrozen)).toBe(true);
    expect(DEVELOPMENT_DEMO_ACCOUNTS.every(({ authorizedClientIds }) => Object.isFrozen(authorizedClientIds))).toBe(true);
  });

  it("keeps every catalog-owned field equal to its shared seed account", () => {
    for (const account of DEVELOPMENT_DEMO_ACCOUNTS) {
      const seedUser = demoSeedData.users.find(({ id }) => id === account.id);
      expect(seedUser).toMatchObject({
        name: account.name,
        email: account.email,
        emailNormalized: account.emailNormalized,
        passwordHash: account.passwordHash,
        role: account.role,
        active: account.active,
        accountKind: account.accountKind,
        title: account.title,
        managerId: account.managerId,
        authorizedClientIds: account.authorizedClientIds
      });
    }
  });
});
