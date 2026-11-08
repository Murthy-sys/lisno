# Local OCR editable-install repair task plan

Date: 2026-11-08
Status: Complete; approved Mode A execution verified

## Authority and source of truth

The user approved the [repair specification](../specs/2026-11-08-local-ocr-editable-install-repair-design.md)
on 2026-11-08, then approved this task plan and selected Mode A.

Environment repair and verification are authorized within the specification's
boundaries. Keep only one parent task below in progress at a time.

## Ownership and boundaries

- The primary agent owns the environment repair, baseline evidence, workflow
  documents, dependency comparison, and final integration/handoff.
- The only implementation target is the editable `lisno-ocr-worker` registration
  inside this checkout's `ocr-worker/.venv`. Pip may update its package metadata,
  generated console entry point, and source-path registration.
- Do not edit application source, launchers, tests, manifests, lockfiles, `.env`,
  model caches, database contents, or unrelated working-tree changes.
- Use the explicit `.venv/bin/python` from `ocr-worker` for every Python command.
- Mode B keeps all work inline. Mode A may delegate an independent read-only
  import/registration review while the primary agent runs the approved tests,
  after the installation and dependency comparison are complete. The reviewer
  owns no writes and must not start the worker, install packages, or run models.
  No parallel writers are needed for this single environment target.

## Dependency-ordered tasks

### 1. Capture the current environment baseline

Dependencies: approved specification, approved task plan, and execution choice.
Owner: primary agent. Acceptance criteria: AC1, AC2, AC4.

- Recheck `git status --short` and relevant diffs. The planning-stage status
  contains only the untracked specification, with this plan being added now.
- Reconfirm that the exact interpreter runs and its editable registration points
  to a missing source location; stop and reassess if the cause has changed.
- Capture installed distribution names/versions and the worker registration
  files in a private task-specific temporary directory. Do not dump environment
  variables, package-index credentials, or private URLs into output.
- Keep the baseline until comparison and review finish. Do not delete or recreate
  the virtual environment.

### 2. Re-register the existing local package

Dependency: task 1. Owner: primary agent. Acceptance criteria: AC1, AC2.

From `ocr-worker`, run:

```sh
.venv/bin/python -m pip install --no-deps -e .
```

- Retain normal build isolation. Build tooling may be fetched into pip's
  temporary build environment; runtime dependencies must remain unchanged.
- If sandbox/network restrictions prevent the operation, use the applicable
  tool approval mechanism for the same bounded repair when available. Inspect
  any failed attempt before retrying. Do not substitute a manual `.pth` patch,
  permanent `PYTHONPATH`, dependency upgrade, or environment rebuild.
- Compare installed distribution versions with the baseline before proceeding.
  Confirm no runtime distribution was added, removed, or changed.

### 3. Verify imports and existing worker behavior

Dependency: task 2. Owner: primary agent, with optional read-only Mode A review
as described above. Acceptance criteria: AC1, AC2, AC3, AC4.

- In a new process using the exact interpreter and with inherited `PYTHONPATH`
  removed, resolve and import `lisno_ocr` and `lisno_ocr.worker`. Assert that both
  originate beneath this checkout's `ocr-worker/src/lisno_ocr` directory.
  Do not manually add a source directory to Python's search path.
- Inspect the repaired editable registration for the current source target.
- Run focused tests first, then the default non-model suite only if they pass:

```sh
.venv/bin/python -m pytest -m "not model" tests/test_worker.py
.venv/bin/python -m pytest -m "not model"
```

- The focused and full test commands are sequential. A Mode A registration review
  can run alongside these checks because it does not modify the environment.
- Do not run `python -m lisno_ocr.worker` or `npm run dev` during verification:
  those commands could consume existing extraction jobs. Importing the module
  checks the reported failure without starting its polling loop.
- Record unexpected failures accurately. New dependency or application changes
  require reconciliation with the approved environment-only scope.

### 4. Reconcile and hand off

Dependency: task 3 and completion of any delegated review.
Owner: primary agent. Acceptance criteria: AC2, AC4, AC5.

- Inspect the final working-tree status and run `git diff --check`. Confirm no
  source, manifest, or lockfile changes; preserve any unrelated user work that
  appeared after the baseline.
- Record exact import, dependency-comparison, and test results in this plan.
- Remove task-created temporary evidence after recording the comparison result;
  report any remaining ignored test artifacts without deleting pre-existing
  caches or model data.
- Report whether the original import error is resolved and list unrun checks.
  Full combined startup and real model inference are intentionally unverified.
  Frontend/backend builds and lint are not applicable to this environment-only
  repair; no lint script exists.
- Provide the existing `cd backend` / `npm run dev` retry command. No commit,
  push, deployment, migration, seeding, or production mutation is authorized.

## Execution results

Task 1 passed. Initial implementation status contains only the two authorized,
untracked workflow documents; tracked files have no changes. The exact Python
3.11.15 interpreter reproduces the missing import and stale editable target.
A private temporary baseline records all 72 installed distributions and the
worker registration.

Task 2 passed. The first pip attempt failed during isolated build-tool download
because sandbox DNS access was unavailable; registration and all distribution
versions remained unchanged. The same bounded installation succeeded with
approved network access. Pip cache and version checking were disabled, and no
runtime dependencies were installed. All 72 installed distribution names and
versions exactly match the baseline after repair.

Task 3 passed. A fresh exact-interpreter process with `PYTHONPATH`
removed resolves both modules from this checkout and imports the worker
successfully. The editable registration references the current source directory.

The independent read-only `integrity_reviewer` also confirmed both imports, the
current editable source target, the generated console entry point's interpreter
and `lisno_ocr.worker.main` target, and all 72 unchanged distribution versions.
No findings were raised.

Commands run from `ocr-worker`:

```sh
env -u PYTHONPATH PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m "not model" tests/test_worker.py
env -u PYTHONPATH PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m "not model"
env -u PYTHONPATH PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m "not model" --basetemp=/private/tmp/lisno-ocr-repair-0y1ylbyh/pytest
```

- Focused worker tests: **35 passed**.
- Initial default suite: **369 passed, 19 failed, 1 deselected**. The 19 failures
  were `PermissionError` exceptions binding the transport tests' synthetic
  loopback HTTP servers inside the sandbox.
- Full suite rerun with approved loopback socket access: **388 passed,
  1 deselected** in 38.66 seconds. The deselected test requires model inference.
- Both test lanes emitted five SWIG/PyMuPDF deprecation warnings; no test failed
  after the socket restriction was removed.
- Bytecode writing and pytest's cache provider were disabled for these checks.

Task 4 passed. Temporary evidence and the rerun's fixtures were created under
`/private/tmp/lisno-ocr-repair-0y1ylbyh`. The initial suite created
`/private/var/folders/8j/zd8v148d3qs4hdqtz2sncbjm0000gn/T/pytest-of-murthy/pytest-0`
and its `pytest-current` link. All of these task-created artifacts were removed;
existing repository caches and model data were preserved. Final
`git diff --check` passed, staged and unstaged tracked diffs are empty, and
`git status --short` lists only the two authorized workflow documents.

Not run: full combined application startup, the real worker polling loop, and
model inference. No existing jobs were consumed. Backend/frontend builds are
not applicable to a package-registration-only repair, and no lint check was
claimed. No dependency, application, manifest, lockfile, database, or `.env`
changes, migration, seeding, commit, push, deployment, or customer communication
were performed.
