# Lisno Development Handoff — 18 August 2026

This is the durable handoff for continuing work from another Codex account. It records the repository state, completed implementation, exact open review findings, remaining work, security decisions, test evidence, and resume procedure. Do not restart discovery or redesign unless new product requirements conflict with the approved specification.

## 1. Resume summary

Repository:

```text
/Users/apple/Desktop/personal/lisno
```

Checkpoint:

```text
Branch: feature/phase1_module1
Implementation HEAD: aaa37ecdeef9efa4059d4e1dc767036182cc758b
Subject: fix: confine demo authentication to local development
Worktree before this report: clean
Remote: origin -> https://github.com/Murthy-sys/lisno.git
Remote status at inspection: local branch was 64 commits ahead
```

The implementation commits are local and were not pushed during this handoff. A new Codex account should use this existing checkout. If a different machine/clone will be used, push or otherwise transfer the branch first.

Immediate resume point:

1. Do **not** redo Prompt 1, the approved design, or Plans A/B.
2. Resume Plan A Task 5 fix round 1 from `aaa37ec`.
3. Fix the two test-scope findings in [Section 8](#8-plan-a-task-5-open-review-findings).
4. Obtain a scoped re-review.
5. Complete Plan A Task 6 and its full security/verification gate.
6. Only then start Plan B Task 1 and execute its 12 tasks sequentially.

Authoritative files:

- [Completed Prompt 1 report](./PROMPT_1_IMPLEMENTATION_REPORT.md)
- [Product roadmap and Prompt state](./CODEX_IMPLEMENTATION_PLAN.md)
- [Approved demo-account and invitation design](./docs/superpowers/specs/2026-08-18-local-demo-accounts-and-staff-invitations-design.md)
- [Plan A — automatic local demo accounts](./docs/superpowers/plans/2026-08-18-local-demo-accounts.md)
- [Plan B — real staff invitations](./docs/superpowers/plans/2026-08-18-real-staff-invitations.md)
- Local execution ledger: `.superpowers/sdd/2026-08-18-local-demo-accounts/progress.md`
- Plan B execution ledger: `.superpowers/sdd/2026-08-18-real-staff-invitations/progress.md`

The `.superpowers/sdd` artifacts are git-ignored scratch state. This tracked report repeats their load-bearing facts so the handoff does not depend on them.

## 2. Overall status

### Product roadmap

| Area | Status |
|---|---|
| Prompt 0 codebase audit | Complete |
| Prompt 1 RBAC foundation | Complete and reported |
| Prompt 2–10 | Not started |
| Follow-up Plan A: automatic local demo accounts | Tasks 1–4 complete; Task 5 implemented but review fixes remain; Task 6 not started |
| Follow-up Plan B: real staff invitations | Designed and planned; all 12 implementation tasks not started |

### Current follow-up task count

There are 18 implementation tasks across the two approved follow-up plans:

- Plan A: 6 tasks.
- Plan B: 12 tasks.
- Fully completed and independently reviewed: 4.
- Task 5: production implementation committed; two test-scope fixes remain.
- Not started: Plan A Task 6 and Plan B Tasks 1–12.

In practical terms: 4 tasks are complete, 1 is nearly complete, and 13 are not started.

## 3. Approved requirements and boundaries

The user approved the following direction:

1. Local dummy accounts must work like normal accounts without manually running `npm run seed`.
2. Automatic local account preparation must be non-destructive and must not reset projects or workflow data.
3. Public demo credentials must not work through a remote/deployed backend.
4. Real users must work normally against a remote backend.
5. Only a current active Super Admin may invite real staff users.
6. Invitations use a separate `UserInvitation` record. Sending an invitation must not pre-create an inactive `User`.
7. Super Admin may invite every non-Client role, including another Super Admin. Admin cannot invite.
8. Client signup/project linking remains separate and unchanged for real, non-reserved Client identities.
9. Invitation links expire after 24 hours, are single-use, and are invalidated by resend/supersession/revocation.
10. Invitees choose a 12–128 character password. Acceptance creates an active `standard` User but does not automatically log the browser in.
11. The first production Super Admin remains an operator-controlled provisioning responsibility; the demo system and invitation flow do not bootstrap it.
12. No Prompt 2 lifecycle work is included in this initiative.

## 4. Prompt 1 foundation already completed

Prompt 1 is complete at commit `28bfcd3` (`docs: complete Prompt 1 RBAC foundation`). Its canonical report is [PROMPT_1_IMPLEMENTATION_REPORT.md](./PROMPT_1_IMPLEMENTATION_REPORT.md).

It delivered, among other things:

- 16 roles and role-family definitions.
- 91 canonical permissions.
- 93 registered human-JWT operations.
- Default-deny backend authorization and frontend authorization snapshots.
- Permission/presentation-aware frontend route registry and derived navigation.
- Admin/Super Admin user directory and safe versioned role/activation changes.
- Project access requests and project access grants.
- Super Admin global vs Admin scoped review behavior.
- Mongo transaction/race coverage, audit redaction, and DTO whitelisting.
- User directory, personal access-request history, and review UI.

Prompt 1 final evidence recorded at completion:

- Backend: 51 test files / 935 tests.
- Frontend: 73 test files / 781 tests.
- Backend/frontend typechecks and builds passed.

Prompt 1 known production blockers remain relevant:

- No approved production staff invitation/password setup or first-Super-Admin bootstrap existed at Prompt 1 completion. Plan B addresses staff invitations but intentionally does not bootstrap the first production Super Admin.
- Public Client project claiming remains unsafe for production until Client email ownership is verified before project claiming.

## 5. New design and planning already completed

Approved design commit:

```text
eedccb0 docs: design local demo accounts and staff invitations
```

Implementation-plan commit:

```text
c3648b4 docs: add demo account and staff invitation plans
```

Both plans received independent backend, frontend, security, and concurrency review before implementation began.

## 6. Plan A implementation completed so far

### Task 1 — identity catalog and account kind

Commit:

```text
18c405d feat: classify development demo accounts
```

Implemented:

- Internal `accountKind`: `standard | development_demo`.
- Exact 21-identity reserved registry used for security checks.
- Exact 16-account writable canonical development catalog in `ROLE_CODES` order.
- Reserved identity predicate is independent: demo marker OR exact reserved User ID OR exact normalized reserved email.
- Lookup sets remain module-private; callers cannot mutate the security registry.
- Legacy Mongo/memory users missing `accountKind` map to `standard`.
- New ordinary Users default to `standard`.
- All 21 explicit destructive-seed Users are marked `development_demo`.
- Public/auth/admin DTOs still omit `accountKind`.

Evidence:

- Focused tests: 138/138.
- Backend typecheck passed.
- Independent task review: clean.

### Task 2 — exact local runtime authorization

Commits:

```text
e8582ab feat: authorize local demo startup
0d1fb26 fix: reject malformed demo Mongo URIs
```

Implemented:

- Dependency-free startup authorization module.
- Runtime must be exactly `development`.
- Development HTTP bind host must be exactly `127.0.0.1`.
- Mongo URI must use `mongodb:`, one exact loopback host (`127.0.0.1` or bracketed `::1`), no username/password, and exact decoded database `lisno_demo`.
- SRV, remote, multi-host, hostname `localhost`, wrong database, malformed percent escape, and any fragment delimiter fail closed.
- Capability is frozen and runtime-unforgeable through module-private issuance facts/identity.
- Post-connect assertion requires exact `lisno_demo` plus object identity between the default Mongoose connection and `UserModel.db`.
- Direct peer helper accepts IPv4 `127/8`, `::1`, and IPv4-mapped `127/8`; malformed/missing/remote addresses fail closed.
- Missing `NODE_ENV` defaults to development only inside the development launcher helper; explicit production/test values remain explicit and cannot authorize.

Evidence:

- Focused tests after review fix: 53/53.
- Typecheck passed.
- Original review found malformed URI gaps; fix round closed them and scoped re-review passed.

### Task 3 — transactional non-destructive preparation

Commit:

```text
414c081 feat: prepare demo accounts non-destructively
```

Implemented `ensureDevelopmentDemoAccounts`:

- Calls the real capability/database/model-connection assertion before its first User read.
- Uses one User-only Mongo transaction.
- Preflights all 16 canonical IDs and normalized emails before the first write.
- Missing exact profiles are inserted with version 1 and one invocation timestamp.
- Exact ID/email rows are repaired only through the catalog-owned allowlist:
  - `name`
  - `email`
  - `emailNormalized`
  - `passwordHash`
  - `role`
  - `active`
  - `accountKind`
  - `title`
  - `managerId`
  - `authorizedClientIds`
  - plus `updatedAt`
- A repair preserves `createdAt`, mobile, address, avatar, and unknown fields and increments `version` exactly once through CAS.
- A canonical row is a literal no-op: stable version and timestamps.
- ID-only, email-only, and crossed-record collisions abort before any write.
- Concurrent startup converges through User transaction/unique/CAS/retry behavior; no coordination/sentinel document is created.
- Unrelated Users and Projects remain byte-identical.
- The destructive seed runner is never imported or invoked by automatic preparation.

Evidence:

- Focused unit/replica tests: 15/15.
- Full backend at that checkpoint: 56 files / 1005 tests.
- Typecheck passed.
- Independent task review: clean.

### Task 4 — startup lifecycle and loopback listener

Commit:

```text
345218d feat: bootstrap demo accounts before local listen
```

Implemented:

- Testable development startup orchestrator.
- Authorization occurs before loading server/bootstrap/model modules.
- Lifecycle order is connect → prepare demo Users → repository → app → listen.
- Bootstrap writer remains lazily imported until the post-connect preparation hook executes.
- Preparation failure disconnects exactly once, creates no repository/app/listener, and prints no readiness output.
- Development server binds explicitly to `127.0.0.1` through the host-aware listen overload.
- Default/production startup retains the previous unspecified-host listener behavior and receives no demo preparation hook/capability.
- Capability is carried through `AppDependencies`; request-time consumption was added in Task 5.

Evidence:

- Focused lifecycle/loading tests: 32/32.
- Typecheck passed.
- Independent task review: clean, including import-graph verification.

### Task 5 — request-time confinement implemented, review not complete

Commit:

```text
aaa37ec fix: confine demo authentication to local development
```

Implemented production behavior:

- Internal auth methods now receive direct socket context for login, Client signup, and JWT authentication.
- Express routes/middleware pass only `request.socket.remoteAddress`.
- The implementation does not trust `request.ip`, `X-Forwarded-For`, `Host`, or CORS.
- Login performs the real/dummy bcrypt comparison before generic demo/origin denial.
- JWT authentication verifies signature and shape, reloads the current stored active User, validates exact stored role, then applies peer/demo rules.
- Two independent enforcement rules:
  1. exact built-in development JWT secret + non-loopback peer denies every human login/JWT/signup;
  2. reserved demo identity requires a real issued capability and loopback peer.
- A capability with a custom non-built-in JWT secret does not independently deny a remote standard User.
- Exact reserved Client normalized email is rejected before the remote-secret rule and before transaction/bcrypt/coordination/User/project/audit work, returning the existing `409 ACCOUNT_EXISTS`.
- Non-reserved real Client behavior remains unchanged.
- Demo login denial is generic `INVALID_CREDENTIALS`; demo JWT denial is generic `INVALID_TOKEN`; non-reserved remote Client signup under the built-in secret is generic 401 rather than 500.
- Tests use an explicit helper that mints the real capability; there is no `NODE_ENV=test` or global production bypass.

Evidence:

- Focused auth/route-registry tests: 144/144.
- Backend typecheck passed.
- Full backend: 57 files / 1055 tests.
- One earlier full run produced a transient 401; it passed isolated and in the immediate full rerun without a code change. This chronology is retained in the Task 5 report.

## 7. Local demo-account behavior and credentials

Automatic bootstrap creates one canonical identity for each of the 16 roles. All use:

```text
Password: LisnoDemo2026!
```

| Role | Email |
|---|---|
| Super Admin | `super-admin@lisno.example` |
| Admin | `admin@lisno.example` |
| Estimator / Sales | `sales@lisno.example` |
| Designer | `ananya@lisno.example` |
| Procurement | `procurement@lisno.example` |
| Finance Head | `finance-head@lisno.example` |
| Site Manager | `site-manager@lisno.example` |
| Electrician | `worker-electrician@lisno.example` |
| Plumber | `worker-plumber@lisno.example` |
| Carpenter | `worker-carpenter@lisno.example` |
| Painter | `worker-painter@lisno.example` |
| Civil Worker | `worker-civil@lisno.example` |
| Other Worker | `worker-other@lisno.example` |
| Design Manager | `aarav@lisno.example` |
| Design Head | `head@lisno.example` |
| Client | `client@aurora.example` |

The security registry reserves 21 historical/demo identities so older seeded demo rows also cannot authenticate remotely. Automatic bootstrap creates/repairs only the 16 canonical rows above.

Expected local target:

```text
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/lisno_demo?replicaSet=rs0
```

Normal intended start after Plan A completion:

```bash
cd backend
npm run dev
```

No manual seed command should be needed. `npm run seed` remains a separate, guarded, destructive full reset and must never be used for normal startup or production identity provisioning.

Current documentation warning: root `README.md` and `backend/README.md` still describe the old manual-seed workflow and omit Estimator/Sales from their tables. Updating those documents is unfinished Task 6. Until Task 6 lands, follow this report and Plan A rather than the README seed setup for ordinary local development.

## 8. Plan A Task 5 open review findings

The independent reviewer approved the production enforcement but found two Important test-scope gaps. Task 5 is not complete until both are fixed and re-reviewed.

### Finding 1 — capability fixture is too broad in one test file

`backend/tests/user-administration.test.ts` applies the demo capability through a file-level wrapper, including apps that use only standard, non-reserved Users.

Required fix:

- Remove the blanket wrapper behavior.
- Pass the capability only to individual app fixtures that authenticate canonical reserved demo identities.
- Preserve at least one standard/non-reserved app path without a capability.
- Add/adjust a regression that would fail if the capability is again injected globally.

### Finding 2 — JWT peer-boundary matrix is incomplete

Existing missing/malformed-address and spoofed-`X-Forwarded-For` cases cover login but not the bearer/JWT middleware path.

Add JWT-path tests for:

- missing `request.socket.remoteAddress`;
- malformed socket address;
- remote socket plus spoofed `X-Forwarded-For: 127.0.0.1`.

Each must prove the signed demo/reserved JWT is rejected generically and that a forwarded header cannot override the direct socket.

### Required Task 5 fix workflow

Use the original Task 5 brief and strict RED/GREEN discipline:

```text
.superpowers/sdd/2026-08-18-local-demo-accounts/task-5-brief.md
.superpowers/sdd/2026-08-18-local-demo-accounts/task-5-report.md
```

1. Add the focused failing regressions first.
2. Run and record the expected RED.
3. Make the minimum test-fixture/helper adjustment.
4. Run:

```bash
cd backend
npm test -- tests/auth.test.ts tests/auth-authorization.test.ts tests/development-demo-accounts.test.ts tests/user-administration.test.ts tests/route-operation-registry.test.ts --reporter=dot
npm run typecheck
npm test -- --reporter=dot
```

5. Commit the focused fix separately.
6. Append Fix Round 1 evidence to the Task 5 report.
7. Generate a diff package from `aaa37ec` to the fix HEAD and obtain scoped re-review.
8. Mark Task 5 complete only when both findings are `ADDRESSED` with no new Critical/Important breakage.

The reviewer also noted that default-startup coverage is compositional: Task 4 proves dependency handoff while Task 5 tests remote denial through a constructed app. This is not currently classified as a production finding; retain it as a review caveat for Plan A’s final security review.

## 9. Plan A Task 6 remaining work

Files:

- `backend/.env.example`
- `backend/README.md`
- root `README.md`

Required documentation:

- Normal local workflow is only `cd backend && npm run dev`.
- Automatic preparation non-destructively ensures the 16 canonical Users in exact local `lisno_demo`.
- Restart repairs catalog-owned reserved fields but preserves project/workflow data.
- Development API binds loopback.
- Include all 16 accounts, including Estimator/Sales.
- Keep `npm run seed` in a clearly separate **Optional destructive full reset** section with exact flags and warning.
- Demo identities cannot authenticate through normal/remote deployment.
- Real staff provisioning is the separate Plan B invitation flow.
- Automatic insertion of the canonical Client does not retroactively claim old projects.

Static security/scope searches:

```bash
rg -n "deleteMany|replaceOne|resetAuthorizedSeedCollections|seedMongoDatabase" backend/src/development backend/src/dev.ts
rg -n "X-Forwarded-For|x-forwarded-for" backend/src/development backend/src/services/auth.service.ts backend/src/middleware/auth.ts backend/src/routes/auth.ts
rg -n "LisnoDemo2026|DEMO_ACCOUNT" frontend/src
```

Expected: no destructive-development coupling, no production forwarding-header authority, and no frontend credential literal.

Focused/final Plan A gate:

```bash
cd backend
npm test -- tests/development-demo-account-catalog.test.ts tests/development-demo-authorization.test.ts tests/development-demo-accounts.test.ts tests/development-demo-accounts-mongo.replica-set.test.ts tests/development-env.test.ts tests/development-processes.test.ts tests/server.test.ts tests/auth.test.ts tests/auth-authorization.test.ts tests/seed.test.ts --reporter=dot
npm run typecheck
npm run build
npm test -- --reporter=dot
```

Then request an independent security review covering capability forgery, import order, connection/model identity, collision atomicity, repair allowlist, direct-socket normalization, remote/default denial, reserved Client behavior, DTO non-leakage, and destructive-seed separation.

Planned Task 6 commit:

```text
docs: explain automatic local demo accounts
```

Do not begin Plan B until Task 5 fixes, Task 6, the full gate, independent review, and clean-worktree completion are all satisfied.

## 10. Plan B — real staff invitations (not started)

Plan B has 12 sequential tasks. No invitation model, API, SMTP adapter, frontend panel, or public acceptance page has been implemented yet.

### Target outcome

A current active stored Super Admin can invite any non-Client role, including Super Admin. The recipient receives a secure 24-hour single-use link, selects a 12–128 character password, and becomes an active ordinary `standard` User who can log in against a remote backend. Admin cannot invite. Client remains on the separate signup/project-linking path.

### Core security invariants

- Separate `UserInvitation`; no inactive User at invite time.
- Staff role is every role except `client`.
- Generate 32 CSPRNG bytes, encode as a 43-character base64url token, and persist only its SHA-256 digest.
- Token/digest/link/password/SMTP body must never enter API DTOs, logs, audits, analytics, errors, browser storage, React Query cache, router state, or query parameters.
- Link uses `/accept-invitation#token=<base64url>` with HTTPS production frontend origin.
- Public page removes the fragment before its first API call while preserving React Router history state.
- Validity is pending + issuer still active/current Super Admin with exact version + future expiry + no User collision + no unclaimed Client project.
- Expiry equality is expired; no TTL deletion of invitation history.
- Resend rotates the same record and invalidates the previous generation.
- A newer create supersedes the prior pending invitation and creates a new record.
- Revoke/accept/supersede clear token hash.
- Authoritative lock order is authorization coordination then normalized-email coordination.
- Acceptance cheaply validates before bcrypt, then rechecks every authority/state invariant transactionally.
- Acceptance creates one `standard` active User with bcrypt cost 12 and no Client project linking; it returns `{accepted:true}` and no JWT.
- Client signup does not consult invitations. Email/User/project races are serialized through existing coordination and must not create a staff Client or orphan an unclaimed project.
- SMTP happens after DB commit. Failure does not roll back invitation.
- Stale delivery callback may audit `matched:false` but cannot change current/terminal telemetry or semantic version.
- A reserved/demo actor must never invoke an external SMTP adapter.
- Production SMTP/config must fail closed before Mongo/listen; no production fallback to a local/test adapter.
- Public inspect/accept use an isolated rate limiter and generic byte-equivalent unavailable response.

### New permissions and policy contract

Add after `identity.users.update` and before `access_request.create`:

```text
identity.user_invitations.read
identity.user_invitations.create
identity.user_invitations.resend
identity.user_invitations.revoke
```

Only Super Admin receives these permissions.

Target totals:

```text
Policy version: 2026-08-18.staff-invitations.v1
Permissions: 95
Human-JWT operations: 97
Frontend permission-route registry: remains 18
```

The four protected operations use `identity_provisioning` availability.

### Planned APIs

| Method/path | Purpose |
|---|---|
| `GET /api/v1/admin/user-invitations` | Super Admin invitation list; canonical query order `search,role,status,deliveryStatus,limit,offset` |
| `POST /api/v1/admin/user-invitations` | Create invitation |
| `POST /api/v1/admin/user-invitations/:invitationId/resend` | Rotate/resend exact version |
| `POST /api/v1/admin/user-invitations/:invitationId/revoke` | Revoke exact version |
| `POST /api/v1/auth/user-invitations/inspect` with `{token}` | Inspect raw token via POST body; no-store; every unavailable state is identical `410 INVITATION_UNAVAILABLE` |
| `POST /api/v1/auth/user-invitations/accept` with `{token,password,passwordConfirmation}` | Accept once; success is `201 {data:{accepted:true}}` with no JWT; every unavailable state is identical no-store `410 INVITATION_UNAVAILABLE` |

Protected order: authenticate → exact operation → delivery limiter where applicable → strict validation → service.

Public order: no-store → isolated public IP limiter → token normalization → strict validation → service. Public routes do not receive human-JWT operation markers.

### Planned persistence

Stored statuses:

```text
pending | accepted | revoked | superseded
```

Effective statuses additionally include:

```text
expired | invalidated
```

Delivery statuses:

```text
queued | sent | failed
```

Important model/repository rules:

- `tokenHash` is `select:false`.
- No TTL index.
- No unique pending-email index; normalized-email coordination plus transaction is authoritative.
- Exact indexes include partial unique string token hash and partial unique string accepted User ID, plus email/status/history and status/expiry indexes.
- At most one stored-pending invitation per normalized email.
- Memory/Mongo parity is required.
- Admin aggregation derives effective status before filter/pagination.
- Legacy issuer missing User version is treated as version 1.
- Delivery telemetry uses exact ID/pending/generation predicates and does not increment semantic version.

Required audit actions:

```text
user_invitation.created
user_invitation.superseded
user_invitation.delivery_sent
user_invitation.delivery_failed
user_invitation.resent
user_invitation.revoked
user_invitation.accepted
user.invited_created
```

### SMTP/configuration target

- Add `nodemailer` and `@types/nodemailer` only; do not install the obsolete standalone `smtp-connection` package.
- Use Nodemailer's bundled `nodemailer/lib/smtp-connection` through a narrow local TypeScript declaration.
- Each physical send owns one isolated connection.
- Enforce a real 10-second wall-clock deadline by closing that exact connection, settling once, and clearing the timer.
- Test cancellation with a real local trickling SMTP socket, not only a mocked `.close()`.
- Require the complete production group `PUBLIC_FRONTEND_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM`; the frontend URL must be an HTTPS origin, and partial/unsafe configuration must fail before Mongo/listen.
- Address fields must be library objects, HTML escaped, TLS certificate verification enabled, and provider click tracking/logging disabled.
- Rate limit create/resend and public inspect/accept independently: 20 attempts per actor+socket or socket IP per 15 minutes, bounded to 10,000 entries, with integer `Retry-After`.

### Frontend target

- Add Super Admin invitation controls to existing `/admin/users`; do not add a new protected registry route.
- Admin sees no invitation panel and makes zero invitation requests.
- Each UI action requires its exact permission.
- Role options come only from server `invitableRoles` and exclude Client.
- No token/password/project/assignment/impersonation display or input in Admin controls.
- No optimistic invitation transitions; mutations use `retry:false`.
- Version conflicts keep dialog open and set a lifetime conflict latch until close/reopen.
- Add direct public `/accept-invitation` route outside the 18-entry permission registry.
- Add `apiClient.postPublic`, which never reads/sends stored JWT and never triggers authenticated-session 401 handling.
- Fragment token is held only in component memory, stripped in a layout step before inspect, and never cached/persisted/logged.
- Existing authenticated session blocks acceptance until explicit logout and is never replaced.
- Acceptance success links to normal login; it does not auto-login.

### Plan B ordered tasks

| # | Work | Exact planned commit |
|---|---|---|
| 1 | Invitation domain, model, repository types, indexes, audit vocabulary, seed collection | `feat: define staff invitation state model` |
| 2 | Memory/Mongo persistence, CAS transitions, effective-status paging/redaction | `feat: persist staff invitations transactionally` |
| 3 | SMTP config, secure mail adapter, bundled connection declaration, rate limiters, app/server injection | `feat: add secure invitation email delivery` |
| 4 | Protected list/create/resend/revoke service and post-commit delivery helper | `feat: implement staff invitation administration` |
| 5 | Public token inspect and one-time atomic acceptance | `feat: accept one-time staff invitations` |
| 6 | Exact routes, permissions, policy/operation parity, backend/frontend contract parity | `feat: expose staff invitation APIs` |
| 7 | Real Mongo concurrency/race proof; production changes only for reproduced defects | `test: prove staff invitation race safety` |
| 8 | Frontend invitation types, authenticated Admin API, isolated public API transport | `feat: align frontend staff invitation contracts` |
| 9 | Super Admin directory panel and create/resend/revoke dialogs | `feat: add Super Admin invitation controls` |
| 10 | Secure fragment-scrubbing public acceptance page | `feat: add secure invitation acceptance` |
| 11 | Frontend accessibility, keyboard, responsive, and regression coverage | `test: verify invitation frontend integration` |
| 12 | Deployment docs, full cross-stack verification, final security review | `docs: document staff invitation delivery` |

Tasks must remain sequential because they share model/repository/service/API contracts.

### Plan B execution rulings already recorded

1. Task 3 owns `backend/src/types/nodemailer-smtp-connection.d.ts` and stages it with the SMTP implementation.
2. Task 11 stages `frontend/src/app/router.test.tsx` only if that task actually modifies it.
3. Task 12 is documentation-only. Any final-review production/test fix returns to its owning task and receives that task's regression/review.

## 11. Deployment and safety status

| Scenario | Status at handoff |
|---|---|
| Local development with exact `lisno_demo` replica set | Automatic demo bootstrap implemented; Task 5 test hardening and final Task 6 verification still required |
| Manual local seed | Still available but destructive and not the normal intended workflow |
| Remote demo-account login | Production enforcement implemented; final Plan A completion review still required |
| Remote login for an existing real standard User with a real secret | Preserved |
| Create/invite a new real staff User remotely | Not implemented until Plan B |
| First real production Super Admin | Operator provisioning required; intentionally not implemented |
| Public Client signup/project claiming | Existing behavior preserved, but public production remains blocked until Client email control is verified |
| Production readiness for this follow-up | No |

Do not deploy the public demo password or the built-in development JWT secret as remote credentials. CORS is not an authentication/network boundary.

## 12. Local prerequisites and start commands

Prerequisites:

- Node.js 20+
- npm
- Python 3.11+ for OCR
- MongoDB replica set; transactions are mandatory

Dependency setup:

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../ocr-worker
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test,model]"
```

Local Mongo example:

```bash
mkdir -p .local/mongo-rs0
mongod --dbpath .local/mongo-rs0 --replSet rs0 --bind_ip 127.0.0.1
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
```

Backend environment must use the exact local target for automatic demos:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/lisno_demo?replicaSet=rs0
```

Start:

```bash
# Terminal 1 — backend + OCR worker
cd backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
```

Backend-only development:

```bash
cd backend
npm run dev:backend
```

## 13. Verification evidence and known warnings

Latest recorded Task 5 evidence:

```text
Focused auth + route registry: 144/144 passed
Backend full suite: 57/57 files, 1055/1055 tests passed
Backend typecheck: passed
```

Known non-blocking warnings observed in earlier full gates:

- Mongoose warns that `new` on `findOneAndUpdate`/`findOneAndReplace` is deprecated in favor of `returnDocument: "after"`.
- Frontend Vite build previously warned that the main JS chunk exceeds 500 kB.

These warnings predate the current follow-up and did not fail verification, but they should remain visible rather than being silently suppressed.

## 14. Commit inventory for this initiative

```text
eedccb0 docs: design local demo accounts and staff invitations
c3648b4 docs: add demo account and staff invitation plans
18c405d feat: classify development demo accounts
e8582ab feat: authorize local demo startup
0d1fb26 fix: reject malformed demo Mongo URIs
414c081 feat: prepare demo accounts non-destructively
345218d feat: bootstrap demo accounts before local listen
aaa37ec fix: confine demo authentication to local development
```

## 15. Instructions for the next Codex account

Use subagent-driven development and strict TDD, as required by the plans.

At session start:

```bash
cd /Users/apple/Desktop/personal/lisno
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected implementation checkpoint before the handoff-document commit:

```text
feature/phase1_module1
aaa37ecdeef9efa4059d4e1dc767036182cc758b
clean status
```

Read, in order:

1. this handoff report;
2. the approved design spec;
3. Plan A Task 5 and Task 6;
4. Plan A ledger and Task 5 report if the local `.superpowers` directory is present;
5. Plan B only after Plan A passes its completion gate.

Do not:

- run the destructive seed for normal development;
- weaken demo/remote denial for convenience;
- trust forwarded headers for peer authority;
- expose `accountKind`, token hashes, raw invitation tokens, passwords, or SMTP details in DTOs/logs/audits;
- implement invitation acceptance with JWT invitation tokens;
- pre-create inactive Users on invitation send;
- let Admin or Client administer staff invitations;
- modify Client signup/project linking except the already-approved exact reserved-demo boundary;
- begin Prompt 2;
- hide production/test fixes inside the final documentation task;
- claim production readiness before Plan B and the independent final gates are complete.

## 16. Definition of completion

This follow-up initiative is complete only when:

1. Plan A Task 5 review findings are fixed and re-reviewed.
2. Plan A Task 6 docs/static/focused/replica/typecheck/build/full-suite/security-review gates pass.
3. Plan B Tasks 1–12 are implemented sequentially with per-task RED/GREEN evidence and review.
4. Real Mongo invitation races pass.
5. Frontend fragment handling, session isolation, accessibility, and hostile-base-URL full suite pass.
6. Production SMTP configuration fails closed and real timeout cancellation is proven.
7. The worktree is clean and all intended commits are present.

Even after this initiative, public production readiness remains **NO** until Client email ownership verification and the separate first-production-Super-Admin operating procedure are approved and implemented.
