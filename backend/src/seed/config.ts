import { config as dotenvConfig } from "dotenv";

import type { Role } from "../domain/roles.js";

export const DEMO_SEED_PASSWORD = "LisnoDemo2026!";
export const DEMO_SEED_PASSWORD_HASH =
  "$2b$10$7EqJtq98hPqEX7fNZaFWoOhqP8D5iEyOH6v9mJEkjEBlrptHw28.O";

export interface DemoRoleAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
}

export const DEMO_ROLE_ACCOUNTS = Object.freeze([
  { id: "user-super-admin", name: "Aditi Rao", email: "super-admin@lisno.example", role: "super_admin", title: "Super Admin" },
  { id: "user-admin", name: "Arjun Patel", email: "admin@lisno.example", role: "admin", title: "Admin" },
  { id: "user-procurement", name: "Nisha Verma", email: "procurement@lisno.example", role: "procurement", title: "Procurement" },
  { id: "user-finance-head", name: "Rohan Gupta", email: "finance-head@lisno.example", role: "finance_head", title: "Finance Head" },
  { id: "user-site-manager", name: "Imran Khan", email: "site-manager@lisno.example", role: "site_manager", title: "Site Manager" },
  { id: "user-worker-electrician", name: "Aman Electrician", email: "worker-electrician@lisno.example", role: "worker_electrician", title: "Electrician" },
  { id: "user-worker-plumber", name: "Bharat Plumber", email: "worker-plumber@lisno.example", role: "worker_plumber", title: "Plumber" },
  { id: "user-worker-carpenter", name: "Charan Carpenter", email: "worker-carpenter@lisno.example", role: "worker_carpenter", title: "Carpenter" },
  { id: "user-worker-painter", name: "Deepak Painter", email: "worker-painter@lisno.example", role: "worker_painter", title: "Painter" },
  { id: "user-worker-civil", name: "Eshan Civil", email: "worker-civil@lisno.example", role: "worker_civil", title: "Civil Worker" },
  { id: "user-worker-other", name: "Farah Worker", email: "worker-other@lisno.example", role: "worker_other", title: "Other Worker" }
] as const satisfies readonly DemoRoleAccount[]);

export interface DemoSeedRuntime {
  NODE_ENV?: string;
  ALLOW_DEMO_SEED?: string;
  DEMO_SEED_DATABASE?: string;
}

export interface LoadedDemoSeedEnvironment extends DemoSeedRuntime {
  MONGODB_URI: string;
}

export function loadDemoSeedEnvironment(): LoadedDemoSeedEnvironment {
  dotenvConfig({ override: false, quiet: true });
  return {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED,
    DEMO_SEED_DATABASE: process.env.DEMO_SEED_DATABASE,
    MONGODB_URI: process.env.MONGODB_URI ?? ""
  };
}

const demoSeedAuthorizationBrand = Symbol("demo-seed-authorization");

export type DemoSeedAuthorization = {
  readonly [demoSeedAuthorizationBrand]: true;
  readonly databaseName: string;
};

export interface ParsedMongoTarget {
  protocol: "mongodb:";
  hostname: string;
  databaseName: string;
}

export function parseSingleHostMongoTarget(uri: string): ParsedMongoTarget {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("Demo seed Mongo target is invalid.");
  }
  if (
    parsed.protocol !== "mongodb:" ||
    !parsed.hostname ||
    parsed.host.includes(",") ||
    parsed.hash ||
    parsed.pathname.split("/").filter(Boolean).length !== 1
  ) {
    throw new Error("Demo seed Mongo target is invalid.");
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error("Demo seed Mongo target is invalid.");
  }
  return {
    protocol: "mongodb:",
    hostname: parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase(),
    databaseName
  };
}

export function assertDemoSeedRuntimeAllowed(runtime: DemoSeedRuntime): void {
  if (
    !["development", "test"].includes(runtime.NODE_ENV ?? "") ||
    runtime.ALLOW_DEMO_SEED !== "true"
  ) {
    throw new Error("Demo seed is disabled.");
  }
}

export function authorizeDemoSeed(
  runtime: DemoSeedRuntime,
  mongodbUri: string
): DemoSeedAuthorization {
  assertDemoSeedRuntimeAllowed(runtime);
  const expectedDatabase = runtime.DEMO_SEED_DATABASE ?? "";
  if (!/^lisno_(?:demo|test)(?:[_-][a-z0-9_-]+)?$/.test(expectedDatabase)) {
    throw new Error("Demo seed database is not allowlisted.");
  }
  const target = parseSingleHostMongoTarget(mongodbUri);
  if (
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.databaseName !== expectedDatabase
  ) {
    throw new Error("Demo seed target is not a local allowlisted database.");
  }
  return Object.freeze({
    [demoSeedAuthorizationBrand]: true as const,
    databaseName: expectedDatabase
  });
}

export function assertAuthorizedDemoSeedTarget(
  authorization: DemoSeedAuthorization | undefined,
  connectedDatabaseName: string
): asserts authorization is DemoSeedAuthorization {
  if (
    !authorization ||
    authorization[demoSeedAuthorizationBrand] !== true ||
    connectedDatabaseName !== authorization.databaseName
  ) {
    throw new Error("Demo seed authorization does not match the connection.");
  }
}
