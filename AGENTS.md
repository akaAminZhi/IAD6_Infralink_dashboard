# Codex Project Instructions

## Start here

Inspect `git status` first and preserve existing uncommitted changes. Trace the
affected path from the normal entry point through the rule or side effect to its
consumers. Check nearby tests and helpers before editing.

- Setup, launch, refresh, or test commands → [README](README.md).
- Resuming work or investigating a recent change → [handoff](CODEX_HANDOFF.md).
- Matching, readiness, issue counts, or other business rules → [rule ownership](ARCHITECTURE.md#rule-ownership).
- ETL or generated data changes → [system flow](ARCHITECTURE.md#system-flow)
  and [data contracts](ARCHITECTURE.md#contract-changes).
- Data Operations jobs, writes, or auth → [automation backend](ARCHITECTURE.md#automation-backend),
  [authorization](ARCHITECTURE.md#authentication-and-authorization), and
  [runner.py](scripts/automation/runner.py). Follow the [operator guide](docs/DATA_OPERATIONS.md)
  when running a workflow.

## Implementation

- Keep changes in the owning path and necessary callers. Check that existing
  helpers match the intended inputs and semantics before extending them. Give
  each business decision one implementation per runtime. Use equivalent cases
  in Python and TypeScript tests when both implement the rule. Extract a helper
  when it names a business decision or has real callers.
- Keep calculations pure. Pass in evidence, policy, and time when they affect
  the result. Keep reads, writes, and subprocesses at their owning boundaries.
  Derive React rows and totals from loaded data and current selections.
- Preserve missing, empty, and false as distinct contract states. Report
  expected failures at the owning boundary with actionable context.
- For writes and jobs, identify what stays saved if publication fails. Reuse
  locks, revision checks, and resume or refresh entry points so retries avoid
  repeating completed mutations.
- Preserve strict TypeScript and shared React, Tailwind, and Lucide patterns.
  Follow nearby Python type hints, pathlib, and module/script import fallbacks.
- Reuse `load_records_json` and `unwrapRecords` for bare arrays and record
  envelopes. Use `scripts/etl/json_utils.py` for single-file JSON writes.
  For contract changes, update producers, schemas, types, loaders, consumers,
  and tests together. Verify old and new formats and regenerate local outputs
  when inputs are available.

## Project constraints

- Preserve PDM → equipment → cases, plus unmatched and ambiguous records for
  diagnostics. Carry `issue_image` and `corrective_images` through to consumers.
- Report missing evidence through Data Quality, including a missing report
  alongside explicit NETA completion. Follow the rule map for tracking
  exclusions and the distinction between lifecycle inventory and cumulative totals.
- Keep FastAPI on loopback. Require server-side operator authorization for
  operations and preserve owner checks and direct-loopback restrictions.
  Run only jobs registered in `scripts/automation/runner.py`. A live CxAlloy
  upload requires explicit confirmation.
- Keep raw exports, generated datasets, downloaded reports, logs, browser
  auth state, credentials, tokens, and environment files out of commits.

## Local environment and verification

- Use conda base for Python, pytest, pip, Playwright, and debugging. On this
  workstation use `C:\anaconda3\python.exe` when `python` is ambiguous. On
  other machines resolve base with `conda info --base` or use
  `conda run -n base python`. Reuse installed packages and browsers.
- Use base Playwright when browser control is unavailable. When a provider
  requires the user's sign-in, notify them and open a visible browser.
- Run the narrowest relevant tests first and verify the normal entry point.
  Build after frontend code or contract changes. Add a focused regression
  when existing coverage misses the change. Compare behavior-preserving
  transformations on identical inputs, allowing for run metadata. Cover legacy,
  missing, ambiguous, and retry paths where applicable.
- Review the diff for duplicate logic, dead code, and unrelated changes.
  Report checks actually run and any blocked verification. Update the owning
  document when its facts change.
