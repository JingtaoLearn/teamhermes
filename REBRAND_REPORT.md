# TeamHermes Rebrand Report — v2026.5.29.2

**Source upstream:** `v2026.5.29.2` (sha `51f432685e4bc73379abe70367f196400dd44054`)
**Branch:** `rebrand-v2026.5.29.2`

## Phase-by-phase summary

| Phase | Description | Approx files | Approx subs |
|---|---|---|---|
| P1 | Package metadata (pyproject.toml: name, extras, console scripts) | 1 | 26 |
| P2 | Default home dir `.hermes` → `.teamhermes` (+ top-level fix) | ~900 | ~4290 |
| P3 | Home dir artifacts (`.hermes_history`, `.hermes_build_sha`, `.hermes_sync.*`) + Dockerfile | ~13 | ~30 |
| P4 | Brand `Hermes` → `TeamHermes` and CLI `hermes <sub>` → `thm <sub>` across all subtrees + skin engine + shell scripts + docker/systemd unit names + i18n + sweep of inline-code residuals | ~2400 | ~18000 |
| P5 | Argparse `prog="hermes"` → `prog="thm"` (also `prog="hermes-acp"` → `prog="thm-acp"`) + this report | 8 | 8 |

## Audit cycles
- P1: 1 (GREEN with comment residuals deferred to P4)
- P2: 2 (1 fix cycle for missed top-level loose files)
- P3: 2 (1 fix cycle for Dockerfile)
- P4: 2 (1 sweep cycle for `\`hermes <subcmd>\`` backtick residuals)
- P5: pending final audit

## Whitelist preservation (regression checklist)
All verified intact in the working tree at end of P4:

- `HERMES_*` env vars (HERMES_HOME etc.) — PRESERVED
- Python module names: `hermes_cli`, `hermes_constants`, `hermes_state`, `hermes_logging`, `hermes_bootstrap`, `hermes_time` — PRESERVED
- Class/function identifiers: `HermesCLI`, `HermesAgent`, `HermesTokenStorage`, `HermesOverlay`, `get_hermes_home`, `get_hermes_home_override` — PRESERVED
- Model identifiers: `Hermes-3`, `Hermes-4`, `Nous Hermes`, `nousresearch/hermes-*` — PRESERVED
- Upstream URL `NousResearch/hermes-agent` (CONTRIBUTING.md, acp_registry, SKILL.md) — PRESERVED
- LICENSE / NOTICE untouched; `Copyright (c) 2025 Nous Research` preserved
- `RELEASE_v*.md` untouched
- Docker: user `hermes` (UID 10000), `/opt/hermes` install path, `docker/s6-rc.d/main-hermes/` directory — PRESERVED
- Test fixtures preserved: `test_openclaw_migration.py`, `test_dingtalk.py`, `test_matrix_mention.py`

## Known residuals — for orchestrator decision

Per CLAUDE.md ("When in doubt about whitelist: mark RESIDUAL"), these were intentionally NOT rebranded because their semantics are ambiguous:

- **HTTP wire-protocol headers** (`gateway/api_server.py`): `X-Hermes-Session-*` headers and JSON discriminator strings `hermes.session`, `hermes.run`, `hermes.tool.progress` — changing these would break existing API clients.
- **Internal tmp file/dir prefixes**: `/tmp/hermes-results`, `tempfile.mkdtemp(prefix="hermes-...")`, `hermes-cmd-stt-`, `hermes-skills-safe-` in tools/* — not user-visible.
- **Git config email** `hermes@local` in `tools/checkpoint_manager.py`.
- **Skills hub cache file** `hermes-index.json` and source id `"hermes-index"` in `tools/skills_hub.py`.
- **Toolset id** `"hermes-yuanbao"` in `tools/yuanbao_tools.py`.
- **Bot mention patterns** in messaging adapters (`hermes-weixin-{uuid}`, `<hermes-{uuid}@...>` email msg-ids).
- **Internal asyncio task names** like `hermes-ws-pub` in `tui_gateway/event_publisher.py`.
- **`@hermes/ink` npm package**, `hermes-ink` / `hermes-tui` package directory names in `ui-tui/`.
- **Email allowlist values** in `scripts/contributor_audit.py` (`hermes-audit@example.com`, `hermes@habibilabs.dev`).
- **npm package name** `hermes-whatsapp-bridge` in `scripts/whatsapp-bridge/package.json`.
- **Skill directory names** containing `hermes-` (e.g. `skills/autonomous-ai-agents/hermes-agent/`, `plugins/hermes-achievements/`) and the systemd unit `plugins/kanban/systemd/hermes-kanban-dispatcher.service` — directory/file renames are out of phase-4 text-substitution scope.
- **Dockerfile shim install location** `/opt/hermes/bin/hermes` (the in-container PATH shim filename).

## Smoke + tests

To be filled by smoke-tester.
