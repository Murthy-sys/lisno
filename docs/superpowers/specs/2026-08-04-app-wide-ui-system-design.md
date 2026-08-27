# Lisno App-Wide UI System Redesign

**Status:** Approved in conversation on 2026-08-04

**Scope:** Frontend visual system, shared interaction behavior, every authenticated role route, and the API/database work required for the targeted client-change replacement experience

**Visual anchor:** The approved Lisno Quotation login redesign

## Purpose

Redesign the complete Lisno application as one polished, professional, and
futuristic product without changing the Lisno Quotation identity, role
permissions, routes, domain workflows, or audit requirements.

The redesign uses a foundation-first approach. Shared tokens, components,
motion, loading, feedback, accessibility, and shell behavior are established
before individual role screens are migrated. Internal roles use a compact,
operational presentation. Client screens use a calmer, more spacious version
of the same visual language.

This specification also closes a critical client-change gap: when a client
requests changes to specific extracted sections and the estimator uploads a
revised plan, only those requested sections become new active attachments.
Unrequested sections remain unchanged, the client sees only the latest active
attachment for each updated section, and the updated section returns to review
with the message "Image updated — please review and approve."

## Approved Product Decisions

1. Use one midnight-navy, porcelain, and violet design system across every
   screen.
2. Keep staff screens information-dense and client screens calmer and more
   spacious.
3. Preserve the existing Lisno Quotation brand and the approved login design.
4. Build shared foundations first rather than applying a CSS-only reskin.
5. Use restrained motion and luminous detail; do not rely on excessive glass,
   gradients, or decorative animation.
6. Use role-specific language while keeping feedback components visually
   consistent.
7. Replace only client-requested plan sections. Never republish every extracted
   section as a side effect of a replacement upload.
8. Show only one active attachment per client-facing section. Older files are
   audit history for authorized staff, not duplicate client attachments.
9. Do not add new product routes solely for visual polish. Existing routes and
   links remain the navigation contract unless a later feature specification
   explicitly changes them.

## Goals

- Make every route feel like part of one intentionally designed product.
- Improve hierarchy, scanability, responsiveness, and perceived quality.
- Standardize buttons, fields, surfaces, headers, dialogs, loading states,
  empty states, status displays, and feedback.
- Give every mutation an immediate, accessible, role-appropriate response.
- Make pending, disabled, success, error, conflict, and recovery states
  unmistakable.
- Protect client approvals and staff work from accidental cross-section or
  cross-version updates.
- Retain keyboard, screen-reader, reduced-motion, and mobile usability.
- Make the redesign incremental so existing features remain shippable while
  routes migrate.

## Non-Goals

- Rebranding Lisno Quotation or changing the logo.
- Replacing React, React Router, TanStack Query, or the current API layer.
- Rebuilding the application with a third-party component library.
- Changing role permissions, KPI calculations, task-risk formulas, or audit
  ownership.
- Adding decorative illustrations or generated imagery where no product asset
  is needed.
- Exposing internal revision history, extraction terminology, staff notes, or
  operational metadata to clients.
- Combining unrelated backend refactors with the UI migration.

## Existing System Constraints

The existing React application serves five role experiences through a shared
shell:

- Designer
- Design Manager
- Design Head
- Estimator/Sales
- Client

The shell already contains tested keyboard and focus behavior in its dialogs,
mobile drawer, and combobox. Those contracts must be preserved. The current
application also has a large global stylesheet and many locally styled buttons,
cards, messages, and section loaders. Migration must be incremental: shared
primitives replace repeated patterns as each route is touched, without a
high-risk all-at-once stylesheet rewrite.

### Domain terminology for replacement work

The targeted replacement contract in this specification applies specifically
to estimate-plan change requests and their extracted estimate drawings:

- A **logical target** is one persistent `EstimateDesignDrawing`, identified by
  its stable `drawingId` across all revisions.
- The **base revision** is the `requestedRevisionId` the client reviewed when
  requesting a change.
- A **replacement revision** is an `EstimateDesignRevision` for the same
  `drawingId`, linked to the request target and its base revision.
- The **current revision** is the one authoritative client-visible revision for
  that `drawingId`; historical revisions are not additional current
  attachments.

The interface may call a logical target a section, drawing, or image according
to client-friendly context, but implementation and API rules use `drawingId`.
Full-plan pages and the separate designer design-section workflow keep their
existing identities and state machines. They must not be merged into this
estimate-drawing target model.

## Design Principles

### Precision over spectacle

Futurism comes from alignment, hierarchy, motion discipline, clean data
presentation, and carefully controlled light—not neon overload, continuous
animation, or glass on every surface.

### One clear action

Each card, dialog, or workflow step has one obvious primary action. Secondary
and destructive actions remain available but do not compete visually.

### Status must explain consequence

A status label never stands alone when the consequence is unclear. Supporting
copy explains what happened, who acts next, and whether existing work remains
safe.

### Progressive density

Staff routes surface more metadata and actions because they support production
work. Client routes reduce visible complexity and lead with the item requiring
a decision.

### Calm reliability

The interface must not jump, flash, or silently change after mutations.
Controls keep stable dimensions, updated regions are announced, and errors
remain visible until resolved or dismissed intentionally.

## Visual System

### Color

The approved login palette becomes the semantic application palette.
Implementation may tune values slightly after contrast verification, but all
components must consume semantic tokens rather than new feature-level hex
values.

| Token | Initial value | Purpose |
|---|---:|---|
| `--color-brand-midnight` | `#111a39` | Sidebar, high-emphasis brand surfaces |
| `--color-brand-midnight-raised` | `#192448` | Elevated dark surfaces and hover states |
| `--color-brand-violet` | `#5a45d6` | Primary actions, active navigation, selected states |
| `--color-brand-violet-bright` | `#8e7cff` | Focus accents and controlled highlights |
| `--color-canvas` | `#f4f5fa` | Application background |
| `--color-surface` | `#ffffff` | Default cards, dialogs, and fields |
| `--color-surface-subtle` | `#f8f8fc` | Grouping and subdued panels |
| `--color-text` | `#171b2d` | Primary content |
| `--color-text-muted` | `#626a7d` | Supporting content |
| `--color-border` | `#dde1eb` | Default separation |
| `--color-border-strong` | `#c8cedc` | Strong grouping and field hover |
| `--color-success` | `#18795c` | Approved and completed states |
| `--color-warning` | `#8a5b12` | Attention and delivery risk |
| `--color-danger` | `#b33a4a` | Errors, blocked states, destructive actions |
| `--color-info` | `#315ab8` | Informational state and processing |

Status components use a dark readable foreground, a low-chroma tint, an icon,
and text. Color is never the only signal. Client-facing change requests use
"Changes requested," never "Rejected."

### Typography

- Preserve the approved editorial serif treatment for login and important page
  titles only.
- Use `Inter`, `Avenir Next`, or the system sans-serif stack for interface text.
- Use tabular numerals for metrics, dates, money, progress, and counts.
- Limit the main hierarchy to display, page title, section title, body, label,
  supporting text, and metadata styles.
- Use sentence case for buttons, labels, and headings.
- Avoid uppercase paragraphs. Eyebrows may use uppercase with generous tracking
  and must remain short.

Suggested responsive title scale:

- Display: `clamp(2.75rem, 5vw, 5.5rem)` on authentication/brand surfaces only.
- Page title: `clamp(2rem, 3vw, 3.5rem)`.
- Section title: `clamp(1.15rem, 1.5vw, 1.5rem)`.
- Body: `1rem` with a minimum `1.5` line height.
- Metadata: no smaller than `0.8125rem`.

### Spacing, radius, and elevation

- Use a spacing scale based on 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64
  pixels.
- Use four radii only: 10px for compact controls, 14px for fields and small
  cards, 20px for primary surfaces, and fully rounded pills for badges.
- Use three shadow levels: soft card separation, raised interactive surface,
  and overlay/dialog. Dark outlines and subtle edge light do more visual work
  than heavy blur.
- Non-interactive cards never lift on hover. Interactive cards may translate by
  no more than 2px and must retain a visible focus state.

### Iconography

Use the existing Lucide icon library. Icons supplement labels rather than
replace them unless the control is a familiar icon-only action with an
accessible name and tooltip. Do not introduce handcrafted inline SVGs, emoji,
or decorative CSS drawings.

## Layout and Responsive Behavior

### Shared shell

Desktop retains a stable sidebar and scrollable content workspace. The sidebar
contains:

- Lisno Quotation brand
- Signed-in role label
- Role-appropriate navigation links that correspond to real routes
- Active-route indicator
- Account identity and sign-out action

The sidebar uses midnight surfaces, a restrained violet active rail, and clear
focus treatment. It does not add decorative navigation destinations that have
no screen.

Global sidebar navigation maps only to stable role homes:

| Role | Label | Destination |
|---|---|---|
| Designer | Workspace | `/designer` |
| Design Manager | Team | `/manager` |
| Design Head | Organization | `/head` |
| Estimator/Sales | Leads & estimates | `/estimator-sales` |
| Client | My projects | `/client` |

Parameterized designer, project, lead, and estimate routes use contextual
breadcrumbs and back links; they are never fabricated as permanent sidebar
destinations without a valid identifier.

Mobile retains a top application bar and accessible slide-in drawer. The
drawer must preserve focus wrap, Escape close, focus restoration, background
scroll lock, and a clear selected destination. A skip link targets the single
main content landmark on every authenticated route.

### Workspace

- Maximum content width varies by job: approximately 1440px for operational
  dashboards and 1120px for client review flows.
- Staff routes use responsive 12-column grids and compact surface padding.
- Client routes use fewer columns, larger whitespace, and larger preview areas.
- Page-level actions remain visible near the title; they do not drift into
  unrelated cards.
- Toolbars wrap predictably at tablet widths; primary actions remain first in
  reading order.
- Below 768px, dense tables and rows become labelled stacked records rather
  than horizontally clipped content.
- Sticky elements must not cover focus targets, banners, or mobile controls.

Complex screens use explicit narrow-layout behavior:

- OCR and crop review place the image above controls below 768px, keep the
  complete crop visible, and place actions after the controls in reading order.
- The estimate builder shows one active stage at a time on small screens with a
  compact stage summary and a non-overlapping action footer.
- Client image review gives the preview the full available width; annotation
  tools wrap or scroll inside their own toolbar rather than the page.
- Sticky plan navigation becomes an in-flow compact rail on narrow screens.
- Audit timelines become vertical labelled events.
- Organization hierarchy reveals one level at a time instead of preserving a
  deeply indented desktop tree.
- Action groups with more than two controls stack full-width on phones and stay
  above the virtual keyboard in dialogs and long forms.

Measurable density rules keep the two role modes related but distinct:

- Staff primary cards use 16–20px internal padding and may use three or four
  columns at 1280px and wider.
- Client primary cards use 24–32px internal padding, a maximum of two columns,
  and an approximately 1120px content measure.
- Migrated components use semantic tokens; new feature-level hex colors,
  one-off radii, or shadows fail review.
- Every representative route/state visual check verifies page hierarchy,
  canvas/surface use, primary action prominence, focus styling, and absence of
  clipped or overlapping content.

### Page header

Every authenticated route uses one `PageHeader` contract:

- Optional breadcrumb or back link
- Short eyebrow identifying the workspace or role context
- Page title
- One-line supporting context
- Optional status/context metadata
- Primary and secondary actions

The page header must not duplicate the same title in the shell.

## Shared Component Architecture

The redesign introduces small, role-neutral primitives with explicit
contracts. Domain components remain in their feature folders.

### Core controls

#### `Button`

Variants: primary, secondary, quiet, and destructive. Sizes: compact, default,
and large. The component supports leading/trailing icons, `busy`, `aria-busy`,
and a stable label width while busy. Disabled controls use the default cursor;
only actively processing controls use a progress cursor.

#### `IconButton`

Uses the same state system, has a minimum 44px touch target, requires an
accessible name, and provides a tooltip for unfamiliar actions.

#### Form primitives

`Field`, `Input`, `Select`, `Textarea`, checkbox, and file input share label,
help, required, invalid, and error-message presentation. Errors connect through
`aria-describedby` and are never communicated by border color alone.

### Structure

- `Surface`: default, subtle, raised, and interactive variants.
- `PageHeader` and `SectionHeader`: consistent hierarchy and action placement.
- `BackLink` and `Breadcrumbs`: route context without duplicate navigation.
- `Tabs` or segmented control: only where content is mutually exclusive; they
  are not used as decorative filters.
- `StatusBadge`: humanized status text, icon, and semantic tone.
- `MetricCard`: consistent numeric layout and trend context.
- `Disclosure`: accessible expansion behavior for hierarchy and detail.
- `Tooltip`: hover and keyboard-focus activation, Escape dismissal, no trapped
  focus, and no substitution for the control's accessible name.
- `Dialog` and `Drawer`: shared overlay foundation while preserving existing
  focus, Escape, restoration, scroll-lock, and busy-close protection.

### Feedback and asynchronous state

- `PageState`: route-level skeleton, error, and empty states without introducing
  a nested `main` landmark.
- `SectionState`: local loading, error, and empty states with optional retry.
- `Skeleton`: quiet pulse or opacity motion shaped like the incoming content.
- `Spinner`: small inline action indicator.
- `Progress`: upload, export, and extraction progress when measurable.
- `InlineMessage`: persistent informational, warning, success, and error
  treatment.
- `NoticeBanner`: workflow-critical status and recovery action.
- `ToastViewport`: short non-critical success confirmations only.
- `EmptyState`: explains why content is absent and offers the next valid action.

Toasts never replace persistent recovery errors, approval requirements,
conflicts, or irreversible-action confirmation.

## Motion and Transition System

Use one easing curve and three durations:

- 140ms for hover, press, focus, and compact control state changes.
- 220ms for cards, disclosures, tabs, banners, and drawers entering a settled
  state.
- 320ms for dialogs and large overlays.

Route content may enter with an approximately 180ms opacity change and a
maximum 6px vertical offset. Route transitions must not delay data display,
steal focus, or announce duplicate page titles.

Buttons use restrained color, border, shadow, and 1px press transitions.
Disclosures combine icon rotation with content opacity and a measured grid-row
or explicit-height transition; they do not animate an unmeasured `height:auto`.
If a disclosure closes while focus is inside it, focus returns to the disclosure
trigger. Toasts enter and exit without shifting page layout. Loading animation
never masks a stalled synchronous request indefinitely.

For `prefers-reduced-motion: reduce`, transitions become effectively instant,
continuous animations stop, and the complete interface remains understandable.

## Loading, Mutation, and Feedback Rules

### Initial loading

Keep the stable `PageHeader` and route `h1`, then render a page skeleton matching
the eventual hierarchy. Skeleton shapes are `aria-hidden`; only the owning
content region receives `aria-busy="true"`. A stable, politely announced status
identifies what is loading without creating a second heading or landmark.

### Partial loading

Render a section-level skeleton or local status. Do not replace already loaded
page content with a full-screen loader. Independent queries fail independently:
for example, a KPI error does not hide loaded projects, and a version-history
error does not replace loaded delivery structure or client-review history.

### Mutations

- The initiating button becomes busy, retains its width, and prevents duplicate
  submission.
- Related fields remain available unless editing them would make the request
  ambiguous.
- Success updates the relevant content in place and produces a role-specific
  confirmation.
- Recoverable errors remain beside the affected control and preserve entered
  values or selected files where browser security permits.
- Version conflicts stop submission, refresh the current record, and ask the
  user to review the new values before resubmitting.
- Optimistic updates roll back when the server rejects the request.

### Long-running work

Uploads and extraction show filename, file size, current stage, and progress
when measurable. If exact progress is unavailable, show the named stage rather
than an unexplained spinner. The user may leave the section when the backend
continues processing safely.

Synchronous reads and mutations use a 30-second client request budget. Upload
transport uses a 120-second budget and reconciles the server state with its
idempotency key before offering a retry, because a timed-out upload may have
completed. Queued extraction is not treated as a timed-out HTTP request: the UI
polls its job state, shows a "Taking longer than expected" notice after ten
minutes, and continues to offer refresh or navigation without creating a second
job. Navigation aborts obsolete reads; it does not cancel a durable processing
job unless the API exposes an explicit cancel operation.

## Role-Specific Language

Visual components remain role-neutral. A centralized content map provides
role-appropriate language for common states.

| Situation | Designer | Manager | Head | Estimator/Sales | Client |
|---|---|---|---|---|---|
| Workspace loading | Loading your projects, priorities, and client feedback… | Loading your team, workload, and approval queue… | Loading managers, team health, and evaluation coverage… | Loading leads, estimates, and client feedback… | Loading your projects and items for review… |
| Clear state | You’re clear—no urgent tasks need attention. | No team actions need attention right now. | All teams are currently within delivery thresholds. | No client feedback needs action. | Nothing needs your review right now. |
| Requested changes | Client requested updates to 2 sections. Approved sections remain locked. | Review is waiting for 2 revised sections. | 2 requested revisions are affecting delivery health. | Client feedback to resolve in 2 sections. | Changes sent. We’ll notify you when the updated images are ready. |
| Replacement ready | 2 updated sections are ready to submit. | Revised sections are ready for delivery review. | Updated work is moving back through approval. | 2 replacements are ready to send. | Image updated — please review and approve. |
| Conflict | A newer version is available. Review the refreshed values before saving again. | The record changed. Review the latest details before trying again. | This inspection changed while it was open. Refresh to continue. | The request changed. Review the latest targets before resubmitting. | This item was updated. We’ve refreshed the latest version for you. |

Client copy avoids internal terms such as queue, extracted drawing, estimate
item assignment, immutable revision, snapshot, geometry projection, and raw
backend status values.

All count-based messages use one centralized formatter with explicit zero,
singular, and plural forms. Target names come from the current server response,
not stale local labels. Tests assert both `1 section` and `2 sections`; examples
in the table are illustrative plural cases rather than hard-coded production
strings.

## Route-by-Route Experience

### Authentication

Session restoration retains a stable authentication heading and shows a scoped
loader. Restoration failure offers retry without discarding a still-valid token.
Mid-session expiry clears protected query data and returns to login with
"Your session expired. Sign in again." plus the safe return path. An
authenticated user opening a route for another role is redirected to their own
role home without rendering unauthorized content. Logout disables duplicate
activation, clears authenticated caches, and confirms progress until navigation
completes.

`/` and wildcard paths remain redirect-only: authenticated users go to their
role home and unauthenticated users go to `/login`. Redirect behavior, session
restoration, expiry, unauthorized-role access, and logout are part of the route
test matrix.

#### `/login`

Preserve the approved login redesign and Lisno Quotation identity. Maintain the
existing authentication behavior, validation, inline submit spinner, stable
button layout, live status announcement, focus visibility, responsive stacking,
and reduced-motion support.

#### `/signup`

Retain the current signup workflow but migrate its controls, validation,
loading, and feedback to the shared authentication primitives. Do not make
signup visually compete with the login brand panel.

### Designer

#### `/designer`

- Lead with priorities: urgent client revisions, at-risk tasks, and approvals.
- Present KPI and activity as supporting operational context rather than a wall
  of equal-weight cards.
- Use a consistent reporting-period control and clearly separated sections for
  projects, estimate approvals, risk, and recent activity.
- Empty states distinguish a healthy queue from missing data.
- Project creation uses shared fields, dialog actions, busy states, and success
  feedback.

#### `/designer/projects/:projectId`

- Use a stable project header containing status, client, ownership, schedule,
  and top-level actions.
- Isolate client-requested sections in an attention panel before the normal
  floor/stage/task hierarchy.
- Keep approved and unrequested sections locked and visually subdued during a
  replacement workflow.
- Preserve the floor, stage, task, upload, OCR, version, conflict, and dirty
  draft rules.
- Use local feedback for task updates and uploads so the user never loses
  orientation in a long project page.
- This route continues to own the designer design-section replacement workflow.
  It may display estimate-plan request context for an assigned project, but it
  does not receive Estimator/Sales upload, extraction-match, or client-resubmit
  controls.

### Design Manager

#### `/manager`

- Prioritize estimate assignment, direct-report capacity, delivery risk, and
  missing actions.
- Designer cards use consistent KPI, workload, risk, and project metadata.
- Search empty states distinguish "no match" from "no direct reports."
- Assignment success names the estimate and assigned designer.

#### `/manager/designers/:designerId`

- Use one designer context header across KPI, projects, risk, audit, deadline,
  and evaluation sections.
- Group corrective actions separately from read-only evidence.
- Evaluation and deadline changes always confirm what changed and that the
  reason/audit entry was recorded.
- Add explicit empty states for trend, projects, risk, and history.

#### `/manager/projects/:projectId`

- Label the page as read-only inspection.
- Separate delivery structure, client review history, version timeline, and
  audit timeline into navigable sections.
- Never display client decision controls.

### Design Head

#### `/head`

- Lead with organization health, evaluation coverage, and teams requiring
  attention.
- Preserve the expandable manager-to-designer hierarchy while reducing nested
  visual noise.
- Manager summaries expose team risk and capacity before individual project
  detail.
- Provide an explicit organization-level empty state.

#### `/head/designers/:designerId`

Reuse the designer-detail system with head-specific back links. The head may
revise task deadlines with a mandatory audited reason and create or correct
head-owned evaluations, matching existing backend authorization. KPI values,
manager-owned evaluations, task production fields, and design files remain
read-only. Evaluation corrections remain tied to the signed-in evaluator.

#### `/head/projects/:projectId`

Reuse the project-inspection system with head-specific navigation and no
approve, reject, assignment, or delivery mutation controls.

### Estimator/Sales

#### `/estimator-sales`

- Separate active leads, follow-ups, saved estimates, and items needing client
  response.
- Show a useful commercial next step on each card rather than raw lifecycle
  status.
- Lead creation and estimate export use persistent error handling and explicit
  success feedback.

#### `/estimator-sales/leads/:leadId`

- Present contact, opportunity, budget, follow-up, and estimate progress as one
  ordered story.
- Confirm lead changes, stage changes, and follow-up creation.
- Preserve form values after recoverable errors.

#### `/estimator-sales/leads/:leadId/estimate`

- Retain Configure, Builder, Summary, and Proposal stages with a clearer
  progress indicator and stable action area.
- Treat design-plan upload, extraction, verification, assignment, and submit as
  a visible workflow rather than disconnected panels.
- When client changes are open, replace general plan management with a focused
  client-feedback workspace: request, requested targets, replacement file,
  extraction state, target matching, verification, and resubmission.
- "Submit drawings to client" and equivalent actions prevent duplicate
  submission and confirm the exact number of replacements sent.
- Replace raw or technical labels with "Client feedback to resolve," "Needs
  item assignment," "Ready to send," "Awaiting client review," and "Revision
  history."

### Client

#### `/client`

- Separate "Needs your review" from project browsing.
- Rename internal estimate terminology to "Estimates for your review."
- Explain why final estimate approval is unavailable when drawings still need
  review.
- Keep one focused primary action per expanded estimate.
- Confirm draft saved, changes sent, drawing approved, estimate approved, and
  refreshed-update states.

#### `/client/projects/:projectId`

- Lead with project progress and current items requiring a decision.
- Present design sections as spacious image-led review cards.
- Use three human states: Awaiting your review, Changes requested, and Approved.
- When a replacement becomes current, mark the section "Updated," focus or
  scroll the review rail to it without stealing keyboard focus, and announce
  "Image updated — please review and approve."
- Existing unrequested sections remain visible in their current states.
- Previous and current attachments never appear together in the active client
  review.

## Targeted Client-Change Replacement Contract

This behavior is a full-stack workflow and data-integrity requirement. The
backend remains the authority; client filtering alone is not sufficient.

### Request creation

1. The client selects one or more estimate drawings and submits a change
   request with annotations and/or a written summary.
2. Each target snapshot stores its stable `drawingId` and
   `requestedRevisionId`; the request stores its own `requestId` and `version`.
3. Approved drawings not selected by the client remain locked and outside the
   request.
4. Page-level feedback with no detected drawing target remains the existing
   unassigned-page workflow and cannot be silently converted into a drawing
   replacement.

### Estimator replacement

1. The estimator opens the specific client request before uploading a revised
   plan.
2. The UI lists only the requested targets as replacement work.
3. The estimator may upload a full plan file, but extraction results do not
   automatically replace the full current set.
4. Extracted results must be explicitly matched to requested `drawingId`
   targets. Matching by title, filename, array position, upload order, or page
   order is invalid.
5. Every requested target requires exactly one explicit replacement revision
   ID before resubmission. Duplicate, missing, or extra target mappings are
   rejected.
6. Unrequested extraction results are never published as current client
   attachments. This feature retains them as staff-only upload/audit artifacts
   because the repository has no approved expiry policy; a separate retention
   specification may delete them later.
7. Estimator/Sales owns upload, target matching, verification, and resubmission
   for this estimate-plan workflow. Other authorized staff may inspect requests
   according to existing access rules but do not receive these mutation
   controls through this redesign.
8. The resubmit action names the replacement count and remains disabled during
   submission.

### Current-set merge

The resubmit request contains:

- `requestId`
- expected `requestVersion`
- a new persisted `idempotencyKey`
- the exact mapping `{ drawingId, baseRevisionId, replacementRevisionId }[]`

The replacement IDs are explicit; "latest" never means whichever record has
the newest timestamp. Before writing, the backend compares every target's
current **client-visible** revision with both the request's
`requestedRevisionId` and submitted `baseRevisionId`. Draft, queued, failed, or
otherwise unpublished replacement records do not replace that base during this
check. If any client-visible target changed, the whole operation returns a
conflict.

The backend then performs one transaction that:

1. Validates exact target-set equality.
2. Validates request version, base revisions, replacement ownership, and
   replacement readiness.
3. Deactivates or removes client-current status from the old target revisions.
4. Makes every submitted replacement current.
5. Moves every affected target to `replacement_submitted`.
6. Increments the request version and writes complete audit evidence.

If any step fails, none of the targets change. On success, construct the
client-facing current projection as:

`previous current set - requested target revisions + submitted replacement revisions`

The merge operates by stable target identifier, never by array position,
filename, upload batch, or page order.

For each requested target:

- The new replacement becomes the single active attachment.
- The previous attachment loses active/client-current status.
- The previous attachment remains available only through authorized staff
  audit or revision history.
- The review state becomes Awaiting your review.

For every unrequested target:

- The active attachment identifier is unchanged.
- Approval state is unchanged.
- Client visibility is unchanged.
- It does not re-enter review.

Current-revision uniqueness is a server invariant scoped to
`{ estimateId, drawingId }`. It may be represented by a transactional current
pointer or by the unique highest valid revision in the existing ordered
revision model, but client-current endpoints must return exactly one revision
per active `drawingId`. Historical-revision endpoints are separate and
staff-authorized.

### Existing-data reconciliation

Before enabling the new publisher, run an idempotent reconciliation:

1. Group revisions by `{ estimateId, drawingId }` and select the highest
   `revisionNumber` whose lifecycle state is client-current under the existing
   publication rules; queued, draft, failed, and abandoned revisions are
   excluded. The existing unique
   `{ drawingId, revisionNumber }` index makes the choice deterministic.
2. When replacement metadata (`replacementDrawingId`, `replacesRevisionId`, or
   request `resolvedByRevisionId`) proves that a new upload belongs to an
   existing target, preserve it as that target's revision and remove any stray
   client-current projection.
3. Never merge records heuristically by label or filename. Ambiguous legacy
   duplicates are excluded from client-current endpoints, reported for manual
   resolution, and retained for authorized audit access.
4. Record before/after IDs for every automatic correction. Re-running the
   reconciliation produces no additional changes.

### Client notification and review

After the merge:

- The client dashboard shows an updated-item count.
- The relevant project review shows an "Updated" badge.
- Each updated target carries a persistent notice saying "Image updated —
  please review and approve." The notice announces once without stealing focus
  and persists until that target receives a decision.
- Multi-target summaries use count-aware copy such as "3 images updated —
  please review and approve," while the exact per-target message remains
  unchanged.
- The latest image is the only active attachment presented for that section.
- Approving the replacement resolves that target without reopening other
  approved sections.
- Asking for changes starts a new audited cycle for that target only: its status
  returns to `open`, its base becomes the rejected replacement revision, and
  the request version increments. Other approved or pending targets retain
  their states.
- The dashboard updated-item count decrements only when the corresponding
  target receives a decision.

### Per-target lifecycle

Each target follows:

`open -> replacement_submitted -> approved`

Client requests for further changes follow:

`replacement_submitted -> open` with a new audited base-revision cycle.

Authorized staff may resolve an invalid or no-longer-applicable target through
the existing audited `resolved` terminal state. The overall request remains
`open` while any target is `open` or `replacement_submitted`; it becomes
`resolved` only when every target is `approved` or `resolved`. Mixed outcomes
therefore remain isolated: approving target A never resolves or reopens target
B.

### Concurrency, idempotency, audit, and authorization

- Replacement submission uses the latest request version. A stale request
  or changed base revision returns a conflict before any target changes.
- The submit control cannot fire twice while pending.
- A persisted idempotency record binds the key to the request/version and exact
  sorted replacement mapping. An identical retry returns the original response;
  reuse with a different mapping returns a conflict.
- Two simultaneous submissions yield one committed current set. A simulated
  failure after any intermediate write rolls back the entire set.
- Each successful submission audits actor, timestamp, request ID/version,
  idempotency key, upload batch, target match evidence, base and replacement
  revision IDs, and before/after current revision IDs.
- Client APIs return current revisions only. Historical revision metadata and
  file URLs require backend staff authorization; guessing a historical URL as a
  client returns a denial rather than relying on hidden UI.

## Error and Recovery Design

- Route errors provide a clear retry and preserve the shell.
- Section errors remain inside their owning section.
- A full-plan fetch error must never render as "No full design pages."
- Saved-estimate load failure must never look like a new blank estimate.
- Upload errors retain file context and accepted-format guidance.
- Extraction failures identify the failed stage and provide a scoped retry.
- Annotation or summary draft failures retain the unsaved client input.
- Approval failures keep the current image and decision controls visible.
- Client-facing messages explain the next action without exposing backend
  implementation details.
- Staff-facing conflicts identify what changed and require review before retry.
- Conflict recovery refetches the affected request/query without a page reload.
  Replacement mappings, text, and the selected `File` object remain in local
  component state while the user compares the new server version. If the
  browser can no longer retain a file selection, the UI preserves all other
  work and asks only for that file to be selected again. A new submission uses
  a new request version and idempotency key.

## Accessibility Requirements

- Exactly one `main` landmark per route; `AsyncState` replacements must not
  introduce nested `main` elements.
- A visible-on-focus skip link targets the shell's main content.
- Every route has one descriptive `h1` and a logical heading hierarchy.
- Preserve dialog, drawer, and combobox keyboard contracts.
- Maintain visible focus rings with at least a 2px discernible outline.
- Minimum interactive target size is 44 by 44 pixels except inline text links
  with sufficient surrounding spacing.
- Pending actions expose `aria-busy` and retain a stable accessible name;
  visible busy wording may change without making the control ambiguous.
- A stable, always-mounted polite `role="status"` region announces loading and
  non-critical success with `aria-atomic="true"`. Blocking errors use
  `role="alert"`. The same event is announced by only one region, repeated
  identical text is deduplicated, and cleared status text is not announced.
- Toasts do not take focus and do not duplicate persistent announcements.
- Status is communicated by text and icon as well as color.
- Contrast must meet WCAG 2.2 AA for text, controls, focus, and meaningful
  graphics.
- Route transitions do not steal focus. Dialogs continue to restore focus.
- Reduced-motion behavior covers transitions, skeletons, spinners, drawers,
  dialogs, and disclosure animations.

Explicit route-focus behavior:

- On user-initiated push/replace navigation, the rendered route `h1` receives
  programmatic focus through `tabindex="-1"` after content is ready; its text is
  the page announcement.
- Browser back/forward restores the originating control when it still exists,
  otherwise it falls back to the route `h1`.
- Background refetch, polling, and in-place success updates never move focus.
- If a focused list item is removed, focus moves to the next item, then the
  previous item, then the owning section heading.
- Opening and closing dialogs or disclosures continues to use the local trigger
  restoration contract instead of the route-focus rule.

## Implementation Architecture

Use incremental files rather than continuing to expand one global stylesheet:

```text
frontend/src/
  styles/
    index.css
    tokens.css
    base.css
    motion.css
    shell.css
    primitives.css
    features/
  components/
    ui/
      Button.tsx
      IconButton.tsx
      Surface.tsx
      PageHeader.tsx
      SectionHeader.tsx
      Field.tsx
      InlineMessage.tsx
      Skeleton.tsx
      AsyncState.tsx
      EmptyState.tsx
      Tabs.tsx
      Tooltip.tsx
    feedback/
      FeedbackProvider.tsx
      ToastViewport.tsx
    layout/
      AppShell.tsx
      Sidebar.tsx
      MobileHeader.tsx
      SkipLink.tsx
      RouteFocusManager.tsx
      navigation.ts
  content/
    roleFeedback.ts
```

The exact split may follow existing repository conventions, but boundaries are
required:

- Primitives own visual and accessibility behavior.
- Feature components own domain data and workflow decisions.
- Role feedback content is centralized enough to avoid inconsistent wording.
- API hooks remain responsible for server state.
- The UI does not recreate permission, risk, or approval formulas.

Feature migrations remove superseded selectors as they adopt primitives. New
late-file override blocks must not become the primary migration strategy.

The targeted replacement phase also changes backend boundaries:

```text
backend/src/
  routes/
    estimate-plan-review.ts
  services/
    estimate-plan-review.service.ts
    estimate-design.service.ts
  models/
    EstimatePlanChangeRequest.ts
    EstimateDesignRevision.ts
  migrations/
    estimate-design-current-revisions.ts
```

Exact filenames may follow the existing service layout. The required boundary
is that one backend service owns target validation, compare-and-swap, atomic
activation, idempotency, request lifecycle, and audit writes. Route handlers
validate transport input but do not reproduce merge rules. Client-current and
staff-history projections remain separate authorization paths.

## Delivery Phases

This is the umbrella design contract, not authorization for one monolithic
rewrite. Implementation is decomposed into one reviewed plan per phase. Each
phase references this specification, preserves compatibility with completed
phases, and reaches its own test/verification gate before the next begins. The
application is not described as fully redesigned until Phase 6 passes.

### Phase 1: Foundation

- Semantic tokens, typography, base styles, motion, and focus system.
- Button, icon button, surface, headers, fields, status, loading, empty, and
  feedback primitives.
- Feedback provider and live-region behavior.
- Shared shell, sidebar, mobile header, skip link, and single-main correction.
- Login regression protection and signup alignment.

### Phase 2: Critical client-change journey

- Ship the backend merge endpoint, reconciliation, client-current projection,
  authorization, and frontend workflow as one compatibility boundary.
- Targeted replacement merge and active-attachment uniqueness.
- Estimator client-feedback workspace and upload/extraction states.
- Client updated-image notice, single-current-attachment presentation, and
  focused review state.
- Duplicate submission, conflict, audit-history, and approval-lock tests.

The new publisher remains behind a server capability flag until reconciliation
and backend integration tests pass. A new frontend talking to an older backend
shows replacement review as read-only; it must never fall back to the old broad
republish behavior. Once enabled, the old publisher is disabled in the same
release so old and new current-set rules cannot run concurrently.

### Phase 3: Designer experience

- Designer dashboard hierarchy.
- Project header, request attention panel, floor/stage/task hierarchy, uploads,
  OCR review, dialogs, and local feedback.

### Phase 4: Manager and head experience

- Manager dashboard and designer detail.
- Shared read-only project inspection.
- Head organization hierarchy, designer detail, project inspection, and
  evaluation coverage.

### Phase 5: Estimator/Sales and client completion

- Lead dashboard, lead detail, full estimate builder, review panels, and client
  dashboard/project polish not already completed in Phase 2.

### Phase 6: Consolidation and quality

- Remove superseded CSS and local button/state patterns.
- Responsive passes at phone, tablet, laptop, and wide desktop sizes.
- Accessibility verification, role-specific copy audit, performance check, and
  full regression coverage.

## Testing Strategy

Implementation follows test-driven development for new primitives and
behavioral changes.

### Component tests

- Button variants, busy state, stable content, disabled semantics, and
  accessible name.
- Field labels, descriptions, validation, and error association.
- Page/section loading, error, empty, and retry states.
- Skeleton ownership (`aria-hidden`, scoped `aria-busy`, stable `h1`, and no
  layout-shifting final render).
- Toast timing and persistent-banner separation.
- Stable polite/alert live regions, message deduplication, and count
  interpolation.
- Tooltip hover/focus activation, Escape dismissal, and accessible-name
  independence.
- Route focus for push, replace, pop, background refresh, and item removal.
- Dialog/drawer focus, Escape, restoration, nested overlays, and busy-close
  behavior.
- Reduced-motion variants.

### Role-route tests

Every route receives at least loading, success, error, and meaningful empty
coverage. Mutation-heavy screens also cover pending, success, failure, retry,
and conflict states. Manager/head project routes assert the absence of approval
and mutation controls. Multi-query dashboards assert fault isolation so one
failed section does not hide successful sections. Authentication coverage
includes restoration success/failure, mid-session expiry, unauthorized-role
redirect, logout, `/`, and wildcard redirect behavior.

### Targeted replacement regression tests

1. A request for one target followed by a full-plan upload changes only that
   target's active attachment.
2. A request for multiple targets requires one replacement for every target.
3. Unrequested target attachment IDs and approval states remain unchanged.
4. The client receives exactly one active attachment per target.
5. The previous attachment remains in authorized audit history but is absent
   from active client review.
6. The client sees "Image updated — please review and approve."
7. Updated targets return to Awaiting your review; untouched approved targets
   stay approved.
8. Duplicate submit does not create duplicate active attachments.
9. A stale request produces a conflict and preserves replacement work for
   review.
10. Approving the replacement resolves only that target.
11. A target whose base revision changed after request creation conflicts the
    whole merge.
12. Duplicate, missing, and extra target mappings are rejected.
13. A failure after the first transactional write rolls back every target.
14. Two simultaneous submissions produce one committed current set.
15. An identical idempotent retry returns the original response; reuse of its
    key with different replacements conflicts.
16. Mixed approve/request-again decisions remain target-isolated and the
    request resolves only after every target is terminal.
17. Client APIs and guessed attachment URLs cannot expose historical revisions.
18. Audit events contain request/version, actor, idempotency, target match,
    base/replacement, and before/after evidence.
19. Per-target notice and dashboard count clear only after that target receives
    a decision.
20. Reconciliation is idempotent, keeps the deterministic current revision,
    excludes ambiguous legacy duplicates from client results, and reports them.

### Accessibility and responsive tests

- Axe coverage includes every role landing route, including Estimator/Sales,
  with browser-level color-contrast checking enabled. Token contrast is also
  verified directly; contrast is not disabled to make a smoke test pass.
- Keyboard smoke tests cover skip link, shell navigation, drawer, dialogs,
  comboboxes, disclosures, tabs, file upload, and review decisions.
- Layout verification covers 320px, approximately 390px, 768px, 1024px, 1440px,
  and a wide desktop viewport, plus 200% and 400% zoom/reflow and virtual
  keyboard behavior for long forms and dialogs.
- Browser screenshots cover representative loading, error, empty, success,
  conflict, and updated-client-review states for each role family. They use
  deterministic fixtures and the same viewports across comparisons.
- No horizontal page scroll, obscured focus target, clipped action group, or
  overlapping sticky element is accepted.

Required verification includes focused frontend/backend tests during each
phase, followed by `npm test`, `npm run typecheck`, and `npm run build` in both
`frontend/` and `backend/`. The replacement phase cannot enable its capability
flag until its backend integration suite and frontend journey suite both pass.

## Acceptance Criteria

The redesign is complete when:

- Every existing screen uses the shared visual foundation and shell.
- All buttons and mutations follow the common busy and feedback contract.
- Initial and partial loading states use the appropriate shared pattern.
- Role-specific success, empty, error, and next-action messages are present.
- Staff and client screens satisfy the measurable padding, column, content
  width, token-use, and route/state visual checklist defined in this spec.
- Requested replacement uploads update only the requested targets.
- Unrequested attachments remain unchanged.
- Client active review never shows previous and new attachments together.
- Updated client sections say "Image updated — please review and approve."
- Existing permissions, route redirects, audit behavior, task rules, KPI rules,
  and approval locking remain intact.
- Focus, keyboard, screen-reader, reduced-motion, and mobile behaviors pass
  regression checks.
- Focused tests, type checking, production build, and relevant full suites pass,
  with unrelated pre-existing failures documented rather than hidden.
