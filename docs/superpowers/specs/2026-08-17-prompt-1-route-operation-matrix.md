# Prompt 1 Route-Operation Matrix

**Date:** 2026-08-17
**Status:** Normative companion to the approved Prompt 1 RBAC design

## Purpose

This matrix classifies every current human-JWT-protected backend route and every new Prompt 1 route. Public authentication, `/health`, and the extraction worker's separate shared-secret routes are excluded.

The implementation must maintain a code-owned registry with one entry per method/path below. Tests must fail for an unclassified protected human route, a registry entry without a route, an unknown permission/module, or a duplicate method/path.

## Classification rules

- `read`: Super Admin may read globally, while validation, redaction, and response-shape rules remain. Self endpoints still return Super Admin's own record rather than impersonating another user.
- `admin`: Super Admin may perform the mutation as itself with audit, validation, concurrency, and workflow checks. Existing scoped administrators retain the relationship rule shown.
- `personal`: Super Admin may not enter through the actor-bound legacy endpoint. A future override requires a distinct administrative operation and audit semantics.
- `projects` and `design` rows use the module-aware project resolver where a project can be resolved.
- Current `estimation` routes remain lead/estimate/client-relationship scoped and do not consume `ProjectAccessGrant` in Prompt 1.
- Non-project namespaces never consult `ProjectAccessGrant`.

Super Admin behavior abbreviations are `self`, `global read`, `admin override`, and `deny personal`.

## Existing protected routes

| # | Method and path | Permission | Module/scope | Preserved relationship or ownership rule | Class | Super Admin |
|---:|---|---|---|---|---|---|
| 1 | `GET /auth/me` | `identity.self.read` | Non-project: identity | Current authenticated active stored user. | read | self |
| 2 | `GET /projects` | `projects.list` | `projects` | Head all; client linked; designer initiated/assigned; manager accountable; estimator none. Preserve client redaction. | read | global read |
| 3 | `GET /client/project-summaries` | `projects.client_summary.read` | `projects` | Client linked projects only. | read | global read |
| 4 | `POST /projects` | `projects.create` | `projects` | Designer creates as initiator; selected manager/designers must be active and correctly role-scoped. | personal | deny personal |
| 5 | `GET /projects/:projectId` | `projects.read` | `projects` | Same legacy project scope and client redaction as project list. | read | global read |
| 6 | `POST /projects/:projectId/floors` | `projects.floor.create` | `projects` | Designer and initiated/assigned project. | personal | deny personal |
| 7 | `POST /floors/:floorId/stages` | `projects.stage.create` | `projects` | Designer and initiated/assigned parent project. | personal | deny personal |
| 8 | `POST /stages/:stageId/tasks` | `projects.task.create` | `projects` | Designer and initiated/assigned project; owner active and assigned designer. | personal | deny personal |
| 9 | `GET /tasks/:taskId/events` | `design.task_events.read` | `design` | Designer/manager/head legacy project scope. | read | global read |
| 10 | `PATCH /tasks/:taskId` | `design.task.self.update` | `design` | Designer owns task; retain version/state validation. | personal | deny personal |
| 11 | `PATCH /tasks/:taskId/deadline` | `design.task_deadline.update` | `design` | Manager direct-report task or Head eligible design task. | admin | admin override |
| 12 | `GET /organization/managers` | `organization.managers.read` | Non-project: organization | Designer's active-manager options. | read | global read |
| 13 | `GET /organization/team` | `organization.team.read` | Non-project: organization | Manager direct designers. | read | global read |
| 14 | `GET /organization/tree` | `organization.tree.read` | Non-project: organization | Design Head legacy organization tree. | read | global read |
| 15 | `GET /organization/managers/:managerId/designers` | `organization.manager_designers.read` | Non-project: organization | Head reads requested manager's direct designers. | read | global read |
| 16 | `GET /designers/:designerId/summary` | `organization.designer_summary.read` | Non-project: organization | Designer self; manager direct report; Head all designers. | read | global read |
| 17 | `GET /kpis/users/:userId/tasks` | `organization.user_tasks.read` | Non-project: organization | Designer self/direct manager/Head; manager subject Head only. | read | global read |
| 18 | `GET /kpis/users/:userId` | `organization.user_kpi.read` | Non-project: organization | Same subject relationship as user-task KPI detail. | read | global read |
| 19 | `POST /evaluations` | `organization.evaluation.create` | Non-project: organization | Manager evaluates direct designer; Head evaluates designer/manager. | admin | admin override |
| 20 | `GET /evaluations/:subjectId` | `organization.evaluation.read` | Non-project: organization | Designer self; manager direct designer; Head designer/manager. | read | global read |
| 21 | `GET /projects/:projectId/activity` | `audit.project_activity.read` | `design` | Accountable manager or Head for accessible design project. | read | global read |
| 22 | `GET /designers/:designerId/audit` | `audit.designer.read` | Non-project: audit | Designer self; manager direct designer; Head. | read | global read |
| 23 | `GET /audit` | `audit.read` | Non-project: audit | Client denied; Head all; designer own; manager own/direct-report/task-visible events. | read | global read |
| 24 | `GET /client/latest-approved-versions` | `design.client_latest_approved.read` | `design` | Client linked projects and approved client-visible versions only. | read | global read |
| 25 | `POST /tasks/:taskId/design-versions` | `design.version.upload` | `design` | Designer owns task and project is initiated/assigned. | personal | deny personal |
| 26 | `GET /projects/:projectId/design-versions` | `design.version.read` | `design` | Legacy accessible project; client only approved client-visible versions. | read | global read |
| 27 | `GET /design-versions/:versionId/extraction` | `design.version_extraction.read` | `design` | Version project in accessible design scope. | read | global read |
| 28 | `PATCH /design-versions/:versionId/approval` | `design.version.approve` | `design` | Accountable manager or Head; retain approval workflow. | admin | admin override |
| 29 | `GET /design-versions/:versionId/download` | `design.version.download` | `design` | Accessible project; client additionally approved/client-visible. | read | global read |
| 30 | `GET /design-versions/:versionId/sections` | `design.section_draft.read` | `design` | Designer owner: version task owner and assigned/initiating project. | read | global read |
| 31 | `POST /design-versions/:versionId/sections` | `design.section.create` | `design` | Same editable owner rule as section draft. | personal | deny personal |
| 32 | `PATCH /design-sections/:sectionId` | `design.section.update` | `design` | Same editable owner rule as section draft. | personal | deny personal |
| 33 | `DELETE /design-sections/:sectionId` | `design.section.delete` | `design` | Same editable owner rule as section draft. | personal | deny personal |
| 34 | `POST /design-versions/:versionId/retry-extraction` | `design.section_extraction.retry` | `design` | Same owner rule plus retryable extraction state. | personal | deny personal |
| 35 | `POST /design-versions/:versionId/submit-sections` | `design.section.submit` | `design` | Same owner rule plus readiness validation. | personal | deny personal |
| 36 | `GET /client/projects/:projectId/design-sections` | `design.client_sections.read` | `design` | Linked client and review-visible sections/revisions. | read | global read |
| 37 | `POST /design-section-revisions/:revisionId/decision` | `design.client_section_decision` | `design` | Linked client and client-decidable revision. | personal | deny personal |
| 38 | `GET /design-source-pages/:pageId/image` | `design.source_page_image.read` | `design` | Submitted/changed/approved uses project scope; otherwise designer owner-only. | read | global read |
| 39 | `GET /design-section-revisions/:revisionId/image` | `design.section_revision_image.read` | `design` | Draft owner-only; non-draft accessible-project scope. | read | global read |
| 40 | `POST /estimates/:estimateId/design-uploads` | `estimation.design_upload.create` | Non-project: estimation ownership | Estimator owns editable estimate and lead. | personal | deny personal |
| 41 | `GET /estimates/:estimateId/design-uploads` | `estimation.design_upload.read` | Non-project: estimation ownership | Estimator owns estimate. | read | global read |
| 42 | `POST /estimate-design-uploads/:uploadId/retry` | `estimation.design_upload.retry` | Non-project: estimation ownership | Estimator owns editable estimate; retryable state. | personal | deny personal |
| 43 | `GET /estimate-design-source-pages/:pageId/image` | `estimation.source_page_image.read` | Non-project: estimation ownership | Source upload belongs to actor-owned estimate. | read | global read |
| 44 | `POST /estimate-design-source-pages/:pageId/drawings` | `estimation.drawing.create` | Non-project: estimation ownership | Page belongs to actor-owned editable estimate. | personal | deny personal |
| 45 | `GET /estimate-design-revisions/:revisionId/image` | `estimation.design_revision_image.read` | Non-project: estimation ownership | Estimator owns estimate; client relation and visible review state. | read | global read |
| 46 | `GET /client/estimates/:estimateId/design-drawings` | `estimation.client_drawings.read` | Non-project: estimation ownership | Existing client estimate relation and exposed review states. | read | global read |
| 47 | `PUT /client/estimate-design-revisions/:revisionId/annotation-draft` | `estimation.client_annotation_draft.save` | Non-project: estimation ownership | Client can access estimate; own versioned draft. | personal | deny personal |
| 48 | `POST /client/estimate-design-revisions/:revisionId/decision` | `estimation.client_drawing_decision` | Non-project: estimation ownership | Client can access estimate; revision client-decidable. | personal | deny personal |
| 49 | `PATCH /estimate-design-drawings/:drawingId` | `estimation.drawing.update` | Non-project: estimation ownership | Drawing belongs to actor-owned editable estimate. | personal | deny personal |
| 50 | `PUT /estimate-design-drawings/:drawingId/estimate-item` | `estimation.drawing.estimate_item.assign` | Non-project: estimation ownership | Drawing belongs to actor-owned editable estimate. | personal | deny personal |
| 51 | `DELETE /estimate-design-drawings/:drawingId` | `estimation.drawing.delete` | Non-project: estimation ownership | Drawing belongs to actor-owned editable estimate. | personal | deny personal |
| 52 | `POST /estimate-design-drawings/:drawingId/replacement` | `estimation.drawing.replace` | Non-project: estimation ownership | Actor owns estimate and replacement workflow permits. | personal | deny personal |
| 53 | `POST /estimates/:estimateId/design-drawings/submit` | `estimation.drawing.submit` | Non-project: estimation ownership | Actor owns editable estimate; readiness checks pass. | personal | deny personal |
| 54 | `GET /client/estimates/:estimateId/plan-review` | `estimation.client_plan_review.read` | Non-project: estimation ownership | Existing client/lead-email relation. | read | global read |
| 55 | `GET /client/estimate-plan-pages/:pageId/thumbnail` | `estimation.client_plan_review.read` | Non-project: estimation ownership | Page belongs to accessible client estimate. | read | global read |
| 56 | `GET /client/estimate-plan-pages/:pageId/current-image` | `estimation.client_plan_review.read` | Non-project: estimation ownership | Page belongs to accessible client estimate. | read | global read |
| 57 | `PUT /client/estimate-plan-pages/:pageId/annotation-draft` | `estimation.client_plan_annotation_draft.save` | Non-project: estimation ownership | Accessible client estimate and actor's versioned draft. | personal | deny personal |
| 58 | `POST /client/estimate-plan-pages/:pageId/target-preview` | `estimation.client_plan_target_preview` | Non-project: estimation ownership | Accessible client estimate; preview is not persisted. | read | global read |
| 59 | `POST /client/estimate-plan-pages/:pageId/change-requests` | `estimation.client_plan_change_request.create` | Non-project: estimation ownership | Accessible client estimate; creates actor's request. | personal | deny personal |
| 60 | `PUT /client/estimate-plan-change-requests/:requestId` | `estimation.client_plan_change_request.update` | Non-project: estimation ownership | Request client is actor; open state and version match. | personal | deny personal |
| 61 | `GET /estimate-plan-change-requests` | `estimation.plan_change_request.read` | Non-project: estimation ownership | Estimator owns estimate, assigned designer, or responsible manager. | read | global read |
| 62 | `GET /estimate-plan-change-requests/:requestId` | `estimation.plan_change_request.read` | Non-project: estimation ownership | Same staff/estimate relation as request list. | read | global read |
| 63 | `PUT /estimate-plan-change-requests/:requestId/targets` | `estimation.plan_change_request.targets.update` | Non-project: estimation ownership | Same staff relation; version/workflow validation. | admin | admin override |
| 64 | `POST /estimate-plan-change-requests/:requestId/resolve-page` | `estimation.plan_change_request.resolve_page` | Non-project: estimation ownership | Same staff relation; version/workflow validation. | admin | admin override |
| 65 | `GET /estimate-plan-pages/:pageId/current-image` | `estimation.plan_page_image.read` | Non-project: estimation ownership | Same staff/estimate relation as change request. | read | global read |
| 66 | `GET /leads` | `estimation.lead.list` | Non-project: estimation ownership | Estimator owner-scoped lead list. | read | global read |
| 67 | `POST /leads` | `estimation.lead.create` | Non-project: estimation ownership | Estimator creates actor-owned lead. | personal | deny personal |
| 68 | `GET /leads/:leadId` | `estimation.lead.read` | Non-project: estimation ownership | Lead owner is actor. | read | global read |
| 69 | `PATCH /leads/:leadId` | `estimation.lead.update` | Non-project: estimation ownership | Lead owner is actor. | personal | deny personal |
| 70 | `GET /leads/:leadId/activities` | `estimation.lead_activity.read` | Non-project: estimation ownership | Actor owns lead. | read | global read |
| 71 | `POST /leads/:leadId/activities` | `estimation.lead_activity.create` | Non-project: estimation ownership | Actor owns lead. | personal | deny personal |
| 72 | `GET /leads/:leadId/estimate` | `estimation.estimate.read` | Non-project: estimation ownership | Actor owns lead and matching estimate. | read | global read |
| 73 | `GET /estimates` | `estimation.estimate.list` | Non-project: estimation ownership | Actor's estimates and leads. | read | global read |
| 74 | `PUT /leads/:leadId/estimate` | `estimation.estimate.save` | Non-project: estimation ownership | Actor owns lead and editable estimate. | personal | deny personal |
| 75 | `POST /leads/:leadId/estimate/submit` | `estimation.estimate.submit` | Non-project: estimation ownership | Actor owns lead/estimate; submit validation. | personal | deny personal |
| 76 | `GET /estimates/:estimateId/pdf` | `estimation.estimate_pdf.download` | Non-project: estimation ownership | Estimate owner is actor. | read | global read |
| 77 | `GET /estimates/review-queue` | `estimation.review_queue.read` | Non-project: estimation ownership | Manager pending queue; designer self-assigned estimates. | read | global read |
| 78 | `GET /estimates/designers` | `estimation.assignable_designers.read` | Non-project: organization | Manager's active direct designers. | read | global read |
| 79 | `POST /estimates/:estimateId/assign` | `estimation.designer_assignment.create` | Non-project: estimation ownership | Manager selects active direct designer; retain queue/workflow rules. | admin | admin override |
| 80 | `POST /estimates/:estimateId/designer-decision` | `estimation.designer_assignment.decision` | Non-project: estimation ownership | Assigned designer is actor; retain state rules. | personal | deny personal |
| 81 | `POST /estimates/:estimateId/send-client` | `estimation.estimate.send_client` | Non-project: estimation ownership | Estimator owns ready estimate. | personal | deny personal |
| 82 | `GET /client/estimates` | `estimation.client_estimate.list` | Non-project: estimation ownership | Lead email/client relation and client-visible status. | read | global read |
| 83 | `GET /client/estimates/:estimateId/pdf` | `estimation.client_estimate_pdf.download` | Non-project: estimation ownership | Client relation and permitted status. | read | global read |
| 84 | `POST /client/estimates/:estimateId/decision` | `estimation.client_estimate.decision` | Non-project: estimation ownership | Client relation and client-decidable estimate state. | personal | deny personal |

## New Prompt 1 protected routes

| # | Method and path | Permission | Module/scope | Relationship or ownership rule | Class | Super Admin |
|---:|---|---|---|---|---|---|
| 85 | `GET /auth/authorization` | `identity.authorization.read` | Non-project: identity | Current authenticated active stored user; returns exact role/policy/permission snapshot. | read | self |
| 86 | `GET /admin/users` | `identity.users.read` | Non-project: identity | Admin sees `OPERATIONAL_ROLES`; Super Admin sees all; redacted and paginated. | read | global read |
| 87 | `PATCH /admin/users/:userId` | `identity.users.update` | Non-project: identity | Admin current and destination role operational; Super Admin global; concurrency and responsibility checks. | admin | admin override |
| 88 | `POST /access-requests` | `access_request.create` | Non-project: access administration | Eligible active internal requester; own opaque request only. | personal | deny personal |
| 89 | `GET /access-requests/mine` | `access_request.self.read` | Non-project: access administration | Actor's own opaque requests. | read | self |
| 90 | `POST /access-requests/:requestId/cancel` | `access_request.self.cancel` | Non-project: access administration | Actor owns pending request; version check. | personal | deny personal |
| 91 | `GET /access-requests/review` | `access_request.review.read` | Non-project endpoint with project-review scope | Admin only own initiated projects after Prompt 2; Super Admin all in Prompt 1. | read | global read |
| 92 | `POST /access-requests/:requestId/decision` | `access_request.review.decide` | Non-project endpoint with project-review scope | Initiating Admin after Prompt 2 or Super Admin; role ceiling, project, version, workflow checks. | admin | admin override |
| 93 | `POST /project-access-grants/:grantId/revoke` | `project_access_grant.revoke` | Non-project endpoint with project-review scope | Initiating Admin after Prompt 2 or Super Admin; reason/version checks. | admin | admin override |

`execution.worker_assignment.override` is a reserved, route-less Super Admin capability in Prompt 1. No worker assignment/reassignment endpoint may be registered until Prompts 6–7.

## Required registry tests

1. The 93 method/path registrations above have exactly 93 registry entries.
2. Public auth, health, and extraction-worker routes are intentionally classified outside the human-JWT registry.
3. Every permission code belongs to the canonical `PermissionCode` catalog.
4. Every project-backed entry uses one exact `ProjectModule`; estimation ownership rows cannot consume project grants in Prompt 1.
5. Every `personal` operation denies Super Admin through that legacy endpoint.
6. Every `admin` operation audits the real actor and retains validation/concurrency/workflow checks.
7. Every `read` operation has an explicit Super Admin query/redaction test; self reads remain self-only.
8. Every direct-Mongoose route applies the same permission and relationship policy as repository-backed routes.
9. A Design grant satisfies only `design` project scope and never `projects`, estimation, or another future module.
10. Future route additions fail registry coverage until deliberately classified.
