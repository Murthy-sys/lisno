# AI Estimator Empty Main Basket Deletion

## Goal

Allow the sole active Super Admin to permanently delete an accidentally created
AI Estimator Main Basket when—and only when—the Basket is empty, unreferenced,
and not owned by the bootstrap manifest.

This specification implements the approved **Option A**. It does not cascade
into Estimation Items or erase revision, pricing, section, or audit history.

## Current behavior and evidence

- The frontend Estimation Item index exposes **Edit basket** and **Archive
  basket** only for Baskets represented by the currently loaded item groups.
  Empty Baskets appear in filters/create-item choices but have no management row,
  so they cannot be selected for a lifecycle action.
- `DELETE /admin/ai-estimator-knowledge/baskets/:basketId` is already registered,
  but it calls `archiveBasket`; it is a versioned, reasoned soft archive rather
  than a physical delete.
- Basket archive is blocked while any non-archived Main Line belongs to the
  Basket. Archived Main Lines and immutable history remain stored.
- The approved knowledge-base design explicitly says physical historical-data
  deletion is not exposed and that archive never deletes revisions, prices,
  taxes, or audit events.
- Main Lines hold an immutable required `basketId`. Scope, recommendation, and
  dependency section payloads can also hold stable `targetBasketId` references.
- Main Line creation and section saving validate Basket existence inside Mongo
  transactions, but Mongo provides no foreign-key cascade. A permanent-delete
  implementation must prevent a concurrent create/reference write from
  committing an orphan after an eligibility check.
- Seven bootstrap-owned Basket documents can be recreated by a later authorized
  bootstrap run. Deleting them would conflict with that manifest's additive,
  idempotent contract.

## Proposed behavior

The Estimation Item page will expose **Manage main baskets** to Super Admin. The
management view lists active, inactive, and archived Baskets, including Baskets
with zero Main Lines. Each Basket retains its existing edit/archive actions and
adds **Delete permanently**.

Selecting **Delete permanently** first loads an authoritative deletion-impact
preflight. The action is enabled only when all of the following are true:

1. the Basket exists at the expected version;
2. it is not bootstrap-owned;
3. no Main Line document in any status has its `basketId`;
4. no stored section in any revision status contains its stable ID as a Basket
   relationship target; and
5. no concurrent operation creates either dependency while deletion commits.

The confirmation requires the exact current Basket name and a non-empty reason.
Success permanently removes only the Basket document and appends an immutable,
sanitized deletion audit event in the same Mongo transaction.

If any item or historical reference exists, permanent deletion remains blocked
and the UI explains that the Basket is archive-only. No child record is changed.

## Scope

- Add a Super Admin-only deletion-impact API for one Main Basket.
- Add a distinct permanent-delete API without changing the existing archive
  endpoint.
- Add transaction-safe dependency coordination for operations that can create a
  new Main Line or introduce a new Basket relationship reference.
- Add a Main Basket management view reachable from the Estimation Item page so
  empty Baskets are visible.
- Add exact-name/reason confirmation, blocker presentation, retry, conflict,
  success announcement, and query invalidation.
- Synchronize route-operation authorization, runtime validation, OpenAPI, shared
  frontend API types, tests, and the AI Estimator design document.

## Non-goals

- No cascade deletion of Main Lines, revisions, sections, price versions, audit
  events, or display-order history.
- No permanent deletion of a Basket that has ever owned a Main Line, including
  an archived Main Line.
- No permanent deletion of a Basket referenced by active, Draft, Superseded, or
  archived configuration history.
- No permanent deletion of bootstrap-owned Baskets.
- No change to existing `DELETE /baskets/:basketId` archive semantics.
- No permission grant to another role and no frontend-only authorization.
- No database backfill, live deletion, seed, deployment, commit, or production
  mutation as part of implementation.

## Actors and authorization

| Operation | Sole active Super Admin with lifecycle permission | Other authenticated role | Anonymous |
| --- | ---: | ---: | ---: |
| Read deletion impact | Allow | 403 | 401 |
| Permanently delete eligible Basket | Allow | 403 | 401 |

- Both routes use the canonical route-operation registry and
  `ai_estimator_knowledge.configuration.lifecycle`.
- The operation scope remains the non-project `ai_estimator_knowledge`
  namespace with `admin_override` Super Admin behavior.
- Operation authorization and stored-actor validation occur before request-body
  validation or resource disclosure.
- Frontend visibility mirrors backend authorization but is never enforcement.

## API contract

### Deletion impact

```text
GET /api/v1/admin/ai-estimator-knowledge/baskets/:basketId/deletion-impact
```

Response:

```json
{
  "basketId": "knowledge-basket-...",
  "basketName": "Carpentry",
  "version": 3,
  "mainLineCount": 0,
  "historicalReferenceCount": 0,
  "bootstrapOwned": false,
  "canDelete": true,
  "blockers": []
}
```

`blockers` is a closed list of safe codes and messages:

- `BOOTSTRAP_OWNED`
- `HAS_MAIN_LINES`
- `HAS_HISTORICAL_REFERENCES`

Counts include all statuses and revision history. They are advisory for the
confirmation UI; the mutation rechecks every invariant transactionally.

### Permanent deletion

```text
DELETE /api/v1/admin/ai-estimator-knowledge/baskets/:basketId/permanent
```

Strict request body:

```json
{
  "expectedVersion": 3,
  "confirmationName": "Carpentry",
  "reason": "Created by mistake"
}
```

Success returns HTTP 200:

```json
{
  "basketId": "knowledge-basket-...",
  "deleted": true,
  "deletedAt": "2026-08-31T12:00:00.000Z"
}
```

### Failure behavior

- `400 VALIDATION_ERROR`: malformed body, empty reason, or confirmation name not
  exactly equal to the current stored name.
- `401`: missing or invalid identity.
- `403 FORBIDDEN`: actor lacks the exact lifecycle operation.
- `404 NOT_FOUND`: unknown/unavailable Basket without hidden-resource detail.
- `409 VERSION_CONFLICT`: stored version differs from `expectedVersion`.
- `409 BASKET_DELETE_BLOCKED`: bootstrap ownership, any Main Line, any historical
  relationship reference, or a dependency created during the attempted delete.
- Transaction/audit failure returns the established server error and leaves the
  Basket present.

## Data and transaction contract

- Only the `aiEstimatorKnowledgeBaskets` document is physically removed.
- Main Line ownership blockers query `basketId` across every Main Line status.
- Historical Basket-reference blockers query all knowledge sections/revisions
  for Basket-target paths used by scope, recommendations, and dependencies.
- Add an internal Basket dependency epoch/guard field with a default that is
  compatible with existing documents; it is not exposed in public DTOs.
- Any transaction that can create a Main Line for a Basket or introduce a new
  `targetBasketId` writes that Basket's dependency guard in the same transaction.
  Permanent deletion writes the same Basket document. Concurrent dependency
  creation and deletion therefore conflict, so only one transaction can commit.
- The delete service authorizes, reloads, checks version and confirmation,
  re-evaluates blockers, deletes by guarded ID/version, and appends audit evidence
  in one replica-set transaction.
- Audit action: `ai_estimator_knowledge_basket_permanently_deleted`; entity ID is
  the deleted Basket ID; old values include name, status, display order, version,
  and bootstrap ownership; reason, actor, and timestamp are retained. No token,
  private URL, or unrelated payload is recorded.
- Display-order high-water allocation is not rewound or reused. Gaps are valid.

## Frontend and UX contract

- Add **Manage main baskets** to the Estimation Item index for actors with the
  lifecycle permission. The existing **Add main basket** flow remains available.
- The management surface/dialog lists every fetched Basket, including empty and
  archived entries, with explicit loading, empty, error, and retry states.
- **Delete permanently** opens a dedicated destructive confirmation; it never
  reuses the archive dialog or implies recoverability.
- The dialog loads current impact, identifies the exact Basket, shows blocker
  counts, and disables confirmation when `canDelete` is false.
- Eligible deletion requires exact-name typing plus a reason. Confirmation stays
  disabled while preflight or mutation is pending.
- `VERSION_CONFLICT` refreshes the Basket/impact and requires renewed
  confirmation; the client never automatically retries a destructive mutation.
- Success closes the dialog, announces deletion, removes stale Basket choices,
  and invalidates Basket lists, item filters/lists, create-item choices, and
  relationship-selector queries.
- Keyboard focus returns to **Manage main baskets** after close/success. Dialog
  naming, alerts, disabled explanations, and mobile action layout remain
  accessible.

## Compatibility, migration, and rollback

- Existing Basket/archive endpoints and DTOs remain compatible; the impact and
  permanent-delete routes are additive.
- The internal dependency guard defaults safely for pre-existing Basket
  documents and is created/incremented on guarded writes; no data backfill or
  write migration is required.
- Code rollback removes the new UI/routes. It cannot restore a legitimately
  deleted Basket; immutable audit evidence is the reconstruction record.
- No production deletion is authorized by approving or implementing this code.
  Any live data recovery remains a separately authorized operational action.

## Risks and mitigations

- **Irrecoverable user error:** require impact preflight, exact-name entry,
  reason, expected version, explicit permanent wording, and an audit event.
- **Orphan creation race:** coordinate Main Line/reference creation and Basket
  deletion through a same-document transactional dependency guard; test both
  commit orders on a Mongo replica set.
- **Historical lineage break:** block on Main Lines and Basket references across
  every status and revision, not just active configuration.
- **Bootstrap resurrection:** classify bootstrap-owned Baskets as permanently
  non-deletable; archive remains available where otherwise valid.
- **Permission leakage:** register both operations and test Super Admin,
  non-Super-Admin, inactive/stale Super Admin, and anonymous identities with
  valid and malformed inputs.
- **Stale frontend state:** invalidate every Basket-dependent query and require
  renewed confirmation after version conflict.
- **Misleading archive/delete language:** retain separate actions and dialogs;
  “Delete permanently” is used only for the physical operation.

## Acceptance criteria

1. A permitted Super Admin can open **Manage main baskets** from the Estimation
   Item page and see an empty custom Basket that is absent from item groups.
2. The Super Admin can permanently delete that Basket only after a successful
   impact preflight, exact-name confirmation, reason entry, and expected-version
   check.
3. Successful deletion removes only the Basket document, writes one atomic
   deletion audit event, invalidates all Basket-dependent frontend state, and
   announces success.
4. A Basket with any Main Line in any status is blocked; no child document is
   modified or deleted.
5. A Basket referenced by any stored revision/section is blocked, including
   historical or inactive relationship rows retained in immutable history.
6. A bootstrap-owned Basket is blocked from permanent deletion.
7. A dependency creation racing with deletion cannot leave an orphan: one
   transaction commits and the other returns a retryable conflict/failure.
8. Version conflict, confirmation mismatch, audit failure, transaction failure,
   unknown ID, and dependency blockers leave the Basket unchanged.
9. Existing Basket archive behavior and routes remain unchanged.
10. Other roles cannot see the action and receive backend 403; anonymous callers
    receive 401; authorization precedes validation/disclosure.
11. The management and confirmation UI handles loading, empty, error, retry,
    blocked, pending, conflict, success, keyboard, focus-return, and responsive
    states accessibly.
12. Focused backend service/route/OpenAPI/authorization tests, replica-set race
    integration tests, focused frontend interaction/accessibility tests, full
    backend/frontend typechecks/tests/builds, and repository hygiene checks pass,
    or any unrun check is explicitly reported.

## Assumptions and open decisions

- “Delete Main basket” means permanent removal of an accidentally created,
  custom Basket that has no Estimation Items or historical references.
- Approval confirms **no cascade deletion**. Used, referenced, and
  bootstrap-owned Baskets remain archive-only.
- Approval confirms deletion is managed from the Estimation Item index through
  **Manage main baskets**, because empty Baskets cannot appear in the existing
  item-derived Basket groups.
- No additional product decision is required if these assumptions are correct.
