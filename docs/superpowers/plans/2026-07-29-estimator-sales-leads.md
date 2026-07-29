# Estimator/Sales Leads Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected estimator/sales lead workspace for creating, tracking, searching, updating, and logging follow-ups on leads before estimate or project creation.

**Architecture:** Introduce a dedicated Lead aggregate plus append-only LeadActivity records in the repository layer, with a LeadService and `/api/v1/leads` router enforcing owner-only access. Add the `estimator_sales` role across auth, routing, and the app shell, then build a React Query lead list/detail experience that consumes the new API. No estimate, upload, approval, client-portal, project-kickoff, or notification behavior is created in this plan.

**Tech Stack:** TypeScript, Express, Zod, Mongoose, in-memory repository, Vitest/Supertest, React, React Router, TanStack Query, Testing Library, Lucide, existing Lisno CSS.

## Global Constraints

- Add exactly one internal role named `estimator_sales`.
- Leads are separate from delivery `Project` records.
- Only the lead owner may read or mutate a lead in this module.
- Preserve existing role behavior and all client/design/project APIs.
- Scope is limited to leads and lead activities; do not add estimates, documents, approvals, notifications, or project creation.
- Use field-specific API validation errors and existing `ApiError` conventions.
- Use test-driven development and commit each independently testable task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/src/contracts/domain.ts` | Add `estimator_sales` to the authoritative `Role` union. |
| `backend/src/repositories/types.ts` | Define lead/activity records, filters, create/update inputs, seed data, and repository operations. |
| `backend/src/models/Lead.ts` | Persist lead fields and indexes in MongoDB. |
| `backend/src/models/LeadActivity.ts` | Persist append-only follow-up/activity records in MongoDB. |
| `backend/src/repositories/memory.ts` | In-memory lead/activity storage and owner-filtered paging. |
| `backend/src/repositories/mongo.ts` | MongoDB lead/activity persistence and indexes. |
| `backend/src/services/lead.service.ts` | Authorization, validation-adjacent workflow rules, timestamps, and audit writes. |
| `backend/src/routes/leads.ts` | Zod request/query validation and HTTP mapping. |
| `backend/src/app.ts` | Construct and mount the lead service/router. |
| `backend/src/seed/data.ts` | Seed one estimator/sales user and representative owned leads/activities. |
| `backend/tests/leads.test.ts` | Backend end-to-end authorization, validation, paging, and activity tests. |
| `frontend/src/api/types.ts` | Public lead/activity contracts and the `estimator_sales` role. |
| `frontend/src/auth/ProtectedRoute.tsx` | `/estimator-sales` role home mapping. |
| `frontend/src/app/router.tsx` | Protected list and detail routes. |
| `frontend/src/components/layout/Sidebar.tsx` | Estimator/Sales label. |
| `frontend/src/features/leads/leadsApi.ts` | Query keys and typed API helpers. |
| `frontend/src/features/leads/LeadCreateDialog.tsx` | Short, validated lead creation form. |
| `frontend/src/features/leads/LeadDashboard.tsx` | Search/filter/list/summary dashboard. |
| `frontend/src/features/leads/LeadDetail.tsx` | Lead context, stage editing, and follow-up timeline. |
| `frontend/src/features/leads/LeadDashboard.test.tsx` | Dashboard, creation, filtering, loading/error tests. |
| `frontend/src/features/leads/LeadDetail.test.tsx` | Detail, activity, stage, and error tests. |
| `frontend/src/styles/index.css` | Scoped lead workspace styling and responsive layout. |

## Task 1: Establish the role and persistence contracts

**Files:**
- Modify: `backend/src/contracts/domain.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `backend/src/services/auth.service.ts`
- Test: `backend/tests/auth.test.ts`

**Consumes:** Existing `Role`, `UserRecord`, `PageResult`, `PaginationInput`, and JWT token schema.

**Produces:** `LeadStage`, `LeadRecord`, `LeadActivityType`, `LeadActivityRecord`, `LeadFilters`, `CreateLeadInput`, `UpdateLeadInput`, `CreateLeadActivityInput`, and role-aware public contracts.

- [ ] **Step 1: Write failing role/auth tests**

Add a seeded `estimator_sales` user fixture and assert login plus `/auth/me` return its exact role:

```ts
expect(login.body.data.user).toMatchObject({
  id: "user-estimator-sales",
  role: "estimator_sales"
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run backend/tests/auth.test.ts`

Expected: TypeScript/test failure because `estimator_sales` is not part of `Role` or the auth role schema.

- [ ] **Step 3: Add the role and lead contracts**

Extend every mirrored role union with `estimator_sales`. Define the following exact backend types in `repositories/types.ts`:

```ts
export type LeadStage =
  | "new_lead" | "contacted" | "site_visit" | "design_meeting"
  | "estimate_in_progress" | "estimate_sent" | "negotiation" | "won" | "lost";

export type LeadActivityType = "call" | "whatsapp" | "meeting" | "email" | "note";

export interface LeadRecord {
  id: string; ownerId: string; clientName: string; clientEmail: string;
  clientMobile: string; projectName: string; location: string;
  propertyType: string; budgetMin: number | null; budgetMax: number | null;
  source: string; stage: LeadStage; nextAction: string; nextActionAt: string;
  builder: string | null; areaSqft: number | null; targetHandoverAt: string | null;
  notes: string | null; latestActivityAt: string | null; createdAt: string; updatedAt: string;
}
```

Use explicit input types that omit server-owned fields. Add paging, find, create, update, append-activity, and list-activities methods to `AppRepository`; add `leads` and `leadActivities` to `SeedData`. Mirror safe public shapes in `frontend/src/api/types.ts`.

- [ ] **Step 4: Make the auth token schema role-aware**

Add `estimator_sales` to the Zod `roleSchema` in `auth.service.ts` so signing and validating a JWT preserve the role.

- [ ] **Step 5: Run focused tests and typechecks**

Run: `cd backend && npm test -- --run tests/auth.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/contracts/domain.ts backend/src/repositories/types.ts backend/src/services/auth.service.ts frontend/src/api/types.ts backend/tests/auth.test.ts
git commit -m "feat: add estimator sales role and lead contracts"
```

## Task 2: Implement repository support in memory and MongoDB

**Files:**
- Create: `backend/src/models/Lead.ts`
- Create: `backend/src/models/LeadActivity.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/seed/data.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`

**Consumes:** Task 1 lead contracts and existing memory/Mongo repository patterns.

**Produces:** Consistent owner-filtered persistence across development/test repositories.

- [ ] **Step 1: Write failing repository tests**

Add tests that create two leads with different `ownerId` values, page only one owner’s records, update one lead, append two activities, and assert newest-first activity order plus `latestActivityAt` update:

```ts
expect(page.items.map((lead) => lead.id)).toEqual(["lead-owned-by-estimator"]);
expect(activities.map((activity) => activity.note)).toEqual(["Second follow-up", "First follow-up"]);
expect(updated.latestActivityAt).toBe("2026-07-29T10:00:00.000Z");
```

- [ ] **Step 2: Run focused repository tests to verify failure**

Run: `cd backend && npm test -- --run tests/repository.test.ts tests/mongo-repository.test.ts`

Expected: FAIL because lead repository methods and models do not exist.

- [ ] **Step 3: Add memory repository storage and operations**

Extend the memory state/clone/transaction state with `leads` and `leadActivities`. Implement exact operations:

```ts
pageLeadsForOwner(ownerId: string, filters: LeadFilters, pagination: PaginationInput): Promise<PageResult<LeadRecord>>
findLeadById(id: string): Promise<LeadRecord | null>
createLead(input: LeadRecord): Promise<LeadRecord>
updateLead(id: string, change: Partial<LeadRecord>): Promise<LeadRecord>
appendLeadActivity(input: LeadActivityRecord): Promise<LeadActivityRecord>
listLeadActivities(leadId: string): Promise<LeadActivityRecord[]>
```

Apply case-insensitive text search across client name, project name, mobile, and email; filter exact stage when supplied; sort lists by `updatedAt` descending and activities by `occurredAt` descending.

- [ ] **Step 4: Add Mongo models and repository operations**

Create `Lead` with indexes `{ ownerId: 1, updatedAt: -1 }`, `{ ownerId: 1, stage: 1, updatedAt: -1 }`, and normalized search-compatible fields. Create `LeadActivity` indexed by `{ leadId: 1, occurredAt: -1 }`. Map documents to repository records using the same null/default behavior as existing models. Update `createMongoRepository` transaction session plumbing so every new method participates in the current session.

- [ ] **Step 5: Seed representative lead data**

Add one active `estimator_sales` user and at least three leads covering an overdue follow-up, estimate-in-progress, and negotiation stage. Seed at least two activities on one lead.

- [ ] **Step 6: Run focused repository and seed tests**

Run: `cd backend && npm test -- --run tests/repository.test.ts tests/mongo-repository.test.ts tests/seed.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/Lead.ts backend/src/models/LeadActivity.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/repositories/types.ts backend/src/seed/data.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/seed.test.ts
git commit -m "feat: persist estimator sales leads"
```

## Task 3: Add the lead service and protected REST API

**Files:**
- Create: `backend/src/services/lead.service.ts`
- Create: `backend/src/routes/leads.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/leads.test.ts`

**Consumes:** Task 1 contracts and Task 2 repository methods.

**Produces:** Owner-authorized CRUD/read/activity endpoints mounted under `/api/v1`.

- [ ] **Step 1: Write failing API tests**

Cover these requests with authenticated fixtures:

```ts
await request(app).post("/api/v1/leads").set(auth(estimator)).send(validLead).expect(201);
await request(app).get("/api/v1/leads?search=nair&stage=negotiation&limit=20&offset=0").set(auth(estimator)).expect(200);
await request(app).post(`/api/v1/leads/${leadId}/activities`).set(auth(estimator)).send({ type: "call", note: "Confirmed site visit", occurredAt }).expect(201);
await request(app).get(`/api/v1/leads/${otherOwnerLeadId}`).set(auth(estimator)).expect(404);
await request(app).get("/api/v1/leads").set(auth(designer)).expect(403);
```

Assert missing `clientName`, invalid email, empty `nextAction`, negative budget, invalid stage, and an end-before-start target date return `400` with field keys. Assert updates cannot alter `ownerId`, `id`, or timestamps.

- [ ] **Step 2: Run the focused API test to verify failure**

Run: `cd backend && npm test -- --run tests/leads.test.ts`

Expected: FAIL with 404 because the router is not mounted.

- [ ] **Step 3: Implement the service**

Expose:

```ts
export interface LeadService {
  page(actor: PublicUser, filters: LeadFilters, pagination: PaginationInput): Promise<PageResult<LeadRecord>>;
  get(actor: PublicUser, leadId: string): Promise<LeadRecord>;
  create(actor: PublicUser, input: CreateLeadInput): Promise<LeadRecord>;
  update(actor: PublicUser, leadId: string, input: UpdateLeadInput): Promise<LeadRecord>;
  addActivity(actor: PublicUser, leadId: string, input: CreateLeadActivityInput): Promise<LeadActivityRecord>;
  listActivities(actor: PublicUser, leadId: string): Promise<LeadActivityRecord[]>;
}
```

Require `actor.role === "estimator_sales"` at every entry point. Resolve leads by ID then return the standard not-found response whenever the record is absent or owned by someone else. On creation/update/activity writes, use the injected clock, update `updatedAt`, update `latestActivityAt` only for activities, and append an audit event with actions `lead_created`, `lead_updated`, and `lead_activity_added`.

- [ ] **Step 4: Implement the router and Zod schemas**

Create `createLeadsRouter(authService, leadService)` with:

```text
GET    /leads
POST   /leads
GET    /leads/:leadId
PATCH  /leads/:leadId
GET    /leads/:leadId/activities
POST   /leads/:leadId/activities
```

Use the existing `paginationShape`, an optional trimmed `search` query, optional `LeadStage` enum query, and strict body schemas. Mount the router in `app.ts` immediately after project routes.

- [ ] **Step 5: Run focused API tests and backend checks**

Run: `cd backend && npm test -- --run tests/leads.test.ts && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/lead.service.ts backend/src/routes/leads.ts backend/src/app.ts backend/tests/leads.test.ts
git commit -m "feat: add protected lead management api"
```

## Task 4: Add role-aware frontend routing and typed API helpers

**Files:**
- Modify: `frontend/src/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/features/leads/leadsApi.ts`
- Test: `frontend/src/app/router.test.tsx`

**Consumes:** Task 1 frontend `Role`, `Lead`, activity, and pagination contracts plus Task 3 API routes.

**Produces:** A protected `/estimator-sales` route, `/estimator-sales/leads/:leadId` route, role label, query keys, and typed API functions.

- [ ] **Step 1: Write failing route tests**

Test that an estimator/sales user reaches the workspace, other roles are redirected to their own home, and an estimator/sales user can open a lead detail path:

```tsx
renderApp(["/estimator-sales"]);
expect(await screen.findByRole("heading", { name: /lead workspace/i })).toBeVisible();
```

- [ ] **Step 2: Run the route test to verify failure**

Run: `cd frontend && npm test -- --run src/app/router.test.tsx`

Expected: FAIL because `roleHomePath` has no estimator/sales route.

- [ ] **Step 3: Add API helpers and query keys**

Create `leadsApi.ts` exporting `leadKeys`, `getLeadPage`, `getLead`, `createLead`, `updateLead`, `getLeadActivities`, and `addLeadActivity`. Use `URLSearchParams`, `encodeURIComponent`, and the existing `apiClient` methods. `leadKeys.page(search, stage)` must normalize search with `trim().toLowerCase()` and represent an absent stage as `"all"`.

- [ ] **Step 4: Add protected routes and sidebar label**

Map `estimator_sales` to `/estimator-sales`, add `Estimator / Sales` to the sidebar label map, and add protected routes for `LeadDashboard` and `LeadDetail`. Initially add minimal exported components returning semantic headings so the route test proves authorization before dashboard behavior is added.

- [ ] **Step 5: Run focused frontend tests and typecheck**

Run: `cd frontend && npm test -- --run src/app/router.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/auth/ProtectedRoute.tsx frontend/src/app/router.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/features/leads/leadsApi.ts frontend/src/features/leads/LeadDashboard.tsx frontend/src/features/leads/LeadDetail.tsx frontend/src/app/router.test.tsx
git commit -m "feat: add estimator sales lead routes"
```

## Task 5: Build the lead dashboard and creation flow

**Files:**
- Create: `frontend/src/features/leads/LeadCreateDialog.tsx`
- Modify: `frontend/src/features/leads/LeadDashboard.tsx`
- Create: `frontend/src/features/leads/LeadDashboard.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Consumes:** Task 4 route/API helpers and Task 3 field error responses.

**Produces:** Searchable/filterable owner lead list, dashboard counts, and a short creation flow.

- [ ] **Step 1: Write failing dashboard tests**

Mock `/auth/me` as `estimator_sales` and `/leads` responses. Prove summary counts, search/stage requests, overdue rendering, empty/error/retry behavior, and lead navigation. Prove creating a lead posts the exact minimal payload and invalid server fields are announced beside the matching control:

```tsx
await user.type(screen.getByLabelText("Client name"), "Ramesh Nair");
await user.click(screen.getByRole("button", { name: "Save lead" }));
expect(await screen.findByText("Client name is required.")).toBeVisible();
```

- [ ] **Step 2: Run dashboard test to verify failure**

Run: `cd frontend && npm test -- --run src/features/leads/LeadDashboard.test.tsx`

Expected: FAIL because the dashboard is only a minimal route placeholder.

- [ ] **Step 3: Implement the dashboard**

Use `useQuery` with `leadKeys.page(search, stage)`. Render four computed count cards from the loaded page: active, overdue follow-up, estimate in progress, and negotiation. Add an accessible search box, stage select with `All stages`, `New lead` button, and lead list rows containing client, project/property, stage text, next action/date, and overdue text. Debounce is unnecessary; send the query on change with the existing list page size. Link each row to `/estimator-sales/leads/:leadId`.

- [ ] **Step 4: Implement the creation dialog**

Use the shared `Dialog`, field labels, local form state, and `useMutation`. Required controls: client name, mobile, email, project/property name, location, property type, budget range, source, next action, and next-action date. Validate client-side only for empty values, invalid numeric ranges, and `budgetMax < budgetMin`; map `ApiError.fields` to controls; invalidate all lead list keys on success and move focus back to the trigger. Persist unsaved values in component state while the dialog remains open; do not write browser storage.

- [ ] **Step 5: Add scoped visual treatment**

Add a `.lead-page` section to existing `index.css`: compact purple/navy header, restrained summary cards, stage badges, a responsive one-column small-screen layout, and an obvious overdue state. Do not modify existing dashboard CSS selectors.

- [ ] **Step 6: Run focused tests and frontend checks**

Run: `cd frontend && npm test -- --run src/features/leads/LeadDashboard.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/leads/LeadCreateDialog.tsx frontend/src/features/leads/LeadDashboard.tsx frontend/src/features/leads/LeadDashboard.test.tsx frontend/src/styles/index.css
git commit -m "feat: add estimator sales lead dashboard"
```

## Task 6: Build lead detail, stage editing, and follow-up logging

**Files:**
- Modify: `frontend/src/features/leads/LeadDetail.tsx`
- Create: `frontend/src/features/leads/LeadDetail.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Consumes:** Task 4 API helpers and Task 5 lead dashboard links/styles.

**Produces:** A complete lead context page with owner-only server protection, stage updates, activity history, and follow-up creation.

- [ ] **Step 1: Write failing detail tests**

Mock lead and activity API responses and prove that the page renders client/property context, newest-first activities, updates a stage, appends a call/WhatsApp/meeting/email/note activity, invalidates/refetches activity and lead data, and keeps typed activity text visible after a failed request:

```tsx
await user.selectOptions(screen.getByLabelText("Lead stage"), "negotiation");
await user.click(screen.getByRole("button", { name: "Save stage" }));
expect(await screen.findByText("Stage updated.")).toBeVisible();
```

- [ ] **Step 2: Run detail test to verify failure**

Run: `cd frontend && npm test -- --run src/features/leads/LeadDetail.test.tsx`

Expected: FAIL because detail behavior has not been implemented.

- [ ] **Step 3: Implement detail queries and layout**

Use `useParams` and `useQuery` for `getLead` plus `getLeadActivities`. Render a back link, stage badge/select, contact links, property/budget/source/timeline/notes blocks, next action/date, and a timeline ordered by returned data. Render `AsyncState` for loading/error with retry.

- [ ] **Step 4: Implement stage and activity mutations**

Use two `useMutation` instances. `updateLead` sends only `{ stage }` for stage changes. Activity form fields are `type`, required `note`, and `occurredAt` defaulted to the local current date/time in `datetime-local` format. On success invalidate `leadKeys.detail(leadId)`, `leadKeys.activities(leadId)`, and all page keys; show polite success feedback. On failure display the API message with alert semantics and retain the form values.

- [ ] **Step 5: Render the intentionally deferred estimate boundary**

Show a compact `Estimate` panel. It states that estimation is the next module and exposes a disabled `Start estimate` button with a short explanation. Do not create an estimate endpoint, record, upload affordance, approval state, or project transition.

- [ ] **Step 6: Add detail CSS and responsive checks**

Add scoped `.lead-detail` and `.lead-timeline` rules. On desktop, use a two-column context/timeline layout; on narrow screens stack sections and keep all action controls full width where necessary. Preserve color-independent stage/overdue labels.

- [ ] **Step 7: Run focused tests and application verification**

Run: `cd frontend && npm test -- --run src/features/leads/LeadDetail.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/leads/LeadDetail.tsx frontend/src/features/leads/LeadDetail.test.tsx frontend/src/styles/index.css
git commit -m "feat: add lead follow-up workspace"
```

## Task 7: Regression, accessibility, and full verification

**Files:**
- Modify: `frontend/src/test/accessibility.test.tsx`
- Modify: `backend/tests/full-journey.test.ts` only if role fixture setup is centrally shared

**Consumes:** Tasks 1–6.

**Produces:** Regression evidence that the new role/module does not break current modules.

- [ ] **Step 1: Write focused accessibility coverage**

Add an estimator/sales dashboard case that asserts a labelled search field, labelled stage filter, `New lead` action, visible stage text, and an accessible error alert. Add a detail case that asserts the activity controls are labelled and the disabled estimate action explains why it is unavailable.

- [ ] **Step 2: Run accessibility test to verify behavior**

Run: `cd frontend && npm test -- --run src/test/accessibility.test.tsx`

Expected: PASS after Tasks 4–6; fix missing labels/semantic roles before continuing.

- [ ] **Step 3: Run complete backend verification**

Run: `cd backend && npm test && npm run typecheck && npm run build`

Expected: all existing and new backend tests PASS.

- [ ] **Step 4: Run complete frontend verification**

Run: `cd frontend && VITE_API_URL=/api/v1 npm test && npm run typecheck && npm run build`

Expected: all existing and new frontend tests PASS. The explicit relative API URL prevents a local development `.env` absolute URL from bypassing MSW handlers.

- [ ] **Step 5: Inspect final diff and commit**

Run: `git diff --check && git status --short`

Confirm only lead-module and intended test/style changes are staged, then:

```bash
git add frontend/src/test/accessibility.test.tsx backend/tests/full-journey.test.ts
git commit -m "test: verify estimator sales lead accessibility"
```

## Self-review

- Spec coverage: Tasks 1–3 implement the dedicated aggregate, owner-only API, activities, validation, timestamps, and audit logging. Tasks 4–6 implement the role routes, list/search/filter/create/detail/activity UI, states, and deferred estimate boundary. Task 7 adds accessibility and complete regression verification.
- Scope check: The plan deliberately excludes estimate configuration, uploads, designer approval, client approval, project creation, and notifications; those each require their own later plan.
- Type consistency: `LeadRecord`, `LeadActivityRecord`, `LeadStage`, `CreateLeadInput`, `UpdateLeadInput`, and `CreateLeadActivityInput` are introduced in Task 1 and consumed consistently by Tasks 2–6.
- Placeholder scan: No TODO/TBD or deferred implementation steps remain; the only intentionally unavailable capability is a visible, non-functional estimate boundary required by the approved scope.
