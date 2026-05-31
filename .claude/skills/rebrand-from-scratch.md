---
name: rebrand-from-scratch
description: Use this skill when the user asks to "rebrand", "apply the rebrand", "redo rebrand on top of vX", or "sync upstream and rebrand". This is the canonical procedure for converting an upstream NousResearch/hermes-agent checkout into TeamHermes (`teamhermes` package, `thm` CLI). Designed to be triggered with the `workflow` keyword so Claude generates and runs a dynamic workflow.
---

# Rebrand From Scratch

## When to use

- Starting fresh on a new upstream release tag
- The user says: "rebrand", "apply rebrand to vX", "sync upstream to vX and rebrand", "redo rebrand"
- A `rebrand-vX.Y.Z.N` branch exists at the upstream tag with NO rebrand applied yet

## Preconditions

1. CWD is `~/work/teamhermes`
2. Current branch matches `rebrand-v*` and HEAD equals an upstream release tag (verify: `git describe --exact-match HEAD` returns `vYYYY.M.D[.N]`)
3. Working tree clean **ignoring `.claude/state/`** (check: `git status --porcelain | grep -v '^.. \.claude/state/'` empty)
4. CLAUDE.md present at repo root
5. `upstream` remote points to NousResearch/hermes-agent

If any precondition fails: STOP, write `.claude/state/blocker.md` explaining why, return `BLOCKED: <reason>`.

## Architecture — Claude Code Dynamic Workflows

This task touches ~1,900 files across 5 semantic phases. Use Claude Code's **dynamic workflow** runtime (https://code.claude.com/docs/en/workflows) — the JS script orchestrates subagents at scale (up to 16 concurrent, 1000 total) and is **resumable in the same session**, perfect for this scope.

- Each phase = one workflow stage
- P2 and P4 (the big ones) split into parallel subagents by directory subtree (~8 and ~16 agents respectively)
- Audit + smoke = sequential gates between phases
- Final report = last stage

**Trigger**: the user MUST include the keyword `workflow` in the prompt so Claude opens the workflow planner. The orchestrator handles this.

**Execution mode**: this skill is designed for **interactive tmux mode**, NOT `claude -p`. In `-p` mode, Workflows submit-then-exit without runtime taking over (verified empirically 2026-05-31). The orchestrator launches `claude --permission-mode bypassPermissions` inside tmux, sends the workflow prompt, monitors via `tmux capture-pane` + `tail .claude/state/events.jsonl`, and presses `s` in `/workflows` UI to save the script to `.claude/workflows/rebrand.js` once green.

**Persistence**: the saved `rebrand.js` becomes the reusable asset — future upstream tags re-run via `/rebrand` slash command (auto-registered from the saved workflow file).

## The five phases (semantic contract)

### Phase 1 — Package metadata

Edit `pyproject.toml` only:
- `name = "hermes-agent"` → `name = "teamhermes"`
- Self-referencing extras: every `hermes-agent[xxx]` → `teamhermes[xxx]`
- Console scripts: `hermes = ...` → `thm = ...`, `hermes-agent = ...` → `thm-agent = ...`, `hermes-acp = ...` → `thm-acp = ...`

DO NOT touch: dependency names referring to upstream PyPI packages, project URLs to NousResearch, license, authors.

Commit: `rebrand: P1 package metadata (teamhermes, thm/thm-agent/thm-acp)`

### Phase 2 — Default home directory

Replace path literal `.hermes` → `.teamhermes` in Python/shell/yaml/toml.

Search pattern that matches: `Path.home() / ".hermes"`, `~/.hermes`, `${HOME}/.hermes`, `"$HOME/.hermes"`, `os.path.expanduser("~/.hermes")`, `pathlib... .hermes`.

**Critical false-positives to skip:**
- `HERMES_HOME` env var (uppercase identifier)
- `hermes_constants` and other `hermes_*` module names
- `get_hermes_home`, `HermesHome` and other identifiers
- `.hermes_history`, `.hermes_build_sha`, `.hermes_sync.*` (handled in Phase 3 with different mapping)
- Strings inside `LICENSE`, `NOTICE`, `RELEASE_v*.md`
- Anything under `.venv/`, `.git/`, `node_modules/`, `__pycache__/`, `.egg-info/`, `.claude/`, `docker/s6-rc.d/main-hermes/`

**Parallelism**: split by top-level directory: `hermes_cli/`, `hermes_state/`, `gateway/`, `tui_gateway/`, `tools/`, `docs/`, `website/`, `tests/`, `scripts/`, plus one agent for everything else. ~8 parallel agents.

Commit: `rebrand: P2 default home dir .hermes -> .teamhermes`

### Phase 3 — Home dir artifacts

Three deterministic renames:
- `.hermes_history` → `.teamhermes_history`
- `.hermes_build_sha` → `.teamhermes_build_sha`
- `.hermes_sync.*` → `.teamhermes_sync.*` (literal `.hermes_sync.` followed by anything)

Tiny scope (~12 files), one agent.

Commit: `rebrand: P3 home dir artifacts (.hermes_history etc.)`

### Phase 4 — Brand string + CLI command in text

Two sub-rules applied together (they often co-occur in the same file):

**4a** — User-facing brand: standalone word `Hermes` → `TeamHermes` (regex `\bHermes\b`).

**4b** — CLI command in text: `hermes <subcommand>` → `thm <subcommand>` in docs, shell scripts, Python strings, docker compose, systemd. Pattern: `\bhermes\b` followed by space and a subcommand, OR in contexts that are clearly CLI invocations.

Also covered in this phase:
- Skin engine (`hermes_cli/skin_engine.py` or similar): agent_name, welcome message, response_label → TeamHermes
- Shell scripts (`install.sh`, `setup-hermes.sh`, `setup_open_webui.sh`): command shims, output messages, temp file prefixes (`thm-*` instead of `hermes-*`)
- Docker compose container names: `hermes` → `thm`
- Systemd unit names: `hermes.service` → `thm.service`
- TypeScript/i18n web dashboard + TUI brand strings

**Critical preserves (whitelist from CLAUDE.md):**
- `NousResearch/hermes-agent` URL (often in markdown links — preserve full URL)
- Model identifiers: `Hermes-3`, `Hermes-4`, `Nous Hermes`, `nousresearch/hermes-*`
- All Python identifiers: `hermes_cli`, `hermes_constants`, `hermes_state`, `hermes_logging`, `hermes_bootstrap`, `hermes_time`
- All `Hermes*` class/function names: `HermesCLI`, `HermesAgent`, `get_hermes_home`, `HermesTokenStorage`, etc.
- All `HERMES_*` env var names
- `LICENSE`, `NOTICE` — DO NOT EDIT
- `RELEASE_v*.md` — DO NOT EDIT
- Docker user `hermes`, `/opt/hermes`, `docker/s6-rc.d/main-hermes/`
- Test fixtures in `test_openclaw_migration.py`, `test_dingtalk.py`, `test_matrix_mention.py`

**Parallelism**: split by directory subtree: docs/ (split into 4), website/ (split into 4), tests/, hermes_cli/, gateway/, tools/, tui_gateway/, scripts/, docker/, plus one for misc. ~16 parallel agents — the max workflow allows.

Commit per sub-batch or one squash commit: `rebrand: P4 brand string Hermes -> TeamHermes and CLI hermes -> thm`

### Phase 5 — Argparse + final report

Find every `prog="hermes"` and `prog="hermes-acp"` in Python — replace with `prog="thm"` and `prog="thm-acp"`. (~7 files.)

Then write `REBRAND_REPORT.md` at repo root summarizing:
- Source upstream tag
- Counts per phase (files changed, lines)
- Whitelist items verified preserved (regression checklist)
- Smoke results
- Test results

Commit: `rebrand: P5 argparse prog + final report`

## Verification gates between phases

After each commit, invoke the `rebrand-auditor` subagent for that phase only:
- After P1: check pyproject.toml is well-formed and contains expected name/scripts
- After P2: residual `\.hermes\b` only in whitelist-allowed contexts
- After P3: no `\.hermes_history`/`\.hermes_build_sha`/`\.hermes_sync\.` remaining
- After P4: full audit per CLAUDE.md whitelist
- After P5: full audit + smoke + full pytest

If any audit returns FAIL: read `.claude/state/audit-report.md`, apply mechanical fixes, re-audit. Max 3 cycles per phase. After 3, STOP and report.

## Test gate (final)

After Phase 5, invoke `smoke-tester` subagent. Pass = ready for orchestrator handoff. Fail outside known xdist flakies = STOP and report.

## Handoff

When all phases green:

1. Write `.claude/state/upstream-tag` = current upstream tag
2. Write `.claude/state/rebrand-report.md` with phase-by-phase summary
3. Print:
   ```
   REBRAND COMPLETE
   Upstream: <tag> (<sha>)
   Phases: P1 P2 P3 P4 P5 all GREEN
   Audit cycles: P1=<n> P2=<n> P3=<n> P4=<n> P5=<n>
   Tests: PASS (<P>/<F>/<S>, <duration>)

   READY FOR ORCHESTRATOR REVIEW:
     - .claude/state/rebrand-report.md (full report)
     - REBRAND_REPORT.md (committed)
     - branch: <branch_name>
   Orchestrator will run review via Claude Code, then push.
   ```

## Hard rules for Claude (subagents inherit)

- NEVER `git push` (denied by settings; also denied by policy)
- NEVER modify LICENSE, NOTICE, RELEASE_v*.md
- NEVER modify anything under `docker/s6-rc.d/main-hermes/`
- NEVER rename `hermes_*` Python modules or `Hermes*` identifiers
- NEVER change `HERMES_*` env var names
- When unsure → mark RESIDUAL in audit, let orchestrator decide. Don't improvise.
- All workflow agents must inherit the whitelist from CLAUDE.md (the workflow script must pass CLAUDE.md context to each spawned agent's prompt).
