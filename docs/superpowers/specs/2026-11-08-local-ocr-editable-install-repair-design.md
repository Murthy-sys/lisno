# Local OCR editable-install repair

Date: 2026-11-08
Status: Approved by the user on 2026-11-08
Classification: Small, local development environment repair

## Goal

Resolve the `ModuleNotFoundError: No module named 'lisno_ocr'` that stops
`cd backend && npm run dev` after the backend becomes ready.

## Current behavior and evidence

- Initial `git status --short` was clean.
- `backend/package.json` launches `scripts/local-chat.mjs --with-ocr`.
  `scripts/local-chat-with-ocr.mts` reuses the process specifications from
  `backend/src/development/processes.ts`.
- The OCR specification uses the repository's `ocr-worker/.venv/bin/python`,
  working directory `ocr-worker`, and arguments `-m lisno_ocr.worker`.
  The active terminal virtual environment does not select this interpreter.
- The selected interpreter runs Python 3.11.15. The worker distribution metadata
  reports version 0.1.0, but `importlib.util.find_spec('lisno_ocr')` returns `None`.
- Its `_editable_impl_lisno_ocr_worker.pth` references a previous checkout's
  absolute `ocr-worker/src` directory, which no longer exists. The current
  checkout's source directory exists but is absent from this interpreter's
  search path. This stale editable registration explains the reported failure.
- Adding the current source directory to `sys.path` in a diagnostic process
  allows `import lisno_ocr.worker` to succeed. This imports the module without
  starting its polling loop or claiming work.
- NumPy, Pillow, pillow-heif, PyMuPDF, pytest, PaddleOCR, and PaddlePaddle are
  discoverable in the existing environment. Model inference was not tested.
- `ocr-worker/README.md` already documents installing this project in editable
  mode with dependency installation separated from package registration.

## Scope and proposed behavior

Repair only the current checkout's local editable installation using its exact
virtual-environment interpreter. From `ocr-worker`, the intended repair is:

```sh
.venv/bin/python -m pip install --no-deps -e .
```

This refreshes package metadata, generated entry points, and the editable source
registration. It must not upgrade or reinstall the existing runtime/model
dependencies. Pip may need isolated build tooling because Hatchling is not
installed in the runtime environment; ordinary build isolation is preferred.

After repair, Python must resolve `lisno_ocr` and `lisno_ocr.worker` directly
from the current checkout without temporary `sys.path` or `PYTHONPATH` changes.

## Non-goals

- No launcher, application, API, dependency manifest, or lockfile changes.
- No permanent `PYTHONPATH` workaround or manual `.pth` patch.
- No deletion or wholesale recreation of the existing virtual environment.
- No model upgrade, model download, or inference benchmark.
- No database writes, queue claims, seeding, migrations, or external delivery.
- No commits, pushes, or deployment.
- No general guarantee that a relocated virtual environment is portable; any
  additional demonstrated breakage must be reported separately.

## Requirements and constraints

1. Use `ocr-worker/.venv/bin/python` explicitly for package installation and
   verification so the shell's active environment cannot change the target.
2. Preserve installed runtime dependency versions and the existing model cache.
3. Preserve the leased-job protocol and existing supervisor shutdown behavior.
4. Run verification without starting the production worker loop or consuming
   existing local extraction jobs.
5. Preserve unrelated work. At implementation time, recheck repository status
   and any changes since this specification was written.
6. Follow the separate task-plan approval and execution-choice gates before
   modifying the virtual environment.

## Assumptions and open decisions

The user intends to restore local combined startup in this checkout. The
evidence supports an environment-only repair; no product or architecture choice
is open. Missing or incompatible dependencies discovered during verification
will be reported rather than silently expanding into a dependency upgrade.

## Risks and recovery

- Editable installation requires build tooling. Restricted network access or
  unavailable build requirements may prevent pip from completing; retain the
  existing environment and report the actual blocker.
- Capture the current worker registration and dependency versions before the
  repair. If installation fails, inspect its state and retry registration from
  the current source; do not delete the environment or restore the known-invalid
  old source target as a purported fix.
- Other files in a moved virtual environment may retain stale paths. Verification
  uses the explicit interpreter and checks the worker's actual import origin.
- An import check establishes that this startup error is fixed. It does not
  establish model inference or full application readiness.

## Acceptance criteria and verification

- **AC1: Correct registration.** Without adding source paths, the exact worker
  interpreter resolves the package and worker module beneath this checkout's
  `ocr-worker/src/lisno_ocr` directory. Importing the worker succeeds.
- **AC2: Dependency preservation.** Before/after installed runtime dependency
  versions match. No manifest or lockfile changes occur.
- **AC3: Worker regressions.** Run the existing focused worker tests first,
  followed by the default non-model suite when the focused checks pass:
  `.venv/bin/python -m pytest -m "not model" tests/test_worker.py` and
  `.venv/bin/python -m pytest -m "not model"`, from `ocr-worker`.
- **AC4: Repository and data hygiene.** `git diff --check` passes; final
  `git status --short` contains only authorized workflow documents. Verification
  does not start the worker polling loop or access existing extraction jobs.
- **AC5: Honest handoff.** Report the import and test results, dependency-version
  comparison, temporary artifacts, and any unverified model/full-startup
  behavior. The user can then retry the existing `npm run dev` command.

## Data, API, and UX impacts

There are no data/schema, permission, HTTP contract, or frontend changes. The
intended developer-visible effect is that OCR no longer terminates combined
startup because its package points at a missing source directory.
