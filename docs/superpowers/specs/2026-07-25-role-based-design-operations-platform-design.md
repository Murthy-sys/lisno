# Lisno Role-Based Design Operations Platform

## Purpose

Build a design-operations application for Lisno with four roles: Designer,
Design Manager, Design Head, and Client. The system tracks design work at
project, floor, stage, and task level; exposes the appropriate data to each
role; forecasts delivery risk; and calculates trustworthy, auditable KPIs.

The supplied Lisno HTML is the visual and product-language reference. The
supplied workflow PDF is the process reference, especially for staged design
work, deadlines, ownership, dependencies, and escalation.

## Technical Architecture

The repository contains two independently runnable, synchronized TypeScript
applications:

- `frontend/`: React, Vite, TypeScript, Tailwind CSS, React Router, TanStack
  Query, and Vitest/Testing Library.
- `backend/`: Node.js, Express, TypeScript, MongoDB with Mongoose, JWT
  authentication, bcrypt password hashing, Zod request validation, Multer file
  uploads, and Vitest/Supertest.

The applications communicate through versioned REST endpoints under
`/api/v1`. Frontend API types and backend response contracts use the same field
names and enums. The backend is the authorization boundary; hiding a frontend
control never substitutes for an API permission check.

Uploaded files use local backend storage for the first release, behind a
storage service interface so cloud object storage can replace it later without
changing project or design-version services.

## Roles and Permissions

### Designer

- View assigned and initiated projects.
- Initiate projects for authorized clients.
- Create floors, stages, and tasks within accessible projects.
- Upload versioned design files against a floor, stage, and task.
- Update task status, progress, notes, and actual completion time.
- View personal task risk, project progress, calculated KPI, KPI breakdown,
  and evaluation history.
- Cannot edit calculated KPI, manager/head evaluations, original deadlines, or
  other designers' private data.

### Design Manager

- View designers assigned directly to the manager.
- View their projects, floors, tasks, uploads, risk, timelines, and KPI
  breakdowns.
- Revise a task deadline only with a mandatory reason. The original deadline
  remains immutable and the change is audited.
- Add a separate manager evaluation with score and comments.
- Cannot overwrite calculated KPI or head evaluations.

### Design Head

- View all design managers and their assigned designers in an expandable
  manager-to-designer hierarchy.
- View manager team performance and all accessible designer/project details.
- Add head evaluations for managers and designers.
- Review manager evaluations and complete audit history.
- Cannot overwrite calculated KPI.

### Client

- View all projects associated with the client account.
- View floor-level progress.
- Preview and download only approved versions explicitly marked client-visible.
- Cannot access internal notes, drafts, task KPI details, staff evaluations, or
  organization data.

## Authentication and Routing

Users sign in with email and password. The backend returns a short-lived JWT
and the authenticated user profile. Protected routes validate the JWT and role.
After login, the frontend redirects by role:

- Designer: `/designer`
- Design Manager: `/manager`
- Design Head: `/head`
- Client: `/client`

Seed data provides one usable login for each role plus representative managers,
designers, clients, projects, floors, tasks, status history, design versions,
and evaluations.

## Domain Model

### User

Contains identity, email, password hash, role, active status, manager
relationship for designers, and profile metadata.

### Project

Contains project identity, client, initiating designer, assigned designers and
manager, project status, location, planned dates, and actual dates. A client
may have many projects and a designer may work on many projects.

### Floor

Belongs to one project and contains a name/number, ordering, progress summary,
and floor-specific dates.

### Design Stage

Belongs to a floor and represents a workflow phase such as:

1. Internal kickoff
2. Client kickoff
3. Key collection
4. Site measurement
5. Concept and mood board
6. Floor plan
7. Client revisions
8. Final approval
9. Design handoff

Stages are ordered and can declare dependencies on prior stages.

### Task

Belongs to a design stage and contains owner, planned start, original deadline,
current deadline, planned effort, progress percentage, status, actual
completion, dependency references, and latest update time.

Statuses are `not_started`, `in_progress`, `in_review`, `blocked`, and
`completed`. Every status/progress change creates an append-only history event.

### Design Version

Belongs to a project, floor, stage, and optionally a task. It contains a version
number, original filename, stored file reference, MIME type, size, uploader,
upload time, approval state, reviewer, approval time, and `clientVisible`.

### Evaluation

Contains subject user, evaluator, evaluator role, evaluation period, score from
0 to 100, comments, and timestamp. Evaluations never change calculated KPI.
Corrections create a new evaluation revision so history remains visible.

### Audit Event

Records actor, action, entity type/id, timestamp, old values, new values, and
reason. Status changes, progress changes, uploads, approvals, visibility
changes, deadline revisions, and evaluations are audited.

## Designer Experience

The dashboard shows personal KPI, active projects, tasks due soon, red/yellow
risks, and recent activity. Project cards show overall progress, floor count,
deadline health, and the next task.

Opening a project shows floors. Each floor expands into ordered stages and
task rows. A designer can update a task's status and progress, add a note, and
upload a design version from the task row or detail panel. Each row displays:

- Status and progress
- Owner
- Current and original deadline when changed
- Planned effort
- Risk color
- Plain-language explanation for the color
- Latest update time
- KPI contribution after completion or overdue state

## Manager Experience

The manager dashboard shows one card per assigned designer with avatar,
calculated KPI, active project count, workload, overdue count, yellow-risk
count, and pending evaluation state.

Opening a designer card provides:

- KPI score and component breakdown
- KPI trend by evaluation period
- Active and completed projects
- Floor/stage/task progress
- Red/yellow task list
- Design version timeline
- Status-update history
- Manager evaluation form and past evaluations

Deadline revisions require a new deadline and reason. The UI presents the
original and revised deadline and the audit event.

## Design Head Experience

The head dashboard presents expandable tree cards:

`Design Manager -> Assigned Designers -> Projects`

Each manager card summarizes team KPI, workload, overdue work, at-risk work,
and evaluation coverage. Expanding it shows designer cards matching the
manager dashboard. The head can inspect manager/team metrics, open any
designer, review manager evaluations, and add head evaluations for managers or
designers.

## Client Experience

The client portal shows project cards with progress, expected completion,
floor count, and latest approved update. A project page lists floors and only
approved, client-visible design versions. Files can be previewed when supported
and downloaded. Empty states clearly distinguish "work in progress" from "no
approved plan available."

## Task Risk Colors

Colors are calculated on the backend and returned with a reason string. The
frontend does not recreate the business formula.

For an open task:

1. Calculate total scheduled duration from planned start to current deadline.
2. Calculate elapsed ratio, clamped from 0 to 1.
3. Calculate remaining schedule buffer as
   `progressRatio - elapsedRatio`.
4. Estimate completion time using observed progress velocity when progress is
   greater than zero.

Classification:

- Gray: not started, before planned start, and not at risk.
- Green: completed on/before the current deadline, or open with at least a 20
  percentage-point positive schedule buffer and forecast on/before deadline.
- Yellow: before the current deadline but forecast after it, within 20
  percentage points of expected progress, behind expected progress, blocked,
  or due within two calendar days without completion.
- Red: incomplete after the current deadline or completed after it.

Yellow therefore represents suspected deadline crossing before it happens.
Red represents an actual deadline breach. The priority order is red, yellow,
green, then gray.

## KPI Formula

KPIs are calculated for a requested reporting period and shown from 0 to 100.
Only tasks whose schedule or completion overlaps the period are included.
Tasks are weighted by positive planned effort; missing or zero effort defaults
to weight 1.

### 1. On-Time Completion - 35%

Each completed or currently overdue task receives:

- Completed by deadline: 100
- Was yellow but recovered and completed by deadline: 90
- Late by up to 10% of planned duration: 70
- Late by more than 10% and up to 25%: 40
- Late by more than 25%, or still overdue: 0

The component is the effort-weighted average of eligible task scores.

### 2. Design Quality and Approval Efficiency - 25%

For completed design stages:

- Approved on first submitted version: 100
- Approved on second version: 85
- Approved on third version: 65
- Approved on fourth version: 40
- More than four versions or rejected/unapproved after deadline: 0

The component is effort-weighted by the tasks attached to each stage.

### 3. Revision Efficiency - 15%

For stages with client or internal review:

`max(0, 100 - max(0, revisionCount - 1) * 20)`

One revision is tolerated without penalty. The component is the
effort-weighted average across eligible stages.

### 4. Status-Update Discipline - 15%

While a task is active, an update is considered timely when a status, progress,
or note event is recorded at least once every two business days. The component
is:

`timelyRequiredUpdateWindows / totalRequiredUpdateWindows * 100`

Completed tasks stop generating required update windows.

### 5. Workload Completion - 10%

For tasks scheduled within the period:

`completedPlannedEffort / totalPlannedEffort * 100`

The value is capped from 0 to 100.

### Final Calculated KPI

`onTime * 0.35 + quality * 0.25 + revisionEfficiency * 0.15 + updateDiscipline * 0.15 + workloadCompletion * 0.10`

Components without eligible data are excluded and the remaining weights are
normalized to total 100%. The API returns the score, component scores,
effective weights, eligible item counts, and explanatory details.

For project, designer, manager team, and organization views, aggregation uses
planned-effort weighting. Tiny tasks therefore cannot dominate the result.

## Evaluations and Blended Indicator

Calculated KPI is immutable. Manager and head evaluations are displayed
separately with evaluator, period, score, comments, and history.

When an evaluation exists, the UI may show a clearly labeled blended
performance indicator:

`calculatedKpi * 0.80 + latestApplicableEvaluation * 0.20`

The calculated KPI and evaluation score remain visible beside it. The blended
indicator is not persisted as a replacement KPI and is not used to rewrite
task outcomes.

## API Boundaries

The REST API includes modules for:

- Authentication and current user
- Users and organization hierarchy
- Projects and client membership
- Floors, stages, tasks, and task updates
- Design upload, version listing, approval, visibility, and download
- KPI calculation and period summaries
- Evaluations and evaluation history
- Audit events

List endpoints use pagination and explicit filters. Mutations validate entity
access and return structured errors with a stable code, message, and optional
field errors.

## Error and Empty States

- Invalid credentials return a generic authentication error.
- Expired tokens redirect to login after clearing local session state.
- Unauthorized API access returns 403 and does not disclose inaccessible data.
- Invalid task transitions and progress values return field-level errors.
- File uploads validate extension/MIME type and configurable maximum size.
- Failed uploads do not create partial design-version records.
- Concurrent updates use document version checks and return a conflict response.
- Every dashboard includes loading, empty, error, and retry states.

## Visual Direction

Retain the supplied Lisno reference's restrained purple/navy identity, compact
information density, serif display accents, rounded cards, subtle borders, and
clear status colors. The new UI is responsive and accessible:

- Desktop uses a left navigation rail and content workspace.
- Mobile uses a compact header, drawer navigation, and stacked cards.
- Status never relies on color alone; every color has a text label and reason.
- Keyboard focus, form labels, contrast, and semantic controls are required.

## Verification

Backend unit tests cover:

- Risk color priority and boundary dates
- Forecast and buffer calculations
- Every KPI component and weight normalization
- Effort-weighted aggregation
- Evaluation separation

Backend integration tests cover authentication, role permissions, hierarchy
visibility, designer updates, deadline revision audit history, uploads,
approval/client visibility, and client isolation.

Frontend tests cover role redirects, protected navigation, designer task
updates, risk presentation, manager designer-detail navigation, head hierarchy
expansion, evaluation submission, and client-only approved files.

The final verification includes type checking, linting, automated tests,
production builds, and visual review of each role at desktop and mobile sizes.

## Out of Scope for the First Release

- Real-time chat
- Billing and payments
- Native mobile applications
- Cloud object-storage configuration
- Email/SMS notifications
- Client commenting or approval from the portal
- Automatic AI review of uploaded designs

