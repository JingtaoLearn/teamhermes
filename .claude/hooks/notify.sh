#!/usr/bin/env bash
# Append hook event JSON to events.jsonl for Hermes to tail
HOOK_TYPE="${1:-unknown}"
STATE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/state"
mkdir -p "$STATE_DIR"
PAYLOAD=$(cat)
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"ts\":\"$TS\",\"hook\":\"$HOOK_TYPE\",\"payload\":$PAYLOAD}" >> "$STATE_DIR/events.jsonl"
exit 0

