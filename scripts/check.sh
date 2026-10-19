#!/usr/bin/env bash
# Runs every part's checks: Go vet + tests (relay, desktop), then the desktop frontend's and the
# mobile app's typecheck, lint and tests.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd relay && go vet ./... && go test ./...)
(cd desktop && go vet ./... && go test ./...)
npm --prefix desktop/frontend run check
npm --prefix mobile run check
