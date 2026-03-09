#!/usr/bin/env bash
# run_local.sh – Convenience forwarder (repo root)
#
# Delegates to karpfen-runtime/run_local.sh.
# All arguments are forwarded.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/karpfen-runtime/run_local.sh" "$@"
