# Client-Editable Open Request Summary

## Goal

Let the client edit the comment for an existing open design change request without creating a duplicate request. Estimator, sales, designer, manager, and head views keep their current read-only Requested changes presentation.

## Client Experience

- When a client opens a Full Design page or extracted drawing with one mapped open request, that request summary appears in the editable **Change summary** textarea.
- The separate **Requested changes** history panel is hidden for an editable client preview. It remains visible for read-only staff and approved-client previews.
- The primary action reads **Update change request** when editing an existing request.
- Saving annotations as a draft does not update the request summary.
- Submitting an unchanged summary is allowed only when annotations changed; if neither changed, the update action is disabled.
- When multiple open requests map to one preview, the most recently returned request is editable and the remaining requests stay visible as read-only history. This avoids silently combining distinct audited requests.

## API Contract

Add:

```http
PUT /api/v1/client/estimate-plan-change-requests/:requestId
Content-Type: application/json

{
  "version": 2,
  "summary": "Updated client comment",
  "annotations": { "schemaVersion": 1, "imageWidth": 1000, "imageHeight": 800, "elements": [] }
}
```

The response is the updated `EstimatePlanChangeRequest` with an incremented version.

The service must:

1. authenticate a client and require ownership of the request;
2. require request status `open` and an exact version match;
3. validate a trimmed 1–1,000 character summary and a non-empty annotation document;
4. update the same request document atomically, incrementing `version`;
5. preserve its request ID, page, targets, statuses, and canonical page count;
6. synchronize `changeSummary` and annotations on still-current requested drawing revisions where applicable;
7. append an `estimate_plan_change_request_updated` audit event;
8. return HTTP 409 for stale versions or a no-longer-open request.

## Frontend Data Flow

Extend the mapped comment presentation value with `version`, `annotations`, and `editable`. The preview dialog receives one optional `editableRequest` separately from read-only `sharedComments`.

For a client-editable preview:

- initialize the textarea from `editableRequest.summary`;
- keep annotation editing native to the current page/crop document;
- call the update endpoint with request version, trimmed summary, and annotations;
- invalidate both plan and drawing workspaces after success;
- keep the dialog open and show a refresh message on HTTP 409.

For staff/read-only previews, continue showing the existing Requested changes panel and never expose update controls.

## Bidirectional Mapping

- Full Design selects open requests whose `sourcePageId` matches the canonical page.
- Extracted preview selects open requests whose targets contain the logical `drawingId`.
- Replacement ancestry continues to identify the original canonical placement.
- Updating from an extracted preview projects its crop annotations back to page coordinates before calling the request update endpoint.

## Verification

- Backend tests prove ownership, version conflict, same-ID update, audit creation, and no new request/page.
- Dialog tests prove editable prefilling for clients and unchanged read-only history for staff.
- Full Design and extracted-preview tests prove both routes call the same update API with correct page coordinates.
- Existing annotation projection, six-page invariance, targeted replacement, frontend, and backend regression suites remain green.
