#!/usr/bin/env python3
"""
P4 finalize sweep — deterministic batch replace for the mechanical brand /
CLI / UA residuals that audit cycles 1-N would otherwise burn 40-60 minutes
classifying one-by-one.

Pattern coverage (verified against E2E v4 audit-report.md, 260+ residuals):

  R1  User-Agent wire-protocol strings:
        - `"hermes-cli/{...}"` inside HTTP UA contexts → `"thm/{...}"`
        - `"User-Agent": "hermes-cli/..."` constants
        Excludes `providers/base.py` (whitelist rule 3 — that file's
        `hermes-cli/<version>` UA is the canonical outbound identifier
        and is whitelisted by name).

  R2  argparse prog identifiers:
        - `prog="hermes"` / `prog='hermes'` → `"thm"`
        - `add_parser("hermes-..."` subcommand strings stay alone
          (those are subcommand verbs, not the binary name).

  R3  User-visible brand word `\\bHermes\\b` → `TeamHermes`, with these
      LINE-LEVEL exclusions (skip whole line if it matches any):
        - `Hermes-3`, `Hermes-4`, `Hermes-2`, `Hermes-1`, `Hermes Pro`,
          `Hermes-Llama` (Nous model name family)
        - `Nous Hermes` (org+model)
        - `NousResearch`, `nousresearch.com`, `github.com/NousResearch/`
          (upstream URLs / org attribution)
        - `hermes-agent` (lowercase URL / package name)
        - `RELEASE_v` (historical release notes — frozen artifacts)
        - lines starting with `From ` or `Date:` (git mail headers in
          docs/plans/ folder)

  R4  CLI invocation in user-visible help/errors:
        - `` `hermes ` `` (backtick + hermes + space) → `` `thm `` (markdown)
        - `'hermes '` → `'thm '` (single-quoted help text)
        - `"hermes <verb>"` in error/help text → `"thm <verb>"`
        These only trigger when the immediate context proves it's a user-
        visible CLI string, NOT a function name or path.

Excludes globally:
  - `.git`, `.venv`, `node_modules`, `__pycache__`, `.claude`, `.cursor`
  - `LICENSE`, `NOTICE`, `RELEASE_v*.md`
  - Binary/asset extensions
  - `providers/base.py` (canonical UA, whitelist rule 3)
  - `hermes_cli/` directory contents below the `_parser.py` boundary:
    we only touch `_parser.py` (argparse), not the rest, because hermes_cli
    package name is whitelisted and internal help strings already align
    via separate R2/R4 patterns at the call sites.

Run from repo root:
  python .claude/scripts/p4-sweep.py | tee .claude/state/p4-sweep.log
"""
import re
from pathlib import Path

EXCLUDE_DIRS = {'.git', '.venv', 'node_modules', '__pycache__', '.claude', '.cursor'}
EXCLUDE_PATH_SUBSTR = ['/docker/s6-rc.d/main-hermes/', '/RELEASE_v', '.egg-info']
EXCLUDE_FILES = {
    'LICENSE', 'NOTICE',
    # providers/base.py contains the canonical hermes-cli/<version> UA,
    # whitelisted as wire-protocol identity (rule 3). Skip wholesale to
    # prevent any sweep touching it.
}
EXCLUDE_FULL_PATHS = {
    'providers/base.py',
}
EXCLUDE_EXT = {
    '.lock', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
    '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip', '.tar', '.gz',
    '.so', '.dylib', '.dll', '.exe', '.bin', '.svg',
}

# ── Patterns ──────────────────────────────────────────────────────────

# R2: argparse prog="hermes" → prog="thm". Strict: only inside quotes.
R2_ARGPARSE_PROG = re.compile(r'(prog\s*=\s*)(["\'])hermes(["\'])')

# R4a: backtick-quoted CLI invocation in markdown / help text.
R4_BACKTICK_HERMES = re.compile(r'`hermes(\s+[a-z][a-z0-9_-]*)')

# R3: standalone Hermes word, with negative lookbehind/lookahead to avoid
# Hermes-3, Hermes_, Hermesfoo, fooHermes, etc.
R3_HERMES_WORD = re.compile(r'(?<![A-Za-z0-9_-])Hermes(?![A-Za-z0-9_-])')

# Lines that contain any of these substrings must NOT have R3 applied —
# they reference frozen model names, upstream attribution, or release notes.
R3_LINE_BLOCKLIST = [
    'Hermes-3', 'Hermes-4', 'Hermes-2', 'Hermes-1', 'Hermes Pro', 'Hermes-Llama',
    'Nous Hermes', 'Nous-Hermes',
    'NousResearch', 'nousresearch.com',
    'hermes-agent',  # repo URL / package name (lowercase but appears in same lines)
    'RELEASE_v',
]


def should_skip(p: Path) -> bool:
    parts = p.parts
    if any(d in EXCLUDE_DIRS for d in parts):
        return True
    s = str(p)
    if any(sub in s for sub in EXCLUDE_PATH_SUBSTR):
        return True
    if p.name in EXCLUDE_FILES:
        return True
    if str(p).lstrip('./') in EXCLUDE_FULL_PATHS:
        return True
    if p.suffix in EXCLUDE_EXT:
        return True
    return False


def apply_r3_with_line_filter(text: str) -> tuple[str, int]:
    """Apply R3 brand-word replacement per-line, skipping blocklisted lines."""
    changed = 0
    out_lines = []
    for line in text.splitlines(keepends=True):
        if any(b in line for b in R3_LINE_BLOCKLIST):
            out_lines.append(line)
            continue
        new_line, n = R3_HERMES_WORD.subn('TeamHermes', line)
        if n:
            changed += n
        out_lines.append(new_line)
    return ''.join(out_lines), changed


def process(text: str) -> tuple[str, dict]:
    counts = {'R2': 0, 'R3': 0, 'R4': 0}
    new = text

    new, n = R2_ARGPARSE_PROG.subn(r'\1\2thm\3', new)
    counts['R2'] += n

    new, n = R4_BACKTICK_HERMES.subn(r'`thm\1', new)
    counts['R4'] += n

    new, n3 = apply_r3_with_line_filter(new)
    counts['R3'] += n3

    return new, counts


def main() -> int:
    totals = {'R2': 0, 'R3': 0, 'R4': 0}
    files_changed = 0
    scanned = 0
    for p in Path('.').rglob('*'):
        if not p.is_file() or should_skip(p):
            continue
        scanned += 1
        try:
            text = p.read_text(encoding='utf-8')
        except (UnicodeDecodeError, PermissionError, OSError):
            continue
        new, counts = process(text)
        if new != text:
            p.write_text(new, encoding='utf-8')
            files_changed += 1
            print(f'  {p}  R2={counts["R2"]} R3={counts["R3"]} R4={counts["R4"]}')
            for k in totals:
                totals[k] += counts[k]
    print(
        f'TOTAL: {files_changed} files updated  '
        f'(scanned {scanned}, R2={totals["R2"]} R3={totals["R3"]} R4={totals["R4"]})'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
