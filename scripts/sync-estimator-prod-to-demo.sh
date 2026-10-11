#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

script_directory="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_directory="$script_directory/../backend"
if [ -z "${LISNO_SYNC_SOURCE_URI:-}" ]; then
  if ! LISNO_SYNC_SOURCE_URI="$(/usr/bin/security find-generic-password -a "$(id -un)" -s "lisno-prod-mongo-uri" -w 2>/dev/null)"; then
    printf '%s\n' '{"status":"failed","code":"SOURCE_CREDENTIAL_MISSING"}' >&2
    exit 1
  fi
fi
export LISNO_SYNC_SOURCE_URI
cd -- "$backend_directory"
exec node --import tsx src/operations/estimator-sync/cli.ts "$@"
