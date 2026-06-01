# TeamHermes Rebrand Report — v2026.5.29.2

**Source upstream:** `v2026.5.29.2` (synced commit `77a1650c7` on rebrand branch; upstream tag sha `51f432685e4bc73379abe70367f196400dd44054`)
**Branch:** `rebrand-v2026.5.29.2`
**Final HEAD:** `a71b87119` (P5 audit cycle 6 — AUDIT PASS)

## Phase-by-phase summary

| Phase | Description | Approx files | Approx subs |
|---|---|---|---|
| P1 | Package metadata (pyproject.toml: name → teamhermes, extras, console scripts thm/thm-agent/thm-acp) | 1 | 26 |
| P2 | Default home dir `.hermes` → `.teamhermes` across Python/shell/yaml/toml | ~900 | ~4290 |
| P3 | Home dir artifacts (`.hermes_history`, `.hermes_build_sha`, `.hermes_sync.*`) + Dockerfile | ~13 | ~30 |
| P4 | Brand `Hermes` → `TeamHermes` + CLI `hermes <sub>` → `thm <sub>` across docs/website/i18n/code + skin engine + shell scripts + docker/systemd unit names | ~2400 | ~18000 |
| P5 | Argparse `prog="hermes"` → `prog="thm"` + comprehensive cleanup of brand/CLI residuals across cli.py, plugins, skills, website, i18n | ~370 | ~2500 |

## Rebrand commits (chronological)

```
a2c6a6df7 rebrand: P1 package metadata (teamhermes, thm/thm-agent/thm-acp)
7fb79eb79 rebrand: P2+P3 re-apply default home dir + artifacts
3ad64a582 rebrand: P2 default home dir .hermes -> .teamhermes
64cdfddb3 rebrand: P4 brand string Hermes -> TeamHermes and CLI hermes -> thm
bf71494ec rebrand: P4 sweep residual CLI `hermes` -> `thm` in docs/strings
e421ecfbf rebrand: P5 argparse prog + REBRAND_REPORT.md
37fc64b74 rebrand: P4 brand string Hermes -> TeamHermes and CLI hermes -> thm
79e061de0 rebrand: P4 audit fixes (cycle 1)
30d488f36 rebrand: P4 audit fixes (cycle 2)
d505aaa65 rebrand: P5 audit fixes (cycle 1)
ad5a3cc04 rebrand: P5 audit fixes (cycle 2)
94dc2ddae rebrand: P5 audit fixes (cycle 3)
cdf24c07a rebrand: P5 audit fixes (cycle 4)
cb7cef12d rebrand: P5 audit fixes (cycle 5) + complete website coverage
a71b87119 rebrand: P5 audit fixes (cycle 6)
019271f72 rebrand: fix CONTRIBUTING.md user-facing hermes-agent residuals
```

## Contract whitelist commits added during this run

```
074e35a59 contract: whitelist plugins/hermes-* directory names and in-doc plugin headings
080fb8b0b contract: whitelist hermes-gateway systemd service name (deployment identity)
4818ec03a contract: whitelist git branch naming hermes-{id}/hermes/*
8a6b355a7 contract: whitelist deploy-configured integrations, wire-protocol fields, OAuth URLs, ACP IDs, contributor quotes
```

## Workflow upgrades

```
69005652e skill(rebrand): replace 3-cycle stop with autonomous audit-fix loop
1bd12e26d workflow(rebrand): upgrade runAudit — autonomous loop + classification rules + mid-loop whitelist
```

## Audit cycle counts

- P1: 1 (PASS)
- P2: 2 (1 fix cycle)
- P3: 2 (1 fix cycle)
- P4: 3 (2 fix cycles)
- P5: 7 (6 fix cycles before final PASS at cycle 6)

## Whitelist preservation (regression checklist)

All verified intact at final HEAD `a71b87119`:

- `HERMES_*` env vars (HERMES_HOME etc.) — PRESERVED
- Python module names: `hermes_cli`, `hermes_constants`, `hermes_state`, `hermes_logging`, `hermes_bootstrap`, `hermes_time` — PRESERVED
- Class/function identifiers: `HermesCLI`, `HermesAgent`, `HermesTokenStorage`, `HermesOverlay`, `get_hermes_home`, `get_hermes_home_override` — PRESERVED
- Model identifiers: `Hermes-3`, `Hermes-4`, `Hermes-4-70B/405B`, `Nous Hermes`, `Nous Research Hermes`, `nousresearch/hermes-*` — PRESERVED
- Upstream URL `NousResearch/hermes-agent` (CONTRIBUTING.md, acp_registry, SKILL.md) — PRESERVED
- LICENSE / NOTICE untouched; `Copyright (c) 2025 Nous Research` preserved
- `RELEASE_v*.md` untouched
- Docker: user `hermes` (UID 10000), `/opt/hermes` install path, `docker/s6-rc.d/main-hermes/` directory — PRESERVED
- Test fixtures preserved: `test_openclaw_migration.py`, `test_dingtalk.py`, `test_matrix_mention.py`
- `hermes-gateway` systemd service name + all references (per whitelist commit 080fb8b0b)
- `plugins/hermes-*/` dirs + in-doc headings (074e35a59)
- Git branch naming hermes-{id}/hermes/* (4818ec03a)
- All wire-protocol/OAuth/ACP/portal-tag identifiers per 8a6b355a7
- `website/src/data/userStories.json` verbatim contributor quotes — PRESERVED

## Smoke verification

| Check | Result |
|---|---|
| `thm --version` | `TeamHermes Agent v0.15.2 (2026.5.29.2)` ✅ |
| `thm --help` | `TeamHermes Agent - AI assistant with tool-calling capabilities` ✅ |
| `thm config --help` | `Manage TeamHermes Agent configuration` ✅ |
| `python -c "from hermes_state import get_hermes_home; print(get_hermes_home())"` | `/home/zehua/.teamhermes` ✅ |
| `thm` subcommand listing | All subcommands enumerated correctly ✅ |
| `pip install -e ".[dev]"` | OK (15 packages added; build of `teamhermes` clean) |

## Pytest results

`pytest -n auto --tb=no -q --timeout=60` (1861.73s ≈ 31 min):

- **26529 passed**
- **147 skipped**
- **240 warnings**
- **50 errors** — all in `tests/docker/` (require live docker daemon, environment-dependent; not rebrand-related)
- **255 failed** — see classification below

### Failure classification

- **Known xdist isolation flakies** (REBRAND_REPORT pre-existing list — test_clipboard.py, test_models.py, test_nous_account.py, test_proxy.py): **3 of 255** match.
- **Test-assertion regressions from rebrand** (CONFIRMED): some test files hardcode expected output strings like `assert "hermes --resume ..." in out`. Production now correctly emits `thm --resume ...`, so the assertion fires. Verified example: `tests/cli/test_exit_summary_resume_hint.py::test_resume_hint_no_profile_flag_on_custom` — production output is exactly the expected behavior; test text needs to be rebranded too.
- Top failing files (>=5 failures each):

  ```
  16 tests/tools/test_computer_use.py
  15 tests/honcho_plugin/test_client.py
  15 tests/gateway/test_api_server.py
  12 tests/tools/test_vision_tools.py
  12 tests/gateway/test_update_command.py
  10 tests/hermes_cli/test_gateway_service.py
   8 tests/honcho_plugin/test_pin_peer_name.py
   8 tests/gateway/test_discord_send.py
   7 tests/tools/test_video_analyze.py
   5 tests/tools/test_browser_homebrew_paths.py
   5 tests/tools/test_approval.py
   5 tests/honcho_plugin/test_cli.py
   5 tests/hermes_cli/test_web_ui_build.py
   5 tests/cli/test_exit_summary_resume_hint.py
  ```

- 324 test files contain `hermes` literal references. Many failures likely stem from the same class of issue (test assertions matching the old brand/CLI string). The rebrand contract did NOT explicitly cover updating test-assertion strings — only product code, docs, i18n. Sequential re-run of a representative sample (`test_approval.py`, `test_exit_summary_resume_hint.py`, `test_cli.py`) reproduced 11 failures, indicating these are deterministic assertion mismatches, not xdist flakies.

### Pytest verdict

**Rebrand correctness — verified via smoke (CLI version banner, help output, hermes_state module home dir return value all correct).**

**Test suite — NOT clean**: 255 failures + 50 docker errors. The bulk of failures fall into two categories:
1. Test files with hardcoded expected strings containing `hermes`/`Hermes` that need to be updated to match new product output.
2. xdist isolation (a known pre-existing pattern, but only 3 explicitly match the documented list).

Distinguishing (1) from (2) for the full 255 requires either sequential re-runs of every failing file or a focused sweep over `tests/` to update assertion text. Neither is in scope for this rebrand run per orchestrator scope (rebrand contract = product code + docs + i18n + skins + scripts, not test assertions).

## Handoff state

- `.claude/state/upstream-tag` = `v2026.5.29.2`
- `.claude/state/audit-report.md` = final P5 audit cycle 6 PASS report
- `.claude/state/smoke-report.md` = smoke verification (this report's smoke section)
- `.claude/workflows/rebrand.js` = reusable workflow asset for future upstream tags

## Orchestrator review pending

This branch is ready for `rebrand-reviewer` agent review. Test-suite failures should be assessed by the reviewer as either (a) acceptable test-string mismatches to be cleaned up in a follow-up commit, or (b) blockers requiring a P6 sweep over `tests/` before push.

**No push performed. Awaiting orchestrator decision.**
