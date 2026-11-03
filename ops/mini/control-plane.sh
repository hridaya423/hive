#!/bin/sh
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DATA=${HIVE_CONTROL_PLANE_DIR:-"$HOME/Library/Application Support/Hive Control Plane"}
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"
cd "$ROOT"

config() {
  bun -e "const c = require('./fork.config.json').controlPlane; console.log($1)"
}

load() {
  set -a
  . "$DATA/$1"
  set +a
}

case "${1:-}" in
worker)
  load secrets.env
  load owner.env
  OPENBOT_API_PORT=$(config c.workerPort)
  SIGNAL_PORT=$(config c.signalPort)
  export OPENBOT_API_PORT
  export OPENBOT_API_HOST=127.0.0.1
  __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=$(config "new URL(c.accountApiUrl).hostname")
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS
  REMOTE_SIGNAL_URL=$(config c.signalUrl)
  export REMOTE_SIGNAL_URL
  export REMOTE_SIGNAL_HOMES=
  export REMOTE_AUTH_WEBHOOK_URL="http://127.0.0.1:$SIGNAL_PORT/internal/auth-events"
  export REMOTE_AUTH_WEBHOOK_URLS=
  export AUTH_EXPOSE_DEVELOPMENT_CODE=false
  export EMAIL_SMTP_HOST= EMAIL_SMTP_PORT= EMAIL_SMTP_USERNAME= EMAIL_FROM= EMAIL_LICENSE_FROM= EMAIL_SMTP_PASSWORD=
  mkdir -p "$DATA/wrangler-state"
  exec bun scripts/run-development.ts api
  ;;
signal)
  load secrets.env
  REMOTE_SIGNAL_PORT=$(config c.signalPort)
  REMOTE_HEALTH_PORT=$(config c.signalHealthPort)
  REMOTE_CONTROL_PLANE_URL="http://127.0.0.1:$(config c.workerPort)"
  export REMOTE_SIGNAL_PORT REMOTE_HEALTH_PORT REMOTE_CONTROL_PLANE_URL
  export REMOTE_SIGNAL_HOST=127.0.0.1
  export REMOTE_TLS_DISABLED=true
  export REMOTE_TRUST_PROXY=true
  export TURN_HOST=127.0.0.1
  exec bun remote/api/src/index.ts
  ;;
tick)
  exec curl -fsS -m 55 -o /dev/null "http://127.0.0.1:$(config c.workerPort)/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"
  ;;
config)
  config "$2"
  ;;
*)
  echo "Usage: control-plane.sh worker|signal|tick|config <expression on c>" >&2
  exit 2
  ;;
esac
