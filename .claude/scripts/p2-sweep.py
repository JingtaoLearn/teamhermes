#!/usr/bin/env python3
"""
P2 finalize sweep — deterministic batch replace for `.hermes` → `.teamhermes` path
literals that the parallel P2 subtree agents missed.

Called by .claude/workflows/rebrand.js after the P2 parallel-edit commit, BEFORE
the P2 audit gate. Verified necessary 2026-06-01: parallel agents covered only
~20% of 717 candidate files in an E2E dry-run.

Run from repo root: `python .claude/scripts/p2-sweep.py | tee .claude/state/p2-sweep.log`
"""
import re
from pathlib import Path

# Skip dirs that are not source (cache, vendored, infra-identity)
EXCLUDE_DIRS = {'.git', '.venv', 'node_modules', '__pycache__', '.claude', '.cursor'}

# Skip path substrings (whitelist per CLAUDE.md)
EXCLUDE_PATH_SUBSTR = ['/docker/s6-rc.d/main-hermes/', '/RELEASE_v', '.egg-info']

# Skip specific files (license / test fixtures / migration tests)
EXCLUDE_FILES = {
    'LICENSE', 'NOTICE',
    'test_openclaw_migration.py', 'test_dingtalk.py', 'test_matrix_mention.py',
}

# Skip binary / asset extensions
EXCLUDE_EXT = {
    '.lock', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
    '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip', '.tar', '.gz',
    '.so', '.dylib', '.dll', '.exe', '.bin',
}

# Match a literal `.hermes` followed by a word boundary, NOT inside an identifier
# like `hermes_cli`, and NOT the artifact names `.hermes_history/_build_sha/_sync`
# (those are P3's job — different mapping).
PAT = re.compile(r'(?<![A-Za-z0-9_])\.hermes(?![A-Za-z0-9_])')


def should_skip(p: Path) -> bool:
    parts = p.parts
    if any(d in EXCLUDE_DIRS for d in parts):
        return True
    s = str(p)
    if any(sub in s for sub in EXCLUDE_PATH_SUBSTR):
        return True
    if p.name in EXCLUDE_FILES:
        return True
    if p.suffix in EXCLUDE_EXT:
        return True
    return False


def main() -> int:
    changed = 0
    scanned = 0
    for p in Path('.').rglob('*'):
        if not p.is_file() or should_skip(p):
            continue
        scanned += 1
        try:
            text = p.read_text(encoding='utf-8')
        except (UnicodeDecodeError, PermissionError, OSError):
            continue
        if not PAT.search(text):
            continue
        new = PAT.sub('.teamhermes', text)
        if new != text:
            p.write_text(new, encoding='utf-8')
            changed += 1
            print(f'  {p}')
    print(f'TOTAL: {changed} files updated (scanned {scanned})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
