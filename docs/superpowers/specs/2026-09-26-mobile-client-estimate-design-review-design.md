# Mobile client estimate and design review

Date: 2026-09-26. Gate 1: specification only.
Classification: substantial, with high-risk approval and annotation mutations. This specification does not authorize implementation, migration, deployment, or external communication.

## Goal

Give a Client a coherent mobile path from a published estimate to its project designs: inspect and approve or request changes to the estimate; see design uploads when the backend makes them client-visible; open the original plan pages; mark them and submit change requests with the same rules as the web client; review extracted drawings and submitted project design sections; and open approved project documents. The project view should use the current mobile Project Details composition and tabs.

## Current behavior and evidence

- `mobile/src/features/workspace/featureDefinitions.ts` exposes `Estimates & design review` through `GET /client/estimates`, but no estimate detail route. `FeatureWorkspace.tsx` renders each estimate as a generic list row with `ClientEstimateAction`. That action supports PDF export and a decision, but shows no estimate line items, uploads, plan pages, drawing review, or annotations.
- `ClientEstimateAction.tsx` offers a decision for both `sent_to_client` and `client_changes_requested`. `backend/src/services/estimate-decision.service.ts` accepts a new Client decision only while `sent_to_client`; the second state can yield a 409.
- The in-progress mobile Project Details change (uncommitted `2026-09-26-mobile-project-details-tabs` spec, plan, and mobile files) adds Information, Estimation, Designs, Documents, Team, and Tasks tabs. Its Estimation tab is informational and only appears for the admin payload. The client `/projects/:id` payload has no estimate. Designs currently contains `DesignVersionWorkspace` and `WorkflowWorkspace`. Documents lists an estimate PDF when an admin estimate ID exists and approved task design versions, but provides downloads rather than a plan annotation viewer.
- `frontend/src/features/estimates/EstimateReviewPanel.tsx`, `ClientEstimateDrawings.tsx`, `ClientPlanPageReview.tsx`, and `components/design/EstimateDrawingPreviewDialog.tsx` establish the web estimate, full-plan-page, extracted-drawing, annotation-draft, change-request, and decision behavior. `frontend/src/features/client/ClientProject.tsx` separately shows submitted design section review and approved, client-visible task design versions.
- Existing backend operations cover these mobile flows: `GET /client/estimates`, `POST /client/estimates/:estimateId/decision`, the client estimate PDF, `GET /client/estimates/:estimateId/plan-review`, protected page image endpoints, page annotation draft, target preview, change-request create/update, `GET /client/estimates/:estimateId/design-drawings`, drawing revision draft/decision, `GET /client/projects/:projectId/design-sections`, section revision decision/image, and project design-version list/download. The operations are already in `mobile/src/contracts/operations.ts`.
- An approved estimate may create or link a project in `estimate-decision.service.ts`; before approval, `projectId` may be null. `GET /client/estimates` returns estimate IDs and `projectId` when linked. Client project design-version listing is server-filtered to `approvalStatus=approved` and `clientVisible=true` in `design-version.service.ts`.
- `mobile/src/platform/annotations/coordinates.ts` already provides normalized image/view coordinate conversion. `react-native-svg` and gesture handling are installed. Authenticated file transfers provide local private-image URIs and cleanup; they are used by mobile message previews.
- The worktree currently contains pre-existing uncommitted edits for the tabbed mobile Project Details screen, including its spec and plan. Those files must be treated as existing work and reconciled before implementation; this specification is the only file created at this gate.

## Recommended product approach

Use one Client estimate review workspace keyed by the **estimate ID** as the entry before project creation. Reuse that same workspace from the Client Project Details **Estimation** tab when `projectId` matches exactly. After approval, keep the review context visible, refetch the authoritative estimate and project, and offer a direct route to the project **Designs** tab. Put client-visible submitted plan pages and design section review in Designs; put approved project design versions in Documents. The full uploaded plan is represented by its original filename and ordered pages, while annotations are saved against the selected source page.

This follows the existing web/backend contract and avoids using project names or client names as join keys. It also avoids assuming that estimate approval itself creates design files: after approval the UI can correctly say that the design plan has not yet been submitted.

## Scope and requirements

### 1. Client entry and estimate review

- The Client Estimates list opens a dedicated mobile estimate review screen for an estimate ID. It shows project/lead identity, estimate status, GST-inclusive total, the included line items and their amounts, PDF export, and design-review availability. It uses the established mobile Project Details header, typography, surface, spacing, and action patterns instead of a generic record dump.
- A linked Client Project Details screen shows **Estimation** when an authorized `GET /client/estimates` result has `projectId === project.id`. The exact ID match is required. If more than one estimate is linked, show each with its own stable ID and status; never silently choose by array order or name. A project without a linked estimate gets an explicit empty state rather than a fabricated amount or approval control.
- Only a `sent_to_client` estimate offers **Approve estimate** and **Request changes**. Approval has a confirmation step and an optional note. Request changes requires a meaningful note. On success, refetch the estimate list and affected project/workflow data; use the returned `projectId` to make the project destination available. A denied, stale, or failed decision leaves the current record visible with a clear retry/refresh path and never assumes success.
- The estimate PDF is opened through the existing authenticated transfer path. The Client operation is `/client/estimates/:estimateId/pdf`, not the admin PDF operation. Preserve the published review artifact semantics supplied by the backend.

### 2. Uploaded plan pages and annotations

- Show original uploaded design plans from `GET /client/estimates/:estimateId/plan-review`, grouped by upload ID and original filename, with page count and ordered page navigation. Show them in the estimate review workspace and in the linked project's Designs tab when the server exposes them. `client_approved` is not itself proof of a submitted plan: show an awaiting-design state until the backend returns visible pages. Before commercial approval, retain the web behavior that allows plan review while `sent_to_client` or `client_changes_requested` when the backend permits it.
- Open protected source-page images in a native, full-screen viewer. Load images through authenticated transfers into temporary local files, with no bearer token in an image URL, logs, or screenshots. Release temporary files on viewer close, session change, and failure. Keep each annotation attached to its page ID and image dimensions; changes in zoom, pan, orientation, or viewport size do not shift saved marks.
- Match the web annotation document V1 contract: rectangle, ellipse, arrow, freehand, and text marks using normalized coordinates, stable element IDs, permitted color/stroke values, undo/redo, selection/editing/removal, and a read-only overlay for already submitted marks. Offer zoom and pan without conflating navigation gestures with drawing. Touch controls must work on phone and tablet, and all tool actions need accessible labels and an equivalent non-drag way to inspect existing marks.
- **Save draft** calls the existing page-draft endpoint with its version, without submitting feedback. **Request changes** requires at least one mark and a non-empty summary, calls target preview, lets the Client confirm detected drawing targets, and submits using the returned page revision, snapshot token, selected drawing IDs, and one stable idempotency key for retries. When there are no target overlaps, explain that feedback will be page-level. An existing open request can be viewed and updated with its own version. On 409, refresh authoritative data and preserve the user's unsent local work until they choose to discard or reconcile it. Warn before closing an unsaved editor.
- The annotation editor validates the backend V1 limits before requests (including 200 elements, a 256 KiB serialized document, bounded text, and normalized coordinates). The backend remains authoritative for all validation and reviewability decisions. Approved pages and design states outside the backend's reviewable window are read-only.

### 3. Extracted drawing and project section review

- Show client-visible extracted drawing revisions from `GET /client/estimates/:estimateId/design-drawings`, with status, image preview, page context, and the backend `readiness` count. For a submitted revision, the Client can approve by its revision number or mark it and request changes. Use page-target projection and change-request APIs where a source page exists; use the existing drawing decision endpoint only for the legacy/no-source-page path, matching web behavior. Preserve submitted annotations and request history as read-only context. Do not expose draft or staff-only drawings.
- In linked Project Details Designs, show submitted project design sections using `GET /client/projects/:projectId/design-sections`. The Client can preview the protected revision image, inspect current status/history, approve a submitted revision, or request changes with a required comment. Decisions send the revision ID and number to `POST /design-section-revisions/:revisionId/decision` and refresh section and workflow data. This is a separate review contract from page annotations; do not attach V1 page marks to section decisions.
- Keep the existing `WorkflowWorkspace` and authorized design-version behavior for other roles. Client review actions appear only for Clients with the corresponding operations and a backend-reviewable item.

### 4. Approved documents

- The Client Project Details Documents tab lists approved and client-visible task design versions returned by the server, with filename, version, date, and an **Open** action. Images open in a native preview; PDFs and other supported documents open through a safe platform document reader/share flow using an authenticated temporary file. Keep Download/Share as a secondary action where useful. Show the client estimate PDF by the linked estimate ID when authorized.
- The Designs tab may show submitted, reviewable plan pages before they are approved; Documents identifies approved project documents only. A missing upload is an empty/awaiting state. Approval of the estimate or an individual drawing never manufactures an approved task document.
- Paginate the design-version list until all approved items are represented, or provide explicit load-more; the existing first-30 window must not silently hide later approved files.

### 5. Mobile interaction states and accessibility

- The sequence is clear on small screens: estimate awaiting decision; estimate approved and design awaited; submitted design available; annotated change request open; revised design awaiting decision; approved document available. Show authoritative status per item, not one optimistic global label.
- Each list/viewer has loading, empty, denied, stale, network-error, retry, and refresh states. A failed image fetch is distinguishable from an absent upload. Mutations disable repeat taps while pending and report success or failure accessibly.
- Preserve the Project Details tab selection and in-progress review state on ordinary tab switching. Back navigation from a full-screen viewer returns to its source plan and page. Support Android back, safe areas, 320 dp width, tablet width, large font scale, screen reader names, 44 dp minimum touch targets, and reduced-motion settings.

## Invariants and data/API impact

- **Identity and authorization:** join estimates to projects only by `projectId`; drive page, drawing, section, version, and request actions by their stable IDs and expected versions. Client visibility is limited by existing backend operations and resource-scoped checks. A mobile button gate is advisory, never a replacement for backend authorization. No cross-client or cross-project fallback.
- **Approval history:** estimate and design decisions remain backend mutations with their existing immutable review/audit semantics. Never locally set an estimate to approved or mark a document client-visible before the server response. Confirmed decisions and idempotent request retries invalidate the affected private query families.
- **Finance:** display the server-supplied estimate total as whole rupees including GST. On a linked project, approved value comes only from the project's `approvedBaseline`; do not relabel a mutable current estimate as the approved baseline or calculate money in the UI.
- **Contracts:** existing endpoints and `AnnotationDocumentV1` are sufficient. No backend schema, permission, or migration is proposed. Mobile typed adapters should validate nested API shapes at the boundary, and any missing operation/authorization metadata must be reconciled with the canonical registry, rather than bypassed.
- **Files:** source pages and document binaries remain behind authenticated downloads and ephemeral local storage. No persistent image cache, public URL, token in URI, or customer file in test fixtures.
- **Compatibility:** admin/staff project tabs and operational task/design workspaces stay available. The existing Client Estimates entry stays reachable for estimates with no project. The tabbed mobile Project Details work is a prerequisite, and implementation must first reconcile its then-current dirty state.

## Scope limits

- No design upload, OCR/extraction, estimate recalculation, new approval policy, new project creation workflow, or staff editing flow.
- No migration or production data change. No automatic estimate approval, automatic design submission, or automatic publication to the Client.
- Do not replace backend review rules with local status heuristics. No generic PDF markup written into the PDF binary; annotations remain source-page V1 documents through existing APIs.
- No changes to web behavior except a separately demonstrated contract defect discovered during implementation.

## Risks and handling

- **Project may not exist before approval:** the estimate-ID entry remains primary until the server returns a linked project ID.
- **Two design streams:** estimate plan pages/drawings and project design sections/task files have different IDs, review states, and endpoints. Keep each labelled and independently loaded so a submitted plan is never presented as an approved project document.
- **Stale revisions or duplicated change requests:** use server versions, snapshot token, and a retained idempotency key; handle 409 with refresh and local-draft preservation.
- **Large private files and memory:** load one full-resolution page at a time, bound transfer sizes, cancel superseded fetches, and clean local files. Native PDF viewing may need an established platform reader capability; choose the smallest compatible approach during the task-plan gate and verify on Android.
- **Ongoing Project Details edits:** this specification references uncommitted work; the implementation owner must inspect the final integrated layout and tests before touching those files.

## Acceptance criteria

1. A Client can open a published estimate on mobile before a project exists, inspect line items and PDF, approve or request changes only while `sent_to_client`, and see the backend result with a route to the project when `projectId` is returned. A `client_changes_requested` estimate has no repeat commercial decision control.
2. A linked Client Project Details screen shows the correct estimate by exact project ID in Estimation; two unequal projects/estimates cannot cross-link, and an unmatched project has an empty state. The approved value continues to use `approvedBaseline`.
3. Client-visible uploads appear by original filename and ordered pages. A Client can open a protected page, add every supported V1 mark, zoom/pan, save a versioned draft, close/reopen it, preview targets, submit a marked and summarized change request, and update an open request. Empty/invalid submissions and stale versions are handled without losing local edits.
4. The same Client can inspect extracted drawing revisions and submitted project sections, approve or request changes using their respective backend contracts, and see updated counts/status/history. Hidden or unreviewable revisions have no action.
5. After a design plan is submitted, the Client can view its plan pages in the linked project's Designs tab. Before submission, the tab explains what is awaited. Approved client-visible task versions and the linked estimate PDF are reachable in Documents; images are previewable and PDFs can be opened with a platform reader. More than 30 approved versions remain reachable.
6. Every private image/file request uses authenticated transport; temporary files are cleaned. Unauthorized or unrelated IDs return a non-disclosing state. Mutations invalidate estimate, plan-review, design, project, and workflow consumers as applicable.
7. Focused tests cover the state matrix, ID isolation, operation gates, version/idempotency flow, coordinate round trips under zoom/pan and rotation, draft persistence, stale mutation handling, and cleanup. Typecheck, mobile tests, contract-drift tests, and native rendered checks on phone/tablet widths pass; any unavailable device check is reported explicitly.

## Assumptions and open decisions

- **Assumption A1:** “Project design page” means the Client's mobile estimate/design journey plus the linked Project Details Designs and Documents tabs. This is the only interpretation that supports estimates with no project yet and matches the current web client flow.
- **Assumption A2:** “Annotation similar to web” means the existing V1 source-plan-page and extracted-drawing review contract, including drafts and change requests. Project design-section review remains comment-based, as it is on web.
- **Decision for spec approval:** Confirm A1 and A2, or identify a narrower target screen or different annotation type. The architecture and endpoint choice materially change if the intended document is a task design-version PDF rather than an estimate plan page.

## Verification boundary

At this gate, only code and documentation were read and this specification was written. No task plan for this request, product code, tests, build, native run, migration, commit, push, or deployment has been performed.
