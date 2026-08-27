---
name: lisno-implementation-planner
description: Plan and execute non-trivial Lisno repository builds, fixes, redesigns, refactors, migrations, and high-risk reviews when work spans components, changes a contract or workflow, requires a material product or architecture choice, or carries meaningful regression risk. Do not use for factual or status questions, routine read-only reports with no material decision, or obvious local edits.
---

# Lisno Implementation Planner

Turn substantial repository requests into an evidence-backed specification, a recommended approach, visible tasks, bounded parallel implementation, and verified results.

## Route the request

Activate this workflow when one or more conditions apply:

- The work spans frontend/backend, persistence/API, authorization, OCR, email, or multiple feature areas.
- It changes a schema, API contract, workflow state, permission boundary, source of truth, financial formula, or data lineage.
- It is a substantial redesign, refactor, or migration.
- A defect is cross-screen, intermittent, concurrency-sensitive, or has an uncertain cause.
- Failure could silently mix projects, users, money, versions, units, approvals, or permissions.

Do not activate merely because a prompt says “build,” “fix,” or “redesign.” Handle an obvious local copy, style, or single-file edit directly. For an ambiguous request, perform cheap read-only discovery first. If it is local and low-risk, disengage: do not create planning artifacts or delegate agents.

Respect the requested mode:

- For diagnosis or review, stop after evidence-backed findings and recommendations.
- For planning, stop after the implementation-ready plan or a requested approval decision.
- For implementation, continue through verification unless a material choice or authority gate blocks progress.

## Discover before deciding

Inspect the current worktree, relevant execution paths, tests, API/persistence contracts, and newest applicable documentation. Capture the initial dirty-path set and each relevant target diff before delegation. Preserve unrelated changes and do not assign a dirty target until its prior work and owner are understood.

Treat historical specs, plans, test counts, and `CODEX_IMPLEMENTATION_PLAN.md` as background only. Reconcile every conclusion with current code and the latest user request. Label verified facts, assumptions, and recommendations separately.

When separable risk surfaces exist and capacity is available, delegate bounded independent read-only audits. Give each agent one concrete question, explicit scope, relevant invariants, and a required evidence-based deliverable. Prefer these roles:

- `implementation_planner` for current-state tracing, architecture/data choices, task dependencies, and verification design.
- `product_ux_architect` for role journeys, information hierarchy, financial labels/formulas, interaction states, responsive behavior, and accessibility.
- Built-in `explorer` agents for an additional read-heavy contract, authorization, migration, or regression audit; set the parent turn read-only when isolation matters.

Do not delegate interpretation of this skill. Do not spawn for ceremony. The primary agent synthesizes evidence and owns final product and contract decisions.

## Publish the working brief

Before the first behavior-changing edit, give the user a compact brief containing:

1. **Evidence:** current behavior, traced source of truth, and root cause or unresolved evidence.
2. **Specification:** goal, non-goals, actors, workflow/state changes, invariants, acceptance criteria, and principal risks.
3. **Recommendation:** the preferred approach and why. When a material choice exists, include two or three genuine alternatives with impact and tradeoffs. Do not manufacture alternatives.
4. **Contract:** data/API fields, identity/version lineage, permissions, financial units/formulas, compatibility, failure behavior, side effects, migration/rollback, and observability as applicable.
5. **Tasks:** a dependency-ordered plan with explicit file ownership and verification for every slice. Keep one parent task in progress.

For substantial cross-cutting, high-risk, or multi-session work, use the full template in [implementation-brief.md](references/implementation-brief.md). Keep it in chat for diagnosis/plan-only requests unless repository documents are explicitly requested. When document writes are authorized, persist the agreed artifacts under:

- `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`
- `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`

Do not create durable documents for ordinary local fixes and do not commit unless authorized.

## Resolve material choices

Recommend first. Ask only when the answer materially changes behavior, architecture, data, security, or scope and cannot be inferred safely.

When structured input is supported, ask one focused question with two or three mutually exclusive choices, recommended choice first, and one-sentence impact per option. Otherwise present the same concise options in plain text. If the existing architecture and request establish one safe approach, state the evidence-backed assumption and proceed.

Do not reveal private chain-of-thought. Provide the decision, evidence, concise rationale, tradeoffs, and uncertainty the user needs to judge the approach.

## Apply authority gates

Continue safe read-only investigation while blocked. Obtain explicit approval immediately before an insufficiently authorized high-risk action:

- destructive or difficult-to-recover deletion;
- production deployment, backfill, cutover, seed, or live external mutation;
- a broad or irreversible data rewrite;
- permission or security-boundary expansion beyond the requested behavior;
- secret rotation, real payment, or real customer communication;
- material scope expansion beyond the request.

Before asking, identify the exact target, blast radius, dry-run evidence, rollback/recovery path, and verification. An explicit request naming the exact action and target may already satisfy the gate; do not ask twice. Authorization never waives a successful scope-matched dry run, conflict reporting, validated backup/rollback, and final integrity checks.

## Execute in owned slices

Create or update the visible plan before implementation. Reproduce the defect or capture a baseline when feasible.

Assign non-overlapping work only after the contract is settled:

- `backend_implementer` owns the approved `backend/` slice. It may prepare an exact named migration/dry-run file only when explicitly assigned, but never executes a live write.
- `frontend_implementer` owns the approved `frontend/` slice.
- `ocr_implementer` owns the approved `ocr-worker/` slice.
- The primary agent owns shared contracts, integration decisions, plan/spec files, and conflict reconciliation.

Tell agents about newly discovered contract changes immediately. Do not allow a writer to cross its boundary or invent a fallback; return the dependency to the primary agent. Update the user and plan at meaningful milestones.

Do not infer authority to deploy, commit, message customers, run migrations, or mutate production from permission to edit and test locally.

## Review and verify the integrated result

After writers finish, run `integrity_reviewer` on the integrated diff. Resolve confirmed findings, then run `verification_runner`. These stages are sequential because all agents share one worktree.

Trace checks to every acceptance criterion. Use verification proportional to risk:

- focused regression tests for each behavior;
- typecheck and production build where applicable;
- broader suites for shared contracts and cross-cutting changes;
- replica-set tests for transactional Mongo paths;
- rendered responsive, interaction, and accessibility checks for every materially user-visible frontend change, with a fuller viewport/state matrix for redesigns;
- authorization matrices for permission changes;
- dry-run, compatibility, rollback, and integrity checks for migrations;
- at least two asymmetric projects or identities for financial and identity lineage.

Inspect the final diff and run repository hygiene checks. Report exact commands/results, unrun checks, external actions not performed, remaining risks, and any generated artifacts. Never describe partial or transient verification as complete.
