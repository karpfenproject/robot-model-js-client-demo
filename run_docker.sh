#!/usr/bin/env bash
# run_docker.sh – Convenience forwarder (repo root)
#
# Delegates to karpfen-runtime/run_docker.sh.
# All arguments are forwarded, including the optional HOST_LOG_DIR.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/karpfen-runtime/run_docker.sh" "$@"
