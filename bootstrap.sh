#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${AGENT_HARNESS_REPOSITORY:-github:tinhdao0503/TinhdaoLazy#main}"
PROJECT_DIR="${AGENT_HARNESS_PROJECT:-$PWD}"
NATIVE_PROJECT_DIR="$PROJECT_DIR"
PORT="${PORT:-4310}"
HARNESS_HOME="${AGENT_HARNESS_HOME:-$HOME/.agent-harness-local}"
LOG_FILE="$HARNESS_HOME/server.log"

if grep -qi microsoft /proc/version 2>/dev/null && command -v wslpath >/dev/null 2>&1; then
  NATIVE_PROJECT_DIR="$(wslpath -w "$PROJECT_DIR")"
fi

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
npm install --global --force "$REPOSITORY"

printf '[2/4] Installing harness into %s...\n' "$NATIVE_PROJECT_DIR"
agent-harness add "$NATIVE_PROJECT_DIR"
printf '%s' '{"prompt":"bootstrap probe"}' | agent-harness hook user-prompt >/dev/null

printf '[3/4] Starting local control plane...\n'
mkdir -p "$HARNESS_HOME"
if curl --silent --fail "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
  printf 'Dashboard already running.\n'
else
  if grep -qi microsoft /proc/version 2>/dev/null && command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process -FilePath (Get-Command agent-harness.cmd).Source -ArgumentList 'serve' -WindowStyle Hidden"
  else
    AGENT_HARNESS_HOME="$HARNESS_HOME" PORT="$PORT" nohup agent-harness serve >"$LOG_FILE" 2>&1 &
    server_pid=$!
    disown "$server_pid" 2>/dev/null || true
  fi
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
printf '\nProject:   %s\n' "$NATIVE_PROJECT_DIR"
printf 'Dashboard: http://127.0.0.1:%s\n' "$PORT"
printf 'Log:       %s\n' "$LOG_FILE"
