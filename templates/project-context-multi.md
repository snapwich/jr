# Project Layout

This directory is a **jr-managed project root**, not a git repository. Do not run git commands here.

## Structure

- `<repo>/default/` — main branch checkout per repo. **These are the git repositories.**
- `<repo>/feat-*-*/` — feature worktrees per repo. Each is an independent git working tree.
- `.jr/` — ticket system (`tk`), plans, tooling config
- `.claude/` — agent configs (managed by jr)
- `justfile` — recipes for worktree and agent management

## Key Rules

- Run git commands inside `<repo>/default/` or a feature worktree, never in this directory or `<repo>/`.
- Use `just ls` to see all repos and their worktrees.
- Recipes that accept a `repo` parameter expect the repo subdirectory name (e.g.,
  `just create-worktree feat-name my-repo`).
