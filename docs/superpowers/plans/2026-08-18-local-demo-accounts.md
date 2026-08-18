# Local Demo Accounts and Remote Authentication Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all sixteen canonical demo accounts available automatically from `npm run dev` without destructive seeding, while ensuring demo identities and the built-in development JWT secret cannot be used through a remotely reachable backend.

**Architecture:** A dependency-free catalog owns the exact reserved identities. The development entrypoint authorizes the runtime and Mongo target before importing server/model code, then passes an opaque capability through a post-connect/pre-app preparation hook. A transactional bootstrap inserts or canonically repairs only the sixteen reserved User rows. Authentication reloads the stored User and applies an exact account-kind/ID/email predicate plus direct socket-loopback policy; production/default startup never receives the capability.

**Tech Stack:** TypeScript 5.8, Node.js HTTP, Express 5, Mongoose 9 transactions, Zod, bcryptjs, JSON Web Tokens, Vitest 3, Supertest, mongodb-memory-server replica sets.

**Spec:** [Local Demo Accounts and Staff Invitations Design](../specs/2026-08-18-local-demo-accounts-and-staff-invitations-design.md). This plan implements only the local-demo-account half. The ordered follow-up is [Real Staff Invitations](./2026-08-18-real-staff-invitations.md).

## Global Constraints

- Do not implement staff invitation models, SMTP, public invitation routes, or invitation UI in this plan.
- `npm run dev` and `npm run dev:backend` must need no seed flags and must never invoke or import the destructive seed runner.
- Preserve `npm run seed` as an explicit, guarded, destructive full reset.
- Automatic preparation may write only the default-connection User collection in database `lisno_demo`; it must never touch projects, tasks, estimates, access requests, grants, invitations, or audit history.
- Development HTTP must bind explicitly to `127.0.0.1`. Default/production startup must retain its current unspecified-host/platform binding.
- Remote-address authority comes only from `request.socket.remoteAddress`. Never trust `X-Forwarded-For`, `Host`, or CORS as the network boundary.
- The demo predicate is exact and independent: `accountKind === "development_demo"` OR reserved ID OR reserved normalized email. Do not infer from `.example`, names, or roles.
- A process using the exact built-in development JWT secret denies every non-loopback human login/JWT/signup request because that secret is public test data; the capability separately controls reserved identities.
- Real, non-reserved Users remain remotely usable. Exact reserved Client email is the only narrow Client-signup exception; every real/non-reserved Client path remains unchanged.
- Use TDD for each task: record a focused RED, implement the minimum GREEN, run the named focused tests and typecheck, self-review, then commit with the exact subject.
- Run work on the current branch. Before every commit, inspect `git status --short`, stage only the task files, and run `git diff --cached --check`.

---

## File Map

### New backend production files

- `backend/src/domain/demo-identities.ts`: production-safe `AccountKind`, exact twenty-one reserved ID/email pairs, and independent marker/ID/email predicates used by authentication and invitations.
- `backend/src/development/demo-account-catalog.ts`: exact sixteen-account writable catalog and exhaustive role/runtime assertions; it never imports the full seed dataset.
- `backend/src/development/demo-account-authorization.ts`: dependency-free URI/runtime/host validation, opaque issued capability, direct socket loopback normalization, and capability assertions.
- `backend/src/development/demo-account-bootstrap.ts`: dynamically imported post-connect transactional User-only preparation.
- `backend/src/development/start.ts`: testable, model-free development orchestrator that authorizes before dynamic server/writer loading.

### Modified backend production files

- `backend/src/config/development-env.ts`: missing `NODE_ENV` becomes `development` only in the development launcher; explicit values are preserved.
- `backend/src/config/env.ts`: carry the effective runtime without creating a production bypass.
- `backend/src/dev.ts`: authorize first, dynamically import server/bootstrap second, and pass the same capability to preparation and authentication.
- `backend/src/server.ts`: post-connect/pre-app hook, optional bind host, correct disconnect-on-preparation-failure, and actual-host readiness output.
- `backend/src/app.ts`: pass the opaque demo authorization into `AuthService` only when the dev entrypoint supplied it.
- `backend/src/models/User.ts`: `accountKind` enum/default.
- `backend/src/repositories/types.ts`: `AccountKind` on `UserRecord`, optional on `NewUser`.
- `backend/src/repositories/memory.ts` and `backend/src/repositories/mongo.ts`: map/create the marker while mapping legacy missing values to `standard`.
- `backend/src/services/auth.service.ts`: request-peer context; exact demo and built-in-secret denial in login and JWT reload; reserved Client-email signup denial.
- `backend/src/routes/auth.ts` and `backend/src/middleware/auth.ts`: pass only direct socket address to auth service.
- `backend/src/seed/config.ts` and `backend/src/seed/data.ts`: consume the centralized catalog and mark all explicit seed Users `development_demo`; the existing spread serializer writes the field and destructive authorization remains unchanged.
- `backend/.env.example`, `backend/README.md`, and `README.md`: normal no-seed startup, all sixteen credentials, explicit-reset distinction, and remote limitations.

### Tests

- Create `backend/tests/development-demo-account-catalog.test.ts`.
- Create `backend/tests/demo-identities.test.ts`.
- Create `backend/tests/development-demo-authorization.test.ts`.
- Create `backend/tests/development-demo-accounts.test.ts`.
- Create `backend/tests/development-demo-accounts-mongo.replica-set.test.ts`.
- Create `backend/tests/development-startup.test.ts`.
- Create `backend/tests/helpers/development-demo-authentication.ts`: explicit real capability for test apps that intentionally authenticate reserved fixtures; never a global test bypass.
- Modify `backend/tests/development-env.test.ts`, `backend/tests/development-processes.test.ts`, `backend/tests/server.test.ts`, `backend/tests/auth.test.ts`, `backend/tests/mongo-repository.test.ts`, `backend/tests/repository.test.ts`, and `backend/tests/seed.test.ts`.
- Modify only the authenticated fixture suites found by the Task 5 call-site scan so each intentional reserved-fixture app receives the helper capability explicitly.

---

## Stable Contracts

Use these exact public shapes across tasks:

~~~typescript
export const ACCOUNT_KINDS = ["standard", "development_demo"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export interface DemoAccountDefinition {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly active: true;
  readonly accountKind: "development_demo";
  readonly title: string;
  readonly managerId: string | null;
  readonly authorizedClientIds: readonly string[];
}

export interface AuthenticationRequestContext {
  readonly remoteAddress: string | null | undefined;
}
~~~

The capability is exported as an opaque type only. Its symbol/issuance registry stays module-private:

~~~typescript
export type DevelopmentDemoAuthorization = Readonly<{
  databaseName: "lisno_demo";
  bindHost: "127.0.0.1";
}> & { readonly __developmentDemoAuthorization: never };
~~~

No caller may construct or cast this value. Tests receive it only from the real authorizer.

---

### Task 1: Centralize account kinds and the reserved identity catalog

**Files:**

- Create: `backend/src/domain/demo-identities.ts`
- Create: `backend/src/development/demo-account-catalog.ts`
- Modify: `backend/src/models/User.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/seed/config.ts`
- Modify: `backend/src/seed/data.ts`
- Test: `backend/tests/demo-identities.test.ts`
- Test: `backend/tests/development-demo-account-catalog.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/seed.test.ts`
- Modify fixture builders as required by the now-required repository field: `backend/tests/project-module-access.test.ts`, `backend/tests/access-requests.test.ts`, `backend/tests/user-administration.test.ts`, `backend/tests/super-admin-authorization.test.ts`, and `backend/tests/hierarchy.test.ts`.

**Interfaces:**

- Domain produces: `ACCOUNT_KINDS`, `AccountKind`, exact frozen `RESERVED_DEMO_IDENTITIES`, `isReservedDemoEmail`, and `isReservedDevelopmentDemoIdentity`. ID/email lookup Sets remain module-private because frozen Sets are still mutable through `add`/`delete`/`clear`.
- Development catalog produces: `DEVELOPMENT_DEMO_PASSWORD`, its deterministic bcrypt hash, and `DEVELOPMENT_DEMO_ACCOUNTS` with the exact sixteen writable profiles.
- Changes: `UserRecord.accountKind` becomes required in repository records; missing Mongo field maps to `standard`; `NewUser.accountKind` remains optional and defaults to `standard`.
- Preserves: all public User/auth/directory DTOs; none may expose `accountKind`.

- [ ] **Step 1: Write the failing catalog and repository mapping tests**

Assert the domain registry contains exactly the sixteen canonical pairs plus Meera, Kabir, Ishita, Vikram, and Celeste. Assert ID/email uniqueness and independent marker-only, ID-only, email-only, pair, and arbitrary `.example` cases. Assert the complete sixteen-row writable table byte-for-byte: ID, name, display/normalized email, password hash, role, active, account kind, title, manager ID, and authorized Client IDs. Explicitly pin Ananya → Aarav and both Aurora/Celeste IDs. For every shared seed row, assert equality across all catalog-owned fields. Then assert exact catalog order and one-to-one role coverage:

~~~typescript
expect(DEVELOPMENT_DEMO_ACCOUNTS.map(({ role }) => role)).toEqual(ROLE_CODES);
expect(new Set(DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id)).size).toBe(16);
expect(new Set(DEVELOPMENT_DEMO_ACCOUNTS.map(({ emailNormalized }) => emailNormalized)).size).toBe(16);
expect(DEVELOPMENT_DEMO_PASSWORD).toBe("LisnoDemo2026!");
~~~

Extend memory/Mongo repository tests to prove legacy documents without the field map to `standard`, inserted real Users default to `standard`, and explicit demo Users round-trip as `development_demo`.

- [ ] **Step 2: Run the RED tests**

Run:

~~~bash
cd backend
npm test -- tests/demo-identities.test.ts tests/development-demo-account-catalog.test.ts tests/repository.test.ts tests/mongo-repository.test.ts --reporter=dot
~~~

Expected: failures for the missing catalog/account kind and repository mapping.

- [ ] **Step 3: Implement the catalog and marker**

Declare all sixteen rows explicitly in `ROLE_CODES` order. Add the five additional legacy ID/email pairs. Freeze arrays, entries, and nested authorized-client arrays. Keep mutable lookup Sets module-private. The exact predicate is:

~~~typescript
export function isReservedDevelopmentDemoIdentity(user: Pick<UserRecord, "id" | "emailNormalized" | "accountKind">): boolean {
  return user.accountKind === "development_demo" ||
    reservedDemoUserIds.has(user.id) ||
    reservedDemoEmails.has(normalizeEmail(user.emailNormalized));
}
~~~

Use these exact writable profiles; every unlisted manager/client array is `null`/`[]`:

| Role | ID | Name | Email | Title | Manager | Authorized Clients |
|---|---|---|---|---|---|---|
| super_admin | `user-super-admin` | Aditi Rao | `super-admin@lisno.example` | Super Admin | — | — |
| admin | `user-admin` | Arjun Patel | `admin@lisno.example` | Admin | — | — |
| estimator_sales | `user-estimator-sales` | Priya Sharma | `sales@lisno.example` | Estimator / Sales | — | — |
| designer | `user-designer-ananya` | Ananya Rao | `ananya@lisno.example` | Senior Designer | `user-manager-aarav` | `user-client-aurora`, `user-client-celeste` |
| procurement | `user-procurement` | Nisha Verma | `procurement@lisno.example` | Procurement | — | — |
| finance_head | `user-finance-head` | Rohan Gupta | `finance-head@lisno.example` | Finance Head | — | — |
| site_manager | `user-site-manager` | Imran Khan | `site-manager@lisno.example` | Site Manager | — | — |
| worker_electrician | `user-worker-electrician` | Aman Electrician | `worker-electrician@lisno.example` | Electrician | — | — |
| worker_plumber | `user-worker-plumber` | Bharat Plumber | `worker-plumber@lisno.example` | Plumber | — | — |
| worker_carpenter | `user-worker-carpenter` | Charan Carpenter | `worker-carpenter@lisno.example` | Carpenter | — | — |
| worker_painter | `user-worker-painter` | Deepak Painter | `worker-painter@lisno.example` | Painter | — | — |
| worker_civil | `user-worker-civil` | Eshan Civil | `worker-civil@lisno.example` | Civil Worker | — | — |
| worker_other | `user-worker-other` | Farah Worker | `worker-other@lisno.example` | Other Worker | — | — |
| design_manager | `user-manager-aarav` | Aarav Mehta | `aarav@lisno.example` | Design Manager | — | — |
| design_head | `user-head` | Devika Menon | `head@lisno.example` | Design Head | — | — |
| client | `user-client-aurora` | Rhea Kapoor | `client@aurora.example` | Aurora Living | — | — |

The repair allowlist is exactly `name`, `email`, `emailNormalized`, `passwordHash`, `role`, `active`, `accountKind`, `title`, `managerId`, and `authorizedClientIds`. Celeste deliberately remains in Ananya's canonical authorized-client array to preserve the live seed profile.

Update the Mongoose schema with enum/default, but make `mapUser` use `document.accountKind === "development_demo" ? "development_demo" : "standard"` for legacy compatibility. Keep all serializers explicit and unchanged. Update direct `UserRecord`/`SeedData` test builders to state `accountKind: "standard"`; do not weaken the required repository record type or use a cast. Make all twenty-one explicit seed Users `development_demo`, and source the shared password/hash plus the eleven Prompt-1 role accounts from the central catalog without importing the seed dataset from the automatic path.

- [ ] **Step 4: Run GREEN and typecheck**

~~~bash
cd backend
npm test -- tests/demo-identities.test.ts tests/development-demo-account-catalog.test.ts tests/repository.test.ts tests/mongo-repository.test.ts tests/seed.test.ts --reporter=dot
npm run typecheck
~~~

Expected: all focused tests and typecheck pass.

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/domain/demo-identities.ts backend/src/development/demo-account-catalog.ts backend/src/models/User.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/seed/config.ts backend/src/seed/data.ts backend/tests/demo-identities.test.ts backend/tests/development-demo-account-catalog.test.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/seed.test.ts backend/tests/project-module-access.test.ts backend/tests/access-requests.test.ts backend/tests/user-administration.test.ts backend/tests/super-admin-authorization.test.ts backend/tests/hierarchy.test.ts
git diff --cached --check
git commit -m "feat: classify development demo accounts"
~~~

---

### Task 2: Authorize only the exact local development runtime

**Files:**

- Create: `backend/src/development/demo-account-authorization.ts`
- Modify: `backend/src/config/development-env.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/development/processes.ts`
- Test: `backend/tests/development-demo-authorization.test.ts`
- Test: `backend/tests/development-env.test.ts`
- Test: `backend/tests/development-processes.test.ts`

**Interfaces:**

- Produces: `authorizeDevelopmentDemoStartup(runtime, mongodbUri, bindHost)`, `assertDevelopmentDemoConnection(capability, context)`, `isLoopbackRemoteAddress(value)`.
- Produces one unforgeable capability bound to `lisno_demo` and `127.0.0.1`.
- Preserves explicit `NODE_ENV`; missing value defaults only in `withDevelopmentCredentials`.

- [ ] **Step 1: Write the authorization matrix RED tests**

Accept Mongo hosts only as exact `127.0.0.1` or bracketed `::1`; reject hostname `localhost` and every other name/address. Accept the concrete URI `mongodb://127.0.0.1:27017/lisno_demo?replicaSet=rs0`. Reject before model import/write for effective production/test/undefined runtime, `mongodb+srv`, multiple hosts, URI credentials, missing/wrong/encoded-extra database, fragment, wrong bind host, copied capability, and connected/model database mismatch. Validate the resolved runtime input supplied by `startDevelopmentBackend`; do not compare it to ambient `process.env`, so focused tests can obtain a real capability without global mutation.

Test loopback normalization separately for `127.0.0.1`, other `127/8`, `::1`, and `::ffff:127.0.0.1`; reject remote, missing, zone-suffixed, malformed, and spoofed-header-only cases.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/development-demo-authorization.test.ts tests/development-env.test.ts tests/development-processes.test.ts --reporter=dot
~~~

- [ ] **Step 3: Implement the dependency-free gate**

Do not import Mongoose, UserModel, server, or seed runner. Use a module-private symbol plus `WeakMap<object, IssuedFacts>` and compare every asserted field to issued facts. `assertDevelopmentDemoConnection` takes the structural context `{ connectedDatabaseName: string; defaultConnection: object; userModelConnection: object }`, requires database `lisno_demo`, and requires the two connection objects to be identical. URI parsing must require `mongodb:`, host exactly `127.0.0.1` or `::1`, one host, no `username`/`password`, and decoded pathname exactly `lisno_demo`.

Change the development environment helper to:

~~~typescript
export const withDevelopmentCredentials = (input: Record<string, string | undefined>) => ({
  ...input,
  NODE_ENV: input.NODE_ENV ?? "development",
  JWT_SECRET: input.JWT_SECRET ?? LOCAL_JWT_SECRET,
  OCR_WORKER_TOKEN: input.OCR_WORKER_TOKEN ?? LOCAL_OCR_WORKER_TOKEN
});
~~~

Preserve explicit `production` so authorization rejects it. Export `isBuiltInDevelopmentJwtSecret(secret)` without exporting the literal itself, and ensure combined child-process specs receive the same effective development environment.

- [ ] **Step 4: Run GREEN and typecheck**

~~~bash
cd backend
npm test -- tests/development-demo-authorization.test.ts tests/development-env.test.ts tests/development-processes.test.ts --reporter=dot
npm run typecheck
~~~

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/development/demo-account-authorization.ts backend/src/config/development-env.ts backend/src/config/env.ts backend/src/development/processes.ts backend/tests/development-demo-authorization.test.ts backend/tests/development-env.test.ts backend/tests/development-processes.test.ts
git diff --cached --check
git commit -m "feat: authorize local demo startup"
~~~

---

### Task 3: Add transactional, non-destructive demo preparation

**Files:**

- Create: `backend/src/development/demo-account-bootstrap.ts`
- Modify: `backend/tests/helpers/mongo-replica-set.ts`
- Test: `backend/tests/development-demo-accounts.test.ts`
- Test: `backend/tests/development-demo-accounts-mongo.replica-set.test.ts`

**Interfaces:**

- Produces: `ensureDevelopmentDemoAccounts(capability, { clock? }): Promise<{ inserted: number; repaired: number; unchanged: number }>`.
- Consumes: the real default Mongoose connection and dynamically loaded `UserModel` only after capability authorization.
- Seed path consumes the same catalog but retains its separate destructive capability.

- [ ] **Step 1: Write unit-level RED tests around the preparation boundary**

Use an injected internal persistence seam only if it remains module-private to production. At the exported boundary, prove missing/forged capability, wrong connected database, and `UserModel.db !== mongoose.connection` cause zero User reads and writes. Prove all sixteen candidates, bcrypt-compatible canonical hash, account kind, valid timestamps/version, complete preflight before writes, exact repair field allowlist, no write for canonical rows, and no `deleteMany`/`replaceOne`/other-model call.

Test collision cases independently: ID belongs to another email, email belongs to another ID, and crossed two-record collision. Every case must make zero writes.

- [ ] **Step 2: Write real replica-set RED tests**

Extend `startMongoReplicaSet(databaseName?: string)` so this file connects with `getUri("lisno_demo")`, while existing callers retain their default. On that actual wiredTiger helper:

1. insert unrelated User, Project, and a drifted exact reserved User;
2. run preparation and assert sixteen canonical rows, repaired auth fields, version +1 once, stable createdAt, preserved mobile/address/unknown fields, and byte-identical unrelated/project rows;
3. run again and assert zero modifications/stable version/updatedAt;
4. run two preparation calls concurrently and assert one row per canonical ID/email;
5. force a preflight collision and assert all-or-nothing zero inserts.

- [ ] **Step 3: Run RED**

~~~bash
cd backend
npm test -- tests/development-demo-accounts.test.ts tests/development-demo-accounts-mongo.replica-set.test.ts --reporter=dot
~~~

- [ ] **Step 4: Implement transaction and duplicate-race handling**

Hash constant may be reused only after a focused bcrypt test proves it matches `LisnoDemo2026!`. `ensureDevelopmentDemoAccounts` must begin by calling `assertDevelopmentDemoConnection(capability, { connectedDatabaseName: mongoose.connection.name, defaultConnection: mongoose.connection, userModelConnection: UserModel.db })` before its first query. Capture one `startupNow = clock()` per invocation. In a Mongo transaction:

- query all reserved IDs and emails with `+passwordHash`;
- build the complete collision verdict before the first write;
- insert missing rows with version 1 and both timestamps equal to `startupNow`;
- update drifted exact rows with `$set` of catalog-owned fields plus `updatedAt: startupNow`, `$inc: { version: 1 }`, `timestamps:false`, preserving `createdAt`;
- skip byte-identical rows.

Use only the User collection: one Mongo transaction, its normal driver retries, unique `_id`/`emailNormalized` constraints, and exact version/CAS filters provide convergence. Inject a fixed clock in tests and assert a changed row gets exactly that `updatedAt` once while its `createdAt` remains byte-identical; canonical rows retain their prior `updatedAt`. If a transaction retry ends in E11000, perform a bounded fresh **User-only** transaction/read and accept only when every winner is the exact canonical pair; repair any exact winner through the same allowlist/CAS, otherwise rethrow. Never create a coordination/sentinel row, and do not import or call the seed reset helper.

- [ ] **Step 5: Run GREEN and typecheck**

~~~bash
cd backend
npm test -- tests/development-demo-accounts.test.ts tests/development-demo-accounts-mongo.replica-set.test.ts --reporter=dot
npm run typecheck
~~~

- [ ] **Step 6: Commit**

~~~bash
git add backend/src/development/demo-account-bootstrap.ts backend/tests/helpers/mongo-replica-set.ts backend/tests/development-demo-accounts.test.ts backend/tests/development-demo-accounts-mongo.replica-set.test.ts
git diff --cached --check
git commit -m "feat: prepare demo accounts non-destructively"
~~~

---

### Task 4: Wire authorized preparation before loopback listening

**Files:**

- Modify: `backend/src/server.ts`
- Modify: `backend/src/dev.ts`
- Create: `backend/src/development/start.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/server.test.ts`
- Test: `backend/tests/development-startup.test.ts`
- Test: `backend/tests/development-demo-accounts.test.ts`

**Interfaces:**

Extend server dependencies with exact optional fields:

~~~typescript
export interface DatabasePreparationContext {
  readonly mongodbUri: string;
}

export interface ServerDependencies {
  // existing fields remain
  bindHost?: string;
  prepareDatabase?: (context: DatabasePreparationContext) => Promise<void>;
  developmentDemoAuthorization?: DevelopmentDemoAuthorization;
}
~~~

`prepareDatabase` runs after successful connect and before repository factory, app factory, or listen. In this task add `AppDependencies.developmentDemoAuthorization?: DevelopmentDemoAuthorization` and carry the capability through `startServer` into `createApp`, but do not yet change `AuthServiceDependencies` or consume it. Task 5 adds that final forwarding atomically with the auth behavior. Default startup supplies none.

- [ ] **Step 1: Write lifecycle RED tests**

Prove event order `connect -> prepare -> repository -> app -> listen`, dev listen receives `127.0.0.1`, default listen omits host, readiness prints actual host, and preparation failure calls disconnect exactly once with zero repository/app/listen/output calls. Also prove connect failure does not call disconnect unless a connection was established.

Add a module-loading regression against `startDevelopmentBackend` with injected dynamic loaders: a rejected authorization must invoke neither server nor bootstrap/model loader. A valid runtime loads server after authorization, while the bootstrap loader remains untouched until the post-connect preparation callback executes.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/server.test.ts tests/development-startup.test.ts tests/development-demo-accounts.test.ts --reporter=dot
~~~

- [ ] **Step 3: Implement startup sequencing**

Move connection into the lifecycle `try` so preparation failures disconnect. Update the local `ServerApp.listen` overload and helper so a defined host uses `app.listen(port, host, callback)` and undefined retains `app.listen(port, callback)`.

Implement `startDevelopmentBackend` in `src/development/start.ts` with injectable `environment`, `loadServer`, and `loadDemoAccounts` functions. It authorizes first, then invokes `loadServer`. Pass a preparation closure that invokes `loadDemoAccounts` only after Mongo has connected; do not eagerly resolve the writer module. Keep `src/dev.ts` as the minimal guarded entrypoint calling this orchestrator. This proves runtime/URI/host authorization precedes the server's model import graph, while connected-name/model-ownership authorization precedes the first User query or write. Both `npm run dev` and `npm run dev:backend` already reach this file.

- [ ] **Step 4: Run GREEN and typecheck**

~~~bash
cd backend
npm test -- tests/server.test.ts tests/development-startup.test.ts tests/development-demo-accounts.test.ts tests/development-processes.test.ts --reporter=dot
npm run typecheck
~~~

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/server.ts backend/src/dev.ts backend/src/development/start.ts backend/src/app.ts backend/tests/server.test.ts backend/tests/development-startup.test.ts backend/tests/development-demo-accounts.test.ts
git diff --cached --check
git commit -m "feat: bootstrap demo accounts before local listen"
~~~

---

### Task 5: Enforce demo and built-in-secret request boundaries

**Files:**

- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/auth.test.ts`
- Test: `backend/tests/auth-authorization.test.ts`
- Test: `backend/tests/development-demo-accounts.test.ts`

**Interfaces:**

Change only the internal auth methods:

~~~typescript
login(email: string, password: string, context: AuthenticationRequestContext): Promise<AuthPayload>;
signupClient(input: ClientSignupInput, context: AuthenticationRequestContext): Promise<AuthPayload>;
authenticate(token: string, context: AuthenticationRequestContext): Promise<PublicUser>;
~~~

`signupClient` keeps its existing successful payload. `authenticate` still reloads current active User and exact stored role before returning. A remote human request made with the exact built-in development JWT secret is denied even if a caller somehow starts the default server without the development capability.

- [ ] **Step 1: Write remote-denial RED tests**

Cover login and signed JWT reload for:

- marker-only, reserved-ID-only, and reserved-email-only Users;
- local authorization + IPv4, IPv6, and mapped loopback success;
- no capability and remote/default denial;
- local capability plus the built-in secret and a remote peer denies a real standard User; a capability plus an explicit non-built-in secret does not independently deny that real User;
- default startup configured with the exact built-in secret plus remote peer denial for login, JWT reload, and Client signup;
- spoofed `X-Forwarded-For: 127.0.0.1` with remote socket denial;
- missing/malformed address denial;
- remote non-reserved real User success on a normal/default server;
- generic `INVALID_CREDENTIALS` for demo password login denial and generic `INVALID_TOKEN` for JWT denial.

Add Client-signup regression: every case-normalized exact reserved email returns existing `409 ACCOUNT_EXISTS` and causes zero coordination/User/project/audit writes, while a non-reserved Client still creates, links, audits, logs in, and reloads exactly as before.

- [ ] **Step 2: Run RED**

~~~bash
cd backend
npm test -- tests/auth.test.ts tests/auth-authorization.test.ts tests/development-demo-accounts.test.ts --reporter=dot
~~~

- [ ] **Step 3: Implement request-context enforcement**

Routes and middleware construct context only as:

~~~typescript
const context = { remoteAddress: request.socket.remoteAddress };
~~~

Do not read `request.ip` when trust-proxy settings could transform it, and do not pass headers. In login, continue constant-work password comparison before the generic denial. In JWT authentication, verify signature/shape, reload stored User, then apply active/role and demo/peer rules.

Apply two independent rules in this order after the reserved-signup exception: `(usesBuiltInDevelopmentSecret && !isLoopbackRemoteAddress(remoteAddress))` denies every human auth request; `(isReservedDevelopmentDemoIdentity(user) && !(issuedCapability && isLoopbackRemoteAddress(remoteAddress)))` denies that reserved identity. A capability with an explicit non-built-in secret does not by itself deny a remote standard User. Extend `AuthServiceDependencies` with optional `developmentDemoAuthorization` here and make `createApp` forward the Task-4 field.

Check reserved Client email before the built-in-secret origin rule and before entering `runInTransaction`, mapping it through the existing `AccountExistsError` so public behavior stays `409 ACCOUNT_EXISTS`. Add the combined remote+built-in-secret+reserved-email test and assert it still returns 409 with zero coordination/User/project/audit writes. Map built-in-secret remote signup for every non-reserved email through the same generic `401 INVALID_CREDENTIALS` behavior chosen for remote login; never allow it to fall through as a 500.

- [ ] **Step 3a: Update the explicit test-fixture capability cascade**

Create `tests/helpers/development-demo-authentication.ts` that mints the real capability from the exact development/`127.0.0.1`/`lisno_demo` tuple. Pass it only to apps that intentionally authenticate canonical reserved fixtures. Scan all `createApp`/`createAuthService` call sites with `rg`; expected affected families include access requests, authorization, design sections/review/upload/extraction, estimate PDF/review, full journey, hierarchy/KPI/leads, uploads, user administration, and workflows. Do not add `NODE_ENV=test` magic or a global auto-allow, and do not touch unauthenticated health/CORS tests without evidence.

- [ ] **Step 4: Run GREEN, route-registry compatibility, and typecheck**

~~~bash
cd backend
npm test -- tests/auth.test.ts tests/auth-authorization.test.ts tests/development-demo-accounts.test.ts tests/route-operation-registry.test.ts --reporter=dot
npm run typecheck
~~~

Then run the complete backend suite once before staging this broad fixture cascade:

~~~bash
npm test -- --reporter=dot
~~~

Expected: every modified authenticated suite imports and passes; do not defer fixture/capability failures to Task 6.

- [ ] **Step 5: Commit**

~~~bash
git add backend/src/services/auth.service.ts backend/src/routes/auth.ts backend/src/middleware/auth.ts backend/src/app.ts backend/tests/helpers/development-demo-authentication.ts backend/tests/auth.test.ts backend/tests/auth-authorization.test.ts backend/tests/development-demo-accounts.test.ts backend/tests/access-requests.test.ts backend/tests/design-section-review.test.ts backend/tests/design-sections.test.ts backend/tests/estimate-design-extraction.test.ts backend/tests/estimate-design-review.test.ts backend/tests/estimate-design-upload.test.ts backend/tests/estimate-pdf-routes.test.ts backend/tests/extraction-worker.test.ts backend/tests/full-journey.test.ts backend/tests/hierarchy.test.ts backend/tests/kpi.test.ts backend/tests/leads.test.ts backend/tests/super-admin-authorization.test.ts backend/tests/uploads.test.ts backend/tests/user-administration.test.ts backend/tests/user-administration-mongo.replica-set.test.ts backend/tests/workflows.test.ts
git diff --cached --check
git commit -m "fix: confine demo authentication to local development"
~~~

---

### Task 6: Document the zero-seed workflow and verify the subsystem

**Files:**

- Modify: `backend/.env.example`
- Modify: `backend/README.md`
- Modify: `README.md`
- Test: all Plan A focused/full gates

- [ ] **Step 1: Update documentation**

Document the normal workflow as:

~~~bash
cd backend
npm run dev
~~~

State that it non-destructively ensures only the sixteen canonical User accounts in local `lisno_demo`, repairs reserved fields on restart, binds to loopback, and never resets project data. Include the exact sixteen-account table and password once in each appropriate README; include Estimator/Sales. Keep `npm run seed` in a separate **Optional destructive full reset** section with its exact flags and warning.

State explicitly that demo accounts are denied on normal/remote deployment, real staff provisioning is implemented by the ordered invitation plan, and local Client insertion does not retroactively claim projects.

- [ ] **Step 2: Run static scope/security searches**

~~~bash
rg -n "deleteMany|replaceOne|resetAuthorizedSeedCollections|seedMongoDatabase" backend/src/development backend/src/dev.ts
rg -n "X-Forwarded-For|x-forwarded-for" backend/src/development backend/src/services/auth.service.ts backend/src/middleware/auth.ts backend/src/routes/auth.ts
rg -n "LisnoDemo2026|DEMO_ACCOUNT" frontend/src
~~~

Expected: first and second searches have no production hits; frontend credential search has no hits.

- [ ] **Step 3: Run focused and real-Mongo verification**

~~~bash
cd backend
npm test -- tests/development-demo-account-catalog.test.ts tests/development-demo-authorization.test.ts tests/development-demo-accounts.test.ts tests/development-demo-accounts-mongo.replica-set.test.ts tests/development-env.test.ts tests/development-processes.test.ts tests/server.test.ts tests/auth.test.ts tests/auth-authorization.test.ts tests/seed.test.ts --reporter=dot
npm run typecheck
npm run build
~~~

- [ ] **Step 4: Run the fresh full backend suite**

~~~bash
cd backend
npm test -- --reporter=dot
~~~

Expected: every backend test passes. Diagnose any listener/replica contention; do not weaken timeouts or assertions without reproducing root cause.

- [ ] **Step 5: Request independent security review**

Reviewer must inspect capability forgeability, import order, connection/model identity, collision all-or-nothing behavior, canonical repair allowlist, direct-socket peer normalization, default production denial, reserved Client exception, no public DTO marker, and no destructive coupling. Fix every Critical/Important finding with a new RED/GREEN regression before continuing.

- [ ] **Step 6: Commit**

~~~bash
git add backend/.env.example backend/README.md README.md
git diff --cached --check
git commit -m "docs: explain automatic local demo accounts"
git status --short
~~~

Expected: clean worktree. Record exact test counts and commit hashes in `docs/superpowers/plans/2026-08-18-real-staff-invitations.md` execution handoff notes only if implementation uncovers a contract change; do not edit the approved design casually.

---

## Plan A Completion Gate

Do not begin invitation implementation until all are true:

- all sixteen documented accounts log in after `npm run dev` without a seed command;
- the second startup is a true no-op;
- unrelated Users and every non-User collection remain unchanged;
- failed/colliding preparation prevents listen and disconnects;
- dev listens only on loopback;
- demo identities and local demo JWTs fail on default/remote auth;
- real non-reserved users and real Client behavior remain green;
- focused, replica-set, typecheck, build, full-suite, static-scope, and independent review gates pass;
- worktree is clean.
