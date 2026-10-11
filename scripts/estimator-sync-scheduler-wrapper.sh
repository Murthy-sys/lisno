#!/bin/bash
set -euo pipefail

# Install only after explicit approval. Scheduled operation is always read-only.
repository="${LISNO_SYNC_REPOSITORY:-/Users/apple/Desktop/personal/lisno}"
entrypoint="$repository/scripts/sync-estimator-prod-to-demo.sh"
if [ ! -f "$entrypoint" ]; then
  printf '%s\n' '{"status":"failed","code":"SYNC_ENTRYPOINT_MISSING"}' >&2
  exit 1
fi
exec /bin/bash "$entrypoint" --dry-run
