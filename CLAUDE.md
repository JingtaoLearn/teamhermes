# TeamHermes — Hard Fork of NousResearch/hermes-agent

This repo is a security-oriented hard fork. Upstream is `https://github.com/NousResearch/hermes-agent` (remote `upstream`). Origin is `https://github.com/JingtaoLearn/teamhermes`.

## Branch model

- Per-release branches: `rebrand-vYYYY.M.D[.N]` rebased from each upstream tag
- `origin/main` = latest greenlit `rebrand-v*` branch (force-pushed by orchestrator only)
- **No long-lived feature branch.** Every upstream release = brand new branch, rebrand reapplied from skill+workflow. This is deliberate: the workflow IS the source of truth, not git history.
- Upstream tag of current branch: see `.claude/state/upstream-tag` (single line)

## Rebrand contract — what changes

| Category | Rule | Approx files |
|---|---|---|
| Package metadata | `pyproject.toml`: name `hermes-agent` → `teamhermes`; self-referencing extras updated | 1 |
| Console scripts | `thm` / `hermes-agent` / `hermes-acp` → `thm` / `thm-agent` / `thm-acp` | 1 (pyproject) + downstream refs |
| Argparse `prog=` | `prog="hermes"` → `prog="thm"`, `prog="hermes-acp"` → `prog="thm-acp"` | ~7 |
| Default home dir | Path literals `.teamhermes` → `.teamhermes` (`Path.home() / ".teamhermes"`, `~/.teamhermes/...`, `${HOME}/.teamhermes`) | ~890 |
| Home dir artifacts | `.teamhermes_history` → `.teamhermes_history`, `.teamhermes_build_sha` → `.teamhermes_build_sha`, `.teamhermes_sync.*` → `.teamhermes_sync.*` | 12 |
| Brand string (uppercase) | Standalone `Hermes` → `TeamHermes` in user-facing strings/docs/i18n/comments/docstrings | ~1,444 |
| CLI command in text | `hermes <subcommand>` → `thm <subcommand>` in docs, shell scripts, Python strings, docker scripts | ~997 |
| Skin engine | All 5 built-in skins: agent_name + welcome + response_label → TeamHermes | 1 file |
| Shell scripts | `install.sh`, `setup-hermes.sh`, `setup_open_webui.sh`: command shims, output messages, temp file prefixes | 4 |
| Docker compose | container names `thm` → `thm` | 5 |
| Systemd | `hermes.service` → `thm.service` unit names | ~10 |
| TypeScript/i18n | Web dashboard + TUI i18n brand strings + component paths | ~50 |

## Whitelist — DO NOT rebrand

These must remain after every rebrand. The auditor regression-checks for their presence.

- **Upstream attribution**: `NousResearch/hermes-agent` URL in CONTRIBUTING.md, acp_registry, SKILL.md files
- **Model identifiers**: `Nous Hermes`, `Hermes-3`, `Hermes-4`, `nousresearch/hermes-*` (external API names — touching these breaks model routing)
- **Python module names**: `hermes_cli`, `hermes_constants`, `hermes_state`, `hermes_logging`, `hermes_bootstrap`, `hermes_time` (renaming breaks every `import hermes_*` in the codebase)
- **Class/function names**: `HermesCLI`, `HermesTokenStorage`, `HermesAgent`, `HermesOverlay`, `get_hermes_home`, `get_hermes_home_override`, and all other `Hermes*` / `*hermes*` identifiers in Python source
- **Environment variables**: ALL `HERMES_*` env vars (`HERMES_HOME`, `HERMES_MODEL`, `HERMES_PROFILE`, `HERMES_API_KEY`, `HERMES_LOG_LEVEL`, ~7,142 occurrences). Users' .env files reference these; changing breaks every existing deployment.
- **LICENSE / NOTICE**: `Copyright (c) 2025 Nous Research` preserved (MIT attribution obligation)
- **RELEASE_v*.md**: 7+ historical release notes preserved as-is
- **Docker infrastructure**:
  - User `thm` (Linux UID 10000) — image filesystem identity
  - `/opt/hermes` install path — image filesystem layout
  - `docker/s6-rc.d/main-hermes/` directory + `user/contents.d/main-hermes` symlink — s6-overlay infra
- **Git branch naming convention** (`cli.py:1042/1324/1385` constants like `hermes-{id}` / `hermes/*` prefix): kanban/session branches in existing repos use this prefix; renaming breaks state lookup on existing branches. Treated as deployment identity, same class as `hermes-gateway`.
- **systemd `hermes-gateway` service name** (`_SERVICE_BASE = "hermes-gateway"` in hermes_cli/gateway.py and all downstream references in toolsets/tools/tests/docs): existing deployments depend on this unit name — renaming breaks them. Treated as deployment infrastructure identity, same as Docker user `hermes` and `/opt/hermes`.
- - **Plugin directory names** (treated as IDs, not brand strings): `plugins/hermes-achievements/`, `plugins/hermes-yuanbao/`, any other `plugins/hermes-*` — the directory name AND in-doc headings referring to the plugin by name (e.g. `# Hermes Achievements`) are package identity, not brand
- **Test fixtures**:
  - `test_openclaw_migration.py` "hermes" test data (tests migration FROM old brand)
  - `test_dingtalk.py`, `test_matrix_mention.py` bot mention patterns (deployment-time config, not source)

## Authoritative sources

- Contract: this file (CLAUDE.md)
- Skill: `.claude/skills/rebrand-from-scratch.md` (how to apply)
- Workflow: `.claude/workflows/rebrand.js` (Claude-generated orchestration, saved on first successful run)
- Per-release report: `REBRAND_REPORT.md` at repo root (committed after each rebrand)

## Project commands (after rebrand applied)

- Install editable: `pip install -e .`
- Smoke: `thm --version` / `thm --help` / `thm config --help`
- Full tests: `pytest -n auto`  (known: ~106 xdist isolation failures in `test_clipboard.py`, `test_models.py`, `test_nous_account.py`, `test_proxy.py` — all pass sequentially; not regressions)

## Safety rules — for Claude Code

- `git push` is **denied** in `.claude/settings.json`. Only the orchestrator (Hermes on parent machine) pushes.
- `pip install*` requires user approval via the orchestrator (returns blocked → orchestrator runs with consent).
- `Bash(rm -rf*)`, `curl`, `wget`, `scp` denied.
- Never delete backup tags. Never modify LICENSE or RELEASE_v*.md.
- When in doubt about whitelist: mark RESIDUAL in the audit report; let the orchestrator decide.
