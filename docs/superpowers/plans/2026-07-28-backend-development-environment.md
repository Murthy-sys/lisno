# Backend Development Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cd backend && npm run dev` pass strict environment validation without requiring a local `.env` file.

**Architecture:** Keep `loadEnvironment()` unchanged and introduce a development-only loader that fills only missing credentials before delegating to the strict loader. A dedicated development entrypoint passes that loader into the existing `startServer()` dependency boundary, so all non-development commands remain fail-closed.

**Tech Stack:** TypeScript, Node.js ESM, dotenv, Zod, Vitest, tsx

## Global Constraints

- Explicit shell and `backend/.env` values must take precedence over development defaults.
- `npm start`, seed, migrations, and direct `loadEnvironment()` calls must continue rejecting missing or weak credentials.
- Development fallback credentials must be deterministic, clearly local-only, and at least 32 characters long.

---

### Task 1: Development-only environment loader and entrypoint

**Files:**
- Create: `backend/src/config/development-env.ts`
- Create: `backend/src/dev.ts`
- Create: `backend/tests/development-env.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `loadEnvironment(input?: Record<string, string | undefined>)` from `backend/src/config/env.ts`
- Produces: `loadDevelopmentEnvironment(input?: Record<string, string | undefined>)`, returning the validated environment object produced by `loadEnvironment`
- Produces: `backend/src/dev.ts`, the entrypoint used exclusively by `npm run dev`

- [ ] **Step 1: Write the failing development-loader tests**

```ts
import { describe, expect, it } from "vitest";

import { loadDevelopmentEnvironment } from "../src/config/development-env.js";

describe("development environment configuration", () => {
  it("supplies valid local credentials when they are missing", () => {
    const env = loadDevelopmentEnvironment({});

    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.OCR_WORKER_TOKEN.length).toBeGreaterThanOrEqual(32);
  });

  it("preserves explicitly configured credentials", () => {
    const env = loadDevelopmentEnvironment({
      JWT_SECRET: "explicit-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN: "explicit-worker-token-with-at-least-32-characters"
    });

    expect(env.JWT_SECRET).toBe(
      "explicit-jwt-secret-with-at-least-32-characters"
    );
    expect(env.OCR_WORKER_TOKEN).toBe(
      "explicit-worker-token-with-at-least-32-characters"
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd backend && npm test -- tests/development-env.test.ts`

Expected: FAIL because `../src/config/development-env.js` does not exist.

- [ ] **Step 3: Implement the minimal development loader**

```ts
import { loadEnvironment } from "./env.js";

const LOCAL_JWT_SECRET = "local-development-jwt-secret-do-not-use-in-production";
const LOCAL_OCR_WORKER_TOKEN =
  "local-development-ocr-worker-token-do-not-use-in-production";

export const loadDevelopmentEnvironment = (
  input: Record<string, string | undefined> = process.env
) =>
  loadEnvironment({
    ...input,
    JWT_SECRET: input.JWT_SECRET ?? LOCAL_JWT_SECRET,
    OCR_WORKER_TOKEN: input.OCR_WORKER_TOKEN ?? LOCAL_OCR_WORKER_TOKEN
  });
```

- [ ] **Step 4: Add the development entrypoint and wire the npm script**

Create `backend/src/dev.ts`:

```ts
import "dotenv/config";

import { loadDevelopmentEnvironment } from "./config/development-env.js";
import { startServer } from "./server.js";

startServer({ loadEnvironment: loadDevelopmentEnvironment }).then(
  () => undefined,
  (error: unknown) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
);
```

Change the `dev` script in `backend/package.json` to:

```json
"dev": "tsx watch src/dev.ts"
```

- [ ] **Step 5: Run focused and regression tests**

Run: `cd backend && npm test -- tests/development-env.test.ts`

Expected: PASS.

Run: `cd backend && npm test`

Expected: all tests PASS, including the existing strict configuration tests.

- [ ] **Step 6: Verify types, build, and startup behavior**

Run: `cd backend && npm run typecheck`

Expected: exit code 0.

Run: `cd backend && npm run build`

Expected: exit code 0.

Run a bounded `npm run dev` smoke test with no `JWT_SECRET` or
`OCR_WORKER_TOKEN`. Expected: no Zod error for either credential; the process
either reports `Backend ready` when the local MongoDB replica set is available
or reaches the normal MongoDB connection error when it is unavailable.

- [ ] **Step 7: Commit**

```bash
git add backend/src/config/development-env.ts backend/src/dev.ts \
  backend/tests/development-env.test.ts backend/package.json \
  docs/superpowers/plans/2026-07-28-backend-development-environment.md
git commit -m "fix: provide safe local backend development credentials"
```
