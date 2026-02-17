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
/tk:create-features path/to/plan.md

# Run the orchestration loop
just start-work
```

The orchestrator picks up ready tickets, launches coder/reviewer subagents in worktrees, and reacts to their signals
until all work is complete or a blocker needs human attention.

## Details

See [CLAUDE.md](CLAUDE.md) for architecture, agent roles, ticket lifecycle, and design decisions.
