# .agents (dotagents)

Multi-agent orchestration toolkit for Claude Code. Deploys agent configs into a project directory, then coordinates
subagents that implement, review, and close tickets in parallel git worktrees.

## Prerequisites

- [just](https://github.com/casey/just) -- command runner
- [GNU stow](https://www.gnu.org/software/stow/) -- symlink manager
- [tk](https://github.com/snapwich/tk) -- git-backed ticket CLI (must be in PATH)
- git, Node.js, pnpm

## Setup

```sh
# Initialize a project
just init ../my-project
```

This stows agent configs, commands, and rules into the target directory, sets up the ticket system, and installs
linting/formatting tooling.

## Usage

```sh
cd ../my-project

# Break a plan into features and tasks
# (from within the project, using Claude Code)
/tk:plan-features path/to/plan.md

# Review ticket structure before starting
just verify-tickets          # checks linear chains, architect-review tags, deps
tk tree                      # visual overview of features → tasks
tk plan                      # execution plan — shows what will run and in what order

# Run the orchestration loop
just start-work
```

The orchestrator picks up ready tickets, launches coder/reviewer subagents in worktrees, and reacts to their signals
until all work is complete or a blocker needs human attention.

### Pre-flight checklist

Before running `just start-work`, verify:

1. **`just verify-tickets`** passes — catches structural issues (non-linear chains, missing architect-review tags,
   cross-feature task deps) that would cause the orchestrator to misbehave
2. **`tk plan`** looks right — shows the execution order and parallelism; confirm features and task chains match your
   intent
3. **`tk ready`** shows expected first tasks — these are what the orchestrator will pick up immediately

## Exit Codes

| Code | Meaning                                                  |
| ---- | -------------------------------------------------------- |
| 0    | All work complete (no open tickets)                      |
| 2    | Escalation or deadlock — check output for details        |
| 3    | All automated work done — features awaiting human review |
| 130  | Interrupted (Ctrl-C)                                     |

## Human Review Flow

When the orchestrator exits with code 3, features are ready for human review:

```sh
# Review the feature branch
just worktree-list            # find the worktree location
cd <repo>/<worktree>          # inspect the code

# Approve a feature (validates all tasks closed, then closes feature)
just approve <feature-id>

# Or request changes (reopens architect-review task for rework)
just request-changes <feature-id> "Fix error handling in auth module"
```

After `request-changes`, run `just start-work` again to begin the rework cycle.

## Stacked Features

When features depend on each other (stacked branches), use `just deps` to see the merge order:

```sh
# Show worktrees in dependency order (merge leaves first, roots last)
just deps
```

This helps you merge PRs in the correct order — start from the leaves (no dependents) and work toward the roots.

After merging an upstream feature, rebase downstream branches:

```sh
# Rebase a downstream feature onto its updated base
just rebase-feature <downstream-feature-id>
```

This rebases the downstream worktree onto the updated base. If conflicts occur, a rebaser agent resolves them
automatically when possible.

To trigger rework after an API change in upstream:

```sh
just rebase-feature <feature-id> "API changed: method() now takes Options object"
```

This rebases AND reopens the architect-review task for the coder to update call sites.

## Useful Commands

```sh
# Pre-flight
just verify-tickets          # Validate ticket structure before running orchestrator
tk tree                      # Show full ticket hierarchy
tk plan                      # Show execution plan (order, parallelism, deps)
tk ready                     # Show tickets ready to be worked on

# During orchestration
just watch                   # Interactive session watcher (fzf-based)
just ls                      # Show repos and their worktrees (alias: just worktree-list)

# After orchestration
just approve <feature-id>    # Validate and close a feature
just request-changes <id> "feedback"  # Reopen for rework
just deps                    # Show merge order for stacked features (alias: worktree-deps)
just rebase-feature <id>     # Rebase a stacked feature after upstream merges
```

## Configuration

Environment variables for tuning the orchestrator:

| Variable            | Default | Description                       |
| ------------------- | ------- | --------------------------------- |
| `TK_MAX_CONCURRENT` | 3       | Max concurrent subagents          |
| `TK_AGENT_TIMEOUT`  | 1800    | Agent timeout in seconds (30 min) |

## Details

See [CLAUDE.md](CLAUDE.md) for architecture, agent roles, ticket lifecycle, and design decisions.
