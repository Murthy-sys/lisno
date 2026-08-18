import { config as dotenvConfig } from "dotenv";

import {
  DEVELOPMENT_DEMO_ACCOUNTS,
  DEVELOPMENT_DEMO_PASSWORD,
  DEVELOPMENT_DEMO_PASSWORD_HASH,
  type DevelopmentDemoAccount
} from "../development/demo-account-catalog.js";

export const DEMO_SEED_PASSWORD = DEVELOPMENT_DEMO_PASSWORD;
export const DEMO_SEED_PASSWORD_HASH = DEVELOPMENT_DEMO_PASSWORD_HASH;

export type DemoRoleAccount = DevelopmentDemoAccount;

export const DEMO_ROLE_ACCOUNTS = Object.freeze(
  DEVELOPMENT_DEMO_ACCOUNTS.filter(({ role }) =>
    [
      "super_admin",
      "admin",
      "procurement",
      "finance_head",
      "site_manager",
      "worker_electrician",
      "worker_plumber",
      "worker_carpenter",
      "worker_painter",
      "worker_civil",
      "worker_other"
    ].includes(role)
  )
);

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
const issuedDemoSeedAuthorizations = new WeakMap<object, string>();

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
  if (
    runtime.NODE_ENV !== process.env.NODE_ENV ||
    runtime.ALLOW_DEMO_SEED !== process.env.ALLOW_DEMO_SEED ||
    runtime.DEMO_SEED_DATABASE !== process.env.DEMO_SEED_DATABASE ||
    mongodbUri !== (process.env.MONGODB_URI ?? "")
  ) {
    throw new Error("Demo seed environment does not match the current process.");
  }
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
  const authorization = { databaseName: expectedDatabase } as DemoSeedAuthorization;
  Object.defineProperty(authorization, demoSeedAuthorizationBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });
  issuedDemoSeedAuthorizations.set(authorization, expectedDatabase);
  return Object.freeze(authorization);
}

export function assertAuthorizedDemoSeedTarget(
  authorization: DemoSeedAuthorization | undefined,
  connectedDatabaseName: string
): asserts authorization is DemoSeedAuthorization {
  if (
    !authorization ||
    authorization[demoSeedAuthorizationBrand] !== true ||
    issuedDemoSeedAuthorizations.get(authorization) !==
      authorization.databaseName ||
    connectedDatabaseName !== authorization.databaseName
  ) {
    throw new Error("Demo seed authorization does not match the connection.");
  }
}
