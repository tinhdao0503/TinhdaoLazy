#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${AGENT_HARNESS_REPOSITORY:-github:tinhdao0503/TinhdaoLazy}"
PROJECT_DIR="${AGENT_HARNESS_PROJECT:-$PWD}"
PORT="${PORT:-4310}"
HARNESS_HOME="${AGENT_HARNESS_HOME:-$HOME/.agent-harness-local}"
LOG_FILE="$HARNESS_HOME/server.log"

for command in node npm curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

if [[ ! -d "$PROJECT_DIR" ]]; then
  printf 'Project directory not found: %s\n' "$PROJECT_DIR" >&2
  exit 1
fi

printf '[1/4] Installing Agent Harness CLI...\n'
npm install --global "$REPOSITORY"

printf '[2/4] Installing harness into %s...\n' "$PROJECT_DIR"
agent-harness add "$PROJECT_DIR"

printf '[3/4] Starting local control plane...\n'
mkdir -p "$HARNESS_HOME"
if curl --silent --fail "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
  printf 'Dashboard already running.\n'
else
  AGENT_HARNESS_HOME="$HARNESS_HOME" PORT="$PORT" nohup agent-harness serve >"$LOG_FILE" 2>&1 &
  server_pid=$!
  disown "$server_pid" 2>/dev/null || true
  for _ in {1..20}; do
    if curl --silent --fail "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
fi

if ! curl --silent --fail "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
  printf 'Dashboard failed to start. Log: %s\n' "$LOG_FILE" >&2
  exit 1
fi

printf '[4/4] Ready.\n'
printf '\nProject:   %s\n' "$PROJECT_DIR"
printf 'Dashboard: http://127.0.0.1:%s\n' "$PORT"
printf 'Log:       %s\n' "$LOG_FILE"
