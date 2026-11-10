# Claude Code Project Instructions

This repo is edited by both Claude Code and Codex. `AGENTS.md` is the single
source of truth for project conventions, commands, and non-negotiable rules.
Do not duplicate its content here; edit `AGENTS.md` instead so the two tools
never drift.

@AGENTS.md

## Claude-Specific Notes

- Where `AGENTS.md` says "Codex" (e.g. `CODEX_HANDOFF.md`), the same applies to
  Claude: read the handoff file for current work, and update it when leaving
  work in progress for the other tool.
- Both tools may have left uncommitted changes. Check `git status` first and
  never revert changes you did not make.
- Use the Windows PowerShell commands listed in `AGENTS.md`; Python runs from
  conda base (`C:\anaconda3\python.exe`).
