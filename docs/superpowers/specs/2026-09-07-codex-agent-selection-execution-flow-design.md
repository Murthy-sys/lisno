# Codex Agent Selection and Default Execution Flow Specification

## Status

Proposed on 2026-09-07. This specification requires approval before a task plan or implementation begins.

## Goal

Let a user choose any Codex model, supported reasoning/intelligence level, and supported Fast/Standard service tier for Lisno without a repository override silently replacing that choice. Make the repository's durable default implementation workflow: specification approval, task-plan approval, explicit choice between parallel subagents and inline execution, then implementation and verification.

## Current behavior and evidence

- `.codex/config.toml` currently pins `model = "gpt-5.6-sol"` and `model_reasoning_effort = "xhigh"` for this trusted repository.
- `codex doctor --json` run from the repository resolves the effective model to `gpt-5.6-sol` even though the user-level configuration currently selects another model. This demonstrates that the project override is active.
- The project does not set `service_tier`, `agents.default_subagent_model`, or `agents.default_subagent_reasoning_effort`.
- The custom role files in `.codex/agents/` do not set `model` or `model_reasoning_effort`; their role instructions and sandbox defaults are therefore separable from model and speed selection.
- `.codex/config.toml` already enables native multi-agent support and limits spawned child threads to three concurrent sessions, excluding the primary agent.
- `AGENTS.md` describes substantial-work planning and proactive multi-agent practices, but it does not contain the requested durable four-stage approval flow. It also says small work should be handled without planning ceremony, which conflicts with making the gated flow the default for every implementation request.
- The worktree was clean before this specification was created.

## Official Codex behavior used by this design

- Codex loads project `.codex/config.toml` above user configuration, while explicit CLI and runtime overrides have the highest precedence. See [OpenAI Docs: Config basics](https://learn.chatgpt.com/docs/config-file/config-basic).
- Codex can delegate when project `AGENTS.md` instructions request it. Native subagent workflows are available in the desktop app, CLI, and IDE extension. See [OpenAI Docs: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- A spawned agent resolves model and reasoning from an explicit spawn choice, then `[agents]` defaults, then the parent. A custom agent file can override those values only when it defines `model` or `model_reasoning_effort`.
- Fast mode is independent of reasoning effort and can be selected for supported models and eligible accounts. See [OpenAI Docs: Speed](https://learn.chatgpt.com/docs/agent-configuration/speed).

## Proposed behavior

### Model and speed selection

- Remove the project-level `model` and `model_reasoning_effort` keys from `.codex/config.toml`.
- Do not add a project-level `service_tier` default.
- Do not add `agents.default_subagent_model` or `agents.default_subagent_reasoning_effort`.
- Keep custom agent role files free of `model` and `model_reasoning_effort` so they inherit the parent selection unless the parent explicitly chooses a model or effort while spawning them.
- Preserve each custom role's instructions and sandbox mode; choosing a model or speed must not weaken role boundaries, permissions, or safety policy.
- Keep native Fast mode enabled and allow the user's live Standard/Fast selection to apply where the selected model and account support it.
- Treat unavailable models, unsupported reasoning levels, Fast-mode eligibility, credit limits, and organization policy as product/account constraints; repository configuration must not attempt to bypass them.

### Default implementation execution flow

Add a concise, authoritative section near the start of `AGENTS.md` with these gates:

1. **Specification:** for a user-requested change, build, fix, migration, redesign, or implementation task, create or update only a durable specification and request approval. Direct questions and read-only requests remain exempt.
2. **Task plan:** after specification approval, create or update only a separate dependency-ordered task plan, trace it to the approved acceptance criteria, and request approval.
3. **Execution choice:** after task-plan approval, ask the user to choose exactly one mode: **A — parallel sub-agents** or **B — inline implementation**.
4. **Implementation:** begin implementation only after that selection. Mode A uses native Codex subagents for independent, non-overlapping work; Mode B keeps implementation in the primary thread. Both modes integrate and verify the final result.

The workflow must also state:

- A user may explicitly skip, combine, or resume a stage.
- Approval advances only the immediately preceding gate.
- Material changes to an approved specification or task plan reopen only the affected approval gate.
- Specification and task plan remain separate durable files using the established `docs/superpowers/specs/` and `docs/superpowers/plans/` conventions.
- The primary agent owns product interpretation, shared contracts, integration, and final reporting.
- Parallel agents receive bounded ownership and must not edit overlapping paths.
- Agents must wait for all assigned work, reconcile results, and run integrated verification before reporting completion.
- Existing safety, authorization, finance, persistence, migration, and repository-hygiene rules continue to apply.

### Reconciliation with existing instructions

- Update the existing small-work guidance so it no longer bypasses the default approval gates. Small changes may use a compact specification and compact plan, but still follow the four stages unless the user explicitly skips or combines stages.
- Retain the current substantial/high-risk classification, planning detail, preferred custom roles, integrity review, and verification requirements.
- Retain proactive delegation guidance only inside approved Mode A execution. Before Mode A is selected, read-only investigation may be performed by the primary agent, but no subagents are spawned merely to advance a gated implementation request.
- Keep the current `[agents]` enablement, three-child concurrency cap, and interruption behavior unless later evidence shows they prevent an explicitly selected agent from running.

## Scope

- `.codex/config.toml`: remove project model and reasoning pins while preserving agent and MCP configuration.
- `AGENTS.md`: add the durable four-stage default workflow and reconcile contradictory small-work and delegation language.
- `.codex/agents/*.toml`: inspect and preserve model/effort inheritance; edit only if verification discovers a hidden pin.
- Documentation created through this workflow under `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Non-goals

- Do not change the user's global `~/.codex/config.toml`.
- Do not grant access to models, Ultra, Fast mode, or service tiers unavailable to the user's account, selected model, region, or organization.
- Do not remove custom Lisno roles or their sandbox boundaries.
- Do not remove the concurrency limit or enable unlimited subagents.
- Do not weaken approval, sandbox, filesystem, network, external-action, or production-mutation protections.
- Do not change application code, dependencies, lockfiles, backend/frontend/OCR behavior, or production state.
- Do not stage, commit, push, deploy, or publish these changes.

## Requirements

1. Opening Lisno must not replace a live user-selected model with a repository-pinned model.
2. Opening Lisno must not replace a supported live reasoning/intelligence selection with a repository-pinned effort.
3. Standard/Fast selection must remain controlled by the live Codex selection or user configuration, subject to model/account support.
4. Built-in and project custom agents must remain selectable.
5. Spawned agents must inherit the parent model and reasoning selection unless an explicit spawn choice is supplied.
6. Every implementation request must follow the four approval stages by default, with only explicit user instruction allowing stages to be skipped, combined, or resumed.
7. Mode A must use native Codex subagents only for independent, non-overlapping slices with explicit ownership.
8. Mode B must perform implementation inline without spawning subagents for implementation work.
9. Read-only questions, explanations, diagnoses, and status reports must not be forced through implementation gates.
10. Existing Lisno invariants and verification expectations must remain authoritative in both execution modes.

## Assumptions

- "Any agent" means any built-in or project custom agent and any model exposed to the user's current Codex account; it does not mean bypassing account or organization restrictions.
- "Any speed level" includes supported reasoning/intelligence levels and the independent Standard/Fast service-tier control.
- The requested workflow is project-default behavior for Lisno, not a mutation of global Codex defaults for unrelated repositories.
- New threads may be required after configuration changes for the selected model, reasoning level, and workflow instructions to reload consistently.

## Constraints and risks

- Reasoning levels differ by model; a level selected for one model may be unavailable for another.
- Fast mode consumes credits at a higher rate and may be unavailable for some accounts, models, or regions.
- Removing the repository quality floor increases user control but allows lower-capability or lower-reasoning selections; acceptance relies on the repository workflow and verification requirements rather than a forced model.
- Applying the full gated flow to tiny edits adds ceremony. Compact artifacts and explicit user skip/combine instructions mitigate this without silently bypassing the requested default.
- Parallel writers can conflict or observe transient shared-worktree state. Mode A therefore requires non-overlapping ownership and final integrated verification.
- `AGENTS.md` must avoid conflicting language that both requires gates and authorizes immediate small-change implementation.

## Data, API, UX, and operational impact

- **Data/API:** none.
- **Product UI:** no Lisno product UI changes. Codex model, reasoning, and Fast/Standard selectors should remain effective for this repository.
- **Persistence:** repository configuration and instruction documents only.
- **Security:** existing permission and sandbox behavior remains unchanged.
- **Operations:** no deployment, migration, seed, external communication, or production mutation.

## Acceptance criteria

1. `.codex/config.toml` contains no top-level `model`, `model_reasoning_effort`, or `service_tier` pin.
2. `.codex/config.toml` contains no `[agents]` default model or reasoning-effort pin.
3. No project custom-agent TOML file fixes a model or reasoning effort.
4. With Lisno as the working directory, Codex configuration resolves the user's current selection/default rather than the former `gpt-5.6-sol`/`xhigh` project pair.
5. A supported explicit model plus reasoning override is accepted from this repository without strict-config errors.
6. Native multi-agent support remains enabled, and all existing custom roles remain discoverable.
7. `AGENTS.md` contains the specification, task-plan, execution-choice, and implementation gates with explicit skip/combine/resume semantics.
8. `AGENTS.md` contains no remaining instruction that silently bypasses those gates for small implementation requests.
9. `AGENTS.md` limits parallel implementation to approved Mode A and preserves bounded ownership plus integrated verification.
10. `git diff --check` passes, and `git status --short` shows only the approved configuration/instruction/specification/plan changes plus any pre-existing user changes.

## Verification approach

- Validate TOML syntax with the installed Codex client in strict-config mode.
- Inspect effective configuration from the Lisno working directory and confirm the former project model pin is absent.
- Exercise at least two supported explicit model/reasoning combinations through non-mutating Codex configuration diagnostics where available.
- Confirm `fast_mode` remains enabled and no project `service_tier` pin exists.
- Enumerate custom agent files and verify that none defines `model` or `model_reasoning_effort`.
- Review `AGENTS.md` for the exact gate order, exemptions, execution modes, ownership rules, and contradictions.
- Run `git diff --check` and `git status --short`.

## Open decisions

None. The user's request establishes project-level selection freedom and the four-stage spec/multi-agent execution flow; account-level availability and safety controls remain outside repository authority.
