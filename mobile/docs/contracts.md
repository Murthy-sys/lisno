# Mobile contract inventory

Date: 2026-09-18
Status: T00 baseline, reconciled from current source.

## Sources of truth

The existing backend is authoritative. Mobile production code owns adapted local types and must not import sibling workspaces at runtime.

- Roles, permissions, requestable modules and the policy version: `backend/src/domain/roles.ts`, `backend/src/domain/authorization.ts`, and `backend/src/services/auth.service.ts`.
- Protected HTTP operations: `backend/src/domain/route-operations.ts`.
- Runtime validation: route-local Zod schemas and domain services. OpenAPI entries marked generic are inventory aids, not request-body authority.
- Client-visible DTO evidence: backend contracts plus `frontend/src/api/types.ts` and feature-local types.
- Web request and invalidation behavior: `frontend/src/api/client.ts`, feature API modules, and component-local requests.

The frozen baseline is 16 roles, 134 permission codes, policy `2026-09-18.vendor-procurement.v1`, and 221 protected human operations. Mobile contract drift tests must fail when those values change until the adaptation is reviewed.

## Envelope and session contract

- All application routes are below `/api/v1`.
- Success JSON is `{ data: T }`.
- Errors are `{ error: { code, message, fields? } }`.
- Pages are `{ items, pagination: { limit, offset, total, hasMore } }`.
- Authenticated calls carry one bearer token. Reset and invitation public endpoints explicitly omit it.
- Restore requires both `/auth/me` and `/auth/authorization`, a matching role, a recognized policy, and recognized permissions. Unknown or mismatched snapshots fail closed.
- Each request, cache key, draft, cursor and private file is scoped by normalized environment identity and user ID. A session/environment generation fences every asynchronous result.

Supported public routes are login, password-reset request/inspect/complete, and invitation inspect/accept. Client signup exists on the backend but stays unavailable in production until verified email ownership precedes project linking/session issuance.

The web login renders resend-verification and SSO actions, but the backend implements neither endpoint. Mobile records them as upstream unavailable and does not fabricate them.

## Authorization rules

Role labels are presentation. The backend operation registry remains enforcement. A mobile action requires its permission and the current entity capability/status/version. Project access also depends on the client/designer/manager/head relationship or a current module grant. Chat rechecks current project membership and may deliberately return a non-disclosing unavailable response.

Super Admin behavior is operation-specific. Operations marked `deny_personal` remain unavailable to Super Admin.

Only these roles may request the corresponding project module:

| Role | Module |
| --- | --- |
| Designer | Design |
| Procurement | Procurement |
| Finance Manager | Finance |
| Site Manager | Execution |

## Protected operation groups

| Area | Canonical operation source | Mobile owner |
| --- | --- | --- |
| Identity, users and invitations | `route-operations.ts` identity operations and public invitation routes | Auth / Admin |
| Projects, hierarchy and tasks | Project, floor, stage and task operations | Projects / Tasks |
| Organization, KPI, evaluation and audit | Organization, KPI, evaluation and audit operations | Management |
| Design versions, sections and artifacts | Design version/section/source/revision operations | Design |
| Leads, estimates and delivery | Lead and estimate operations | Leads / Estimates |
| Estimate drawings and annotations | Design upload/drawing/revision/client decision operations | Plan review |
| Full-plan change review | Plan page, draft, target and request operations | Plan review |
| Estimate/design response queues and proof | Admin response operations | Estimates / Design |
| Project workflow and assignments | Design workflow and operational task operations | Workflow / Tasks |
| Procurement and vendors | Procurement item/vendor/suggestion/expense operations | Procurement |
| Finance | Portfolio, bucket, entry and document operations | Finance |
| Knowledge and configuration | Knowledge items, sections, references and quality operations | Knowledge |
| Super Admin dashboard | Overview/projects/workforce operations | Admin |
| Chat, attachments, notifications and SSE | Project chat/message/participant/attachment/event operations | Messages |

The exhaustive row-level manifest is derived from the canonical registry by `scripts/contract-drift.test.ts`; duplicating 221 hand-maintained rows here would create another source of drift.

## High-risk invariants

- Stable IDs connect list, detail, mutations, audit, notifications and files. Names never act as join keys.
- `version` and `expectedVersion` are compare-and-swap inputs. A conflict retains the draft, refreshes current data and requires review.
- Idempotency identifiers survive ambiguous results. A non-idempotent mutation is never automatically retried with a new key.
- Finance uses integer paise. Whole-rupee estimate boundaries are explicit. GST is excluded before margin calculations; approved baselines and ledger-derived overhead remain server-owned.
- Approval records are immutable history with actor, source, on-behalf proof, version and audit lineage.
- Publication/submission and external delivery are independent. `queued`, `sending`, `sent`, `failed` and `disabled` are persisted facts; retries reuse the stored semantic round/artifact.
- Annotation documents preserve schema version, source dimensions, page/revision identity, snapshot token, targets, CAS and idempotency.
- Chat preserves stable client message/upload IDs, attachment limits, cursor replay/resync, bounded frames, membership revocation and read state.
- Private downloads stay authenticated, app-private and short-lived. Logout, access loss and application disposal clear managed private state. Separately configured environments use distinct credential/query/file identities. Access changes immediately cancel and remove protected query families; project-specific downloaded-artifact revocation still needs device-backed lifecycle verification.

## Cross-feature invalidation

The primary integrator owns one invalidation registry. At minimum:

- Design workflow: workflow, designer/admin/client project, estimate design and review queues.
- Tasks: project hierarchy, workflow, KPI and Super Admin dashboard.
- Client estimate/drawing/plan decisions: drawing/plan workspaces, client estimate queue, workflow and client project.
- Operational tasks: operational/project tasks, admin project, finance portfolio/bucket and dashboard.
- Finance entry: bucket, ledger, portfolio and dashboard.
- Project initiation: admin projects, dashboard and leads.
- Access decisions/revocation: reviewer/requester data plus purge of newly inaccessible project/chat/artifact state.
- Knowledge vendor mutations: knowledge list/context plus procurement vendor/suggestion queries.
- Logout, authorization loss and application disposal: every private query, draft, transfer, stream, recording and preview. Remote and Local launches remain isolated by normalized environment identity.

## Drift lane

`npm run test:contracts` compares mobile-reviewed snapshots with the repository's roles, permissions, policy version and protected operation registry. Selected fixtures cover authorization, finance, approvals/proofs, annotations, procurement lineage, chat/SSE, pagination and errors.

Backend verification for a contract change includes `frontend-authorization-contract`, `authorization-policy`, `route-operation-registry`, and `api-docs`. The existing frontend-local authorization test currently expects the obsolete 2026-09-17 policy and 132 permissions; the current backend cross-workspace test is authoritative until that unrelated stale test is corrected.
