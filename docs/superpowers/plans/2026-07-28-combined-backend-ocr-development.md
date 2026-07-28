# Combined Backend and OCR Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cd backend && npm run dev` start and stop the backend and OCR worker together.

**Architecture:** Add a dependency-free TypeScript process coordinator that builds explicit backend and worker process specifications, validates the worker virtual environment, spawns both children with one shared development environment, and coordinates shutdown. Keep backend server bootstrap and all production commands unchanged.

**Tech Stack:** TypeScript, Node.js child processes, tsx, Vitest, Python virtual environment

## Global Constraints

- Explicit shell and `backend/.env` values must take precedence over development defaults.
- Both child processes must receive the same `OCR_WORKER_TOKEN`.
- `Ctrl+C` and child failure must stop both processes.
- Missing `ocr-worker/.venv` must produce an actionable setup message.
- Production, seed, and migration commands must remain unchanged.

---

### Task 1: Shared development environment

**Files:**
- Modify: `backend/src/config/development-env.ts`
- Modify: `backend/tests/development-env.test.ts`

**Interfaces:**
- Produces: `withDevelopmentCredentials(input: Record<string, string | undefined>): Record<string, string | undefined>`
- Retains: `loadDevelopmentEnvironment(input?: Record<string, string | undefined>)`

- [ ] **Step 1: Extend the test first**

Add an assertion that `withDevelopmentCredentials({}).OCR_WORKER_TOKEN` is at
least 32 characters and that an explicit token is returned unchanged.

- [ ] **Step 2: Verify RED**

Run: `cd backend && npm test -- tests/development-env.test.ts`

Expected: FAIL because `withDevelopmentCredentials` is not exported.

- [ ] **Step 3: Implement the shared input builder**

Move the existing fallback merge into `withDevelopmentCredentials` and make
`loadDevelopmentEnvironment` call `loadEnvironment(withDevelopmentCredentials(input))`.

- [ ] **Step 4: Verify GREEN**

Run: `cd backend && npm test -- tests/development-env.test.ts`

Expected: all development environment tests PASS.

### Task 2: Coordinated backend and worker processes

**Files:**
- Create: `backend/src/development/processes.ts`
- Create: `backend/src/development/run.ts`
- Create: `backend/tests/development-processes.test.ts`
- Modify: `backend/package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `createDevelopmentProcessSpecs(options)` returning backend and OCR worker commands with one shared environment
- Produces: `runDevelopmentProcesses(options): Promise<number>` supporting injected `spawnProcess`, `pathExists`, and signal source boundaries
- Consumes: `withDevelopmentCredentials` from Task 1

- [ ] **Step 1: Write failing process-spec tests**

Test with a literal backend root and explicit environment. Assert:

```ts
expect(specs.map((spec) => spec.label)).toEqual(["backend", "ocr-worker"]);
expect(specs[0].env.OCR_WORKER_TOKEN).toBe(specs[1].env.OCR_WORKER_TOKEN);
expect(specs[1]).toMatchObject({
  command: "/repo/ocr-worker/.venv/bin/python",
  args: ["-m", "lisno_ocr.worker"],
  cwd: "/repo/ocr-worker"
});
```

Also assert an explicitly supplied token is preserved.

- [ ] **Step 2: Write failing lifecycle tests**

Use EventEmitter-based fake children and injected boundaries. Assert that:

- a missing worker Python path returns exit code `1`, writes the virtual
  environment setup command, and spawns nothing;
- when either child exits, the still-running sibling receives `SIGTERM`;
- a failing child exit results in a nonzero coordinator exit code.

- [ ] **Step 3: Verify RED**

Run: `cd backend && npm test -- tests/development-processes.test.ts`

Expected: FAIL because `src/development/processes.ts` does not exist.

- [ ] **Step 4: Implement process specifications**

Build the backend command from `process.execPath` plus
`node_modules/tsx/dist/cli.mjs watch src/dev.ts`. Build the worker command from
the sibling `ocr-worker/.venv` path, selecting `bin/python` on POSIX and
`Scripts/python.exe` on Windows. Pass `withDevelopmentCredentials(input)` to
both specifications.

- [ ] **Step 5: Implement lifecycle coordination**

Before spawning, check the worker executable. Spawn both processes with
inherited stdio. On `SIGINT`, `SIGTERM`, spawn error, or child exit, send
`SIGTERM` to the remaining child, remove installed signal listeners after both
children close, and resolve with `0` only for an explicit user shutdown.

- [ ] **Step 6: Add the executable entrypoint**

`backend/src/development/run.ts` loads `dotenv/config`, computes the backend
root from `import.meta.url`, calls `runDevelopmentProcesses`, and assigns the
returned code to `process.exitCode`.

Change `backend/package.json`:

```json
"dev": "tsx src/development/run.ts",
"dev:backend": "tsx watch src/dev.ts"
```

- [ ] **Step 7: Update the runbook**

Replace the separate backend and worker terminal instructions in `README.md`
with `cd backend && npm run dev`, retaining the note that first model use may
download PaddleOCR assets. Keep frontend as its own terminal.

- [ ] **Step 8: Verify GREEN and regressions**

Run:

```bash
cd backend
npm test -- tests/development-processes.test.ts tests/development-env.test.ts
npm test
npm run typecheck
npm run build
cd ../ocr-worker
.venv/bin/python -m pytest -m "not model"
```

Expected: all commands exit `0`.

- [ ] **Step 9: Smoke-test the real combined command**

Run `cd backend && env -u JWT_SECRET -u OCR_WORKER_TOKEN npm run dev`.
Expected: the coordinator announces both processes, the backend reports ready,
the worker remains running, and one `Ctrl+C` terminates both.

- [ ] **Step 10: Commit**

```bash
git add backend/src/config/development-env.ts \
  backend/src/development/processes.ts backend/src/development/run.ts \
  backend/tests/development-env.test.ts \
  backend/tests/development-processes.test.ts backend/package.json README.md \
  docs/superpowers/plans/2026-07-28-combined-backend-ocr-development.md
git commit -m "feat: run backend and OCR worker together"
```
