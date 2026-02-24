#!/usr/bin/env bash
# Mock subagent script — stands in for `claude` during tests.
# Parses --agent and -p args, extracts ticket ID from the prompt,
# looks up a response file, and outputs it.

set -euo pipefail

agent=""
prompt=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) agent="$2"; shift 2 ;;
    -p) prompt="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Extract ticket ID from prompt
# Standard pattern: "tk show <ticket-id>"
# Rebaser pattern: "feature-id: <ticket-id>" (multiline prompt)
ticket_id=$(echo "$prompt" | grep -oP 'tk show \K[a-zA-Z0-9_-]+' | head -1 || true)
if [[ -z "$ticket_id" ]]; then
  ticket_id=$(echo "$prompt" | grep -oP 'feature-id:\s*\K[a-zA-Z0-9_-]+' | head -1 || true)
fi

if [[ -z "$ticket_id" || -z "$agent" ]]; then
  echo "mock-subagent: could not determine ticket_id ($ticket_id) or agent ($agent)" >&2
  exit 1
fi

if [[ -z "${MOCK_RESPONSES_DIR:-}" ]]; then
  echo "mock-subagent: MOCK_RESPONSES_DIR not set" >&2
  exit 1
fi

# Try numbered files first (queue mode): <ticket-id>.<agent>.1.txt, .2.txt, ...
# Find lowest numbered file and consume it
found=""
for f in "$MOCK_RESPONSES_DIR/$ticket_id.$agent".[0-9]*.txt; do
  if [[ -f "$f" ]]; then
    found="$f"
    break
  fi
done

if [[ -n "$found" ]]; then
  cat "$found"
  rm "$found"
  exit 0
fi

# Fall back to unnumbered file (repeatable mode): <ticket-id>.<agent>.txt
fallback="$MOCK_RESPONSES_DIR/$ticket_id.$agent.txt"
if [[ -f "$fallback" ]]; then
  cat "$fallback"
  exit 0
fi

echo "mock-subagent: no response file for ticket=$ticket_id agent=$agent" >&2
echo "mock-subagent: looked in $MOCK_RESPONSES_DIR" >&2
ls -la "$MOCK_RESPONSES_DIR/" >&2
exit 1
