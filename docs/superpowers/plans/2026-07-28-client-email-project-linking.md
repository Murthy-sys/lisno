# Client Email Project Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client signup and case-insensitive email-based project linking, and replace manual project client/manager IDs with client contact fields and an active-manager combobox.

**Architecture:** Projects retain client contact snapshots and may have a nullable account link. Shared email normalization drives global account uniqueness, signup linking, login, and project creation; repository transactions keep account/link changes atomic. A paginated manager-search API feeds an accessible single-select combobox while project authorization uses explicit assignments rather than reporting lines.

**Tech Stack:** TypeScript 5.8, Express 5, Zod, bcryptjs, JWT, Mongoose 9, React 19, TanStack Query, React Hook Form, Vitest, Testing Library, MSW.

## Global Constraints

- One project has exactly one accountable manager.
- Any designer may select any active design manager.
- Cross-team project assignments do not change reporting hierarchy.
- One client account may own multiple projects.
- Account emails are globally unique and compared after trim-plus-lowercase normalization.
- Projects preserve client name, email, mobile, and address snapshots.
- Email alone never grants project access; access continues through `clientId`.
- Existing multi-floor, upload, OCR crop, replacement, approval, and protected-preview behavior must not change.
- New project client name, email, mobile, and address are required.
- Existing projects and client links must migrate without reassignment.

---

### Task 1: Add normalized account identity and nullable project links

**Files:**
- Create: `backend/src/domain/email.ts`
- Create: `backend/src/migrations/client-email-project-linking.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/models/User.ts`
- Modify: `backend/src/models/Project.ts`
- Modify: `backend/src/seed/data.ts`
- Modify: `backend/src/seed/run.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/seed.test.ts`
- Create: `backend/tests/client-email-migration.test.ts`

**Interfaces:**
- Produces: `normalizeEmail(email: string): string`.
- Produces: `AppRepository.createUser(input: NewUser): Promise<UserRecord>`.
- Produces: `AppRepository.linkUnclaimedProjectsToClient(emailNormalized: string, clientId: string, updatedAt: string): Promise<ProjectRecord[]>`.
- Produces: `AppRepository.pageActiveManagers(search: string, pagination: PaginationInput): Promise<PageResult<UserRecord>>`.
- Produces user fields `emailNormalized`, `mobile`, and `address`.
- Produces project fields `clientId: string | null`, `clientName`, `clientEmail`, `clientEmailNormalized`, `clientMobile`, and `clientAddress`.

- [ ] **Step 1: Write failing normalization, repository, and parity tests**

```ts
expect(normalizeEmail("  John@Gmail.COM ")).toBe("john@gmail.com");

const linked = await repository.linkUnclaimedProjectsToClient(
  "john@gmail.com",
  "client-john",
  now
);
expect(linked.map((project) => project.id)).toEqual(["project-a", "project-b"]);
expect((await repository.findProjectById("project-linked"))?.clientId)
  .toBe("existing-client");

const managers = await repository.pageActiveManagers("aarav@", {
  limit: 20,
  offset: 0
});
expect(managers.items.every((user) =>
  user.active && user.role === "design_manager"
)).toBe(true);
```

Add the same linking, no-reassignment, case-insensitive manager search, and
pagination assertions to the memory and Mongo contract suites. Add a duplicate
normalized-email Mongo test that expects the unique index to reject the second
user. In `client-email-migration.test.ts`, prove dry-run performs no writes,
duplicate normalized emails stop all writes, existing links are preserved, and
missing legacy mobile/address values become empty snapshot strings.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/seed.test.ts
npm test -- tests/client-email-migration.test.ts
```

Expected: FAIL because normalized fields and repository methods do not exist.

- [ ] **Step 3: Implement shared types, models, and repository methods**

```ts
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export interface UserRecord {
  // existing fields
  emailNormalized: string;
  mobile: string | null;
  address: string | null;
}

export interface ProjectRecord {
  // existing fields
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientEmailNormalized: string;
  clientMobile: string;
  clientAddress: string;
}
```

Make `findUserByEmail` normalize its input. Implement `createUser`,
`linkUnclaimedProjectsToClient`, and `pageActiveManagers` in both repositories.
The link method must update only records whose `clientId === null`. Add indexes:

```ts
userSchema.index({ emailNormalized: 1 }, { unique: true });
projectSchema.index({ clientEmailNormalized: 1, clientId: 1 });
```

Keep `email` as the display value and populate `emailNormalized` for all seed
users.

- [ ] **Step 4: Add the idempotent migration command**

The migration must:

1. load users and compute normalized emails;
2. stop before writes when two IDs normalize to the same email;
3. set user normalized email/mobile/address fields;
4. backfill project client snapshots from the currently linked client;
5. preserve every existing `clientId`;
6. use empty strings only for missing legacy mobile/address snapshots;
7. call `syncIndexes()` after successful backfill.

Expose:

```json
"migrate:client-linking": "tsx src/migrations/client-email-project-linking.ts"
```

Add a `--dry-run` branch that reports duplicate emails and planned record counts
without writing.

- [ ] **Step 5: Run repository, seed, typecheck, and build checks**

Run:

```bash
cd backend
npm test -- tests/repository.test.ts tests/mongo-repository.test.ts tests/seed.test.ts
npm test -- tests/client-email-migration.test.ts
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/email.ts backend/src/migrations/client-email-project-linking.ts backend/src/repositories backend/src/models backend/src/seed backend/package.json backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/seed.test.ts backend/tests/client-email-migration.test.ts
git commit -m "feat: add client email project identity"
```

---

### Task 2: Add transactional client signup and authentication throttling

**Files:**
- Create: `backend/src/middleware/auth-rate-limit.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/auth.test.ts`
- Test: `backend/tests/full-journey.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`, `AppRepository.createUser`, and `AppRepository.linkUnclaimedProjectsToClient`.
- Produces: `ClientSignupInput`.
- Produces: `AuthService.signupClient(input: ClientSignupInput): Promise<AuthPayload>`.
- Produces: `POST /api/v1/auth/client-signup`.

- [ ] **Step 1: Write failing signup tests**

Cover:

```ts
expect(response.status).toBe(201);
expect(response.body.data.user.role).toBe("client");
expect(response.body.data.token).toEqual(expect.any(String));
expect(await bcrypt.compare("StrongPassword!23", stored.passwordHash)).toBe(true);
expect(linkedProjects.map(({ clientId }) => clientId))
  .toEqual(["new-client-id", "new-client-id"]);
```

Also test uppercase/lowercase matching, multiple pre-existing projects, a
project already linked to another client, duplicate client email, an internal
role email, password confirmation mismatch, transaction rollback, concurrent
duplicate signup, response password-field exclusion, and throttling after the
configured number of attempts.

- [ ] **Step 2: Run focused auth tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/auth.test.ts tests/full-journey.test.ts
```

Expected: FAIL with missing signup route/service.

- [ ] **Step 3: Implement signup service transaction**

```ts
export interface ClientSignupInput {
  name: string;
  email: string;
  mobile: string;
  address: string;
  password: string;
}
```

Inside `repository.runInTransaction`, reject any existing account, hash the
password, create an active `client`, link all matching unclaimed projects,
append audit events, then sign and return the JWT. Convert duplicate-index
errors into `409 ACCOUNT_EXISTS`.

- [ ] **Step 4: Implement route validation and bounded throttling**

Use a strict Zod body with trimmed required fields, email transformation,
password length bounds, and `passwordConfirmation` equality. The route removes
confirmation before calling the service.

Implement a per-IP fixed-window limiter with:

```ts
createAuthRateLimit({
  windowMs: 15 * 60_000,
  maxAttempts: 20,
  clock
})
```

Apply it to login and signup. Return `429 TOO_MANY_ATTEMPTS` with a generic
retry message and clear expired buckets on access so memory remains bounded.

- [ ] **Step 5: Run auth and backend verification**

Run:

```bash
cd backend
npm test -- tests/auth.test.ts tests/full-journey.test.ts
npm test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/auth-rate-limit.ts backend/src/services/auth.service.ts backend/src/routes/auth.ts backend/src/app.ts backend/tests/auth.test.ts backend/tests/full-journey.test.ts
git commit -m "feat: add client signup and project claiming"
```

---

### Task 3: Create projects from client snapshots and allow cross-team assignments

**Files:**
- Modify: `backend/src/routes/projects.ts`
- Modify: `backend/src/services/project.service.ts`
- Modify: `backend/src/services/workflow.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/seed/data.ts`
- Test: `backend/tests/workflows.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/full-journey.test.ts`

**Interfaces:**
- Consumes normalized email and nullable `ProjectRecord.clientId`.
- Produces:

```ts
export interface CreateProjectInput {
  name: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  clientAddress: string;
  assignedDesignerIds: string[];
  managerId: string;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
}
```

- [ ] **Step 1: Write failing project creation and authorization tests**

Test these exact outcomes:

- existing client email sets `clientId`;
- unknown email creates a project with `clientId: null`;
- mixed-case email links correctly;
- staff-role email returns a `clientEmail` field error;
- inactive or non-manager selection returns a `managerId` field error;
- any active manager can be selected;
- initiating designer is inserted into assignments;
- active cross-team designers are accepted;
- inactive/non-designer assignees are rejected;
- reporting `managerId` fields remain unchanged;
- client project listings still filter only by linked `clientId`.

- [ ] **Step 2: Run focused workflow tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/workflows.test.ts tests/full-journey.test.ts tests/repository.test.ts tests/mongo-repository.test.ts
```

Expected: FAIL because `clientId` is still required and same-manager rules are
enforced.

- [ ] **Step 3: Update request schema and service**

Replace `clientId` in the strict project Zod schema with the four required
client snapshot fields. In the service:

```ts
const existing = await repository.findUserByEmail(input.clientEmail);
if (existing && existing.role !== "client") {
  throw new ApiError(400, "INVALID_PROJECT", "Client email is unavailable.", {
    clientEmail: "This email belongs to an internal account."
  });
}
```

Require an active manager and active designer assignees. Remove
`designer.managerId === manager.id`, assigned-designer same-manager checks, and
`authorizedClientIds` checks from project creation only. Store the normalized
snapshot and `existing?.id ?? null`.

- [ ] **Step 4: Make nullable-client reads safe**

Ensure project queries for clients remain `{ clientId: user.id }`. Audit every
`requireUser(project.clientId)` call and either restrict it to non-null linked
projects or return the existing not-found/forbidden response. Do not compare
actor email with project email for access.

- [ ] **Step 5: Run full backend verification**

Run:

```bash
cd backend
npm test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/projects.ts backend/src/services/project.service.ts backend/src/services/workflow.ts backend/src/repositories backend/src/seed/data.ts backend/tests
git commit -m "feat: create projects from client contact details"
```

---

### Task 4: Add active-manager search API

**Files:**
- Modify: `backend/src/services/hierarchy.service.ts`
- Modify: `backend/src/routes/organization.ts`
- Create: `backend/tests/hierarchy.test.ts`
- Test: `backend/tests/server.test.ts`

**Interfaces:**
- Consumes: `AppRepository.pageActiveManagers(search, pagination)`.
- Produces:

```ts
export interface ManagerOption {
  id: string;
  name: string;
  email: string;
  mobile?: string;
}
```

- Produces: `GET /api/v1/organization/managers?search=&limit=20&offset=0`.

- [ ] **Step 1: Write failing route/service tests**

Assert designer access, non-designer rejection, name search, email search,
case-insensitive matching, active-manager-only results, deterministic ordering,
pagination metadata, bounded `limit`, and omission of password/internal fields.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/hierarchy.test.ts tests/server.test.ts
```

Expected: FAIL with route not found.

- [ ] **Step 3: Implement manager projection and route**

Add a strict query schema:

```ts
const managerSearchQuery = z.object({
  search: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();
```

Authorize `designer`, map repository users to `ManagerOption`, and return the
existing paginated envelope.

- [ ] **Step 4: Run backend verification**

Run:

```bash
cd backend
npm test -- tests/hierarchy.test.ts tests/server.test.ts
npm test
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/hierarchy.service.ts backend/src/routes/organization.ts backend/tests/hierarchy.test.ts backend/tests/server.test.ts
git commit -m "feat: add searchable manager directory"
```

---

### Task 5: Add client signup UI and automatic session entry

**Files:**
- Create: `frontend/src/auth/SignupPage.tsx`
- Create: `frontend/src/auth/SignupPage.test.tsx`
- Modify: `frontend/src/auth/AuthProvider.tsx`
- Modify: `frontend/src/auth/AuthProvider.test.tsx`
- Modify: `frontend/src/auth/LoginPage.tsx`
- Modify: `frontend/src/auth/LoginPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface ClientSignupInput {
  name: string;
  email: string;
  mobile: string;
  address: string;
  password: string;
  passwordConfirmation: string;
}
```

- Produces `AuthContext.signupClient(input): Promise<PublicUser>`.

- [ ] **Step 1: Write failing provider, page, routing, and accessibility tests**

Test required labels, client-side required/email/password-confirmation
validation, API field-error rendering, submit payload, token persistence,
authenticated client state, dashboard redirect, login-to-signup and
signup-to-login links, keyboard navigation, and password visibility controls.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/auth/AuthProvider.test.tsx src/auth/SignupPage.test.tsx src/auth/LoginPage.test.tsx src/test/accessibility.test.tsx
```

Expected: FAIL because signup components and context method do not exist.

- [ ] **Step 3: Implement provider method and route**

Post to `/auth/client-signup`, persist the returned token using the same storage
path as login, set the returned public user, and protect against stale async
responses using the provider's existing operation sequencing.

- [ ] **Step 4: Implement accessible signup form**

Use React Hook Form and Zod with the backend field names. On success route to
`/client`; on API field errors associate messages with the matching control.
Reuse the login card visual language and responsive behavior.

- [ ] **Step 5: Run frontend verification**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/auth/AuthProvider.test.tsx src/auth/SignupPage.test.tsx src/auth/LoginPage.test.tsx src/test/accessibility.test.tsx
VITE_API_URL=/api/v1 npm test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/auth frontend/src/app/router.tsx frontend/src/api/types.ts frontend/src/styles/index.css frontend/src/test/accessibility.test.tsx
git commit -m "feat: add client signup experience"
```

---

### Task 6: Replace manual project IDs with client fields and manager combobox

**Files:**
- Create: `frontend/src/components/ui/SearchCombobox.tsx`
- Create: `frontend/src/components/ui/SearchCombobox.test.tsx`
- Modify: `frontend/src/features/designer/ProjectCreateDialog.tsx`
- Modify: `frontend/src/features/designer/DesignerDashboard.test.tsx`
- Modify: `frontend/src/features/designer/designerApi.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/test/accessibility.test.tsx`

**Interfaces:**
- Consumes `ManagerOption` and paginated manager-search API.
- Produces `searchManagers(search: string, offset?: number): Promise<PageData<ManagerOption>>`.
- Produces a controlled single-select `SearchCombobox<T>` with `value`,
  `onChange`, `query`, `onQueryChange`, `items`, `itemKey`, and `renderItem`.

- [ ] **Step 1: Write failing combobox and project-dialog tests**

Assert:

- no Client ID or Manager ID text fields;
- required client name/email/mobile/address controls;
- manager fetch only while dialog is open;
- debounced name/email search;
- option name/email/mobile rendering;
- one selected manager;
- ArrowUp/ArrowDown/Enter/Escape behavior;
- correct combobox/listbox ARIA relationships;
- loading, empty, error, and retry states;
- payload contains snapshot fields and selected manager ID;
- initiating designer remains included;
- field-level API errors focus the relevant control.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/components/ui/SearchCombobox.test.tsx src/features/designer/DesignerDashboard.test.tsx src/test/accessibility.test.tsx
```

Expected: FAIL because the combobox and new form contract do not exist.

- [ ] **Step 3: Implement manager query**

```ts
export const searchManagers = (search: string, offset = 0) => {
  const query = new URLSearchParams({
    search,
    limit: "20",
    offset: String(offset)
  });
  return apiClient.get<PageData<ManagerOption>>(
    `/organization/managers?${query.toString()}`
  );
};
```

Use a stable query key containing the normalized search text.

- [ ] **Step 4: Implement the reusable combobox**

Follow the WAI-ARIA combobox pattern: input with `role="combobox"`,
`aria-expanded`, `aria-controls`, and `aria-activedescendant`; popup with
`role="listbox"`; options with `role="option"` and `aria-selected`. Preserve
selection when results refresh and close on outside click or Escape.

- [ ] **Step 5: Replace project ID inputs**

Update `CreateProjectInput` and form state to submit:

```ts
{
  name,
  clientName,
  clientEmail,
  clientMobile,
  clientAddress,
  managerId: selectedManager.id,
  assignedDesignerIds,
  location,
  plannedStartAt,
  plannedEndAt
}
```

Keep assigned-designer behavior unchanged except that the backend now accepts
cross-team IDs. Never render the selected manager ID as editable text.

- [ ] **Step 6: Run frontend verification**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/components/ui/SearchCombobox.test.tsx src/features/designer/DesignerDashboard.test.tsx src/test/accessibility.test.tsx
VITE_API_URL=/api/v1 npm test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/SearchCombobox.tsx frontend/src/components/ui/SearchCombobox.test.tsx frontend/src/features/designer frontend/src/api/types.ts frontend/src/styles/index.css frontend/src/test/accessibility.test.tsx
git commit -m "feat: simplify designer project creation"
```

---

### Task 7: Verify linking through the client design-preview journey

**Files:**
- Modify: `backend/tests/full-journey.test.ts`
- Modify: `backend/tests/design-section-review.test.ts`
- Modify: `frontend/src/features/client/ClientDashboard.test.tsx`
- Modify: `frontend/src/features/client/DesignSectionReview.test.tsx`
- Modify: `frontend/src/features/designer/DesignUploadsWorkspace.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes all prior signup, project, manager, and design-section interfaces.
- Produces an end-to-end regression proving an initially unclaimed project
  becomes visible without altering asset permissions or crop/revision behavior.

- [ ] **Step 1: Add the complete failing journey**

Build this sequence in backend integration coverage:

1. designer searches and selects an active manager;
2. designer creates a project for an unknown mixed-case client email;
3. designer creates multiple floors and uploads a design;
4. OCR sections progress through designer submission and internal review;
5. client signs up with the lowercase equivalent email;
6. both pre-existing projects link to the new client;
7. client dashboard lists both projects;
8. client can view protected approved crops and approve/reject sections;
9. an unrelated client receives not found;
10. replacement/revision history remains intact.

- [ ] **Step 2: Run the complete journey tests**

Run:

```bash
cd backend
npm test -- tests/full-journey.test.ts tests/design-section-review.test.ts
cd ../frontend
VITE_API_URL=/api/v1 npm test -- src/features/client/ClientDashboard.test.tsx src/features/client/DesignSectionReview.test.tsx src/features/designer/DesignUploadsWorkspace.test.tsx
```

Expected: all assertions pass using the production interfaces implemented in
Tasks 1–6. If any assertion fails, keep the test RED and proceed to Step 3.

- [ ] **Step 3: Make only integration fixes required by the journey**

Keep fixes within the established service/repository/UI boundaries. Do not alter
OCR title classification, crop generation, storage references, or client review
authorization except to support nullable pre-signup `clientId`.

- [ ] **Step 4: Document setup and migration**

Update `README.md` with:

- client signup URL and fields;
- email-linking behavior;
- manager selection behavior;
- `npm run migrate:client-linking -- --dry-run`;
- production migration command;
- startup commands for backend, frontend, and OCR worker.

- [ ] **Step 5: Run complete verification**

Run:

```bash
cd backend
npm test
npm run typecheck
npm run build
cd ../frontend
VITE_API_URL=/api/v1 npm test
npm run typecheck
npm run build
cd ../ocr-worker
.venv/bin/python -m pytest -q -m "not model"
.venv/bin/python -m pytest -q -m model
cd ..
git diff --check
git status --short
```

Expected: all suites pass; only intentional files are modified.

- [ ] **Step 6: Commit**

```bash
git add backend/tests frontend/src README.md
git commit -m "test: verify email-linked client design journey"
```
