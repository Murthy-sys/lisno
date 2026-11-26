# User known languages and preferred language

Date: 2026-11-25
Status: Approved and implemented in Mode A. Integrated verification passed; see the task plan for evidence. Local backend refreshed; no deployment performed.

## Goal

In Configuration / Users, let the Super Admin add, update, and clear a user's known languages and preferred language. Support both new-user invitations and existing-user management, with persistence and validation in the backend.

## Current behavior and evidence

- The Users screen is `frontend/src/features/admin/UserDirectoryPage.tsx`. New users use `InviteUserDialog.tsx`; existing accounts use `UserMutationDialog.tsx`. The Details panel shows saved account metadata.
- User Location has already been added to these forms and to backend user/invitation persistence. Those changes are uncommitted and must be preserved. The initial worktree contains modifications across those frontend files, backend models/repositories/services/routes, OpenAPI, security regression tests, and the Location specification/plan.
- Users and invitations currently have no language fields. User administration accepts strict, versioned role-only, active-only, or location-only patches (`backend/src/routes/admin-users.ts`). Invitation creation also has strict HTTP and service-level validation (`routes/user-invitations.ts`, `services/user-invitation.service.ts`). Both layers must accept the new fields.
- Projects already have `languagesKnown` and `preferredLanguage`. `backend/src/contracts/project-initiation.ts` defines 23 supported language codes and display labels, re-exported through `shared/projects/projectInitiation.ts`.
- The project form already uses `ProjectLanguageMultiSelect.tsx` for known languages and a standard dropdown for preferred language. Project preferred language is explicitly independent of known languages; existing tests exercise that behavior.
- Profile-only Location writes advance the user CAS version and `profileVersionOffset` together. Authorization fences use `userAuthorizationVersion`, preserving valid sessions, invitations, and password-reset links. Language edits must follow the same rule.
- Audit listing is also available to Design Head. Existing private Location audit values are redacted from non-Super-Admin responses; language audit values require equivalent protection.

## Scope and UX

1. Add **Known languages** as a multi-select and **Preferred language** as a single dropdown to Invite user and Manage user.
2. Reuse the existing supported-language catalog and accessible selection control; do not introduce a second list or dependency.
3. Both fields are optional. Existing records display no selected languages and no preferred language until set. Include clear actions/options.
4. Match the existing project behavior: preferred language can be selected independently of known languages. Selecting or removing a known language must not silently change the preferred language.
5. In Manage user, save the pair atomically through an explicit **Save languages** action. Retain the current separate Location and access actions. Prevent another action from silently discarding unsaved language edits, and avoid a state where edits cannot be saved or undone.
6. Show both saved values in the existing user Details panel, with **Not set** for empty values. Keep the main directory table compact rather than adding two broad columns.
7. Prefill saved values on reopen. Preserve edits on ordinary validation/network failures, identify field errors, and focus the affected control. A stale version must visibly load current data for review before retry.
8. Support keyboard use, accessible field names, pending/disabled states, cancellation with unsaved changes, and desktop/mobile layouts. Long multi-language selections must wrap without horizontal overflow.

## Data and API contract

Use the existing canonical codes and names:

```ts
languagesKnown: ProjectLanguage[];           // default []
preferredLanguage: ProjectLanguage | null;   // default null
```

- Add optional persistence fields to User and UserInvitation; old documents require no backfill. Administrative reads return canonical empty/null defaults.
- Accept only supported codes, a unique known-language list of at most the catalog size, and a supported preferred language or null. Reject invalid types, duplicates, unsupported values, and unrelated fields with useful field-level errors.
- Known languages represent a set. Normalize them into catalog order so reordering alone does not create a profile mutation or audit event.
- Extend invitation creation with optional `languagesKnown` and `preferredLanguage`. Omission preserves compatibility with existing callers and automatic invitation flows. Default omitted fields to empty/null.
- Extend the existing user update endpoint with one strict language-only branch:

```ts
{ version: number; languagesKnown: ProjectLanguage[]; preferredLanguage: ProjectLanguage | null }
```

- Require both language fields for that patch so the form saves a complete pair. Keep role, active status, and Location update branches compatible; reject mixed access/profile actions.
- Update HTTP validation, direct service validation, repository interfaces, memory and Mongo mappings, Mongoose models, frontend serializers/types, administrative DTOs, and OpenAPI together. Language validation errors must identify `languagesKnown` or `preferredLanguage`, rather than returning an empty fields object for malformed language values.
- Carry invitation language values through persistence, administrative list/detail projections, resend, and accepted-user creation. Resend preserves stored values. Do not add a new invitation-edit workflow.
- Keep user language metadata separate from project/client-persona language metadata. Editing either must not overwrite the other.

## Authorization, consistency, and side effects

- Reuse existing Super Admin user-management and invitation permissions; introduce no new endpoint or permission expansion. Existing active/inactive manageable users remain editable; deleted users remain unavailable. The sole Super Admin account stays immutable under the existing policy.
- Retain transactional actor revalidation and optimistic version checks. A changed language pair increments the raw user version and profile offset exactly once. A normalized no-op changes neither version nor audit history.
- Preserve user sessions, role, activation, responsibilities, grants, password-reset validity, and invitation authority during language-only updates. Genuine access changes must retain their existing revocation behavior.
- Record `user.languages_updated` with actor, target, old/new values, versions, and timestamp. Exclude those private values from non-Super-Admin audit responses while retaining the stored event and Super Admin visibility.
- Do not expose the new metadata through public invitation inspection, authentication tokens, general public user projections, email templates, or logs.
- Preserve invitation delivery preflight: unavailable mail must still produce no invitation/token/audit/email write. Feature verification uses synthetic data and isolated databases, not real invitations.
- Successful saves refresh affected administrative queries. Server validation remains authoritative.

## Assumptions and non-goals

- “Configuration user tab” means the existing Super Admin Users screen, consistent with the completed Location work.
- Reusing the project's language catalog and independent preferred-language semantics is the default, supported by current implementation. There are no unresolved decisions blocking this specification.
- This stores communication preferences only. App translation, automatic language matching/assignment, project persona synchronization, search/filter changes, and new language-configuration management are outside scope.
- Do not redesign user administration or modify existing role/access behavior. No new dependencies or lockfile changes are expected.
- No migration, production mutation, seed, commit, deployment, or real email is included.

## Compatibility, risks, and recovery

- Missing historical fields read as empty/null; older create/update clients remain compatible. Preserve the existing uncommitted Location implementation and tests.
- Principal risks are strict-schema mismatches, dropped fields in explicit mappings or invitation acceptance, stale saves, accidental authorization invalidation, and audit disclosure. Verify each at its boundary.
- Local frontend HMR and backend restart behavior previously caused a frontend/backend mismatch. Before reporting implementation ready, verify the running local backend serves the updated contract, restarting only the established loopback development service when necessary. Do not seed or mutate application data.
- Additive fields require no data rewrite. Rolling back code leaves optional stored metadata intact; an older client cannot edit it. Coordinate frontend/backend rollout to avoid sending new fields to an old validator.

## Acceptance criteria and verification

1. New-user invitation captures zero or more known languages and an optional preferred language; acceptance persists the exact normalized pair on the new user. Resend preserves it. Existing automatic and language-free invitations still work.
2. Existing users can add, change, and clear both fields; reopening and refreshing show persisted values. Historical users start empty/null without invented defaults.
3. Preferred language is independent. Known-language reordering is a no-op; invalid/duplicate language values and mixed patches are rejected with no writes.
4. Memory and transactional Mongo behavior agree. Stale versions cannot overwrite changes, concurrent saves resolve through CAS, and language-only writes preserve sessions and authority while real access changes still revoke as before.
5. Unauthorized actors cannot read/write private language metadata via these administration surfaces. Sole Super Admin and deleted-user restrictions remain intact; non-admin audit projections redact language values.
6. Invite and Manage interactions pass rendered tests for selections, clearing, save/reopen, validation, request failure, stale refresh, and unsaved edits. Existing Location and role/status workflows remain usable.
7. Desktop and mobile browser checks demonstrate usable dropdowns, keyboard/focus behavior, no overflow, and no unexpected console/network errors using synthetic fixtures.
8. Focused backend/frontend regressions, replica-set tests for changed transactional paths, both typechecks and builds, and repository diff hygiene pass. Broaden security/invitation/password-reset checks according to the final diff. Report exact results and any unrelated existing failures; do not claim lint or unrun suites passed.

Implementation and verification are recorded in [the approved task plan](../plans/2026-11-25-super-admin-user-languages.md).
