# Description layout and client visibility

User-directed implementation under the supplied autonomous operating instructions. The user explicitly confirmed that Description starts empty in every mode.

Current behavior: Configuration generates a paragraph and places it inside the bordered settings surface. Estimator tier details combine that paragraph with specifications and brands. Configuration Client view shares that combined disclosure; the project client quotation has no description metadata.

Required behavior:
- Present Description above and outside the internal settings border, with readable multiline text, accessible editing, and an explicit empty state.
- Missing descriptions start empty in default, Signature, Premium and Functional scopes. Preserve saved descriptions. An explicit empty string clears text and suppresses inherited common wording; absent tier wording may still use an explicitly saved common description from the same verified revision, preserving existing fallback behavior.
- Preserve synchronization of inclusions/exclusions only for nonempty saved text. Empty text must never acquire generated clauses.
- Show only description in the client detail area and Configuration Client view. Keep specifications in a separate disclosure for explicitly authorized internal estimator users. Existing pricing, quantity and tier selection stay functional.
- Add only nullable final description to the existing project-scoped tier-choice DTO. Do not expose specifications, brands, mode configuration, notes or margins through this addition. Retain all current backend authorization and source/revision checks.
- Preserve published snapshots and saved estimates. No data migration or production change.

Acceptance: empty and clearing persistence, mode switching, saved text preservation, client/internal boundary, current-source refresh, keyboard editing/disclosure, long multiline text and narrow layouts. Verify focused backend/frontend suites, compilation/builds and rendered browser checks. No dependencies.
