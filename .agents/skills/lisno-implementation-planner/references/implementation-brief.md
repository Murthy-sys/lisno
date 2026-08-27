# Implementation brief template

Use this full template for substantial cross-cutting, high-risk, or multi-session work. Compress or omit inapplicable sections; do not fill them with speculation.

## 1. Decision summary

- Requested outcome
- Recommended approach and concise rationale
- Decisions already fixed by the user or current architecture
- Material decision still required, with recommended option first

## 2. Current-state evidence

- User-visible behavior and reproduction
- Traced execution and data path
- Canonical source of truth
- Confirmed root cause, contributing causes, and unresolved evidence
- Current tests and gaps

## 3. Product specification

- Goal and measurable outcome
- Actors and role-specific jobs
- Scope and non-goals
- End-to-end happy path
- State transitions and action availability
- Loading, empty, error, stale, conflict, retry, success, and permission states
- Acceptance criteria

## 4. Contract and invariants

- API request/response/event changes
- Persistence/schema/index changes
- Stable IDs, version/CAS lineage, audit/proof requirements, and idempotency keys
- Permission matrix by actor and operation
- Financial source, unit, rounding, GST, margin, expense, overhead, and reconciliation formulas
- Email/file/background-job semantics, explicitly classifying preflight/no-write operations versus commit-independent delivery
- Cross-screen consumers and cache invalidation

## 5. UX and content

- Information hierarchy and primary action
- List/detail or progressive-disclosure model
- Exact labels, statuses, formulas, units, and helper text
- Responsive layout and breakpoints
- Keyboard/focus flow, accessible names, contrast, and motion
- Existing design-system components to reuse
- Visual QA scenarios and viewport matrix

## 6. Options and tradeoffs

For each genuine option record:

- approach;
- user and engineering impact;
- correctness, compatibility, migration, complexity, and operational tradeoffs;
- why it is recommended or rejected.

Do not invent alternatives if one credible approach is already established.

## 7. Compatibility and operations

- Backward/forward compatibility and rollout order
- Migration/backfill, dry run, conflicts, backup, and rollback
- Failure behavior, retries, deduplication, and recovery
- External side effects and exact authority gate
- Logging, metrics, audit events, alerts, and support diagnostics

## 8. Dependency-ordered task graph

For each task record:

- outcome and acceptance criteria covered;
- owner/agent and exact file or subsystem boundary;
- dependencies and shared contract inputs;
- implementation steps;
- focused tests and final verification;
- stop/report conditions.

Parallelize only tasks without shared write ownership. The primary agent owns cross-layer contracts and integration.

## 9. Verification matrix

Map each acceptance criterion and important invariant to:

- test or inspection method;
- fixture identities/projects/versions/amounts;
- exact command or visual scenario;
- expected result;
- environment dependency;
- result and remaining blind spot.

Use unequal projects and identities for finance, authorization, and data-lineage work so accidental value reuse cannot pass.

## 10. Handoff

- Final outcome and notable decisions
- Files and contracts changed
- Exact checks and results
- Migration, deployment, communication, or external action not performed
- Remaining risks and recommended next action
