# Backend Readiness Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print an unambiguous readiness message after the backend has connected to MongoDB and successfully started listening.

**Architecture:** Add an injectable output function to the existing server bootstrap dependencies, defaulting to standard output in production. Invoke it only after the awaited HTTP listen operation resolves, so failed database connections and listen attempts cannot announce readiness.

**Tech Stack:** TypeScript, Node.js, Express 5, Vitest

## Global Constraints

- Print `Backend ready at http://localhost:<validated PORT>` only after successful listening.
- Do not print readiness when MongoDB connection or HTTP listening fails.
- Do not change ports, MongoDB connection behavior, process lifetime, or `tsx watch` behavior.
- Keep output testable without replacing global `process.stdout`.

---

### Task 1: Add and verify the readiness message

**Files:**
- Modify: `backend/src/server.ts:17-57`
- Test: `backend/tests/server.test.ts:21-141`

**Interfaces:**
- Consumes: the validated `env.PORT` value and successful resolution of `listen(app, env.PORT)`.
- Produces: optional `ServerDependencies.writeOutput?: (message: string) => void`, defaulting to `process.stdout.write`, and the exact message `Backend ready at http://localhost:${env.PORT}\n`.

- [ ] **Step 1: Write the failing success-path test**

In the test named `connects with MONGODB_URI and injects the Mongo repository instead of an in-memory fallback`, create `const writeOutput = vi.fn()`, pass it to `startServer`, and add:

```ts
expect(writeOutput).toHaveBeenCalledOnce();
expect(writeOutput).toHaveBeenCalledWith(
  `Backend ready at http://localhost:${env.PORT}\n`
);
```

Also pass `writeOutput: vi.fn()` in the other existing successful bootstrap test so it does not write to the test runner's standard output.

- [ ] **Step 2: Extend the listen-error test**

In `rejects and disconnects when Express reports a listen error`, create and inject `const writeOutput = vi.fn()`, then assert:

```ts
expect(writeOutput).not.toHaveBeenCalled();
```

This proves the message is gated on successful listening.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
cd backend
npm test -- --run tests/server.test.ts
```

Expected: FAIL because `writeOutput` is not yet part of `ServerDependencies` and is never called.

- [ ] **Step 4: Implement the minimal output dependency**

Add this property to `ServerDependencies`:

```ts
writeOutput?: (message: string) => void;
```

After `server = await listen(app, env.PORT);`, add:

```ts
(dependencies.writeOutput ?? ((message) => process.stdout.write(message)))(
  `Backend ready at http://localhost:${env.PORT}\n`
);
```

Keep this statement inside the existing `try` block and after the awaited listen call.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
cd backend
npm test -- --run tests/server.test.ts
```

Expected: all server bootstrap tests PASS.

- [ ] **Step 6: Run complete verification**

Run:

```bash
cd backend
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all backend tests pass, TypeScript reports no errors, the build exits successfully, and `git diff --check` produces no output.

- [ ] **Step 7: Verify the development command**

With port 3000 free and MongoDB running, run:

```bash
cd backend
npm run dev
```

Expected output includes:

```text
Backend ready at http://localhost:3000
```

The command remains active in watch mode until interrupted with `Ctrl+C`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/server.ts backend/tests/server.test.ts
git commit -m "feat: report backend readiness"
```
