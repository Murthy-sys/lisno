# Task 10 report — Project access-request workflow

## Scope

- Plan task: Task 10 only, operation-matrix rows 88–93.
- Base HEAD: `81b97f27ad0f912d71025c1d132f232327ee7a1a`.
- Added only the project access-request submit, owner history/cancel, reviewer inbox/decision, and grant revocation workflow.
- Reused the Task 4 memory/Mongo repository APIs and indexes; no repository, model, migration, seed, Task 11, or Prompt 2 production behavior was added.

## TDD slices

### Opaque submission and bounded abuse control

RED:

- `backend/tests/access-requests.test.ts`: 8/8 initial cases failed because `POST /api/v1/access-requests` returned 404.
- The cases established the observable receipt contract, authorization/module ordering, zero project lookup, duplicate behavior, and actor-plus-IP limiting before implementation.

GREEN:

- Mounted `authenticate -> requireOperation("POST /access-requests") -> role/module eligibility -> rate limiter -> strict body validation -> handler` in that order.
- Submission always returns the same 202 `{ data: { accepted: true } }` receipt for syntactically valid known and unknown project IDs, with equivalent body keys, content type, and CORS-visible headers.
- Submission does not resolve a project. Inside one transaction it takes the authorization coordination lock, reloads the actor, rechecks current role/activity/module eligibility, atomically finds or creates one pending tuple, and writes `access_request.created` only when the row was created.
- The in-memory limiter permits 10 attempts per actor/IP in 15 minutes, resets at the exact window boundary, caps state at 10,000 buckets, and evicts the oldest bucket deterministically. App dependency overrides are test-only deterministic controls.

### Owner history and cancellation

RED:

- Three new owner/cancel scenarios failed on missing routes.

GREEN:

- `GET /access-requests/mine` pages only the authenticated requester's records and returns an explicit DTO without requester, reviewer, fingerprint, approved-grant, password, or resolved-project data.
- `POST /access-requests/:requestId/cancel` is owner-only, uses a non-disclosing 404 for absent/foreign IDs, performs an exact pending/version CAS, appends the typed audit atomically, and reconstructs only the one-version same-result retry.
- The slice reached 16/16 focused access-request tests with a clean backend typecheck.

### Reviewer inbox, decision, and revocation

RED:

- Seven reviewer/decision/revocation scenarios failed on missing routes before their handlers were added.

GREEN:

- Super Admin has global reviewer scope. Admin uses only active `admin_initiator` access in the `projects` module and therefore reviews/decides/revokes only inside projects that Admin initiated.
- Reviewer DTOs explicitly whitelist requester and project fields, represent unresolved projects generically, and expose `activeGrant` only when the exact stored `approvedGrantId` is still active.
- A decision takes the coordination lock, reloads the current reviewer, loads the request, authorizes current scope before terminal idempotence, and fingerprints exactly `decision + "\\n" + normalized original rejection reason`.
- Approval requires the exact project, an active/currently eligible requester, and a grant that can currently supply the requested module. A dormant `direct_assignment` tuple remains pending and cannot satisfy approval.
- Unknown-project approval returns `ACCESS_REQUEST_NOT_APPROVABLE` and leaves the request pending. Unknown-project rejection stores only `The access request could not be approved.` while retaining an idempotence fingerprint derived from the normalized original reason.
- Approved retries load only the exact `approvedGrantId`; they never substitute another tuple grant. Grant-created and request-transition audits are created atomically and the grant audit is written only for a newly created grant.
- Revocation takes the same coordination lock, uses exact-version CAS, removes access immediately, reconstructs only the same reviewer/reason/version retry, and never substitutes a later grant. Super Admin is global; Admin may revoke only `access_request` grants inside current initiator scope.

## Mongo transaction and race evidence

`backend/tests/access-request-mongo.replica-set.test.ts` uses a real replica set and synchronizes the AccessRequest, ProjectAccessGrant, User, Audit, and Project indexes. All 6 scenarios pass:

1. Parallel opaque submissions produce one pending request and one created audit.
2. A direct duplicate upsert is recovered across the complete transaction boundary.
3. Audit failure rolls back grant creation, request transition, and both audits.
4. Duplicate approval and competing terminal decisions serialize to one durable result.
5. Unresolved rejection reconstructs only from the original normalized reason.
6. Approval reconstruction before and after revocation uses only the exact approved grant, even when a later matching grant exists.

## Route registry and boundary audit

- One router mounts exactly rows 88–93:
  - `POST /access-requests`
  - `GET /access-requests/mine`
  - `POST /access-requests/:requestId/cancel`
  - `GET /access-requests/review`
  - `POST /access-requests/:requestId/decision`
  - `POST /project-access-grants/:grantId/revoke`
- Every route has exactly one authentication marker followed by exactly one matching operation marker.
- The registry now observes 84 baseline operations, `GET /auth/authorization`, and the 6 Task 10 routes: 91 mounted human operations. Only matrix rows 86–87 remain unmounted for Task 11.
- Request, requester, decision, grant, and project responses are built from explicit public DTO fields; no user/request record is spread into a response.
- Search and diff review found no worker reassignment, access-request administration UI, seed changes, Task 11 route, or Prompt 2 behavior.

## Verification

Final focused Task 10 verification:

- `npm test -- tests/access-requests.test.ts tests/access-request-repository.test.ts tests/access-request-mongo.replica-set.test.ts tests/project-module-access.test.ts tests/route-operation-registry.test.ts --reporter=dot`
- 5/5 files passed; 108/108 tests passed; duration 3.90 seconds.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

Full backend verification:

- The first post-review run passed 46/47 files and 864/865 tests; the sole failure was the pre-existing Task 9 row-79 replica rollback test exceeding its default 5-second timeout under parallel replica-set startup.
- Per controller direction, that unchanged test passed isolated: 1/1, 1.57-second test time, 2.48-second total duration. No Task 9 file was changed.
- The immediately following unchanged full run passed 47/47 files and 865/865 tests in 8.27 seconds.

## Concerns

- No Task 10 correctness or scope concern remains after focused tests, typecheck, registry checks, race coverage, and the green 865-test backend suite.
- Mongoose emits its existing `findOneAndUpdate` deprecation warnings during Mongo-backed tests; this task does not introduce or broaden those calls.
