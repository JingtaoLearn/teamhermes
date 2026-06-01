export const meta = {
  name: 'rebrand',
  description: 'Apply the TeamHermes rebrand-from-scratch contract end-to-end (5 phases, audit gates, smoke + pytest).',
  whenToUse: 'Run on a fresh rebrand-vX.Y.Z.N branch at an upstream tag with no rebrand applied yet.',
  phases: [
    { title: 'P1 metadata' },
    { title: 'P1 audit' },
    { title: 'P2 home dir' },
    { title: 'P2 audit' },
    { title: 'P3 artifacts' },
    { title: 'P3 audit' },
    { title: 'P4 brand+CLI' },
    { title: 'P4 audit' },
    { title: 'P5 argparse+report' },
    { title: 'P5 audit' },
    { title: 'P6 Smoke + tests + CI sweep' },
  ],
}

const CONTRACT = `
You are applying the TeamHermes rebrand contract from CLAUDE.md. Hard rules (subagents inherit):
- NEVER git push. NEVER modify LICENSE, NOTICE, RELEASE_v*.md, or anything under docker/s6-rc.d/main-hermes/.
- NEVER rename hermes_* Python modules (hermes_cli, hermes_constants, hermes_state, hermes_logging, hermes_bootstrap, hermes_time).
- NEVER rename Hermes* identifiers (HermesCLI, HermesAgent, get_hermes_home, HermesTokenStorage, etc.).
- NEVER change HERMES_* env var names.
- PRESERVE: NousResearch/hermes-agent URL; model ids (Nous Hermes, Hermes-3, Hermes-4, nousresearch/hermes-*); docker user 'hermes', /opt/hermes path; test fixtures in test_openclaw_migration.py, test_dingtalk.py, test_matrix_mention.py.
- Skip .venv/, .git/, node_modules/, __pycache__/, *.egg-info/, .claude/.
- If unsure → leave it; the auditor will catch it.
`

const PHASE_RESULT_SCHEMA = {
  type: 'object',
  required: ['filesChanged', 'commitSha', 'summary'],
  properties: {
    filesChanged: { type: 'integer' },
    commitSha: { type: 'string' },
    summary: { type: 'string' },
  },
}

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'residuals', 'notes'],
  properties: {
    verdict: { enum: ['PASS', 'FAIL'] },
    residuals: { type: 'integer' },
    notes: { type: 'string' },
  },
}

// --- runAudit: autonomous loop with classification rules + mid-loop whitelist commits ---

const CLASSIFICATION_RULES = `
FIX/WHITELIST CLASSIFICATION (apply autonomously per residual, no orchestrator ping needed):

WHITELIST (keep hermes/Hermes — renaming would break something existing):
1. Code identifiers: Python module/class/function/variable names (hermes_*, Hermes*).
2. Env vars: HERMES_*.
3. Protocol identifiers: HTTP headers (X-Hermes-*), JSON wire fields (owned_by=hermes, error.hermes), URL query params registered with external services (source=hermes, from=hermes&tp=hermes), MCP/ACP server/method names.
4. Deploy-configured integrations: systemd unit names (hermes-gateway), Slack /hermes slash command, OAuth redirect URL fragments (#hermes), logger names (hermes.lint.lsp — users have log-filter rules), git branch naming conventions (hermes-{id}/hermes/*).
5. Filesystem identity: Docker user hermes (UID 10000), /opt/hermes, ~/.local/state/hermes, %LOCALAPPDATA%\\\\hermes, docker/s6-rc.d/main-hermes/, plugins/hermes-*/, container/sandbox naming (hermes-{uuid}), tmp prefixes (/tmp/hermes-*, hermes-ssh, hermes-cmd-stt-).
6. External backend tags: Nous portal tags (product=hermes-agent, hermes-client-v*).
7. Upstream attribution: NousResearch URLs, nousresearch/hermes-agent Docker image, model names (Hermes-3/4, Nous Hermes), LICENSE, NOTICE, RELEASE_v*.md.
8. Verbatim contributor quotes (website/src/data/userStories.json).
9. User-configurable naming patterns: hermes-config-*, hermes-dashboard-*, hermes-security profile.
10. Test fixtures testing the old brand: test_openclaw_migration.py, test_dingtalk.py, test_matrix_mention.py.

FIX (change to TeamHermes/thm/teamhermes — text users read or our outward identifier):
1. User-facing brand strings in docs, READMEs, i18n locale yaml, CLI help, banners, error messages.
2. Standalone CLI command in text: hermes <subcmd> → thm <subcmd>.
3. Install commands: pip install hermes-agent → teamhermes; brew/uv same. EXCEPT upstream attribution Docker image and git+URL.
4. Code comments and docstrings citing "Hermes" as the product (visible via pydoc/help).
5. Argparse prog/description/help.
6. Outgoing User-Agent headers (Hermes-Agent/... → TeamHermes-Agent/..., gl-python/hermes → gl-python/teamhermes).
7. Process protection patterns: pkill hermes / pgrep -f hermes in our own scripts → thm.
8. Website build config: projectName: 'hermes-agent' → 'teamhermes'.
9. Shell scripts and shim names: setup-hermes.sh → setup-thm.sh, ./hermes → ./thm.

Heuristic when in doubt: persistent state / wire-protocol / deploy-registered → WHITELIST. Ambiguous → WHITELIST conservatively + mark deferred in audit report (do NOT stop the loop).

When fixing, you may add new WHITELIST entries to CLAUDE.md with a separate commit "contract: whitelist <thing> (matches rule <N>: <rule name>)" before the fix commit so future audits classify consistently.
`

async function runAudit(phaseLabel, phaseDescription) {
  const MAX_CYCLES = 15
  let lastResiduals = -1
  let sameResidualStreak = 0
  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    const audit = await agent(
      `${CONTRACT}\n\n${CLASSIFICATION_RULES}\n\nRun the rebrand-auditor procedure SCOPED TO PHASE ${phaseLabel} ONLY.\n` +
      `Phase scope: ${phaseDescription}.\n` +
      `CRITICAL: per the auditor's scope-limited rule, run ONLY the grep categories that match this phase scope. Do NOT report residuals belonging to later phases (e.g. when auditing P2 home dir, do NOT report \\bHermes\\b brand strings or pyproject.toml comments — those belong to P4).\n` +
      `Apply the FIX/WHITELIST classification rules above when judging in-scope residuals. Write .claude/state/audit-report.md with each in-scope residual classified.\n` +
      `Return JSON via StructuredOutput: { verdict: "PASS"|"FAIL", residuals: <int>, notes: "<short>" }.`,
      { label: `audit:${phaseLabel}:cycle${cycle}`, phase: `${phaseLabel} audit`, schema: AUDIT_SCHEMA, agentType: 'rebrand-auditor' }
    )
    if (audit && audit.verdict === 'PASS') {
      log(`${phaseLabel} audit PASS on cycle ${cycle}`)
      return audit
    }
    log(`${phaseLabel} audit FAIL cycle ${cycle}: ${audit?.residuals} residuals`)

    // Stall detection: if same residual count persists 3 cycles, escalate
    if (audit?.residuals === lastResiduals) {
      sameResidualStreak++
      if (sameResidualStreak >= 3) {
        throw new Error(`${phaseLabel} audit stalled: ${audit.residuals} residuals unchanged across 3 cycles (fix agent can't converge). Notes: ${audit?.notes}`)
      }
    } else {
      sameResidualStreak = 0
      lastResiduals = audit?.residuals ?? -1
    }

    if (cycle === MAX_CYCLES) {
      throw new Error(`${phaseLabel} audit failed after ${MAX_CYCLES} cycles: ${audit?.notes}`)
    }

    await agent(
      `${CONTRACT}\n\n${CLASSIFICATION_RULES}\n\nThe ${phaseLabel} audit reported ${audit?.residuals} residuals. Read .claude/state/audit-report.md.\n` +
      `CRITICAL FILE-SCOPE RULE: You may ONLY edit files (and ideally only line ranges) explicitly named in audit-report.md under the residual list. Do NOT re-grep the repo for additional residuals. Do NOT edit any file not listed in the audit report. If you discover what looks like a new residual not in the report, IGNORE it — the auditor is authoritative and will catch it next cycle. Editing files outside the audit-report scope has caused regressions (e.g. rewriting wire-protocol UA strings in providers/base.py, internal hermes_cli/main.py help text containing whitelist symbols). Trust the audit report as the closed work list.\n` +
      `IMPORTANT phase-scope rule: only act on residuals IN-SCOPE for phase ${phaseLabel} (${phaseDescription}). If the audit report contains items obviously belonging to a later phase (e.g. \\bHermes\\b brand strings reported during P2 home dir audit), SKIP those — note them in your summary as "deferred to later phase" but DO NOT edit them now. Editing out-of-scope items breaks the phase contract.\n` +
      `For each IN-SCOPE residual, apply the FIX/WHITELIST classification rules autonomously:\n` +
      `- If WHITELIST: edit CLAUDE.md to add the entry under the existing whitelist section, commit as "${COMMIT_PREFIX}contract: whitelist <thing> (matches rule <N>)".\n` +
      `- If FIX: apply the mechanical substitution per the rule.\n` +
      `If after filtering there are ZERO in-scope residuals to fix, do nothing and return JSON {filesChanged:0, commitSha:"", summary:"all reported residuals out-of-scope, deferred to later phase"}.\n` +
      `Otherwise commit the fix batch as: "${COMMIT_PREFIX}rebrand: ${phaseLabel} audit fixes (cycle ${cycle})". Return JSON {filesChanged, commitSha, summary}.`,
      { label: `fix:${phaseLabel}:cycle${cycle}`, phase: `${phaseLabel} audit`, schema: PHASE_RESULT_SCHEMA }
    )
  }
}


// --- Dry-run flag: presence of .claude/state/dry-run.flag → DRY_RUN=true ---
const dryRunCheck = await agent(
  `Check if file .claude/state/dry-run.flag exists. Use: test -f .claude/state/dry-run.flag && echo true || echo false. Return JSON {dryRun: <true|false>}.`,
  { label: 'dry-run-check', schema: { type: 'object', required: ['dryRun'], properties: { dryRun: { type: 'boolean' } } } }
)
const DRY_RUN = !!dryRunCheck?.dryRun
const COMMIT_PREFIX = DRY_RUN ? '[DRY-RUN] ' : ''
log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`)

const P6_FIX_SCHEMA = {
  type: 'object',
  required: ['verdict', 'fixedCount', 'remainingFailures', 'bucketTally', 'notes'],
  properties: {
    verdict: { enum: ['PROGRESS', 'DONE', 'BLOCKED'] },
    fixedCount: { type: 'integer' },
    remainingFailures: { type: 'integer' },
    bucketTally: {
      type: 'object',
      properties: { A: {type:'integer'}, B: {type:'integer'}, C: {type:'integer'}, D: {type:'integer'} }
    },
    notes: { type: 'string' },
  },
}

// ---------------- Phase 1 ----------------
phase('P1 metadata')
const p1 = await agent(
  `${CONTRACT}\n\nPHASE 1 — Package metadata. Edit ONLY pyproject.toml:\n` +
  `- Change [project] name from "hermes-agent" to "teamhermes".\n` +
  `- In every dependency-extras list, change "hermes-agent[xxx]" to "teamhermes[xxx]" (all ~15 occurrences across lines 141-211).\n` +
  `- In [project.scripts]: hermes = ... → thm = ...; hermes-agent = ... → thm-agent = ...; hermes-acp = ... → thm-acp = ...\n` +
  `DO NOT touch: project authors, license, urls, dependencies referring to upstream packages, py-modules list (those are import names), packages.find include list.\n` +
  `After editing, run: git add pyproject.toml && git commit -m "${COMMIT_PREFIX}rebrand: P1 package metadata (teamhermes, thm/thm-agent/thm-acp)".\n` +
  `Return JSON {filesChanged, commitSha, summary}.`,
  { label: 'p1:metadata', schema: PHASE_RESULT_SCHEMA }
)
log(`P1: ${p1?.summary}`)
await runAudit('P1', 'pyproject.toml is well-formed; name=teamhermes; scripts thm/thm-agent/thm-acp present; no remaining "hermes-agent" self-references in extras')

// ---------------- Phase 2 ----------------
phase('P2 home dir')
const P2_SUBTREES = [
  'hermes_cli', 'hermes_state', 'gateway', 'tui_gateway',
  'tools', 'docs', 'website', 'tests', 'scripts',
  'misc:everything else (acp_adapter agent assets cron datagen-config-examples docker infographic locales nix optional-mcps optional-skills packaging plans plugins providers skills ui-tui web and repo-root files like *.md *.toml *.sh *.yaml — EXCLUDE all dirs already covered by other P2 agents)'
]
const p2Results = await parallel(P2_SUBTREES.map(sub => () => agent(
  `${CONTRACT}\n\nPHASE 2 — Default home directory. Replace path literal ".hermes" → ".teamhermes" in your assigned subtree ONLY: ${sub}.\n` +
  `Match: Path.home() / ".hermes", "~/.hermes", "$HOME/.hermes", "${'${HOME}'}/.hermes", os.path.expanduser("~/.hermes"), pathlib refs to .hermes.\n` +
  `CRITICAL: Do NOT touch any of these (they are different mappings or whitelisted):\n` +
  `  - HERMES_HOME and other HERMES_* env vars\n` +
  `  - hermes_* module names (hermes_cli, hermes_constants, hermes_state, hermes_logging, hermes_bootstrap, hermes_time)\n` +
  `  - Hermes* identifiers (get_hermes_home, HermesHome, HermesCLI, etc.)\n` +
  `  - .hermes_history, .hermes_build_sha, .hermes_sync.* (Phase 3 handles these)\n` +
  `  - LICENSE, NOTICE, RELEASE_v*.md, anything under docker/s6-rc.d/main-hermes/, .claude/, .venv/, .git/, node_modules/, __pycache__/, *.egg-info/\n` +
  `Use rg to find candidates, then Edit each carefully. Do NOT commit (the coordinator commits all P2 results together).\n` +
  `Return JSON {filesChanged, commitSha:"", summary:"<subtree>: <count> edits"}.`,
  { label: `p2:${sub.split(':')[0]}`, phase: 'P2 home dir', schema: PHASE_RESULT_SCHEMA }
)))
const p2Total = p2Results.filter(Boolean).reduce((s, r) => s + (r.filesChanged || 0), 0)
log(`P2: ${p2Total} files edited across ${p2Results.filter(Boolean).length} subtrees — committing`)
await agent(
  `Run: git add -A && git diff --cached --stat | tail -1 && git commit -m "${COMMIT_PREFIX}rebrand: P2 default home dir .hermes -> .teamhermes (subtree parallel pass)" || echo "nothing to commit". Return JSON {filesChanged:0, commitSha:"<sha or empty>", summary:"P2 subtree commit"}.`,
  { label: 'p2:commit', phase: 'P2 home dir', schema: PHASE_RESULT_SCHEMA }
)

// P2 finalize sweep — parallel subtree agents reliably miss many \.hermes\b hits
// when the subtree has 100+ candidates (they sample and stop, no convergence pressure).
// Run a deterministic Python batch-replace as a safety net BEFORE the audit gate.
await agent(
  `${CONTRACT}\n\nPHASE 2 FINALIZE SWEEP — deterministic batch replace for any \\.hermes\\b path literals the parallel subtree agents missed. Use the script .claude/scripts/p2-sweep.py (already in repo). If the script does not exist, create it with the canonical content from .claude/skills/rebrand-from-scratch.md "Phase 2 finalize sweep" section.\n\n` +
  `Run: \`python .claude/scripts/p2-sweep.py | tee .claude/state/p2-sweep.log\` and read the total line.\n` +
  `Commit: \`git add -A && git commit -m "${COMMIT_PREFIX}rebrand: P2 finalize sweep (deterministic batch replace)" || echo "nothing to commit"\`.\n` +
  `Return JSON {filesChanged: <count from script>, commitSha: "<sha or empty>", summary: "P2 sweep: <count> files batch-replaced"}.`,
  { label: 'p2:finalize-sweep', phase: 'P2 home dir', schema: PHASE_RESULT_SCHEMA }
)

await runAudit('P2', 'residual \\.hermes\\b path literals only in whitelist-allowed contexts (LICENSE/NOTICE/RELEASE_v*.md, test fixtures, docker/s6-rc.d/main-hermes/, .hermes_history/_build_sha/_sync.* deferred to P3)')

// ---------------- Phase 3 ----------------
phase('P3 artifacts')
const p3 = await agent(
  `${CONTRACT}\n\nPHASE 3 — Home dir artifacts. Three deterministic global renames:\n` +
  `  .hermes_history → .teamhermes_history\n` +
  `  .hermes_build_sha → .teamhermes_build_sha\n` +
  `  .hermes_sync.<anything> → .teamhermes_sync.<anything>\n` +
  `Use rg to find all occurrences across the repo (skip .git/, .venv/, node_modules/, __pycache__/, *.egg-info/, .claude/, docker/s6-rc.d/main-hermes/, LICENSE, NOTICE, RELEASE_v*.md). Edit each file. ~12 files expected.\n` +
  `Commit: git add -A && git commit -m "${COMMIT_PREFIX}rebrand: P3 home dir artifacts (.hermes_history etc.)".\n` +
  `Return JSON {filesChanged, commitSha, summary}.`,
  { label: 'p3:artifacts', schema: PHASE_RESULT_SCHEMA }
)
log(`P3: ${p3?.summary}`)
await runAudit('P3', 'no remaining .hermes_history / .hermes_build_sha / .hermes_sync. literals outside the whitelist')

// ---------------- Phase 4 ----------------
phase('P4 brand+CLI')
const P4_SUBTREES = [
  'docs/part1', 'docs/part2', 'docs/part3', 'docs/part4',
  'website/part1', 'website/part2', 'website/part3', 'website/part4',
  'tests', 'hermes_cli', 'gateway', 'tools', 'tui_gateway', 'scripts', 'docker',
  'misc:everything else (acp_adapter agent assets cron infographic locales nix optional-mcps optional-skills packaging plans plugins providers skills ui-tui web AND repo-root files like README.md CONTRIBUTING.md *.toml *.sh — EXCLUDE LICENSE NOTICE RELEASE_v*.md and dirs already covered by other P4 agents)',
]
const p4Results = await parallel(P4_SUBTREES.map(sub => () => agent(
  `${CONTRACT}\n\nPHASE 4 — Brand string + CLI command in text. Apply BOTH sub-rules to your assigned subtree ONLY: ${sub}.\n` +
  `For docs/partN and website/partN: split alphabetically (part1=a-g, part2=h-m, part3=n-s, part4=t-z by top-level filename in that directory).\n\n` +
  `4a — User-facing brand: standalone word "Hermes" → "TeamHermes" (regex \\bHermes\\b). User-facing strings, docs, i18n, comments, docstrings, markdown.\n\n` +
  `4b — CLI command in text: "hermes <subcommand>" → "thm <subcommand>" in docs/shell/python-strings/docker/systemd. Pattern: \\bhermes\\b followed by space+subcommand, or other clearly-CLI contexts (\`hermes run\`, \`hermes config ...\`, \`hermes-acp\` → \`thm-acp\`).\n\n` +
  `Also in scope for this phase (relevant files in your subtree only):\n` +
  `  - hermes_cli/skin_engine.py: agent_name/welcome/response_label → TeamHermes (if your subtree is hermes_cli)\n` +
  `  - install.sh, setup-hermes.sh, setup_open_webui.sh (if in scripts/): command shims, output messages, temp file prefixes (thm-* not hermes-*)\n` +
  `  - docker-compose*.yml container names hermes → thm (NOT docker user name, NOT /opt/hermes, NOT main-hermes service dir)\n` +
  `  - systemd unit files: hermes.service → thm.service\n` +
  `  - TypeScript/i18n brand strings in website/ui-tui/web\n\n` +
  `CRITICAL — do NOT change any of these even though they match:\n` +
  `  - NousResearch/hermes-agent URL (full URL must remain intact, including markdown links)\n` +
  `  - Model names: Nous Hermes, Hermes-3, Hermes-4, nousresearch/hermes-*\n` +
  `  - Python identifiers: hermes_cli/hermes_constants/hermes_state/hermes_logging/hermes_bootstrap/hermes_time and all Hermes* class/function names\n` +
  `  - HERMES_* env vars\n` +
  `  - LICENSE, NOTICE, RELEASE_v*.md — SKIP these files entirely\n` +
  `  - docker user 'hermes' in Dockerfile, /opt/hermes paths, docker/s6-rc.d/main-hermes/\n` +
  `  - test fixtures: test_openclaw_migration.py, test_dingtalk.py, test_matrix_mention.py — SKIP entirely\n` +
  `  - acp_registry markdown brand mentions of upstream\n` +
  `  - SKILL.md files referencing upstream\n\n` +
  `Use rg to find candidates. Be careful with \\bhermes\\b — many matches are identifiers (hermes_cli.x) which you must NOT touch; only edit text/string/doc contexts.\n` +
  `Do NOT commit; the coordinator commits all P4 results.\n` +
  `Return JSON {filesChanged, commitSha:"", summary:"<subtree>: <count> edits"}.`,
  { label: `p4:${sub.replace(/[/:].*/, '').slice(0, 16)}`, phase: 'P4 brand+CLI', schema: PHASE_RESULT_SCHEMA }
)))
const p4Total = p4Results.filter(Boolean).reduce((s, r) => s + (r.filesChanged || 0), 0)
log(`P4: ${p4Total} files edited across ${p4Results.filter(Boolean).length} subtrees — committing`)
await agent(
  `Run: git add -A && git diff --cached --stat | tail -1 && git commit -m "${COMMIT_PREFIX}rebrand: P4 brand string Hermes -> TeamHermes and CLI hermes -> thm" || echo "nothing to commit". Return JSON {filesChanged:0, commitSha:"<sha or empty>", summary:"P4 commit"}.`,
  { label: 'p4:commit', phase: 'P4 brand+CLI', schema: PHASE_RESULT_SCHEMA }
)

// P4 finalize sweep — parallel subtree agents miss the bulk of \bHermes\b
// brand-word, backtick-quoted `hermes <cmd>` CLI references, and argparse
// prog="hermes". E2E v4 proved that without this, P4 audit takes 5-6 cycles
// (~50 minutes) classifying mechanical residuals one-by-one. The script
// applies the same WHITELIST-aware filters CLAUDE.md prescribes (Nous Hermes
// model names, NousResearch URLs, hermes-agent repo refs, providers/base.py
// UA, refs/hermes git namespace, HERMES_* identifiers — all preserved).
await agent(
  `${CONTRACT}\n\nPHASE 4 FINALIZE SWEEP — deterministic batch replace for mechanical brand/CLI residuals so the audit gate doesn't spend 5+ cycles on them. Use .claude/scripts/p4-sweep.py (already in repo).\n\n` +
  `Run: \`python .claude/scripts/p4-sweep.py | tee .claude/state/p4-sweep.log\` and read the TOTAL line.\n` +
  `Commit: \`git add -A && git commit -m "${COMMIT_PREFIX}rebrand: P4 finalize sweep (deterministic batch replace)" || echo "nothing to commit"\`.\n` +
  `Return JSON {filesChanged: <count from script>, commitSha: "<sha or empty>", summary: "P4 sweep: <count> files batch-replaced"}.`,
  { label: 'p4:finalize-sweep', phase: 'P4 brand+CLI', schema: PHASE_RESULT_SCHEMA }
)

await runAudit('P4', 'full whitelist audit per CLAUDE.md: \\bHermes\\b residuals only in whitelist contexts; \\bhermes\\b in text only where the whitelist allows; all preserved identifiers/URLs/env vars still present')

// ---------------- Phase 5 ----------------
phase('P5 argparse+report')
const p5 = await agent(
  `${CONTRACT}\n\nPHASE 5 — Argparse + final report.\n` +
  `Step A: rg 'prog\\s*=\\s*["\\']hermes' -t py to find every argparse prog= literal. Replace prog="hermes" → prog="thm" and prog="hermes-acp" → prog="thm-acp" (~7 files).\n` +
  `Step B: Write REBRAND_REPORT.md at repo root with sections:\n` +
  `  # TeamHermes Rebrand Report — v2026.5.29.2\n` +
  `  ## Source\n  - Upstream tag: v2026.5.29.2\n  - Branch: rebrand-v2026.5.29.2\n` +
  `  ## Phase summary (files changed)\n  - P1 metadata: 1 (pyproject.toml)\n  - P2 home dir: <p2 count>\n  - P3 artifacts: <p3 count>\n  - P4 brand+CLI: <p4 count>\n  - P5 argparse: <p5 count>\n` +
  `  ## Whitelist verified preserved\n  - [x] NousResearch/hermes-agent URL\n  - [x] hermes_* Python modules\n  - [x] Hermes* class/function names\n  - [x] HERMES_* env vars\n  - [x] LICENSE / NOTICE unchanged\n  - [x] RELEASE_v*.md unchanged\n  - [x] docker user hermes, /opt/hermes, docker/s6-rc.d/main-hermes/\n  - [x] test fixtures in test_openclaw_migration.py, test_dingtalk.py, test_matrix_mention.py\n` +
  `  ## Smoke + tests\n  - (to be filled by smoke-tester; leave placeholders for now)\n\n` +
  `Use the actual git stats from the prior commits to fill counts where possible (git show --stat HEAD~4..HEAD).\n` +
  `Commit: git add -A && git commit -m "${COMMIT_PREFIX}rebrand: P5 argparse prog + final report".\n` +
  `Return JSON {filesChanged, commitSha, summary}.`,
  { label: 'p5:argparse+report', schema: PHASE_RESULT_SCHEMA }
)
log(`P5: ${p5?.summary}`)
await runAudit('P5', 'full whitelist audit AND no remaining prog="hermes" / prog="hermes-acp" in any *.py')

// ---------------- P6 Smoke + tests + CI sweep ----------------
phase('P6 Smoke + tests + CI sweep')
const smoke = await agent(
  `Run the smoke-tester procedure exactly as documented in your agent definition. Write .claude/state/smoke-report.md. ` +
  `Return JSON via StructuredOutput: { verdict: "PASS"|"FAIL", passed: <int>, failed: <int>, skipped: <int>, newRegressions: <int>, notes: "<short>" }.`,
  {
    label: 'smoke',
    agentType: 'smoke-tester',
    schema: {
      type: 'object',
      required: ['verdict', 'passed', 'failed', 'skipped', 'newRegressions', 'notes'],
      properties: {
        verdict: { enum: ['PASS', 'FAIL', 'BLOCKED'] },
        passed: { type: 'integer' },
        failed: { type: 'integer' },
        skipped: { type: 'integer' },
        newRegressions: { type: 'integer' },
        notes: { type: 'string' },
      },
    },
  }
)
log(`Smoke verdict: ${smoke?.verdict} (${smoke?.passed}P / ${smoke?.failed}F / ${smoke?.skipped}S, ${smoke?.newRegressions} new regressions)`)

if (smoke?.verdict === 'PASS' && smoke?.newRegressions === 0) {
  log('P6 smoke green, no failures — skipping sweep')
} else if (smoke?.verdict === 'BLOCKED') {
  throw new Error(`P6 smoke BLOCKED: ${smoke?.notes}`)
} else {
  const MAX_SWEEP_CYCLES = 16
  let lastRemaining = -1
  let stallStreak = 0
  for (let cycle = 1; cycle <= MAX_SWEEP_CYCLES; cycle++) {
    const fix = await agent(
      `${CONTRACT}\n\nP6 CI sweep — cycle ${cycle}/${MAX_SWEEP_CYCLES}.\n` +
      `Read .claude/state/failures.list (current remaining failures only — do NOT re-run full pytest).\n` +
      `Also read .claude/state/p6-resume.list if it exists (items the orchestrator already handled — SKIP these).\n` +
      `Follow the Phase 6 procedure in .claude/skills/rebrand-from-scratch.md exactly: classify each failure into Bucket A/B/C/D, apply the targeted fix, re-run that single test to verify, then re-run the remaining failures-list to update .claude/state/failures.list.\n` +
      (DRY_RUN
        ? `DRY-RUN MODE: do NOT edit files, do NOT commit. Instead write .claude/state/p6-plan.md with one section per failure: {bucket, target_file, proposed_fix_summary}. Return JSON with fixedCount:0, remainingFailures:<initial count>, verdict:"DONE".\n`
        : `Commit the batch as: "${COMMIT_PREFIX}rebrand: P6 CI-sweep cycle ${cycle} (bucket tally A/B/C/D)".\n`) +
      `Return JSON {verdict, fixedCount, remainingFailures, bucketTally:{A,B,C,D}, notes}.`,
      { label: `p6-fix:cycle${cycle}`, phase: 'P6 sweep', agentType: 'rebrand-fixer', schema: P6_FIX_SCHEMA }
    )

    if (DRY_RUN) { log(`P6 dry-run: ${fix?.remainingFailures} failures classified into plan`); break }
    if (fix?.verdict === 'DONE' || fix?.remainingFailures === 0) { log(`P6 sweep DONE on cycle ${cycle}`); break }
    if (fix?.verdict === 'BLOCKED') {
      await agent(
        `Write .claude/state/p6-resume.list with the current contents of .claude/state/failures.list, prefixed with a header line "# BLOCKED at cycle ${cycle}: ${fix?.notes}". Return JSON {filesChanged:1, commitSha:"", summary:"resume list written"}.`,
        { label: 'p6-blocked', schema: PHASE_RESULT_SCHEMA }
      )
      throw new Error(`P6 sweep BLOCKED at cycle ${cycle}: ${fix?.notes}. See .claude/state/p6-resume.list for orchestrator handoff.`)
    }
    if (fix?.remainingFailures === lastRemaining) {
      stallStreak++
      if (stallStreak >= 3) throw new Error(`P6 sweep stalled: ${fix?.remainingFailures} failures unchanged across 3 cycles`)
    } else { stallStreak = 0; lastRemaining = fix?.remainingFailures ?? -1 }
    if (cycle === MAX_SWEEP_CYCLES) throw new Error(`P6 sweep exhausted ${MAX_SWEEP_CYCLES} cycles, ${fix?.remainingFailures} failures remain`)
  }
}

// ---------------- Handoff state ----------------
await agent(
  `Update .claude/state/upstream-tag to contain exactly: v2026.5.29.2\n` +
  `Write .claude/state/rebrand-report.md with a phase-by-phase summary including audit cycle counts and the smoke verdict (${smoke?.verdict}, ${smoke?.passed}/${smoke?.failed}/${smoke?.skipped}). Do not commit these state files.\n` +
  `Return JSON {filesChanged, commitSha:"", summary:"handoff state written"}.`,
  { label: 'handoff', schema: PHASE_RESULT_SCHEMA }
)

if (DRY_RUN) {
  await agent(
    `Write .claude/state/dry-run-summary.md listing every commit on this branch with subject starting "[DRY-RUN]" (use: git log --grep='^\\[DRY-RUN\\]' --oneline). Add at the end: "To revert: git reset --hard v2026.5.29.2". Return JSON {filesChanged:1, commitSha:"", summary:"dry-run summary written"}.`,
    { label: 'dry-run-summary', schema: PHASE_RESULT_SCHEMA }
  )
}

return {
  upstreamTag: 'v2026.5.29.2',
  branch: 'rebrand-v2026.5.29.2',
  smoke: smoke,
  ready: smoke?.verdict === 'PASS',
}
