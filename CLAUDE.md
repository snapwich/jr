# .agents (dotagents)

Stow-based toolkit for deploying AI agent configs into project directories. Orchestrates multi-agent workflows where
Claude subagents work on `tk` tickets in git worktrees.

**Intended flow:** `just init` a project → break down work into tk tickets (epics/tasks) → run agentic loop that assigns
subagents to tickets via worktrees → results aggregated and user notified.

## Design Goals

**Intentional context isolation.** Each subagent starts with minimal, focused context — just the ticket and its notes.
This is deliberate, not a limitation to work around:

- **Workers** perform better with scoped context. A focused ticket with clear instructions avoids the failure mode where
  an agent gets distracted by tangentially related code or tries to "improve" things outside scope. Tickets should be
  broken down to simple, clear instructions.
- **Reviewers** must come in fresh. If a reviewer has the implementor's full reasoning, it's more likely to rubber-stamp
  the solution rather than evaluate the result independently. Fresh context means the reviewer only agrees with the
  implementation if it arrives at a similar conclusion on its own.
- **Handoff via ticket notes.** Workers log decisions, steps taken, and rationale as ticket notes during work. When a
  ticket changes hands (implementation → review → revision), the incoming agent reads the ticket description + notes +
  the actual code in the worktree. This is intentionally lossy — it preserves what matters (decisions, rationale,
  specific feedback) without biasing toward a particular approach.

**Orchestrator as tech lead, not a bash loop.** The orchestrator is an LLM agent (sonnet) rather than a script. The
hypothesis is that an agent can exercise judgment a loop cannot: identifying issues early before subagents waste effort,
adapting to unexpected failures, keeping workers aligned toward the common goal across a long-running session, and
deciding when to intervene vs let things proceed. A known risk is the orchestrator being too creative — retrying things
it shouldn't or making hard-to-debug coordination decisions. Sonnet on bash-only mitigates this, and structured status
reporting keeps decisions auditable. If the orchestrator mostly just runs `tk ready` and launches subagents
mechanically, it should be demoted to a script.

**Early issue detection.** A key motivation is avoiding the failure mode of existing long-running loops that do too much
work before surfacing problems. The orchestrator should catch issues early and surface them to the user rather than
letting subagents grind on a bad path.

## Architecture

### Stow deployment model

`claude/` and `scripts/` are symlinked into a target project via GNU stow. The target project gets Claude agent
definitions, commands, rules, and a `scripts/justfile` for worktree/subagent management.

```text
.agents repo                          target project
─────────────                         ──────────────
claude/.claude/agents/tk/*    ──→     .claude/agents/tk/*
claude/.claude/commands/tk/*  ──→     .claude/commands/tk/*
claude/.claude/rules/tk-*     ──→     .claude/rules/tk-*
scripts/justfile              ──→     justfile (worktree mgmt)
                                      .agents/.tickets/  (git-tracked tickets)
                                      .tickets → .agents/.tickets  (symlink)
```

### Expected project structure

```text
~/
├── .agents/                              # this repo, project created with `just init ../<project>`
│   └── ...
└── <project>/                            # target project
    ├── .agents/
    │   ├── .tickets/                     # git-backed ticket store (tk data)
    │   └── plans/                        # plan documents
    ├── .claude/
    │   ├── agents/tk/
    │   │   ├── coder.md                  # ──→ symlink (stow) — agent definition
    │   │   ├── orchestrator.md           # ──→ symlink (stow) — agent definition
    │   │   └── ...                       # more agents as they're added
    │   ├── commands/tk/
    │   │   ├── subagent-task.md          # ──→ symlink (stow) — slash command
    │   │   ├── create-epic.md            # ──→ symlink (stow) — slash command
    │   │   └── ...                       # more commands as they're added
    │   └── rules/
    │       ├── tk-agents.md              # ──→ symlink (stow) — subagent rules
    │       └── ...                       # more rules as they're added
    ├── .tickets → .agents/.tickets       # symlink so tk can recursively find tickets
    ├── justfile                          # ──→ symlink (stow) — recipes for orchestrator use
    ├── <repo-a>/                           # user-managed git repo
    │   ├── default/                      # main checkout (bare repo worktree)
    │   │   └── .claude/                  # merged copy (if repo has .claude/ committed)
    │   ├── EPIC-123-some-feature/        # worktree — one branch, one eventual PR
    │   │   ├── .claude/                  # merged copy of project .claude/ (see note below)
    │   │   │   ├── agents/tk/            #   tk agent defs (from project-level stow symlinks)
    │   │   │   ├── commands/tk/          #   tk commands (from project-level stow symlinks)
    │   │   │   ├── rules/                #   project rules + tk rules
    │   │   │   └── settings.json         #   project's own settings
    │   │   ├── CLAUDE.md                 #   project's own context
    │   │   ├── src/
    │   │   └── ...
    │   └── EPIC-124-another-feature/     # another worktree, can run in parallel
    │       ├── .claude/
    │       └── ...
    └── <repo-b>/                           # another user-managed git repo
        ├── default/                      # main checkout
        └── EPIC-456-cross-repo-work/     # worktree
            └── ...
```

Claude Code doesn't recursively search parent directories for `.claude/`, so each worktree needs its own copy.
`just create-worktree <repo> <name>` handles this — it copies the project-level `.claude/` into the worktree using
`cp -r --update=none`, which merges without overwriting existing files. This means worktrees get both the stowed tk
configs and any project-specific claude config (rules, settings, CLAUDE.md, etc.).

### No project CLAUDE.md

All universal subagent context goes in `claude/.claude/rules/*` prefixed with `tk-` to avoid clobbering project rules.
Projects provide their own context via their own CLAUDE.md, rules, commands, and skills.

### Ticket system

`tk` CLI is always in PATH — never reference its source location, just use it as a CLI tool. It's a git-backed markdown
ticket tracker. Run `tk` with no args to see available commands.

### Worktree model

Each repo directory (e.g. `repo-a/`) contains a `default/` checkout with sibling worktrees. All justfile recipes take a
`repo` parameter to target the correct repo directory. Generally one worktree per epic (branch + eventual PR). Can be
multiple worktrees/PRs per epic across different repos.

### Task parallelism

Tasks within an epic can run in parallel if their `tk` dependencies allow it. The orchestrator uses `tk ready` to
determine what can be worked on. However, multiple subagents in the same worktree simultaneously risks file conflicts —
the orchestrator should serialize per-worktree even if tasks are technically ready.

### Agent model

- **Orchestrator** (sonnet, bash-only, green) — coordinates workflows, manages tickets, launches subagents
- **Coder** (opus, full tools, orange) — implements tasks, tracks progress via `tk`
- **Reviewer** (TBD) — reviews completed work with fresh context, approves or requests changes

Agent definitions are WIP — initial pass only, need significant work. Need to add reviewer, testing subagents, and
improve existing definitions.

### Review workflow

Review uses ticket notes as the handoff mechanism. The flow for a task:

1. **Coder works** — implements the task, logging decisions and steps as `tk` notes along the way
2. **Coder finishes** — reassigns the ticket to the reviewer agent (ticket stays `in_progress`)
3. **Reviewer picks up** — reads ticket description, notes, and reviews the code in the worktree with fresh context (no
   implementation bias)
4. **If approved** — reviewer marks ticket as `done`
5. **If changes requested** — reviewer leaves detailed feedback as a note, reassigns back to coder. A new coder subagent
   picks it up with the ticket description + all accumulated notes (implementation notes + review feedback) + the
   current code state. The review note should be specific and concrete enough that a fresh agent can act on it without
   the original implementation context.

This intentionally discards implementation context on revision — the coder reads the review feedback alongside the
actual code and makes targeted changes, rather than defending the original approach.

### Subagent launching

`just start-subagent <repo> <worktree> <ticket-id>` reads the ticket's assignee via `tk query`, substitutes the ticket
ID into `subagent-task.md`, and launches `claude --agent <agent> -p <prompt>` in the `<repo>/<worktree>/` directory.

### Worktree notes

Each task tracks its assigned worktree via a `tk` note in a standard greppable format:

```text
worktree: <repo>/<worktree-name>
```

The orchestrator checks `tk show <ticket-id> | grep '^worktree:'` before creating a worktree. If a note exists, it
reuses that worktree; otherwise it creates one and records it with `tk note`. This is per-task, not per-epic — a single
epic may span multiple worktrees (e.g. cross-repo work), and looking up a parent epic on every `tk ready` result would
be expensive.

## Directory Structure

```text
justfile                              # main entry point — `just init <dir>`
claude/.claude/
  agents/tk/
    coder.md                          # coder agent definition (opus, full tools)
    orchestrator.md                   # orchestrator agent definition (sonnet, bash-only)
  commands/tk/
    subagent-task.md                  # slash command: work on a ticket by ID (works)
    create-epic.md                    # slash command: break down work into epics/tasks (empty — TODO)
  rules/
    tk-agents.md                      # behavioral rules for subagents
scripts/
  justfile                            # worktree/subagent recipes (create-worktree, remove-worktree, start-subagent)
.husky/pre-commit                     # runs lint-staged on commit
package.json                          # dotagents — prettier + lint-staged dev deps
.prettierrc.yml                       # 120 char width, proseWrap: always for markdown
.markdownlint.yaml                    # no line-length rule, no first-line-heading rule
```

## Current State

### Built

- `just init <dir>` — creates `.agents/.tickets`, `.agents/plans`, inits git, stows configs, creates `.tickets` symlink
- `scripts/justfile` — `create-worktree`, `remove-worktree`, `start-subagent` recipes (all take a `repo` parameter)
- Agent definitions (coder, orchestrator) — initial pass, need significant work
- `subagent-task.md` command — works on a ticket by ID (used by `just start-subagent`)
- `tk-agents.md` rule — tells subagents to use `tk` and check help for syntax
- Pre-commit hooks (prettier via husky/lint-staged)

### TODO

- **`create-epic.md` command** — currently empty. Slash command to break down plans/issues/GitHub issues/Jira into epics
  → tasks with proper tk dependencies
- **Agentic loop orchestrator** — runs `tk ready`, assigns work to worktrees, starts subagents, aggregates results,
  notifies user on completion or blockers
- **Testing subagents** — unit tester and integration tester agent definitions. Must be generic; project-specific test
  config comes from project context (project CLAUDE.md, rules, skills)
- **Reviewer agent definition** — design decided (see review workflow above), needs implementation
- **Better agent definitions** — current ones are initial pass

## Intended Workflow

1. `just init ../<project>` — deploys agent configs and ticket infrastructure
2. User clones repos as named subdirectories (e.g. `repo-a/`, `repo-b/`), each with `default/` as the main checkout
3. Work comes in as plans (Claude plan mode output), GitHub issues, Jira, etc.
4. User runs `/tk:create-epic` to break work into tk tickets (epics → tasks with dependencies)
5. User runs a command to start the agentic loop
6. Orchestrator: `tk ready` → create/reuse worktrees per repo → start subagents → aggregate → notify user

## Work Breakdown Model

- **Plan** → optional starting point (markdown, GitHub issue, Jira, etc.)
- **Epic** (`type: epic`) ≈ feature ≈ one worktree/branch/PR (usually)
- **Task** (`type: task`, `parent: epic`) ≈ unit of work, parallelizable based on declared tk dependencies

Possible task flow per epic:

1. Write integration/acceptance tests up-front
2. Fork into parallel: implementation tasks + unit test writing (dependency structure TBD)
3. Each completed task goes through the review workflow (coder → reviewer → revision cycle in same worktree)
4. Final review: all commits as a whole, verify integration tests pass
5. PR is ready

## Open Design Questions

- **Task parallelism within a worktree**: Multiple subagents in same worktree risks file conflicts. Likely serialize
  per-worktree even if tasks are ready.
- **Unit test tasks**: Should unit test writing be separate from implementation? Reviewed independently? TBD.
- **Testing subagent genericity**: How much do agent definitions prescribe vs leave to project rules?
- **Cross-repo epics**: Each repo gets its own worktree/branch; ticket metadata tracks the target repo.

## Development Guidelines

- `tk` is always in PATH — use it as a CLI tool, never reference its source
- All subagent context goes in `claude/.claude/rules/*` prefixed with `tk-` (not in a CLAUDE.md)
- Formatting enforced by prettier on commit: 120 char width, `proseWrap: always` for markdown
- Markdown linting via markdownlint (MD013 disabled, MD041 disabled)
- Agent definitions, commands, and rules are the main development surface
- The `init` recipe should be idempotent: safe to run on a fresh project or to deploy new files added since last init

## Testing

No established test plan yet. This is an open question. Possible approaches:

- A dedicated test fixture project (not a real project)
- Integration tests that run `just init` in a temp directory and verify stow output
- Testing subagent behavior against fixture tickets

Do not use `../portfolio` or other real projects as test targets.

## Dependencies

- **tk** — git-backed ticket CLI (always in PATH)
- **GNU stow** — symlink farm manager
- **just** — command runner
- **git** — with worktree support
- **Node.js/pnpm** — for prettier/husky dev tooling only (not runtime)
