#!/usr/bin/env bash
# Block dangerous bash commands and secret exposure
STATE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/state"
mkdir -p "$STATE_DIR"
PAYLOAD=$(cat)
CMD=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

# Deny patterns
DENY_RE='(ANTHROPIC_API_KEY|LITELLM.*KEY|sk-ant-|rm -rf /|rm -rf ~|:(){|git push --force|chmod -R 777 /|>/etc/|dd if=)'
if echo "$CMD" | grep -qE "$DENY_RE"; then
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "{\"ts\":\"$TS\",\"hook\":\"BLOCKED\",\"cmd\":$(echo -n "$CMD" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" >> "$STATE_DIR/events.jsonl"
  echo "BLOCKED by Hermes guard: dangerous pattern matched" >&2
  exit 2
fi
exit 0

