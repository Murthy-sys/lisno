# Lisno Role-Based Design Operations Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build synchronized React and Node applications for four role-based design workflows, task risk forecasting, file-version access, evaluations, and auditable KPI calculation.

**Architecture:** A Vite React SPA in `frontend/` consumes versioned REST endpoints from an Express API in `backend/`. MongoDB/Mongoose persists production data, while a deterministic in-memory demo repository gives tests and local review the same contracts without requiring a running MongoDB instance.

**Tech Stack:** React 19, TypeScript 5, Vite, Tailwind CSS 4, React Router, TanStack Query, React Hook Form, Zod, Express 5, Mongoose, JWT, bcryptjs, Multer, Vitest, Testing Library, and Supertest.

## Global Constraints

- Keep `frontend/` and `backend/` independently runnable under the repository root.
- All API endpoints live under `/api/v1`.
- The backend is the authorization boundary for all role and entity access.
- Calculated KPI is immutable; manager/head evaluations remain separate and audited.
- Task risk is calculated by the backend and returned with a text reason.
- Uploaded files use a replaceable local-storage adapter in the first release.
- Only approved, explicitly client-visible design versions are exposed to clients.
- Status must never rely on color alone.
- Use the supplied Lisno HTML for visual direction and the workflow PDF for process direction.

---

## File Map

### Root

- `README.md`: setup, demo accounts, scripts, architecture, KPI summary.
- `.gitignore`: frontend/backend build output, environment files, and upload data.

### Backend

- `backend/package.json`: backend commands and dependencies.
- `backend/tsconfig.json`, `backend/vitest.config.ts`: TypeScript/test configuration.
- `backend/.env.example`: Mongo, JWT, CORS, port, storage configuration.
- `backend/src/app.ts`: Express assembly and middleware.
- `backend/src/server.ts`: environment validation, Mongo connection, startup.
- `backend/src/config/env.ts`: typed environment parsing.
- `backend/src/contracts/domain.ts`: enums and API-safe domain interfaces.
- `backend/src/contracts/http.ts`: response, pagination, and error contracts.
- `backend/src/domain/risk.ts`: risk forecast and color rules.
- `backend/src/domain/kpi.ts`: KPI component and weighted aggregation formulae.
- `backend/src/domain/permissions.ts`: role/entity authorization predicates.
- `backend/src/repositories/types.ts`: repository interfaces.
- `backend/src/repositories/memory.ts`: deterministic demo/test repository.
- `backend/src/models/*.ts`: Mongoose schemas.
- `backend/src/repositories/mongo.ts`: Mongo repository implementation.
- `backend/src/services/*.ts`: authentication, project, task, hierarchy, file,
  evaluation, audit, and KPI orchestration.
- `backend/src/middleware/*.ts`: authentication, error handling, validation, upload.
- `backend/src/routes/*.ts`: versioned REST route handlers.
- `backend/src/seed/data.ts`, `backend/src/seed/run.ts`: demo fixtures and Mongo seed.
- `backend/src/storage/*.ts`: file-storage interface and local adapter.
- `backend/tests/*.test.ts`: domain and integration tests.

### Frontend

- `frontend/package.json`: frontend commands and dependencies.
- `frontend/tsconfig*.json`, `frontend/vite.config.ts`: build/test configuration.
- `frontend/.env.example`: API origin.
- `frontend/src/main.tsx`: application entry.
- `frontend/src/app/router.tsx`: protected role routes.
- `frontend/src/app/providers.tsx`: QueryClient and authentication provider.
- `frontend/src/api/client.ts`: typed fetch client and auth/error handling.
- `frontend/src/api/types.ts`: frontend view of REST contracts.
- `frontend/src/auth/*.tsx`: login, session store, route guards.
- `frontend/src/components/layout/*.tsx`: shell, sidebar, mobile header.
- `frontend/src/components/ui/*.tsx`: cards, badges, progress, states, dialogs.
- `frontend/src/components/kpi/*.tsx`: KPI score and component breakdown.
- `frontend/src/components/tasks/*.tsx`: task row, risk badge, update dialog.
- `frontend/src/features/designer/*.tsx`: designer dashboard and project workspace.
- `frontend/src/features/manager/*.tsx`: team cards and designer detail.
- `frontend/src/features/head/*.tsx`: manager/designer hierarchy and evaluations.
- `frontend/src/features/client/*.tsx`: project and approved plan portal.
- `frontend/src/styles/index.css`: Tailwind theme and Lisno tokens.
- `frontend/src/test/*.tsx`: test server, render helper, and fixtures.
- `frontend/src/**/*.test.tsx`: role and interaction tests.

---

### Task 1: Workspace Scaffolding and Health Contract

**Files:**
- Create: `README.md`
- Modify: `.gitignore`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.example`
- Create: `backend/src/config/env.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Create: `backend/src/routes/health.ts`
- Create: `backend/tests/health.test.ts`
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles/index.css`
- Create: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: `GET /api/v1/health -> { data: { status: "ok" } }`
- Produces: independent `npm run dev`, `npm test`, `npm run typecheck`, and
  `npm run build` commands in both folders.

- [ ] **Step 1: Write failing backend health test**

```ts
it("returns API health", async () => {
  const response = await request(createApp()).get("/api/v1/health");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ data: { status: "ok" } });
});
```

- [ ] **Step 2: Write failing frontend shell test**

```tsx
it("renders the Lisno application shell", () => {
  render(<App />);
  expect(screen.getByText("Design operations, clearly delivered.")).toBeVisible();
});
```

- [ ] **Step 3: Install dependencies and confirm tests fail**

Run:

```bash
cd backend && npm install && npm test
cd ../frontend && npm install && npm test
```

Expected: tests fail because `createApp` and the application shell are absent.

- [ ] **Step 4: Implement minimal health API and branded frontend shell**

Use `createApp()` as a factory so tests do not bind ports. Add Tailwind theme
tokens for Lisno navy, violet, parchment, success, warning, danger, ink, and
muted colors. The first screen contains only the branded background and shell
copy required by the test.

- [ ] **Step 5: Verify both workspaces**

Run:

```bash
cd backend && npm run typecheck && npm test
cd ../frontend && npm run typecheck && npm test && npm run build
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add .gitignore README.md backend frontend
git commit -m "chore: scaffold lisno frontend and backend"
```

---

### Task 2: Domain Contracts, Risk Forecasting, and KPI Formulae

**Files:**
- Create: `backend/src/contracts/domain.ts`
- Create: `backend/src/contracts/http.ts`
- Create: `backend/src/domain/risk.ts`
- Create: `backend/src/domain/kpi.ts`
- Create: `backend/tests/risk.test.ts`
- Create: `backend/tests/kpi.test.ts`
- Create: `frontend/src/api/types.ts`

**Interfaces:**
- Produces:

```ts
type Role = "designer" | "design_manager" | "design_head" | "client";
type TaskStatus = "not_started" | "in_progress" | "in_review" | "blocked" | "completed";
type RiskLevel = "gray" | "green" | "yellow" | "red";

interface TaskRisk {
  level: RiskLevel;
  reason: string;
  elapsedRatio: number;
  progressRatio: number;
  forecastCompletion?: string;
}

function calculateTaskRisk(task: KpiTask, now: Date): TaskRisk;
function calculateKpi(input: KpiInput): KpiResult;
function weightedAverage(items: Array<{ score: number; weight: number }>): number;
```

- [ ] **Step 1: Write risk boundary tests**

Cover not-started gray, healthy green, low-buffer yellow, forecast-late yellow,
blocked yellow, due-within-two-days yellow, overdue red, on-time-completed
green, and late-completed red with fixed UTC timestamps.

- [ ] **Step 2: Run risk tests and verify failure**

Run: `cd backend && npm test -- risk.test.ts`

Expected: FAIL because `calculateTaskRisk` does not exist.

- [ ] **Step 3: Implement deterministic risk calculation**

Use millisecond schedule durations, clamp ratios from 0 to 1, calculate
velocity only when elapsed and progress are positive, and return the exact
human-readable reason selected by the highest-priority rule.

- [ ] **Step 4: Run risk tests**

Run: `cd backend && npm test -- risk.test.ts`

Expected: PASS.

- [ ] **Step 5: Write KPI tests**

Cover every timing score band, approval-version scores, revision efficiency,
two-business-day update windows, workload completion, missing-component weight
normalization, and effort-weighted aggregation.

- [ ] **Step 6: Run KPI tests and verify failure**

Run: `cd backend && npm test -- kpi.test.ts`

Expected: FAIL because `calculateKpi` does not exist.

- [ ] **Step 7: Implement KPI functions**

Return:

```ts
interface KpiResult {
  score: number;
  components: Array<{
    key: "onTime" | "quality" | "revisionEfficiency" | "updateDiscipline" | "workloadCompletion";
    label: string;
    score: number | null;
    configuredWeight: number;
    effectiveWeight: number;
    eligibleCount: number;
    explanation: string;
  }>;
}
```

Round displayed scores to one decimal only at the result boundary.

- [ ] **Step 8: Verify contracts and formulas**

Run: `cd backend && npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/contracts backend/src/domain backend/tests frontend/src/api/types.ts
git commit -m "feat: add task risk and KPI domain formulas"
```

---

### Task 3: Repository Layer, Mongo Models, and Seed Data

**Files:**
- Create: `backend/src/repositories/types.ts`
- Create: `backend/src/repositories/memory.ts`
- Create: `backend/src/models/User.ts`
- Create: `backend/src/models/Project.ts`
- Create: `backend/src/models/Floor.ts`
- Create: `backend/src/models/DesignStage.ts`
- Create: `backend/src/models/Task.ts`
- Create: `backend/src/models/TaskEvent.ts`
- Create: `backend/src/models/DesignVersion.ts`
- Create: `backend/src/models/Evaluation.ts`
- Create: `backend/src/models/AuditEvent.ts`
- Create: `backend/src/repositories/mongo.ts`
- Create: `backend/src/seed/data.ts`
- Create: `backend/src/seed/run.ts`
- Create: `backend/tests/repository.test.ts`

**Interfaces:**
- Produces: `AppRepository` with user, project, hierarchy, task, version,
  evaluation, and audit methods.
- Produces: `createMemoryRepository(seed?: SeedData): AppRepository`.
- Produces: `createMongoRepository(): AppRepository`.

- [ ] **Step 1: Write repository contract tests**

Test designer-to-manager hierarchy, client project isolation, floor-stage-task
ordering, append-only task events, evaluation revision history, and audit-event
creation against `createMemoryRepository`.

- [ ] **Step 2: Verify repository tests fail**

Run: `cd backend && npm test -- repository.test.ts`

Expected: FAIL because repository implementations are missing.

- [ ] **Step 3: Define focused repository interfaces**

Use discrete methods such as:

```ts
findUserByEmail(email: string): Promise<UserRecord | null>;
listProjectsForUser(user: UserRecord): Promise<ProjectRecord[]>;
getOrganizationTree(): Promise<ManagerTreeNode[]>;
updateTask(id: string, expectedVersion: number, change: TaskChange): Promise<TaskRecord>;
appendTaskEvent(event: NewTaskEvent): Promise<TaskEventRecord>;
createEvaluation(input: NewEvaluation): Promise<EvaluationRecord>;
appendAuditEvent(input: NewAuditEvent): Promise<AuditEventRecord>;
```

- [ ] **Step 4: Implement deterministic in-memory repository**

Clone seed input on construction and return copies from read methods so tests
cannot mutate repository state accidentally.

- [ ] **Step 5: Add Mongoose schemas and Mongo adapter**

Use timestamps, indexes on email/role/manager/client/project, optimistic
concurrency for tasks, and discriminated string enums matching domain
contracts.

- [ ] **Step 6: Add representative seed data**

Seed one head, two managers, at least four designers, two clients, three
projects, multiple floors, all key stage types, and tasks that intentionally
produce green, yellow, red, and gray states.

- [ ] **Step 7: Verify repository layer**

Run: `cd backend && npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/repositories backend/src/models backend/src/seed backend/tests/repository.test.ts
git commit -m "feat: add persistence contracts and seeded design data"
```

---

### Task 4: Authentication and Role Authorization

**Files:**
- Create: `backend/src/domain/permissions.ts`
- Create: `backend/src/services/auth.service.ts`
- Create: `backend/src/middleware/auth.ts`
- Create: `backend/src/middleware/errors.ts`
- Create: `backend/src/middleware/validate.ts`
- Create: `backend/src/routes/auth.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/auth.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/auth/login`
- Produces: `GET /api/v1/auth/me`
- Produces:

```ts
interface AuthPayload {
  token: string;
  user: { id: string; name: string; email: string; role: Role; avatar?: string };
}
```

- [ ] **Step 1: Write authentication integration tests**

Test valid seeded login for all roles, invalid credentials, inactive user,
missing token, expired token, and `/me` returning no password fields.

- [ ] **Step 2: Verify tests fail**

Run: `cd backend && npm test -- auth.test.ts`

Expected: route-not-found failures.

- [ ] **Step 3: Implement password and JWT service**

Issue tokens containing only user id and role. Load the current user from the
repository on every authenticated request so deactivated users lose access.

- [ ] **Step 4: Implement authentication middleware and structured errors**

All errors follow:

```ts
{ error: { code: string; message: string; fields?: Record<string, string> } }
```

- [ ] **Step 5: Verify authentication**

Run: `cd backend && npm run typecheck && npm test -- auth.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/domain/permissions.ts backend/src/services/auth.service.ts backend/src/middleware backend/src/routes/auth.ts backend/src/app.ts backend/tests/auth.test.ts
git commit -m "feat: add JWT authentication and role authorization"
```

---

### Task 5: Project, Task, Hierarchy, KPI, and Evaluation APIs

**Files:**
- Create: `backend/src/services/project.service.ts`
- Create: `backend/src/services/task.service.ts`
- Create: `backend/src/services/hierarchy.service.ts`
- Create: `backend/src/services/kpi.service.ts`
- Create: `backend/src/services/evaluation.service.ts`
- Create: `backend/src/services/audit.service.ts`
- Create: `backend/src/routes/projects.ts`
- Create: `backend/src/routes/tasks.ts`
- Create: `backend/src/routes/organization.ts`
- Create: `backend/src/routes/kpis.ts`
- Create: `backend/src/routes/evaluations.ts`
- Create: `backend/src/routes/audit.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/workflows.test.ts`

**Interfaces:**
- Produces:

```text
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:projectId
POST   /api/v1/projects/:projectId/floors
POST   /api/v1/floors/:floorId/stages
POST   /api/v1/stages/:stageId/tasks
PATCH  /api/v1/tasks/:taskId
PATCH  /api/v1/tasks/:taskId/deadline
GET    /api/v1/organization/tree
GET    /api/v1/designers/:designerId/summary
GET    /api/v1/kpis/users/:userId
POST   /api/v1/evaluations
GET    /api/v1/evaluations/:subjectId
GET    /api/v1/audit
```

- [ ] **Step 1: Write role workflow integration tests**

Test designer project creation and task updates, immutable original deadline,
manager reasoned deadline revision, manager-own-team restriction, head
organization access, client project isolation, KPI immutability, evaluation
separation, and audit entries.

- [ ] **Step 2: Verify workflow tests fail**

Run: `cd backend && npm test -- workflows.test.ts`

Expected: route-not-found failures.

- [ ] **Step 3: Implement project and task services**

Validate status transitions, progress range 0–100, completed task progress
100, dependency completion, entity access, and optimistic version numbers.
Append task and audit events in the same service operation.

- [ ] **Step 4: Implement hierarchy and designer summaries**

Return manager nodes with designer summary cards; never serialize password
hashes or inaccessible client/project fields.

- [ ] **Step 5: Implement KPI endpoints**

Calculate on read from repository records using the domain functions. Accept
validated `from` and `to` query dates and return risk explanations with task
summaries.

- [ ] **Step 6: Implement evaluation and audit endpoints**

Managers evaluate only assigned designers. Heads evaluate managers or
designers. Corrections create a new record linked by `revisionOf`.

- [ ] **Step 7: Verify workflows**

Run: `cd backend && npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services backend/src/routes backend/src/app.ts backend/tests/workflows.test.ts
git commit -m "feat: add role-based design workflow APIs"
```

---

### Task 6: Versioned File Upload and Client Visibility

**Files:**
- Create: `backend/src/storage/storage.ts`
- Create: `backend/src/storage/local-storage.ts`
- Create: `backend/src/middleware/upload.ts`
- Create: `backend/src/services/design-version.service.ts`
- Create: `backend/src/routes/design-versions.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/uploads/.gitkeep`
- Create: `backend/tests/uploads.test.ts`

**Interfaces:**
- Produces:

```text
POST  /api/v1/tasks/:taskId/design-versions
GET   /api/v1/projects/:projectId/design-versions
PATCH /api/v1/design-versions/:versionId/approval
GET   /api/v1/design-versions/:versionId/download
```

- [ ] **Step 1: Write upload integration tests**

Test valid PDF/image upload, rejected MIME/size, monotonic version number,
failed-storage cleanup, manager/head approval, client-visible toggle, and
client download denial for draft/internal files.

- [ ] **Step 2: Verify tests fail**

Run: `cd backend && npm test -- uploads.test.ts`

Expected: route-not-found failures.

- [ ] **Step 3: Implement storage adapter and upload middleware**

Generate server-side UUID filenames, preserve original filenames as metadata,
limit size using `MAX_UPLOAD_MB`, and support PDF, PNG, JPEG, and WebP.

- [ ] **Step 4: Implement version service and routes**

Create metadata only after storage succeeds. Delete the stored object if
metadata persistence fails. Stream downloads after authorization.

- [ ] **Step 5: Verify uploads**

Run: `cd backend && npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/storage backend/src/middleware/upload.ts backend/src/services/design-version.service.ts backend/src/routes/design-versions.ts backend/src/app.ts backend/uploads backend/tests/uploads.test.ts
git commit -m "feat: add secure design version uploads"
```

---

### Task 7: Frontend Authentication, API Client, and Responsive Shell

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/app/providers.tsx`
- Create: `frontend/src/app/router.tsx`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/auth/AuthProvider.tsx`
- Create: `frontend/src/auth/LoginPage.tsx`
- Create: `frontend/src/auth/ProtectedRoute.tsx`
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/components/layout/MobileHeader.tsx`
- Create: `frontend/src/components/ui/AsyncState.tsx`
- Create: `frontend/src/components/ui/StatusBadge.tsx`
- Create: `frontend/src/test/server.ts`
- Create: `frontend/src/test/render.tsx`
- Create: `frontend/src/auth/LoginPage.test.tsx`
- Create: `frontend/src/app/router.test.tsx`

**Interfaces:**
- Consumes: authentication endpoints from Task 4.
- Produces: `useAuth()`, `apiClient`, role redirects, protected routes, and
  responsive application shell.

- [ ] **Step 1: Write login and role-routing tests**

Test generic invalid-login copy, successful role redirects, restored session,
expired-session redirect, cross-role route denial, and logout.

- [ ] **Step 2: Verify frontend tests fail**

Run: `cd frontend && npm test -- LoginPage.test.tsx router.test.tsx`

Expected: FAIL because auth components are missing.

- [ ] **Step 3: Implement typed fetch client**

Attach bearer token, parse structured errors, clear session on 401, and expose
typed `get`, `post`, `patch`, and multipart helpers.

- [ ] **Step 4: Implement authentication provider and route guards**

Persist only the token. Resolve the current user from `/auth/me` at startup.
Redirect to role home using a single `roleHomePath(role)` function.

- [ ] **Step 5: Implement Lisno login and shell**

Use the approved navy/violet visual direction, accessible fields, password
toggle, demo-account helper, desktop sidebar, and mobile drawer.

- [ ] **Step 6: Verify authentication UI**

Run: `cd frontend && npm run typecheck && npm test && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: add role-aware frontend authentication"
```

---

### Task 8: Designer Dashboard and Task Workspace

**Files:**
- Create: `frontend/src/components/ui/MetricCard.tsx`
- Create: `frontend/src/components/ui/ProgressBar.tsx`
- Create: `frontend/src/components/kpi/KpiScore.tsx`
- Create: `frontend/src/components/kpi/KpiBreakdown.tsx`
- Create: `frontend/src/components/tasks/RiskBadge.tsx`
- Create: `frontend/src/components/tasks/TaskRow.tsx`
- Create: `frontend/src/components/tasks/TaskUpdateDialog.tsx`
- Create: `frontend/src/components/tasks/DesignUploadDialog.tsx`
- Create: `frontend/src/features/designer/DesignerDashboard.tsx`
- Create: `frontend/src/features/designer/ProjectWorkspace.tsx`
- Create: `frontend/src/features/designer/ProjectCreateDialog.tsx`
- Modify: `frontend/src/app/router.tsx`
- Create: `frontend/src/features/designer/DesignerDashboard.test.tsx`
- Create: `frontend/src/features/designer/ProjectWorkspace.test.tsx`

**Interfaces:**
- Consumes: projects, task, KPI, and upload endpoints.
- Produces: `/designer`, `/designer/projects/:projectId`.

- [ ] **Step 1: Write designer dashboard tests**

Test KPI summary, project cards, red/yellow counts, risk label plus reason,
empty state, and project navigation.

- [ ] **Step 2: Write task workspace tests**

Test floor/stage expansion, task status/progress update, blocked note, upload
submission, original/current deadline display, and query refresh after mutation.

- [ ] **Step 3: Verify tests fail**

Run: `cd frontend && npm test -- DesignerDashboard.test.tsx ProjectWorkspace.test.tsx`

Expected: missing-component failures.

- [ ] **Step 4: Implement designer dashboard**

Present KPI as a large score with a five-component breakdown, compact metric
cards, deadline-health project cards, and recent activity.

- [ ] **Step 5: Implement project workspace**

Use accessible disclosure controls for floors and stages. Render every task
with text status, risk color, reason, progress, deadline, effort, and latest
update. Keep mutation forms in dialogs with inline validation.

- [ ] **Step 6: Verify designer workflow**

Run: `cd frontend && npm run typecheck && npm test && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components frontend/src/features/designer frontend/src/app/router.tsx
git commit -m "feat: add designer projects and task tracking"
```

---

### Task 9: Manager and Design Head Workspaces

**Files:**
- Create: `frontend/src/components/kpi/KpiTrend.tsx`
- Create: `frontend/src/components/ui/DesignerCard.tsx`
- Create: `frontend/src/components/ui/EvaluationForm.tsx`
- Create: `frontend/src/features/manager/ManagerDashboard.tsx`
- Create: `frontend/src/features/manager/DesignerDetail.tsx`
- Create: `frontend/src/features/manager/DeadlineRevisionDialog.tsx`
- Create: `frontend/src/features/head/HeadDashboard.tsx`
- Create: `frontend/src/features/head/OrganizationTree.tsx`
- Modify: `frontend/src/app/router.tsx`
- Create: `frontend/src/features/manager/ManagerDashboard.test.tsx`
- Create: `frontend/src/features/manager/DesignerDetail.test.tsx`
- Create: `frontend/src/features/head/HeadDashboard.test.tsx`

**Interfaces:**
- Consumes: organization, designer summary, KPI, evaluation, task deadline,
  and audit endpoints.
- Produces: `/manager`, `/manager/designers/:designerId`, `/head`.

- [ ] **Step 1: Write manager tests**

Test assigned designer cards, search/filter, designer detail, component KPI,
project/task risk, mandatory deadline reason, evaluation submission, and
calculated KPI remaining unchanged.

- [ ] **Step 2: Write head hierarchy tests**

Test manager cards, expandable manager-to-designer tree, team summary, designer
navigation, manager evaluation, designer evaluation, and past evaluation
history.

- [ ] **Step 3: Verify tests fail**

Run:

```bash
cd frontend && npm test -- ManagerDashboard.test.tsx DesignerDetail.test.tsx HeadDashboard.test.tsx
```

Expected: missing-component failures.

- [ ] **Step 4: Implement manager workspace**

Use responsive designer cards and a detail page with KPI breakdown, trend,
projects, risk queue, audit timeline, deadline revision, and evaluation panel.

- [ ] **Step 5: Implement head hierarchy**

Use nested accessible disclosures. Manager cards show team effort-weighted KPI,
workload, red/yellow counts, and evaluation coverage; expanded content reuses
designer cards.

- [ ] **Step 6: Verify management workflows**

Run: `cd frontend && npm run typecheck && npm test && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components frontend/src/features/manager frontend/src/features/head frontend/src/app/router.tsx
git commit -m "feat: add manager and design head workspaces"
```

---

### Task 10: Client Portal

**Files:**
- Create: `frontend/src/features/client/ClientDashboard.tsx`
- Create: `frontend/src/features/client/ClientProject.tsx`
- Create: `frontend/src/components/ui/FilePreview.tsx`
- Modify: `frontend/src/app/router.tsx`
- Create: `frontend/src/features/client/ClientDashboard.test.tsx`
- Create: `frontend/src/features/client/ClientProject.test.tsx`

**Interfaces:**
- Consumes: client-filtered projects and approved/client-visible versions.
- Produces: `/client`, `/client/projects/:projectId`.

- [ ] **Step 1: Write client portal tests**

Test multiple projects, floor progress, latest approved update, approved file
preview/download, absence of drafts/internal notes/KPI/evaluations, and both
client empty-state variants.

- [ ] **Step 2: Verify tests fail**

Run: `cd frontend && npm test -- ClientDashboard.test.tsx ClientProject.test.tsx`

Expected: missing-component failures.

- [ ] **Step 3: Implement client dashboard and project page**

Use larger, calmer project cards than internal dashboards. Group versions by
floor, display approval metadata, preview supported images/PDFs, and use an
authenticated blob download for files.

- [ ] **Step 4: Verify client portal**

Run: `cd frontend && npm run typecheck && npm test && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/client frontend/src/components/ui/FilePreview.tsx frontend/src/app/router.tsx
git commit -m "feat: add client design plan portal"
```

---

### Task 11: End-to-End Integration, Documentation, and Visual QA

**Files:**
- Modify: `README.md`
- Modify: `backend/.env.example`
- Modify: `frontend/.env.example`
- Create: `backend/tests/full-journey.test.ts`
- Create: `frontend/src/test/accessibility.test.tsx`
- Create: `design-qa.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: reproducible local setup, demo credentials, final verification
  record, and cross-role journey coverage.

- [ ] **Step 1: Write full backend journey test**

Log in as designer, create/update a task, upload a version; log in as manager,
revise deadline and evaluate; log in as head, inspect hierarchy and evaluate;
log in as client, verify only approved/client-visible version access.

- [ ] **Step 2: Write frontend accessibility smoke tests**

Render login and each role home with API fixtures; assert labeled form fields,
named navigation, keyboard-operable disclosures/dialogs, no unlabeled status
color, and no obvious automated accessibility violations.

- [ ] **Step 3: Run new tests and correct failures**

Run:

```bash
cd backend && npm test -- full-journey.test.ts
cd ../frontend && npm test -- accessibility.test.tsx
```

Expected: PASS after integration corrections.

- [ ] **Step 4: Complete documentation**

Document prerequisites, Mongo setup, environment variables, seed command,
demo credentials, development commands, upload directory, KPI formula, risk
rules, role permissions, tests, and production build commands.

- [ ] **Step 5: Run complete automated verification**

Run:

```bash
cd backend && npm run typecheck && npm run lint && npm test && npm run build
cd ../frontend && npm run typecheck && npm run lint && npm test && npm run build
```

Expected: all commands exit 0 with no failing tests.

- [ ] **Step 6: Perform visual and responsive QA**

Run both applications against deterministic seed data. Review login and all
four role experiences at 1440x900 and 390x844. Record route, viewport,
interaction coverage, and findings in `design-qa.md`. Correct clipping,
overflow, unreadable density, missing focus, confusing hierarchy, and any
status that relies only on color.

- [ ] **Step 7: Re-run complete verification after QA fixes**

Run the commands from Step 5 again.

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add README.md backend frontend design-qa.md
git commit -m "test: verify complete role-based design workflow"
```

