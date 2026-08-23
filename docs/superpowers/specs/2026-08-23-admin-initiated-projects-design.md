# Admin-Initiated Projects Design

**Date:** 2026-08-23

**Status:** Implemented and verified

**Scope:** Admin project initiation and estimator handoff only

## Goal

Replace the regular Admin's user-directory landing page with a **My Projects**
workspace. An Admin can initiate a project, must assign one active
Estimator/Sales user, and can then see only projects that Admin initiated. The
assignment creates a linked lead in the estimator's existing workspace so the
current estimate builder can be used later without giving Admin broad user or
estimate access.

## Approved product decisions

| Decision | Approved outcome |
|---|---|
| Admin landing | Regular Admin lands on `/admin/projects`. |
| Admin navigation | Show **My Projects** and the existing **Access requests** item. |
| User directory | **Users** is Super Admin-only in the UI and API. |
| Project visibility | Admin lists and reads only projects covered by that Admin's active `admin_initiator` / `projects` grant. |
| Estimator assignment | Selecting one active `estimator_sales` account is mandatory during initiation. |
| Estimator handoff | Initiation automatically creates one linked lead owned by the selected estimator. |
| Initiation form | Reuse the fields visibly rendered by the current New Lead dialog except Source, then add the mandatory estimator selector. Backend-only optional Lead fields are not added. |
| Lead source | The server records `admin_project`; the client neither renders nor submits Source. |
| Estimate work | The selected estimator uses the current Leads & estimates workspace and existing estimate builder. |
| Project reuse | An estimate linked to an Admin-created project updates that project at approval; it never creates a duplicate. |
| Legacy compatibility | Estimator-created leads without a project retain the current approval-time project-creation behavior. |
| Explicit exclusions | No Admin estimate editing, reassignment, project editing, approval proof, client-approval override, or wider Prompt 2 lifecycle is added here. |

## Current-state findings

The current regular Admin home is `/admin/users`, and the Admin role has
`identity.users.read` and `identity.users.update`. That page is a real staff
directory, not a mislabeled project list.

Backend project reads are already default-deny for Admin. `GET /projects`
resolves Admin scope only from active `admin_initiator` grants for the
`projects` module. The memory and Mongo repositories implement the same rule,
and per-project reads use it too. The missing piece is creation: only Designer
can currently call the project-creation service, and no production flow creates
an Admin initiator grant.

The existing estimate workflow is lead-first and owned by Estimator/Sales. An
estimate is unique by lead and normally receives a `projectId` only when client
approval creates a project. Therefore this feature must link the Admin-created
project, generated lead, and later estimate while preserving the legacy branch.

## Approaches considered

### 1. Real project plus linked estimator lead — selected

Create the Project, Admin initiator grant, and estimator-owned Lead atomically.
The Admin receives true project scope immediately; the estimator receives work
through the existing lead boundary. A later estimate adopts the existing
project identifier.

This requires a small evolution of the Project and Lead models and an
approval-time reuse branch, but it keeps authorization and domain language
truthful.

### 2. Treat a lead as a temporary project

Render Admin-created leads under the label "My Projects" and create the real
Project only after estimate approval.

This is a smaller initial change, but Admin would not own a real project,
`admin_initiator` scope and access-request review could not activate, and the UI
would use project language for a different resource.

### 3. Reuse Designer project creation with placeholder assignments

Populate `initiatingDesignerId`, `managerId`, or assigned designers with dummy
or unrelated accounts so the current Project schema accepts the row.

This is rejected because it corrupts ownership, responsibility counts,
authorization, audit history, and later design assignment.

## Domain model

### Project

An Admin-created Project remains the canonical project record from initiation
through later approval. It stores the selected estimator in a nullable
`assignedEstimatorId` field. Existing projects have `null` unless a later
explicit flow assigns an estimator.

The existing design-team fields must represent real relationships:

- `initiatingDesignerId` becomes nullable;
- `managerId` becomes nullable;
- `assignedDesignerIds` may be empty.

Admin-created projects initially use `null`, `null`, and `[]` respectively.
They must not use placeholder Designers or Design Managers. Existing
Designer-created projects retain their current non-null relationships and
behavior. Relationship-based access checks and responsibility counts become
null-safe without broadening scope.

The compatibility change is explicit across the Mongoose schema,
`ProjectRecord` and frontend `Project` contracts, Mongo mapping, memory
fixtures, relationship predicates, project filters, responsibility counts,
hierarchy reads, and every service that consumes `initiatingDesignerId` or
`managerId`. Missing fields on existing Mongo rows map to `null`; existing rows
already containing valid IDs are not rewritten. No data backfill is required,
but schema/type consumers must all be updated and regression-tested together.

The Admin creator is represented by the active `admin_initiator` project grant,
which remains the authorization source of truth. The Project does not duplicate
that user identifier in a second ownership field.

The initial project values are:

- `name`: submitted project/property name;
- normalized client identity fields using the existing client-email rules;
- `clientId`: the matching existing Client account ID, or `null` when no Client
  account exists, matching the current project-linking behavior;
- `clientAddress`: submitted location, matching the current estimate-to-project
  behavior;
- `location`: submitted location;
- `assignedEstimatorId`: validated selector value;
- `status`: existing `planning` status;
- `plannedStartAt`: initiation time;
- `plannedEndAt`: initiation time plus the existing 90-day planning default;
- design-team relationships: unassigned as described above.

No new broad project-lifecycle status set is introduced in this slice.

### Lead

Lead gains a nullable `projectId`. Admin initiation creates exactly one Lead
whose:

- `projectId` is the new Project ID;
- `ownerId` is the selected Estimator/Sales user;
- `source` is the server-owned value `admin_project`;
- `stage` is the existing `new_lead` stage;
- client, property, budget, next-action, and date values come from the form.

A partial unique index on non-null `projectId` enforces at most one lead per
pre-created project. Legacy leads keep `projectId: null`; no backfill or data
migration is required.

For every linked handoff, `lead.ownerId` must equal
`project.assignedEstimatorId`. Creation establishes that invariant, ordinary
updates cannot change either side, and estimate approval verifies it before
using the Project link.

For a linked Lead, `projectId`, `ownerId`, the server-owned `admin_project`
source, client identity fields, project name, and location are immutable
through the ordinary Lead update route. `projectId` and `ownerId` are already
absent from its public update schema; the service rejects attempted changes to
the other linked identity fields. Property type, budgets, stage, next action,
next-action date, and follow-up behavior retain their existing update rules.

The Project is authoritative for project name, client identity, and location
shown to Admin. The linked Lead is the live source for property type, budgets,
stage, next action, and next-action date, so Admin sees estimator progress
rather than an initiation-time snapshot. A future UI for coordinated linked
identity editing is outside this slice.

### Estimate

Estimate already supports nullable `projectId` and unique `leadId`. When an
estimate is first saved for a lead with `projectId`, it copies that exact value.
If an older draft has no project link but its lead now has one, the next valid
save backfills the link. Conflicting non-null Lead and Estimate project IDs
are rejected rather than silently rewritten.

## API design

### List Admin projects

`GET /api/v1/admin/projects?limit=<n>&offset=<n>` returns `200` with a stable,
created-newest-first page. For regular Admin, counting and pagination happen
after applying the existing exact active-initiator-grant scope.

A dedicated Admin-summary repository query performs this ordering with
`createdAt DESC, id DESC`; it does not reuse the generic project pager's
name-based ordering. Scope is resolved before Lead or Estimate joins. The
joined DTO is a projection only and never grants Admin permission to the Lead
or Estimate routes whose IDs it names.

Each `AdminProjectSummary` contains only what the workspace needs:

```ts
interface AdminProjectSummary {
  id: string;
  name: string;
  status: "planning" | "active" | "on_hold" | "completed";
  location: string;
  client: {
    name: string;
    email: string;
    mobile: string;
  };
  propertyType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  estimator: null | {
    id: string;
    name: string;
    email: string;
  };
  lead: null | {
    id: string;
    stage: string;
    nextAction: string;
    nextActionAt: string;
  };
  estimate: null | {
    id: string;
    status: string;
    total: number;
  };
  createdAt: string;
}
```

The handoff fields are non-null for projects created through this flow. They
remain nullable in the transport contract so a Super Admin global read or an
older manually granted project cannot fabricate an estimator or lead
relationship. The UI renders those exceptional records as unassigned rather
than hiding the project or inventing data.

The detail endpoint, `GET /api/v1/admin/projects/:projectId`, returns `200` with
the same resource and the full captured initiation fields. A project outside
the caller's initiator scope returns the existing non-disclosing `404`
response.
The Admin frontend uses these purpose-built summary/detail endpoints rather
than the generic project-hierarchy response.

Super Admin's existing global-read policy remains intact at the backend, but
its home and navigation remain the Super Admin user directory; this feature
does not add a Super Admin project dashboard.

### Initiate a project

`POST /api/v1/admin/projects` is available only to an actor whose current
stored role is exactly `admin`; it returns `201` and accepts this strict body:

```ts
interface InitiateAdminProjectInput {
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: number;
  budgetMax: number;
  nextAction: string;
  nextActionAt: string;
  estimatorId: string;
}
```

`source` is not accepted. Unknown fields are rejected. Strings are trimmed,
email uses the existing normalization and internal-account collision rules,
budgets are non-negative with `budgetMax >= budgetMin`, and `nextActionAt` must
be a valid offset-aware timestamp.

The service reloads the active current actor and validates that the selected
user is still active with the exact `estimator_sales` role at commit time.
Missing, inactive, or wrong-role selections return a field-addressable `400`
error without revealing unrelated directory data.

This create operation follows the application's current non-idempotent create
semantics: each accepted submission is a deliberate new Project. The client
disables repeat submission while the request is pending, and transport code
must not automatically retry this POST. Content-based deduplication is not
introduced because two projects may legitimately have identical client and
property fields. Approval-time Project reuse remains duplicate-safe as
specified below.

### Estimator options

`GET /api/v1/admin/estimators?search=<text>&limit=<n>&offset=<n>` returns `200`
with only active Estimator/Sales options containing `id`, `name`, `email`, and
nullable `title`.
It never returns mobile, address, role-management metadata, responsibilities,
or other staff roles. Search and pagination use the existing bounded patterns.

This endpoint replaces any need for the regular Admin to read the staff
directory.

## Atomic initiation flow

The project initiation service performs these operations in one repository
transaction:

1. Reload and validate the active Admin actor.
2. Reload and validate the selected active Estimator/Sales account.
3. Coordinate and validate the normalized client email using the existing
   client-linking rules.
4. Create the Project.
5. Create one active ProjectAccessGrant with:
   - `userId`: initiating Admin;
   - `projectId`: new Project;
   - `module`: `projects`;
   - `source`: `admin_initiator`;
   - `grantedById`: initiating Admin.
6. Create the linked estimator-owned Lead with server source `admin_project`.
7. Append the existing `project_created`, `project_access.granted`, and
   `lead_created` audit events without storing passwords or unnecessary client
   data.
8. Commit and return the Admin project summary.

Any validation, persistence, uniqueness, or audit failure rolls back the
Project, grant, Lead, and all associated audit writes. The memory and Mongo
repositories must expose equivalent outcomes.

The audit payloads use an explicit allowlist:

- `project_created`: `{ status: "planning", assignedEstimatorId }`;
- `project_access.granted`: `{ projectId, userId, module: "projects", source:
  "admin_initiator" }`;
- `lead_created`: `{ stage: "new_lead", projectId, ownerId }`.

Client name, email, mobile, location, budgets, next action, and free text are
not copied into audit `oldValues` or `newValues`.

## Estimate handoff and approval compatibility

The selected estimator sees the generated lead through the existing
owner-filtered lead query. Other estimators do not see it; Super Admin retains
the existing explicit global-read exception. The current lead detail, Start
Estimate, Continue Estimate, estimate calculations, PDF output, review
workflow, and client estimate UI remain unchanged.

On the first estimate save, the Estimate adopts the Lead's `projectId`. During
client approval:

- when `estimate.projectId` is non-null, the transaction loads that Project,
  verifies the Lead/Estimate/Project relationship, links the client, and writes
  the real assigned Designer and Design Manager resolved by the existing
  approval logic to that Project; `initiatingDesignerId` remains `null` because
  the Admin, not that Designer, initiated the project;
- it updates the Estimate to the existing approved state with the same
  `projectId`;
- it retains the Admin initiator grant;
- it creates no second Project;
- if the linked Project is missing or mismatched, it fails closed with a
  conflict and rolls back;
- when `estimate.projectId` is null, the current legacy approval branch creates
  a Project exactly as it does today.

This branching preserves existing estimator-originated work while making
Admin-originated work identity-stable from initiation onward.

The implementation preserves the repository split already present in the
codebase. Project/Lead/grant/audit initiation uses
`AppRepository.runInTransaction` and is verified against memory and Mongo
adapters. Estimate save and client approval continue in the existing Mongoose
path; the approval branch updates Project and Estimate inside its existing
Mongo transaction and is covered by Mongo integration tests. This feature does
not move all Estimate persistence into `AppRepository`.

## Authorization changes

The canonical permission catalog adds `projects.initiate` for Admin project
initiation and `organization.estimators.read` for active-estimator option
reads. The frontend authorization contract mirrors both exact names. The list
and detail routes reuse `projects.list` and `projects.read`. Route-operation
registry entries classify the new list, detail, option, and initiation routes,
and the registry availability catalog gains `prompt_2` for this staged slice.

| Operation | Permission | Scope | Class | Super Admin behavior |
|---|---|---|---|---|
| `GET /admin/projects` | `projects.list` | Project / `projects` | read | global read |
| `GET /admin/projects/:projectId` | `projects.read` | Project / `projects` | read | global read |
| `POST /admin/projects` | `projects.initiate` | Project / `projects` | personal | deny personal |
| `GET /admin/estimators` | `organization.estimators.read` | Non-project / organization | read | global read |

Regular Admin loses:

- `identity.users.read`;
- `identity.users.update`.

Both `GET /admin/users` and `PATCH /admin/users/:userId` therefore return `403`
for Admin even if called directly. Their services also retain a Super
Admin-only role guard as defense in depth. Super Admin keeps current user-list
and mutation behavior.

The lockdown is synchronized across the backend role-permission map,
route-operation contracts, user-administration service guards, frontend
authorization contract, role home mapping, route presentation roles, sidebar
navigation, and their contract/security tests. No layer continues to describe
regular Admin as a user-directory manager.

Admin retains existing access-request review permissions and `projects.list` /
`projects.read`. Its project reads continue to rely on the exact active
`admin_initiator` grant. A grant for another module, an inactive grant, a grant
belonging to another Admin, or a guessed ID never supplies scope.

The estimator selector endpoint returns a purpose-built option DTO, not a
redacted version of the general user directory. Estimator lead and estimate
authorization remains owner-based.

## Frontend design

### Routing and navigation

- Change regular Admin home from `/admin/users` to `/admin/projects`.
- Register `/admin/projects` and `/admin/projects/:projectId` for Admin.
- Add **My Projects** to Admin side navigation.
- Keep **Access requests** for Admin.
- Remove **Users** from Admin presentation roles and navigation.
- Keep Super Admin home, route, and **Users** navigation unchanged.
- Direct Admin navigation to `/admin/users` renders the standard access-denied
  experience and cannot succeed through the API.

### My Projects page

The page contains:

- a **My Projects** heading and **Initiate project** primary action;
- paginated project cards or rows;
- client, property, location, estimator, and estimate-state summaries;
- a clear **No estimate yet** state when `estimate` is null;
- an **Unassigned handoff** fallback for an older globally read or manually
  granted record whose nullable estimator/lead relationship is absent;
- existing loading, error/retry, empty, and pagination patterns;
- a link from each project to its read-only detail route.

The detail page presents the captured client/project data, assigned estimator,
lead next action, and current estimate state. It does not add edit,
reassignment, approval, or estimate controls.

### Initiation dialog

The dialog uses these fields:

- Client name
- Client email
- Mobile
- Project / property name
- Location
- Property type
- Minimum budget
- Maximum budget
- Next action
- Next action date
- Estimator/Sales

There is no Source field. The estimator selector queries only the active-option
endpoint, is mandatory, and uses the existing accessible search-combobox
pattern. Client-side validation gives immediate field feedback, while the
server remains authoritative and revalidates role/activity at submission.
The backend-supported optional Lead fields `builder`, `areaSqft`,
`targetHandoverAt`, and `notes` are not currently rendered by New Lead and are
therefore not part of this approved form or request contract.

On success, the client invalidates the Admin project list, closes the dialog,
announces success, and opens the new read-only project detail. A failed request
keeps the entered data and displays the server-safe error. A failed estimator
lookup has an inline retry state and disables submission until a valid option
is selected.

## Error handling and concurrency

- A missing, inactive, or wrong-role estimator fails before persistence.
- A role/activity change between option loading and submission is caught by
  transaction-time validation.
- Budget-order and timestamp validation return the existing structured
  validation envelope.
- Project/grant/lead/audit writes are all-or-nothing.
- The partial unique Lead `projectId` index and existing unique Estimate
  `leadId` index prevent duplicate handoff records.
- A conflicting Lead/Estimate project link fails closed.
- Out-of-scope project detail remains `404`, not `403`, to avoid existence
  disclosure.
- An Admin cannot regain directory access through frontend manipulation because
  backend permission and service checks both deny it.
- Reassignment after initiation is intentionally unavailable; an estimator
  later becoming inactive does not silently transfer ownership.

## Testing strategy

### Backend

Add test-first coverage proving:

1. Admin A lists and reads only Project A created by Admin A.
2. Admin B cannot list or read Project A, and guessed detail IDs return `404`.
3. Inactive, wrong-module, wrong-source, and other-Admin grants never supply
   project scope.
4. Admin receives `403` from user-directory list and mutation routes; Super
   Admin retains current behavior.
5. Initiation requires `estimatorId` and rejects missing, inactive, or wrong-role
   users.
6. A successful initiation creates exactly one Project, one active initiator
   grant, one linked estimator-owned Lead with source `admin_project`, and the
   expected audit trail.
7. An injected failure at each persistence/audit boundary leaves none of those
   records committed.
8. Only the assigned estimator and the existing Super Admin global reader see
   and read the generated Lead; another estimator cannot.
9. The first estimate save copies the linked Project ID and the unique-lead
   rule still prevents duplicate estimates.
10. Client approval updates the pre-created Project and leaves the total Project
    count unchanged.
11. A legacy lead with no Project still creates exactly one Project during the
    existing approval path.
12. Memory and Mongo repository behavior, operation registry classification,
    backend/frontend role contracts, and responsibility checks remain aligned.
13. A linked Lead rejects changes to system linkage and Project-owned identity
    fields, and conflicting Lead/Estimate Project IDs fail closed.

### Frontend

Add test-first coverage proving:

1. Admin home and sidebar use **My Projects**, and Admin does not see **Users**.
2. Super Admin still lands on and can navigate to **Users**.
3. My Projects renders loading, retryable error, empty, populated, and paginated
   states from the server response.
4. A project opens the read-only detail route.
5. The initiation form contains every approved field, contains no Source field,
   and requires an estimator selection.
6. The dropdown renders only returned active estimator options and handles
   lookup failure safely.
7. Submission sends the exact strict payload, refreshes the list, announces
   success, and navigates to the created project.
8. Server validation preserves form state and renders accessible feedback.
9. Direct Admin access to the old user route shows access denied.

Fresh focused suites are followed by full backend and frontend tests,
type-checking, authorization-contract checks, and production builds.

## Out of scope

- Admin creating or editing estimate line items.
- Estimator reassignment after project initiation.
- Project field editing or deletion.
- Sending estimates, proof upload, Admin approval on behalf of a client, or new
  project lifecycle states.
- Procurement, Finance, Execution, worker, or Super Admin dashboard work.
- A redesign of the existing estimator workspace or estimate engine.
- Backfilling legacy Leads with Project IDs.
- Changing Designer-created project semantics beyond the null-safety required
  to coexist with Admin-created projects.

## Acceptance criteria

1. Regular Admin lands on **My Projects** and has no UI or API access to the
   user directory.
2. **My Projects** lists only projects initiated by the signed-in Admin.
3. Initiation cannot succeed without one currently active Estimator/Sales user.
4. The form contains the approved existing lead fields except Source.
5. A successful initiation atomically creates the Project, initiator grant,
   and estimator-owned linked Lead.
6. The assigned estimator sees the generated lead in the unchanged Leads &
   estimates workspace and can create or continue its estimate there.
7. The estimate uses the pre-created Project ID, and approval never duplicates
   that Project.
8. Legacy lead-to-estimate-to-project behavior continues to work.
9. Super Admin user administration remains unchanged.
10. Authorization is enforced server-side and covered in both repository
    adapters plus route and frontend tests.

## Verification

Fresh verification completed on 2026-08-23:

- Backend `npm run typecheck` — passed.
- Backend `npm test` — 59 files and 1,100 tests passed.
- Backend `npm run build` — passed.
- Frontend `npm run typecheck` — passed.
- Frontend `npm test` — 76 files and 799 tests passed.
- Frontend `npm run build` — passed.

`git diff --check` also passed. The builds retain the repository's existing
non-failing Mongoose deprecation and Vite chunk-size warnings.
