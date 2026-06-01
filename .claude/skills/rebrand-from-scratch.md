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

**Phase 6 automation (added 2026-06-01):** The smoke-tester subagent writes `.claude/state/failures.list`; the workflow then loops the `rebrand-fixer` subagent up to 16 cycles, each cycle classifies failures into the Phase 6 four-bucket taxonomy and commits a batch. If the loop hits a Bucket-C blast radius or stalls, it writes `.claude/state/p6-resume.list` so the orchestrator can hand-fix and re-trigger (the next workflow run skips those items).

## Dry-run mode

Touch `.claude/state/dry-run.flag` BEFORE launching the workflow. Effects:
- All phase commits get a `[DRY-RUN]` subject prefix.
- Phase 6 produces `.claude/state/p6-plan.md` (per-failure classification + proposed fix) instead of editing files or committing.
- Handoff writes `.claude/state/dry-run-summary.md` listing every dry-run commit.

To revert after a dry-run validation pass:
    git reset --hard <upstream-tag>     # e.g. v2026.5.29.2
    rm .claude/state/dry-run.flag

Dry-run is the safe way to validate that the skill + workflow can reproduce a rebrand from a clean upstream checkout — diff the dry-run commits against a real rebrand and any delta signals hidden knowledge missing from the skill.

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

### Phase 2 finalize sweep (deterministic safety net)

After the parallel-subtree P2 commit, run `.claude/scripts/p2-sweep.py` as a second pass. Verified necessary 2026-06-01: parallel agents using `rg + Edit each carefully` on a subtree with 100+ candidates converge to ~20% coverage and stop (no signal to keep going). The sweep script does a deterministic Python regex replace with the canonical exclude list (LICENSE/NOTICE/main-hermes/test fixtures/binary extensions) and the same lookbehind/lookahead pattern as the auditor (`(?<![A-Za-z0-9_])\.hermes(?![A-Za-z0-9_])`) so it cannot touch `hermes_cli`, `HERMES_HOME`, or `.hermes_history` (the latter is P3's mapping). On a clean v2026.5.29.2 it lands ~919 files / ~4478 lines that the parallel pass missed, and the audit then comes back clean on the first cycle.

The workflow runs this automatically between the P2 subtree commit and the P2 audit gate — see `.claude/workflows/rebrand.js` `p2:finalize-sweep` agent.

### Phase 4 finalize sweep (deterministic safety net)

After the P4 parallel-subtree commit, run `.claude/scripts/p4-sweep.py` as a second pass — the same pattern as P2. E2E v4 (2026-06-01) proved that without this, P4 audit takes **5-6 cycles, ~50 minutes** classifying the same mechanical brand residuals one-by-one (Sonnet auditor + Opus fixer doing 40-72 tool calls per cycle while the residuals are entirely mechanical).

The script applies three WHITELIST-aware patterns:

- **R2 argparse**: `prog="hermes"` / `prog='hermes'` → `"thm"` (strict, inside quotes only)
- **R3 brand word**: `\bHermes\b` → `TeamHermes`, with per-line blocklist for `Hermes-3/4/2/1`, `Nous Hermes`, `NousResearch`, `nousresearch.com`, `hermes-agent`, `RELEASE_v` — these are model names, upstream attribution, and frozen release notes
- **R4 CLI in markdown/help**: `` `hermes <cmd>` `` (backtick + hermes + space) → `` `thm <cmd>` ``

Global excludes: `.git/`, `.venv/`, `node_modules/`, `__pycache__/`, `.claude/`, `.cursor/`, LICENSE, NOTICE, RELEASE_v\*.md, binary/asset extensions, and `providers/base.py` (whitelist rule 3 — that file's `hermes-cli/<version>` UA is the canonical wire-protocol identity).

Verified on clean v2026.5.29.2 (post-P2 sweep state): 1584 files / ~12,200 lines batch-replaced in ~3 seconds. All whitelist symbols verified intact afterwards (`refs/hermes` × 2, `hermes@local`, `HERMES_HOME` × 2595, Nous Hermes / Hermes-3/4 × 50, NousResearch × 3790, `hermes-agent` × 5117, `providers/base.py` UA × 4).

The workflow runs this automatically between the P4 subtree commit and the P4 audit gate — see `.claude/workflows/rebrand.js` `p4:finalize-sweep` agent.

### Phase 5 — Argparse + final report

Find every `prog="hermes"` and `prog="hermes-acp"` in Python — replace with `prog="thm"` and `prog="thm-acp"`. (~7 files.)

Then write `REBRAND_REPORT.md` at repo root summarizing:
- Source upstream tag
- Counts per phase (files changed, lines)
- Whitelist items verified preserved (regression checklist)
- Smoke results
- Test results

Commit: `rebrand: P5 argparse prog + final report`

## Audit-fix loop — autonomous classification

After each phase commit, invoke the `rebrand-auditor` subagent. If it returns FAIL, **do not stop after 3 cycles**. Loop until PASS, using these classification rules autonomously to decide FIX vs WHITELIST for each residual:

### WHITELIST (keep `hermes`/`Hermes`) — anything matching these patterns:

1. **Code identifiers**: any Python module name, class, function, variable, type alias. Includes `hermes_*` modules and `Hermes*` / `*hermes*` names. Renaming breaks `import` statements and `getattr` lookups.
2. **Environment variables**: `HERMES_*`. Users' .env files depend on these.
3. **Protocol identifiers**: HTTP headers (`X-Hermes-*`), JSON wire fields (`owned_by: hermes`, `error.hermes`), URL query params registered with external services (`source=hermes`, `from=hermes`), MCP server names, ACP names/method IDs, MCP/ACP tool names.
4. **Deploy-configured integrations**: systemd unit names (e.g. `hermes-gateway`), Slack slash commands (`/hermes`), bot mention patterns, OAuth redirect URL fragments, logger names (people have log-filter rules), git branch naming conventions used by kanban/session features.
5. **Filesystem identity**: Docker user `hermes` (UID 10000), `/opt/hermes`, `~/.local/state/hermes/`, `%LOCALAPPDATA%\hermes`, `docker/s6-rc.d/main-hermes/`, plugin directories `plugins/hermes-*/`, container/sandbox naming conventions like `hermes-{uuid}`, tmp prefixes (`/tmp/hermes-*`, `hermes-ssh`, `hermes-cmd-stt-`, etc.).
6. **External backend identifiers**: tags sent to upstream services that affect routing/billing (`product=hermes-agent` in Nous portal tags, `hermes-client-v*`).
7. **Upstream attribution**: `NousResearch/hermes-agent` URLs, `nousresearch/hermes-agent` Docker image refs, model names (`Hermes-3`, `Hermes-4`, `Nous Hermes`, `nousresearch/hermes-*`), `LICENSE`, `NOTICE`, `RELEASE_v*.md`.
8. **Verbatim contributor content**: user-quoted excerpts in `website/src/data/userStories.json` and similar — editing misrepresents contributors.
9. **User-configurable naming patterns**: skill name patterns like `hermes-config-*`, `hermes-dashboard-*`, profile names like `hermes-security` — same class as plugin dir names.
10. **Test fixtures testing the old brand**: `test_openclaw_migration.py`, `test_dingtalk.py`, `test_matrix_mention.py`.

### FIX (change to `TeamHermes`/`thm`/`teamhermes`) — anything matching these:

1. **User-facing brand strings**: `Hermes` in docs, READMEs, i18n locale yaml hint strings, CLI help text, banner/welcome messages, skin engine branding, error messages users see.
2. **CLI command in text**: standalone `hermes <subcmd>` in docs, scripts, comments, docstrings, plugin READMEs.
3. **Install commands**: `pip install hermes-agent`, `brew upgrade hermes-agent`, `uv pip install hermes-agent` → `teamhermes`. EXCEPT upstream attribution Docker images and git+URL.
4. **Code comments and docstrings** referencing "Hermes" as the product (visible via pydoc/help() or to anyone reading code).
5. **Argparse `prog=`, description=, help=** strings.
6. **Outgoing User-Agent headers**: `Hermes-Agent/...`, `Hermes-Watcher/...`, `gl-python/hermes` → `TeamHermes-*` / `gl-python/teamhermes` (our outward identity).
7. **Process protection patterns**: `pkill hermes`, `pgrep -f hermes` in our own scripts must become `thm` so they protect the renamed binary.
8. **Website project metadata**: `projectName: 'hermes-agent'` in build configs → `'teamhermes'`.
9. **Shell scripts and shim names**: `./hermes` venv shim, `setup-hermes.sh` → `./thm`, `setup-thm.sh`.

### When in doubt — apply the heuristic

- **Is it persistent state / wire-protocol / deployment-registered identifier?** → WHITELIST. Renaming breaks something existing.
- **Is it text a user reads (docs, comments, help text, error messages, banners)?** → FIX. Brand consistency.
- **Is it our outward identifier (User-Agent, build config)?** → FIX. We are TeamHermes.

If a residual fits neither pattern clearly, classify conservatively as **WHITELIST** and document the choice in the audit report as `EXPECTED (deferred, ambiguous - flag for orchestrator)`. Continue with the rest. Do not stop the loop for a single ambiguous item — the orchestrator can revisit those at final review.

### When to genuinely stop

Stop the audit-fix loop and report `BLOCKED` only when:
- Audit FAILS with 0 actual residuals (auditor disagrees with itself)
- Same exact residual persists across 3 consecutive fix cycles (Claude can't seem to apply the fix correctly)
- Audit catches a regression in the WHITELIST INTACT section
- pip install requires permission approval and you cannot proceed to smoke-tester

Otherwise: keep looping autonomously. Each cycle is one commit `rebrand: P<n> audit fixes (cycle N)`.

### Hard file-scope rule for fix cycles

The audit-report.md is a **closed work list**. The fix-cycle agent:

- **MUST** only edit files explicitly listed in the audit report's residual section.
- **MUST NOT** re-grep the repo for additional residuals during a fix cycle.
- **MUST NOT** edit any file not named in the report, even if it looks like it has a residual.

Why: the auditor has already applied the WHITELIST taxonomy. Files NOT listed are either compliant or whitelisted. Re-grepping past the audit report has produced regressions like rewriting wire-protocol UA strings (`hermes-cli/<version>` in `providers/base.py`) or internal help text containing whitelisted symbols (`hermes_cli/main.py` references to the `hermes_cli` package). If the fix-cycle agent thinks the auditor missed something, leave it — the **next** cycle's audit pass will catch it, and a new audit report will explicitly authorize the edit.

### Whitelist additions during the loop

If the loop encounters a residual that should be permanently whitelisted (not just deferred), the executing Claude may add it to `CLAUDE.md` directly with a `contract: whitelist <thing> (<reason>)` commit, then continue. Cite the classification rule (e.g. "matches WHITELIST rule 3: protocol identifier"). The orchestrator reviews these commits at final review.

## Test gate (final)

After Phase 5, invoke `smoke-tester` subagent. Pass = ready for orchestrator handoff. Fail outside known xdist flakies = STOP and report.

## Phase 6 — Iterative convergence CI sweep (MANDATORY)

**Why this phase exists:** Smoke tests verify the binary launches and config loads. They do NOT catch the ~80–250 unit-test failures the rebrand reliably introduces. Skipping this phase ships a green local repo with a red CI — every time. (Verified 2026-06-01: 78–131 unique unit-test failures after a "smoke-clean" rebrand; v5 dry-run gave up after one cycle with 131 still failing.)

### Convergence contract (FINAL — do not negotiate)

**Cycle budget:** Hard cap **16 cycles**.

- **Cycle 1** = the smoke-tester's full `pytest -n auto` run. It writes `.claude/state/failures.list` (one pytest nodeid per line).
- **Cycles 2–16** = targeted rerun ONLY of the nodeids in `failures.list`:
  `pytest $(cat .claude/state/failures.list | tr '\n' ' ') -q`
- After every cycle: **rewrite** `failures.list` with the current remaining failures (could shrink, stay the same, or grow if a fix broke something).
- **Converged** when `failures.list` is empty → P6 PASS.
- **Exhausted** when cycle 16 finishes with non-empty `failures.list` → P6 STOP. Write remaining to `.claude/state/p6-blocked.md` and exit non-zero. Do NOT declare PASS.

### Per-cycle workflow

1. **Run pytest** (targeted from cycle 2 on) → capture the new failures list.
2. **Classify** every failure into Bucket A/B/C/D and write `.claude/state/p6-cycle-N-buckets.md` BEFORE editing anything:
   - **A** — test assertion stale (test expects "hermes" but production correctly outputs "thm") → **fix the test**
   - **B** — production code stale (production still outputs "hermes" but test correctly expects "thm") → **fix the code**
   - **C** — compatibility surface incorrectly rebranded (wire-protocol header, OAuth URL, model id, PyPI distribution name, etc — must REVERT in production)
   - **D** — rebrand introduced a real bug (NameError, broken import, dangling local) → **fix the source**
3. **Apply fixes in order A → B → D → C.** C is last because it has the highest blast radius (see below).
4. **Re-run only the just-fixed testids** to verify each fix individually before the batch commit.
5. **Re-run the remaining failure list** to refresh `.claude/state/failures.list`.
6. Commit: `[DRY-RUN] P6 cycle N: bucket A=x B=y C=z D=w, fixed M, remaining K` (omit `[DRY-RUN] ` in live mode).

### Scope fence (hard rules — fix-agent MUST obey)

**MAY edit:**
- Source files referenced by a failing test (traced via the test's import graph or stack trace), OR
- The test file itself

**MAY NOT:**
- Edit any file touched by a P1–P5 phase commit unless it appears in a failures.list trace (avoid undoing whitelist decisions).
- Add new entries to `CLAUDE.md`. **The whitelist is frozen during P6.** If a failure seems to require a new whitelist entry, mark BLOCKED instead.
- Re-grep for new patterns outside failures.list scope. P6 is a convergence loop, NOT a discovery phase.

**Bucket-C blast-radius check (mandatory before any C reversal):**
1. `rg <symbol_being_reverted>` repo-wide.
2. `pytest <whole containing module>` (e.g. the full `tests/plugins/memory/` if reverting `supermemory._DEFAULT_CONTAINER_TAG`).
3. If the reversal breaks **≥3 other tests in the same module**, mark BLOCKED — do not commit the reversal.

### BLOCKED degradation (per-testid)

A single testid that fails for **3 consecutive cycles with no progress** (same failure signature, no edit attempted to its trace):
- Append to `.claude/state/p6-blocked.md` with one section per testid (last error tail, last classification, why blocked).
- **Remove from `failures.list`** so the loop can keep converging on the rest.

`p6-blocked.md` is part of the final P6 report regardless of how P6 exits.

### Post-convergence (LIVE mode only)

When `failures.list` is empty AND `DRY_RUN === false`:

1. `git push origin <current-branch>` (this branch is the PR branch — e.g. `fix/ci-rebrand-residuals` = PR #6).
2. `gh pr checks <PR#> --watch` (wait for remote CI).
3. Write `.claude/state/p6-final-report.md` with the remote CI status.

In DRY-RUN mode: skip the push, write a `[DRY-RUN] P6 CONVERGED` commit, stop.

### Verification before declaring P6 done

```bash
# 1. failures.list is empty
test ! -s .claude/state/failures.list

# 2. No regressions in adjacent suites
pytest tests/cron tests/gateway tests/hermes_cli tests/agent tests/honcho_plugin \
       tests/cli tests/tools tests/plugins tests/scripts -q -n 4 --timeout=60
```

### The bidirectional fix taxonomy

CI failures after rebrand split into FOUR buckets. Classify each before editing.

**Bucket A — Test stale, code correct.** Test asserts the OLD brand string; code now correctly emits the NEW one. Example: `test_auth_nous_provider.py` expects `'hermes auth add nous'`, code emits `'thm auth add nous'`. **Fix the test.**

**Bucket B — Code stale, test correct.** Test asserts the NEW brand string; code still emits OLD. P2/P4 missed this file. Example: `test_proxy_mode.py` expects header `X-TeamHermes-Session-Id`, code still sends `X-Hermes-Session-Id`. **Fix the code.** This bucket is the most dangerous — it's a real rebrand residual that smoke tests cannot see.

**Bucket C — Compatibility-preserved surface, code wrongly rebranded.** Test asserts the OLD string because that string is on the contract whitelist (PyPI distribution name in ACP registry, Homebrew formula name, etc.). P1–P4 incorrectly changed code to new brand. **Revert the code to old; test is the source of truth.** Look for these in `scripts/release.py` (PyPI/uvx package strings), `plugins/memory/supermemory/__init__.py` (default container tag — historically `hermes`), `docker/s6-rc.d/*/run` (user is `hermes` but binary is `thm` — mixed line `s6-setuidgid hermes thm dashboard`).

**Bucket D — Real source bug introduced by rebrand.** Renames left a variable reference dangling, e.g. function renamed `_resolve_hermes_bin` → kept inner `hermes_bin` local but parameter became `thm_bin` → `NameError`. **Read the file, fix the bug.** These pass syntax check but blow up at runtime; only the failing test surfaces them.

### Decision heuristic (apply per-failure, in order)

1. Is the test asserting a **preserved-compatibility surface** (PyPI distribution name, Homebrew tap, Docker user, ACP uvx `package` field, supermemory container tag, mixed s6 lines)? → Bucket C, revert code.
2. Is the test asserting a **NEW brand string** and the code still emits OLD? → Bucket B, fix code.
3. Is the test asserting an **OLD brand string** and code emits NEW correctly per contract (visible to users, CLI hint text, error messages, banner)? → Bucket A, fix test.
4. Does the failure stack-trace mention `NameError`, `AttributeError`, `KeyError` on a `hermes`-ish identifier inside production code? → Bucket D, debug and fix the source.
5. Honcho `host=` / `workspace_id=` defaults: these are **logical host keys** for the memory plugin's wire protocol. The legitimate value is the **old name** (`hermes`) — host keys are external-protocol-shaped. → Bucket C, revert code to `"hermes"`.

### Known recurring hotspots (verified 2026-06-01)

Files almost guaranteed to need a Bucket-C or Bucket-D fix on every rebrand:

| File | Issue class | Fix direction |
|---|---|---|
| `plugins/memory/honcho/client.py` | `host` / `workspace_id` defaults wrongly rebranded | Code → `"hermes"` |
| `plugins/memory/supermemory/__init__.py` | `_DEFAULT_CONTAINER_TAG` wrongly rebranded | Code → `"hermes"` |
| `scripts/release.py` | ACP registry uvx `package` field | Code → `"hermes-agent[acp]=={ver}"` |
| `docker/s6-rc.d/dashboard/run` | Test wants `s6-setuidgid <user> <binary>` — user stays `hermes`, binary becomes `thm` | Test asserts new mixed line |
| `tests/test_termux_all_extra_compat.py` | Self-reference uses new package name `teamhermes[termux]` | Test → `teamhermes[...]` |
| `tools/approval.py` `DANGEROUS_PATTERNS` | `killall hermes` / `pkill hermes` still in the wild → must trigger | Regex needs both `hermes` AND `thm` |
| `plugins/google_meet/meet_bot.py` `_looks_like_human_speaker` | Filter ignored `"thm agent"` echo speaker | Code → add `"thm agent"` to filter set |
| `gateway/run.py` `_resolve_hermes_bin` | Local var still `hermes_bin` after refactor → `NameError` | Code → rename to match new parameter |
| `agent/skill_utils.py` skill-system-prompt | Toolset-gated skills wrongly leaked into prompt | Code → restore gating logic |
| `tools/cronjob_tools.py` `profile` description | Hint command was rebranded inconsistently | Code → spell as `thm profile` |
| `hermes_cli/config.py` | Stale identifier reference | Code → match new symbol |

When the suite first runs after the rebrand, grep for `hermes` in failing-test source lines AND in the actual-output strings — the direction tells you the bucket.

### The autonomous fix loop

```
while True:
    pytest <failure-list> -q
    if 0 failed: break
    for each failure:
        classify per heuristic above (A/B/C/D)
        apply targeted fix
        re-run that single test → must go green
    commit batch: "rebrand: P5.5 CI-sweep fixes (<N> tests, buckets A/B/C/D)"
    re-run full failure list
    if still failing same items 3 cycles in a row: STOP, report BLOCKED
```

Maximum: ~5 cycles in practice. Each cycle clears 10–30 failures.

### Verification

Before declaring P5.5 done:

```bash
# 1. Original failure list now clean
pytest $(cat .claude/state/failures.list | tr '\n' ' ') -q

# 2. No regressions in adjacent suites
pytest tests/cron tests/gateway tests/hermes_cli tests/agent tests/honcho_plugin \
       tests/cli tests/tools tests/plugins tests/scripts -q -n 4 --timeout=60
```

Both must end with `0 failed` (xdist-flaky timeouts are acceptable IFF rerunning the same test alone passes).

Commit: `rebrand: P6 CI-sweep clean (NN tests fixed, buckets: <A=...,B=...,C=...,D=...>)`

### CRITICAL: Bucket-C reversals have a blast radius

When reverting a Bucket-C (compatibility-preserved surface) change, **never trust the single failing test as proof of correctness**. The same module almost certainly has other tests/call-sites that depend on the value you just changed.

Mandatory checklist before declaring a Bucket-C fix done:

```bash
# 1. What else in the codebase reads this symbol?
rg "<SYMBOL_YOU_CHANGED>" --type py

# 2. What else in tests asserts on its value?
rg "_DEFAULT_FOO|FOO == \"hermes\"|FOO == \"thm\"" tests/

# 3. Run the WHOLE module's tests, not just the single failing one
pytest path/to/module/ -q

# 4. If the module has integration tests touching the same symbol,
#    run them too:
pytest tests/integration -k <relevant_keyword> -q
```

Verified 2026-06-01: reverting `supermemory._DEFAULT_CONTAINER_TAG` from `thm` back to `hermes` for one failing test silently set up ~15 other tests in the same module to fail (they assert `_container_tag == "hermes_<profile>"` and the default flows through into that calculation). The fix was correct in isolation but the blast radius was uninspected. Always scan the radius before committing a Bucket-C reversal.

### Cost guardrails

- Budget Claude Code at ≥ $20 per CI sweep — first pass typically lands at $6, but the bidirectional taxonomy needs an explicit prompt and at least one re-pass to clear the second-direction failures.
- If the first pass returns `subtype=success` but `git diff` only touches `tests/`, it missed Bucket B/C/D entirely. Re-prompt with explicit "must change source code, not only tests" before accepting the result.
- The agent loop hits `error_max_budget_usd` cleanly — that's fine. Take what landed, manually finish the last handful (each is a one-line patch). Don't burn another $15 to save 6 trivial edits.

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

## Phase 7 — Squash to single commit (final step)

After audit passes, smoke tests pass, and REBRAND_REPORT.md is committed:

1. Capture the upstream tag/ref the rebrand was based on (`UPSTREAM_REF`) and the new project name.
2. Soft-reset all rebrand commits onto that base, keeping every change staged:
   ```bash
   git reset --soft "$UPSTREAM_REF"
   git commit -m "rebrand: <NewName> from <upstream>/<repo> $UPSTREAM_REF"
   ```
3. Force-push the single squashed commit to the fork's main branch
   (the orchestrator does the push, not the in-loop agent).
4. Re-tag the backup of the pre-rebrand main on the remote before the
   force-push, so the prior state is recoverable.

Rationale: keep the public history clean — one atomic rebrand commit
on top of a known upstream tag, instead of N audit-cycle commits.
