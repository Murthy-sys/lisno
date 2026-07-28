# Frontend Development API Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cd frontend && npm run dev` reach the local backend without a `frontend/.env` file.

**Architecture:** Export a focused Vite development-server configuration containing an `/api` reverse proxy to `http://localhost:3000`, and consume it from the existing Vite config. Keep the application client's relative `/api/v1` fallback and production environment override unchanged.

**Tech Stack:** Vite, TypeScript, Vitest

## Global Constraints

- The proxy applies only to the Vite development server.
- Production may continue to set `VITE_API_URL`.
- No local `frontend/.env` copy step is required.
- `/api/v1` paths and response bodies must pass through unchanged.

---

### Task 1: Vite API proxy

**Files:**
- Create: `frontend/vite.config.test.ts`
- Modify: `frontend/vite.config.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: `developmentServer`, a Vite `ServerOptions` value
- Consumes: the existing relative `/api/v1` fallback in `frontend/src/api/client.ts`

- [ ] **Step 1: Write the failing proxy configuration test**

```ts
import { describe, expect, it } from "vitest";
import { developmentServer } from "./vite.config";

describe("Vite development server", () => {
  it("proxies relative API requests to the local backend", () => {
    expect(developmentServer.proxy?.["/api"]).toMatchObject({
      target: "http://localhost:3000",
      changeOrigin: true
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `cd frontend && npm test -- vite.config.test.ts`

Expected: FAIL because `developmentServer` is not exported.

- [ ] **Step 3: Implement the proxy**

Export a typed `developmentServer` value and pass it to `defineConfig`:

```ts
export const developmentServer: ServerOptions = {
  proxy: {
    "/api": {
      target: "http://localhost:3000",
      changeOrigin: true
    }
  }
};
```

- [ ] **Step 4: Remove the local environment copy requirement**

Update `README.md` so frontend setup installs dependencies but does not copy
`.env.example`. Explain that Vite proxies `/api` locally and
`VITE_API_URL` remains available for deployments with a separate API origin.

- [ ] **Step 5: Verify tests and builds**

Run:

```bash
cd frontend
npm test -- vite.config.test.ts
npm test
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 6: Verify the live proxy**

Start the backend and frontend without `frontend/.env`, then request:

```bash
curl http://localhost:5173/api/v1/health
```

Expected: HTTP 200 with `{"data":{"status":"ok"}}`.

- [ ] **Step 7: Commit**

```bash
git add frontend/vite.config.ts frontend/vite.config.test.ts README.md \
  docs/superpowers/plans/2026-07-28-frontend-development-api-proxy.md
git commit -m "fix: proxy frontend development API requests"
```
