# Task 12 report — Safe local demo seed and role accounts

## Scope

- Plan task: Task 12 only.
- Base HEAD: `de465626c1f91623c17cb233dfc94b661703d543`.
- Commit: `452bd38 chore: gate demo seed and add role accounts`.
- Added the approved local seed gate, deterministic role accounts, documentation, and production login credential removal.
- Did not implement Task 13, frontend authorization snapshots, Prompt 2 behavior, staff invitation/provisioning, or any Client behavior change.
- Added `frontend/src/styles/index.css` to the declared file scope because Task 12 Step 6 explicitly requires every dead `.demo-helper` rule to be removed; the file contained the base and responsive helper rules.

## Seed safety and ordering

- Environment is loaded exactly once per command with dotenv `override: false`, so explicit shell values retain precedence.
- Runtime authorization accepts only `development`/`test`, exact `ALLOW_DEMO_SEED=true`, a single loopback `mongodb://` target, an allowlisted `lisno_demo`/`lisno_test*` database, and an exact URI/database-name match.
- The authorization capability uses a private symbol, is checked at runtime, and is frozen with `Object.freeze`.
- Rejected command inputs are handled before mongoose import, connection, model loading, or mutation.
- Successful commands connect first, assert the actual connected database name against the branded capability, then dynamically load models and reset data.
- The reset now includes AccessRequest, ProjectAccessGrant, and AuthorizationCoordination in addition to every existing seed model.

## Deterministic data and compatibility

- Added exactly one active account for each approved new role: Super Admin, Admin, Procurement, Finance Head, Site Manager, and six Worker trades.
- All new IDs and `@lisno.example` emails are deterministic. Every new user starts at version `1` and uses the existing bcrypt hash verified against `LisnoDemo2026!`.
- New users are appended after legacy users, preserving existing fixture ordering, IDs, reporting relationships, projects, client linking, and Client behavior.
- `estimateResponsibilities`, `accessRequests`, and `projectAccessGrants` remain empty.
- Both READMEs document the guarded local command, destructive-reset warning, all local credentials, and that seeding is not a production privileged-account bootstrap.
- The root README explicitly records unverified client-email claiming as a public-production blocker.

## UI credential removal

- Removed the demo account constant, fill handler/button/helper, and Sparkles import from LoginPage.
- Removed all `.demo-helper` rules and sign-in quiet-button rules that existed only for that helper from both style sheets.
- Login tests now prove credentials are neither rendered nor prefilled and that the dead helper selectors are absent.

## TDD and verification evidence

RED:

- Backend focused run initially had the intended missing-config failure and 11 intended new-account login failures; 27 existing auth tests remained passing.
- Frontend focused run initially had the intended credential-helper regression, then exactly two intended failures after adding the dead-style assertion; 16 existing LoginPage tests remained passing.

Focused GREEN:

- `npm test -- tests/seed.test.ts tests/auth.test.ts`: 2/2 files, 67/67 tests passed.
- The seed suite covers 14 rejected command cases with environment called exactly once and zero mongoose-load, connection, model-load, delete, bulk, or insert calls.
- Three allowed local target cases prove connect -> model load -> reset ordering across all 13 models.
- `npm test -- src/auth/LoginPage.test.tsx`: 1/1 file, 18/18 tests passed.
- Backend `npm run typecheck`: passed.
- Frontend `npm run typecheck`: passed.
- `git diff --check`: passed before final suites.

Exactly one fresh full suite per workspace after the focused gates:

- Backend `npm test`: 50/50 files, 926/926 tests passed in 15.52 seconds.
- Frontend `npm test`: 63/63 files, 564/564 tests passed in 17.60 seconds.

## Concerns and boundaries

- The backend full suite continues to emit the pre-existing Mongoose deprecation warning for the `new` option; Task 12 did not change those unrelated repository calls.
- Demo role accounts are deliberately local fixtures. There is no production privileged-account bootstrap in this task.
- This report is intentionally local/uncommitted, matching the existing implementation-report convention; the required product/test files are committed with the exact prescribed subject.

## Fix Round 1 — destructive safety hardening

Review findings reproduced:

- The destructive reset helper and model loader were exported from the seed module.
- The capability's symbol brand was enumerable and a copied/retargeted object passed runtime validation.
- Caller-supplied development flags could mint a capability even when the actual process environment was production.
- Injected models from a different connection could reach mutation after validating an unrelated connection.

RED evidence:

- `npm test -- tests/seed.test.ts`: 28/33 passed with exactly five intended failures.
- Failures proved the enumerable brand, copied/retargeted capability acceptance, synthetic-environment minting, mismatched-model mutation, and exported destructive surface.
- The pre-existing 14 rejected invocation cases and three valid target/ordering cases stayed passing during RED.

Minimal implementation:

- `loadSeedModels` and `resetAuthorizedSeedCollections` are module-private.
- Issued capabilities have a non-enumerable private-symbol property, are frozen, and are registered in a module-local WeakMap tied to the exact authorized database. Clones and retargeted copies cannot reconstruct identity.
- Issuance requires the supplied runtime fields and URI to exactly match the actual post-dotenv `process.env` values before runtime/target authorization.
- After dynamic model loading and before any delete/write, all 13 models must have `.db` equal to the exact validated mongoose connection object and that connection name must equal the authorized database.

Verification:

- Focused backend seed/auth: 2/2 files, 71/71 tests passed.
- Backend typecheck passed.
- Unchanged frontend LoginPage focused suite: 18/18 passed; frontend typecheck passed.
- Exactly one fresh full backend suite: 50/50 files, 930/930 tests passed in 15.65 seconds.
- Exactly one fresh full frontend suite: 63/63 files, 564/564 tests passed in 17.18 seconds.
- `git diff --check` passed before the final suites.

Fix commit: `17c41bf fix: close demo seed authorization bypasses`.

## Fix Round 2 — non-injectable production command

Review finding reproduced:

- The exported production command accepted replacement environment, mongoose,
  connection, model-loader, and output dependencies. An injected connection
  could ignore the validated loopback URI, present the authorized database
  name, bind injected models to itself, and reach deletion.
- The exported seed helper exposed the same dependency-substitution seam once
  a valid local capability had been issued.

RED evidence:

- Initial `npm test -- tests/seed.test.ts`: 33/34 passed with the one intended
  production-command failure; the redirecting injected command resolved
  instead of rejecting.
- The broadened exported-boundary regression then produced exactly two intended
  failures with 33/35 passing: both the command and helper accepted injected
  loaders and resolved.

Minimal implementation:

- `runDemoSeedCommand()` has no dependency parameter and rejects any runtime
  extra argument before environment loading or dynamic imports.
- `seedMongoDatabase(capability)` likewise has no dependency parameter and
  rejects runtime extra arguments before mongoose/model loading.
- Both production paths now use only module-private environment, mongoose, and
  model loaders. CLI ordering remains environment load -> capability issuance
  -> mongoose import -> validated URI connect -> connected database assertion
  -> model import/binding assertion -> reset.
- Tests use the exported side-effect-free capability and model-binding gates
  for lower-level validation; no exported destructive test harness remains.

Focused verification:

- Backend seed/auth: 2/2 files, 73/73 tests passed.
- Backend typecheck passed.
- Unchanged frontend LoginPage: 18/18 passed; frontend typecheck passed.
- `git diff --check` passed during self-review.

Final verification after the separate listener-stabilization commit:

- The first sandboxed backend full run had 931 passes and one unrelated KPI
  timeout. Focused diagnosis reproduced `listen EPERM 0.0.0.0`, confirming the
  sandbox blocked Supertest's ephemeral listener rather than a product failure.
- The required backend full suite was rerun outside that listener restriction:
  50/50 files and 932/932 tests passed in 9.99 seconds.
- Frontend full suite: 63/63 files and 564/564 tests passed in 17.27 seconds.
- Final backend and frontend typechecks passed.
- Final `git diff --check` and cached-diff checks passed.

Fix commit: this commit, subject `fix: make demo seed command non-injectable`.
