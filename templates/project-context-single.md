# Project Layout

This directory is a **jr-managed project root**, not a git repository. Do not run git commands here.

## Structure

- `default/` — main branch checkout. **This is the git repository.**
- `feat-*-*/` — feature worktrees, siblings of `default/`. Each is an independent git working tree.
- `.jr/` — ticket system (`tk`), plans, tooling config
- `.claude/` — agent configs (managed by jr)
- `justfile` — recipes for worktree and agent management

## Key Rules

- Run git commands inside `default/` or a feature worktree, never in this directory.
- Use `just ls` to see all worktrees and their branches.
- Use `just create-worktree <name>` to create a worktree.
