# Sourced by the deploy scripts. load_env FILE reads KEY=VALUE lines literally
# (values such as deploy keys contain "|", so the files are not sourced as
# shell) and exports them. Surrounding quotes are stripped.
load_env() {
  if [ ! -f "$1" ]; then
    echo "Missing $1. Copy the .env.example next to it and fill in the production values." >&2
    exit 1
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
    export "$key=$value"
  done < "$1"
}
