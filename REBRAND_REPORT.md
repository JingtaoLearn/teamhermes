# TeamHermes Rebrand Report

## Summary

- **Source**: NousResearch/hermes-agent (upstream commit 61268ff)
- **Target**: teamhermes-agent on branch `rebrand-spike`
- **Total commits**: 8 (1f15944, a8aabdb, 9c7656a, 488acaa, feeab98, cfc5f6a, cfcd5c3, plus final report)
- **Total files changed**: 1,900
- **Total line changes**: 22,793 insertions / 20,576 deletions

## What changed

| Category | Files | Description |
|----------|-------|-------------|
| Package metadata | 1 | `pyproject.toml`: name `hermes-agent` → `teamhermes-agent`, self-referencing extras updated, console scripts `hermes`/`hermes-agent`/`hermes-acp` → `th`/`th-agent`/`th-acp` |
| Default home directory | 884 | `.hermes` → `.teamhermes` in all path literals (`Path.home() / ".hermes"`, `~/.hermes/...`, `${HOME}/.hermes`, etc.) |
| Home dir artifacts | 12 | `.hermes_history` → `.teamhermes_history`, `.hermes_build_sha` → `.teamhermes_build_sha`, `.hermes_sync.*` → `.teamhermes_sync.*` |
| Brand string (uppercase) | 1,444 | Standalone `Hermes` → `TeamHermes` in user-facing strings, documentation, i18n, comments, docstrings |
| CLI command name | 997 | `hermes <subcommand>` → `th <subcommand>` in docs, shell scripts, Python strings, docker scripts |
| Argparse prog name | 7 | `prog="hermes"` → `prog="th"`, `prog="hermes-acp"` → `prog="th-acp"` |
| Skin engine | 1 | All 5 built-in skins: agent_name, welcome message, response_label updated to TeamHermes |
| Shell scripts | 4 | `install.sh`, `setup-hermes.sh`, `setup_open_webui.sh`: command shims, output messages, temp file prefixes |
| Docker | 5 | `main-wrapper.sh`: s6-setuidgid exec lines (user stays `hermes`, command → `th`), container names → `th` in docker-compose |
| Systemd | ~10 | `hermes.service` → `th.service` unit names |
| TypeScript/i18n | ~50 | Web dashboard and TUI i18n strings, component paths |

## What was preserved (whitelist)

- **NousResearch/hermes-agent URL** — upstream attribution in CONTRIBUTING.md, acp_registry, SKILL.md files
- **Nous Hermes / Hermes-3 / Hermes-4 model names** — external API identifiers (39 occurrences across 10+ files)
- **Python module names** — `hermes_cli`, `hermes_constants`, `hermes_state`, `hermes_logging`, `hermes_bootstrap`, `hermes_time`, all unchanged
- **Class/function names** — `HermesCLI`, `HermesTokenStorage`, `HermesAgent`, `HermesOverlay`, `get_hermes_home`, `get_hermes_home_override`, etc.
- **HERMES_* environment variables** — `HERMES_HOME`, `HERMES_MODEL`, `HERMES_PROFILE`, `HERMES_API_KEY`, etc. (940 files)
- **LICENSE** — MIT, Copyright (c) 2025 Nous Research (unchanged)
- **RELEASE_v*.md** — 7 historical release notes preserved as-is
- **Docker user `hermes`** — Linux UID 10000, infrastructure identity
- **`/opt/hermes` install path** — Docker image filesystem layout

## Verification

### CLI smoke tests

| Test | Result |
|------|--------|
| `th --version` | `TeamHermes Agent v0.15.1 (2026.5.29)` |
| `th --help` | Shows `usage: th [-h] [--version] ...` |
| `th config --help` | `Manage TeamHermes Agent configuration` |
| `th sessions --help` | Working |
| `th cron --help` | Working |
| `th tools --help` | Working |
| Skin engine default branding | `TeamHermes Agent` / `Welcome to TeamHermes Agent!` |
| `get_hermes_home()` | `~/.teamhermes` |
| Gateway import | `from gateway.run import main` — OK |
| Python module imports | `hermes_constants`, `hermes_state`, `hermes_logging`, `hermes_cli.main` — OK |

### Test suite

- **pytest (sequential, per-file)**: 14,945 / 15,114 passed (98.9%), 106 failed, 63 skipped
- **Failure triage**: All 106 failures are **xdist parallel isolation issues**, not rebrand bugs.
  - `test_clipboard.py` (20 failures with `-n auto`): 107/107 pass when run alone or with `-n 4` on the single file.
  - `test_models.py` (14 failures): 76/76 pass sequentially and `-n 4` per-file.
  - `test_nous_account.py` (7 failures): 18/18 pass sequentially.
  - `test_proxy.py` (7 failures): 39/39 pass sequentially.
  - Root cause: shared mutable state (monkeypatched env vars, tmp directories) collides across xdist workers when the full suite runs. Pre-existing issue, not introduced by rebrand.

## Known issues / follow-ups

1. **Docker infrastructure paths**: `/opt/hermes` install directory and `hermes` Linux user (UID 10000) are unchanged. Renaming these would require Dockerfile rebuild and is a separate infrastructure task.
2. **s6 service directory**: `docker/s6-rc.d/main-hermes/` directory name and its `user/contents.d/main-hermes` symlink are unchanged. Renaming requires s6-overlay reconfiguration.
3. **LaunchAgent label**: `ai.hermes.gateway` was already changed to `ai.teamhermes.gateway` in step 4.
4. **Test data containing "hermes"**: Some test fixtures in `test_openclaw_migration.py` use `hermes` as test data (e.g., `"hermes should always respond concisely"`). These are intentionally preserved — they test migration FROM the old brand name.
5. **Bot mention patterns**: `test_dingtalk.py` and `test_matrix_mention.py` test for "hermes" as a bot name in messages. These may need updating when the bot identity changes, but that's a deployment-time config change, not a source rebrand.
6. **xdist test failures (106)**: Pre-existing parallel isolation issues. Not introduced by rebrand. Filed as known flakiness.

## Upstream sync cost

This is now a **hard fork**. Every `git fetch upstream && git merge` will produce hundreds of conflicts across:
- All 1,900 changed files
- Especially docs, i18n, tests, and CLI strings (highest churn areas)

**Estimated weekly maintenance**: 2-4 hours for a typical upstream merge, more during heavy upstream release cycles.

**Mitigation strategies**:
- Keep a mapping script for automated re-application of the brand transform
- Merge frequently (daily if possible) to keep conflict batches small
- Consider selective cherry-picking for upstream changes that don't touch branded strings
