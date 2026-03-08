#!/usr/bin/env bash
# run.sh – Start the Karpfen Robot Demo
#
# This script configures and starts the karpfen-runtime execution server.
# After the server is running, open webui.html in your browser to interact
# with the demo.
#
# Prerequisites:
#   - Java 21+ on PATH  (java --version)
#   - Python 3.12+      (python / python3 / py)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$SCRIPT_DIR/karpfen-runtime"

echo "=== Karpfen Robot Demo ==="
echo ""

# ── Write application.conf ---------------------------------------------------
echo "[1/3] Writing karpfen-runtime/application.conf ..."
cat > "$RUNTIME_DIR/application.conf" << 'EOF'
server {
  host = "127.0.0.1"
  port = 8080
}

websocket {
  queueTimeoutMs = 1000
  enabled        = true
}

logging {
  level         = "INFO"
  consoleOutput = true
}
EOF

echo "      → host: 127.0.0.1, port: 8080"
echo ""

# ── Build (skip tests for speed) --------------------------------------------
echo "[2/3] Building karpfen-runtime (this may take a moment on first run) ..."
cd "$RUNTIME_DIR"
./gradlew build -x test --quiet
echo "      → Build successful"
echo ""

# ── Start server -------------------------------------------------------------
echo "[3/3] Starting karpfen-runtime server ..."
echo "      → HTTP  API : http://127.0.0.1:8080"
echo "      → WebSocket  : ws://127.0.0.1:8080/ws"
echo ""
echo "Now open webui.html in your browser and follow the setup wizard."
echo "Press Ctrl+C to stop the server."
echo ""

./gradlew run
