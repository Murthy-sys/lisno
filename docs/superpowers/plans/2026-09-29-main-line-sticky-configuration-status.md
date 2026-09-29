# Sticky Main Line Save action: revised task plan

Status: Revised task plan approved and implemented locally. Based on the approved [revised specification](../specs/2026-09-29-main-line-sticky-configuration-status-design.md).

## Dependency-ordered tasks

1. **Preserve current work.** Record the dirty-path set and targeted diffs. Keep the unrelated Expo log and PDF untouched. Ownership: primary agent. Acceptance: only the Main Line web slice and these working documents change.
2. **Return progress to normal flow.** Remove the full-strip sticky rule, strip-height observer, Quality full-bar sticky offset, and related history-rail offset added by the earlier implementation. Retain the existing visual layout and progress/save semantics. Ownership: Main Line status/CSS slice. Acceptance: progress and status text scroll away, spec criterion 1.
3. **Create one active pinned Save action.** Use the active inline Save element as a scroll boundary. Render a compact action beneath the shell topbar only after the inline action passes it; suppress the inline action from keyboard access while the pinned one is active. Reuse the active tab's handler and disabled/busy state, update on tab switch, and clean up observers/listeners. Ownership: Main Line workspace/status slice, after task 2. Acceptance: spec criteria 1, 2, and 4.
4. **Connect Quality to the same handoff.** Expose only the checklist command state needed by the parent, keep Quality's existing save validation and `save()` handle authoritative, and let its command bar scroll normally. Ownership: Quality panel/command bar integration; can proceed alongside task 3 only after the shared command shape is agreed, with no overlapping file edits. Acceptance: spec criterion 3.
5. **Integrate and verify.** Test the inline/pinned transition, state and tab changes, read-only/permission behavior, and keyboard reachability. Run focused frontend tests, typecheck, build, and `git diff --check`. Use the synthetic full-shell fixture to inspect desktop and narrow scrolling, text zoom, overflow, and modal layering. Ownership: primary integration/verification after writers finish. Acceptance: all five spec criteria; report that the synthetic fixture does not verify persistence.

## Parallelism and boundaries

Mode A remains the user's selected execution mode. The primary agent owns the shared command contract, page wiring, and integration. A bounded Quality panel edit can run in parallel with status/CSS once that contract is settled. No backend, shared API, native mobile, dependency, or lockfile change is planned.

## Completion evidence

Report exact focused checks and rendered positions, any unrun checks, the final dirty-path set, and remaining limitations. Do not commit or deploy; remove only generated QA artifacts.
