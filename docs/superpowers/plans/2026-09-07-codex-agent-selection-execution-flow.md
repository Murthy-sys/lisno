# Codex Agent Selection and Default Execution Flow Task Plan

## Status

Proposed on 2026-09-07 from the approved [Codex Agent Selection and Default Execution Flow Specification](../specs/2026-09-07-codex-agent-selection-execution-flow-design.md). Implementation must not begin until this plan is approved and the user selects execution mode A or B.

## Objective

Remove Lisno's project-level model and reasoning pins so supported live Codex model, intelligence/reasoning, and Standard/Fast choices remain effective. Persist the approved specification → task plan → execution choice → implementation workflow in `AGENTS.md` without weakening existing Lisno safety and verification rules.

## Change boundaries

### Authorized implementation targets

- `.codex/config.toml`
- `AGENTS.md`
- The approved specification and this task plan for status-only updates if required by repository convention

### Read-only verification targets

- `.codex/agents/*.toml`
- User-level `~/.codex/config.toml`, limited to confirming inherited model/effort/service-tier behavior without editing or exposing sensitive values
- Codex diagnostic and feature output

### Excluded targets

- Backend, frontend, OCR worker, dependencies, lockfiles, application data, production systems, global Codex configuration, custom role behavior, and MCP settings
- Git staging, commits, pushes, deployment, seeds, migrations, and external communication

## Acceptance-criteria traceability

| Acceptance criteria | Implemented by | Verified by |
| --- | --- | --- |
| AC1–AC2: no project model, effort, service-tier, or subagent-default pins | Task 2 | Tasks 4–5 |
| AC3: custom roles do not pin model or effort | No write expected; Task 1 audit | Tasks 1 and 5 |
| AC4–AC5: parent/live selection and explicit supported overrides resolve | Task 2 | Task 4 |
| AC6: native multi-agent and custom roles remain available | Task 2 preserves agent configuration | Tasks 4–5 |
| AC7–AC9: durable four-gate workflow with correct A/B behavior and no small-work bypass | Task 3 | Tasks 3 and 5 |
| AC10: repository hygiene | All tasks | Task 5 |

## Dependency-ordered tasks

### Task 1 — Preflight and target audit

**Owner:** primary agent in either execution mode.

**Dependencies:** approved specification, approved task plan, and selected execution mode.

**Actions:**

1. Capture `git status --short` immediately before writers start.
2. Inspect the relevant existing diff for `.codex/config.toml` and `AGENTS.md`; stop and reconcile if either contains new user changes.
3. Confirm every `.codex/agents/*.toml` file remains free of `model` and `model_reasoning_effort`.
4. Confirm the installed Codex client recognizes `fast_mode`, the `[agents]` settings being preserved, and the project config schema.
5. Record the former effective project model/effort as the comparison baseline without modifying user-level configuration.

**Completion evidence:** initial dirty-path set, per-target diff state, custom-role pin audit, and Codex capability baseline are recorded.

### Task 2 — Remove project model and speed pins

**Owner in Mode A:** one implementation worker with exclusive ownership of `.codex/config.toml`.

**Owner in Mode B:** primary agent.

**Dependencies:** Task 1.

**Actions:**

1. Remove the top-level `model` and `model_reasoning_effort` entries and their obsolete quality-floor comment.
2. Do not add `service_tier`, `agents.default_subagent_model`, or `agents.default_subagent_reasoning_effort`.
3. Preserve the schema declaration, multi-agent enablement, three-child concurrency cap, interruption behavior, and complete `21st` MCP configuration byte-for-byte except where formatting around removed lines necessarily changes.
4. Do not edit custom agent files because their current inheritance behavior already satisfies the approved design.

**Acceptance criteria:** AC1–AC6.

**Focused verification:** inspect the resulting TOML diff and parse it with the installed Codex client in strict-config mode.

### Task 3 — Persist and reconcile the default execution workflow

**Owner in Mode A:** a separate implementation worker with exclusive ownership of `AGENTS.md`.

**Owner in Mode B:** primary agent.

**Dependencies:** Task 1. This task may run in parallel with Task 2 only in approved Mode A.

**Actions:**

1. Add an authoritative default spec-driven workflow near the start of `AGENTS.md`.
2. Define the four ordered gates: specification, task plan, exact A/B execution choice, and implementation.
3. State that direct questions and read-only requests are exempt and that the user may explicitly skip, combine, or resume a stage.
4. Define approval semantics, separate durable artifact paths, and the rule for reopening only materially affected gates.
5. Define Mode A as native parallel subagents for independent, non-overlapping work with explicit ownership; define Mode B as inline implementation without implementation subagents.
6. Reconcile the current small-work language: small implementation changes may use compact artifacts but do not bypass gates without explicit user instruction.
7. Reconcile proactive-delegation language so it applies during approved Mode A execution and does not silently spawn subagents before the execution-choice gate.
8. Preserve the current substantial/high-risk criteria, architecture boundaries, product invariants, safety restrictions, custom role guidance, integrity review, verification matrix, and final handoff requirements.
9. Include the exact required gate prompts so future runs ask each approval question once and stop at the correct boundary.

**Acceptance criteria:** AC7–AC9.

**Focused verification:** review the final `AGENTS.md` as a single instruction system and search for contradictory immediate-implementation or unconditional-delegation language.

### Task 4 — Configuration behavior verification

**Owner in Mode A:** primary agent after Tasks 2 and 3 complete; a verification agent may run the commands read-only and return evidence.

**Owner in Mode B:** primary agent.

**Dependencies:** Tasks 2 and 3.

**Actions:**

1. Validate the edited project TOML using strict configuration parsing.
2. Run non-mutating Codex diagnostics from the Lisno directory and confirm the former `gpt-5.6-sol` project pin is no longer the effective source.
3. Confirm at least two available explicit model/reasoning combinations are accepted by configuration loading. Do not send model prompts or consume task credits solely for this check if configuration diagnostics can validate them.
4. Confirm `fast_mode` remains enabled and no project `service_tier` value blocks live Standard/Fast selection.
5. Confirm multi-agent support, the three-child concurrency setting, and every existing custom role remain present.
6. If a model or reasoning level is unavailable because of account/model compatibility, report that as an external availability constraint rather than changing repository configuration to bypass it.

**Acceptance criteria:** AC1–AC6.

**Completion evidence:** exact diagnostic commands, exit results, resolved effective model source, override checks, Fast-mode status, and agent inventory.

### Task 5 — Integrated instruction and repository verification

**Owner in Mode A:** `verification_runner` after all writers have finished, with no source edits; primary agent reconciles its report.

**Owner in Mode B:** primary agent performs the same checks inline.

**Dependencies:** Task 4 and completion of every writer.

**Actions:**

1. Inspect the complete diff for `.codex/config.toml`, `AGENTS.md`, the specification, and the task plan.
2. Trace every approved acceptance criterion to final file evidence and verification output.
3. Search all project Codex configuration for unexpected `model`, `model_reasoning_effort`, `service_tier`, `default_subagent_model`, and `default_subagent_reasoning_effort` pins.
4. Verify that `AGENTS.md` contains all four gates, exact approval prompts, exemptions, skip/combine/resume behavior, and Mode A/Mode B ownership rules.
5. Verify that no retained small-work or delegation instruction contradicts the new default flow.
6. Run `git diff --check` and `git status --short`.
7. Report unrun checks, account-dependent Fast/model availability, and the requirement to start a new thread or reload the project for consistent configuration pickup.

**Acceptance criteria:** AC1–AC10.

## Parallel execution map

After Task 1, approved Mode A may run these two non-overlapping writers concurrently:

- **Configuration worker:** Task 2; owns only `.codex/config.toml`.
- **Instruction worker:** Task 3; owns only `AGENTS.md`.

They must not edit the specification, task plan, custom agent files, or each other's target. Task 4 begins only after both return. Task 5 runs only after all writers finish and the primary agent has reconciled their changes.

Mode B performs Tasks 2 and 3 sequentially in the primary thread, followed by Tasks 4 and 5 without spawning implementation subagents.

## Verification commands

Exact arguments may be adjusted to the installed Codex version while preserving the stated checks.

```sh
git status --short
git diff -- .codex/config.toml AGENTS.md
rg -n -S '^\s*(model|model_reasoning_effort|service_tier|default_subagent_model|default_subagent_reasoning_effort)\s*=' .codex
codex --strict-config features list
codex doctor --json
codex doctor --json -c 'model="gpt-6-astra"' -c 'model_reasoning_effort="high"'
codex doctor --json -c 'model="gpt-5.6-sol"' -c 'model_reasoning_effort="low"'
git diff --check
git status --short
```

`codex doctor` may report unrelated environment or network warnings. Verification will evaluate configuration-loading evidence separately from unrelated diagnostic categories and will not claim the whole diagnostic suite passed when it did not.

## Rollback

- Before editing, preserve the exact pre-change contents in the Git diff and initial-state evidence.
- If configuration loading regresses, restore only the two removed project keys and comment through a targeted patch after user authorization; do not reset unrelated files.
- If `AGENTS.md` produces contradictory behavior, amend only the newly added/reconciled workflow text against the approved specification and reopen the affected approval gate when the behavior change is material.
- No data or production rollback is required.

## Completion report

The final handoff must report:

- Whether live model, reasoning/intelligence, and Standard/Fast selection are no longer project-pinned.
- Whether built-in and project custom agents remain available and inherit or accept explicit model/effort choices.
- The exact durable default workflow added to `AGENTS.md`.
- Files changed and principal decisions.
- Exact verification commands and outcomes, including any unrelated `codex doctor` warnings.
- Checks not run, external account/model limitations, and the new-thread/reload requirement.
- Confirmation that no global configuration, application code, dependencies, Git history, external service, or production state was changed.
