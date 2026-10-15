#!/usr/bin/env bash
set -euo pipefail

# Run from the monorepo root; neither OCR nor the model service is installed.
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
python_bin="${ASSISTANT_BUILD_PYTHON:-python3}"
rules_venv="$repo_root/assistant-service/dist/rules-venv"

if ! "$python_bin" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1; then
  echo 'Render build requires Python 3.11 or newer for the rules assistant.' >&2
  exit 1
fi

cd -- "$repo_root/backend"
npm ci --include=dev
npm run build

"$python_bin" -m venv "$rules_venv"
"$rules_venv/bin/python" -m pip install --disable-pip-version-check --no-cache-dir --only-binary=:all: -r "$repo_root/assistant-service/rules-requirements.lock"
PYTHONPATH="$repo_root/assistant-service/src" "$rules_venv/bin/python" -c 'from lisno_assistant.rules_main import main; from lisno_assistant.rules_app import create_app'
echo 'Backend and model-free Python rules runtime built.'
