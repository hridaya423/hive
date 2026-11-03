#!/bin/sh
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DATA=${HIVE_CONTROL_PLANE_DIR:-"$HOME/Library/Application Support/Hive Control Plane"}
LOGS="$HOME/Library/Logs/Hive Control Plane"
AGENTS="$HOME/Library/LaunchAgents"
LABEL_PREFIX=dev.hridaya.hive.control-plane
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"
cd "$ROOT"

setting() {
  bun -e "console.log(require('./fork.config.json').controlPlane.$1)"
}

if [ ! -f "$DATA/owner.env" ] && { [ -z "${HIVE_OWNER_EMAIL:-}" ] || [ -z "${HIVE_OWNER_TAILNET_LOGIN:-}" ]; }; then
  echo "Set HIVE_OWNER_EMAIL and HIVE_OWNER_TAILNET_LOGIN for the first install." >&2
  exit 2
fi

WORKER_PORT=$(setting workerPort)
SIGNAL_PORT=$(setting signalPort)
API_PORT=$(bun -e "console.log(new URL(require('./fork.config.json').controlPlane.accountApiUrl).port)")
SIGNAL_PUBLIC_PORT=$(bun -e "console.log(new URL(require('./fork.config.json').controlPlane.signalUrl).port)")

if tailscale serve status 2>&1 | grep -q "Funnel on"; then
  echo "Tailscale Funnel is on. Turn it off first: it would put the account service on the public internet." >&2
  exit 1
fi

umask 077
mkdir -p "$DATA" "$LOGS" "$AGENTS"
if [ ! -f "$DATA/owner.env" ]; then
  printf "OWNER_EMAIL='%s'\nOWNER_TAILNET_LOGIN='%s'\n" "$HIVE_OWNER_EMAIL" "$HIVE_OWNER_TAILNET_LOGIN" > "$DATA/owner.env"
fi
if [ ! -f "$DATA/secrets.env" ]; then
  bun ops/mini/make-secrets.ts > "$DATA/secrets.env"
fi

STATE="$ROOT/apps/auth-api/.wrangler/state"
mkdir -p "$ROOT/apps/auth-api/.wrangler" "$DATA/wrangler-state"
if [ ! -L "$STATE" ]; then
  if [ -d "$STATE" ]; then
    cp -R "$STATE/." "$DATA/wrangler-state/"
    rm -rf "$STATE"
  fi
  ln -s "$DATA/wrangler-state" "$STATE"
fi
bun run api:migrate:local > "$LOGS/migrate.log" 2>&1

DOMAIN="gui/$(id -u)"
for name in worker signal tick; do
  plist="$AGENTS/$LABEL_PREFIX.$name.plist"
  sed -e "s|__ROOT__|$ROOT|g" -e "s|__LOGS__|$LOGS|g" "ops/mini/$LABEL_PREFIX.$name.plist" > "$plist"
  launchctl bootout "$DOMAIN/$LABEL_PREFIX.$name" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$plist"
done

tailscale serve --bg --https="$API_PORT" "http://127.0.0.1:$WORKER_PORT" > /dev/null
tailscale serve --bg --https="$SIGNAL_PUBLIC_PORT" "http://127.0.0.1:$SIGNAL_PORT" > /dev/null

API_URL=$(setting accountApiUrl)
SIGNAL_HEALTH="${API_URL%:*}:$SIGNAL_PUBLIC_PORT"
tries=0
until curl -fsS -o /dev/null "$API_URL/health/live" && curl -fsS -o /dev/null "$SIGNAL_HEALTH/health/ready"; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "The control plane did not answer after 2 minutes. See $LOGS." >&2
    exit 1
  fi
  sleep 2
done
echo "The control plane answers at $API_URL."
