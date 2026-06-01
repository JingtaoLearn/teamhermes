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

prompt=$(grep -A 50 'P6 ITERATIVE CONVERGENCE' .claude/workflows/rebrand.js | head -80)

fail=0
for needle in \
    'SCOPE FENCE' \
    'MAY NOT: add new entries to CLAUDE.md' \
    'Bucket A/B/C/D' \
    'order A → B → D → C' \
    'blast' \
    'p6-blocked.md'
do
  if ! echo "$prompt" | grep -qF "$needle"; then
    echo "MISSING: $needle"
    fail=1
  fi
done
[[ $fail -eq 0 ]] && echo "P6 scope-fence sanity check: OK"
exit $fail
