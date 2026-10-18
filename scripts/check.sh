#!/usr/bin/env bash
# Runs every part's checks: Go vet + tests, then the frontend's typecheck, lint and tests.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd desktop && go vet ./... && go test ./...)
npm --prefix desktop/frontend run check
