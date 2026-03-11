# Project-Level Agent Extensions

This directory is deployed to `<project>/.agents/claude/` via stow. Extensions live at:

- `<project>/.agents/claude/_/...` for project-wide extensions
- `<project>/.agents/claude/<repo>/...` for repo-specific extensions

This directory contains project-specific extensions for tk subagents.

## Structure

- `_/agents/tk/<agent>.md` — Agent extensions (appended at worktree creation)
- `_/prompts/tk/subagent-task.md` — Prompt extension for ALL subagents (appended at runtime)
- `_/rules/*.md` — Additional rules (copied to worktree)
- `<repo>/...` — Repo-specific extensions (same structure)

## What Can Be Extended/Added

| Type             | When Applied           | Notes                                      |
| ---------------- | ---------------------- | ------------------------------------------ |
| Agents           | Worktree creation      | Appended to base agent                     |
| Commands         | Worktree creation      | Appending to base command                  |
| subagent-task.md | Runtime (orchestrator) | Appended — applies to ALL subagents        |
| Rules            | Worktree creation      | Copied — no base to extend, just new rules |

## Usage

Extensions are pure markdown (no frontmatter).

Example `_/prompts/tk/subagent-task.md` (applies to all subagents):

````markdown
## Project-Specific: Shared Resources

When running integration or e2e tests, wrap with lock:

```bash
just with-lock app-server pnpm test:integration amx -b
```
````
