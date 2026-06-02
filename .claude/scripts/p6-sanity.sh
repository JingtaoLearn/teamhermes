#!/usr/bin/env bash
# Sanity check the P6 scope-fence logic: fake a failures.list, render the prompt
# template, verify it contains the scope-fence and bucket directives.
set -euo pipefail
cd "$(dirname "$0")/../.."

mkdir -p .claude/state
cat > /tmp/p6-fake-failures.list <<'EOF'
tests/test_proxy_mode.py::test_session_header
tests/test_auth_nous_provider.py::test_help_hint
EOF

fail=0
# Workflow.js prompt template must carry the scope-fence + v6-hardening rules
prompt=$(grep -A 80 'P6 ITERATIVE CONVERGENCE' .claude/workflows/rebrand.js | head -120)
for needle in \
    'SCOPE FENCE' \
    'MAY NOT: add new entries to CLAUDE.md' \
    'Bucket A/B/C/D' \
    'order A → B → D → C' \
    'blast' \
    'p6-blocked.md' \
    'FOREGROUND ONLY' \
    'CHECK-AND-EXIT'
do
  if ! echo "$prompt" | grep -qF "$needle"; then
    echo "MISSING in workflow.js: $needle"
    fail=1
  fi
done

# Skill must document the two v6 hardening rules under a dedicated section
for needle in \
    'P6 pytest execution rules (HARD)' \
    'pytest MUST run foreground' \
    'instant `failures.list` is empty'
do
  if ! grep -qF "$needle" .claude/skills/rebrand-from-scratch.md; then
    echo "MISSING in skill: $needle"
    fail=1
  fi
done

[[ $fail -eq 0 ]] && echo "P6 scope-fence + v6-hardening sanity check: OK"
exit $fail
