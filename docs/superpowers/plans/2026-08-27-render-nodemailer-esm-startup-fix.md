# Render Nodemailer ESM Startup Fix — Task Plan

## Approved specification

- [Render Nodemailer ESM Startup Fix](../specs/2026-08-27-render-nodemailer-esm-startup-fix-design.md)

## Outcome

Produce and locally verify a bounded backend change that replaces Nodemailer's
directory-style SMTP connection import with its explicit `index.js` ESM entry point,
allowing the compiled server module to load under Node.js 24.

## Ownership boundaries

- **Backend implementation owner:**
  - `backend/src/services/smtp-transport.ts`
  - `backend/src/types/nodemailer-smtp-connection.d.ts`
  - `backend/tests/user-invitation-mailer.test.ts`
  - `backend/tests/estimate-mailer.test.ts`
- **Primary agent:** approved-spec reconciliation, integrated diff inspection, local
  verification, and final handoff.
- No task may modify Render configuration, dependency manifests, lockfiles, SMTP
  behavior, or unrelated dirty paths.

## Initial state to preserve

- Existing untracked planning/specification documents belong to ongoing work and
  must remain untouched.
- `render.yaml` has no local diff and is outside this fix.
- No secret values may be read, logged, or added to files.

## Dependency-ordered tasks

### Task 1 — Capture the bounded baseline

**Owner:** Primary agent  
**Dependencies:** Approved specification  
**Affected area:** Read-only inspection of the four owned backend files

Steps:

1. Confirm the exact current import, declaration, mock, and unmock specifiers.
2. Confirm `nodemailer/lib/smtp-connection/index.js` exists in the installed package.
3. Capture the relevant pre-edit diff and stop if any owned file has an unexplained
   existing modification.

Acceptance:

- The four coupled locations and valid target entry point are proven before editing.
- Existing work is preserved.

### Task 2 — Align the ESM module specifier

**Owner:** Backend implementation owner  
**Dependencies:** Task 1  
**Affected files:** The four owned backend files only

Steps:

1. Change the runtime import to
   `nodemailer/lib/smtp-connection/index.js`.
2. Change the ambient declaration to the identical module specifier.
3. Change invitation-mailer and estimate-mailer mock/unmock specifiers to the
   identical module specifier.
4. Do not alter SMTP transport behavior or test assertions.

Acceptance:

- Runtime, types, and focused tests use one exact ESM file specifier.
- No dependency, lockfile, or unrelated code changes occur.

### Task 3 — Focused regression verification

**Owner:** Primary agent  
**Dependencies:** Task 2  
**Affected area:** Backend test/build outputs only

Run:

```bash
cd backend
npm test -- tests/user-invitation-mailer.test.ts tests/estimate-mailer.test.ts
npm run typecheck
npm run build
node -e "import('./dist/services/smtp-transport.js')"
```

Acceptance:

- Both focused mailer suites pass without real email delivery.
- Typecheck passes.
- Production build passes.
- Direct built-module import exits successfully without
  `ERR_UNSUPPORTED_DIR_IMPORT`.

Stop/report conditions:

- A focused test requires real network delivery.
- Type resolution still depends on the old directory specifier.
- The explicit Nodemailer file path is absent from the installed version.
- Verification reveals a wider Node/Nodemailer compatibility problem.

### Task 4 — Integrated review and hygiene

**Owner:** Primary agent  
**Dependencies:** Task 3

Steps:

1. Inspect the complete bounded diff against the approved specification.
2. Run:

```bash
git diff --check
git status --short
```

3. Confirm no secrets, generated output, dependency changes, Render mutations, or
   unrelated edits were introduced.

Acceptance:

- The final diff is limited to the approved module-specifier alignment.
- Repository hygiene checks pass.
- Any pre-existing dirty paths remain preserved and separately identified.

### Task 5 — Handoff; external actions remain gated

**Owner:** Primary agent  
**Dependencies:** Task 4

Report:

- Root cause and exact files changed.
- Exact verification commands and results.
- Any remaining risk, including Render Free SMTP restrictions.
- Commit, push, and Render redeployment not performed.

If the user later requests production rollout, obtain explicit authority for the
exact Git push and Render target before taking those external actions.

## Parallelization

No implementation tasks should run in parallel. The runtime import, ambient
declaration, and Vitest mock paths form one exact coupled contract, and the change is
too small for safe non-overlapping writer ownership. Verification begins only after
all four specifiers are aligned.

## Acceptance-criteria traceability

| Specification criterion | Plan coverage |
| --- | --- |
| Compiled explicit `index.js` import | Tasks 2 and 3 |
| TypeScript deep-import resolution | Tasks 2 and 3 |
| Focused mailer tests pass | Task 3 |
| Typecheck and build pass | Task 3 |
| Built module loads under Node | Task 3 |
| No secrets/external mutations/dependency changes | Tasks 2, 4, and 5 |

