#!/usr/bin/env bash
# Builds and (re)starts the relay on the VPS with Docker Compose, in RELAY_DIR
# (e.g. ~/agentdeck-relay), and installs its Caddy site. Dockhand shows it as a stack.
# Server details live in relay/.env.prod.local (git-ignored; see relay/.env.example).
#   scripts/deploy-relay.sh            DRY_RUN=1 scripts/deploy-relay.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/load-env.sh

load_env relay/.env.prod.local
: "${DEPLOY_HOST:?DEPLOY_HOST is not set in relay/.env.prod.local}"
: "${DEPLOY_PORT:?DEPLOY_PORT is not set in relay/.env.prod.local}"
: "${RELAY_DIR:?RELAY_DIR is not set in relay/.env.prod.local}"
dry=()
[ -n "${DRY_RUN:-}" ] && dry=(--dry-run)

echo "› Checks"
(cd relay && go vet ./... && go test -race ./...)

echo "› Upload"
rsync -avz ${dry[@]+"${dry[@]}"} -e "ssh -p $DEPLOY_PORT" \
  --include Dockerfile --include compose.yaml --include go.mod --include go.sum \
  --exclude '*_test.go' --exclude deploy --include '*/' --include '*.go' --exclude '*' \
  relay/ "$DEPLOY_HOST:$RELAY_DIR/"
rsync -avz ${dry[@]+"${dry[@]}"} -e "ssh -p $DEPLOY_PORT" relay/deploy/agentdeck.caddy "$DEPLOY_HOST:/etc/caddy/sites/agentdeck.caddy"
if [ -n "${DRY_RUN:-}" ]; then
  echo "Dry run: nothing started."
  exit 0
fi

echo "› Build, restart and reload Caddy"
ssh -p "$DEPLOY_PORT" "$DEPLOY_HOST" "cd $RELAY_DIR && docker compose up -d --build && docker compose ps &&
  caddy validate --config /etc/caddy/Caddyfile && caddy reload --config /etc/caddy/Caddyfile"
