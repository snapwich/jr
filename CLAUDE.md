# .agents (dotagents)

Stow-based toolkit for deploying AI agent configs into project directories. Orchestrates multi-agent workflows where
Claude subagents work on `tk` tickets in git worktrees.

**Intended flow:** `just init` a project → break down work into tk tickets (features/tasks) → run `/tk:orchestrate` →
subagents implement, review, and close tickets → user notified on completion or blockers.

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

**Orchestrator as interactive coordinator.** The orchestrator runs as a slash command (`/tk:orchestrate`) in the user's
interactive Claude session. The user watches it work and can intervene directly. This simplifies observability and
escalation — the user is right there. The orchestrator uses `tk ready` to discover work, launches subagents in the
background, and reacts to their return signals.

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

The toolkit supports two modes depending on whether the project works with one repo or multiple:

**Single-repo mode** — `default/` and worktrees at project root:

```text
~/
├── .agents/                              # this repo
└── <project>/                            # target project (single repo)
    ├── .agents/, .claude/, justfile      # project-level (stowed)
    ├── .tickets → .agents/.tickets
    ├── default/                          # main checkout
    │   └── .claude/                      # merged copy (if repo has .claude/ committed)
    ├── TASK-123-some-feature/            # worktree (one per task)
    │   └── .claude/                      # merged copy of project .claude/
    └── TASK-456-another-task/            # another worktree
```

**Multi-repo mode** — repos are named subdirectories:

```text
~/
├── .agents/                              # this repo
└── <project>/                            # target project (multi-repo)
    ├── .agents/, .claude/, justfile      # project-level (stowed)
    ├── .tickets → .agents/.tickets
    ├── <repo-a>/                         # user-managed git repo
    │   ├── default/                      # main checkout
    │   ├── TASK-123-backend/             # worktree
    │   └── TASK-456-api/
    └── <repo-b>/                         # another repo
        ├── default/
        └── TASK-789-frontend/
```

**Mode detection:** Run `just detect-mode` — returns `single-repo` if `default/` exists at project root, otherwise
`multi-repo`. In single-repo mode, pass `.` as the `repo` parameter to justfile recipes.

Claude Code doesn't recursively search parent directories for `.claude/`, so each worktree needs its own copy.
`just create-worktree <name> [repo]` handles this — it copies the project-level `.claude/` into the worktree using
`cp -r --update=none`, which merges without overwriting existing files. This means worktrees get both the stowed tk
configs and any project-specific claude config (rules, settings, CLAUDE.md, etc.).

### No project CLAUDE.md

All universal subagent context goes in `claude/.claude/rules/*` prefixed with `tk-` to avoid clobbering project rules.
Projects provide their own context via their own CLAUDE.md, rules, commands, and skills.

### Ticket system

`tk` CLI is always in PATH — never reference its source location, just use it as a CLI tool. It's a git-backed markdown
ticket tracker. Run `tk` with no args to see available commands.

### Worktree model

Each repo has a `default/` checkout with sibling worktrees. All justfile recipes take a `repo` parameter:

- **Single-repo mode:** `default/` is at project root; omit the repo arg (e.g. `just create-worktree TASK-123`)
- **Multi-repo mode:** repos are subdirectories; pass the repo name (e.g. `just create-worktree TASK-123 repo-a`)

One worktree per task (= one branch = one eventual PR).

### Task parallelism

Tasks within a feature can run in parallel if their `tk` dependencies allow it. The orchestrator uses `tk ready` to
determine what can be worked on. However, multiple subagents in the same worktree simultaneously risks file conflicts —
the orchestrator serializes per-worktree even if tasks are technically ready.

### Agent model

Four agent roles, three as subagents and one as a slash command:

- **Coder** (`tk:coder`, opus, full tools, orange) — implements tasks, runs tests, commits and pushes
- **Code-Reviewer** (`tk:code-reviewer`, opus, read-only, cyan) — reviews code + test quality, approves or requests
  changes
- **Architect-Reviewer** (`tk:architect-reviewer`, opus, read-only, magenta) — feature-level review, cross-task
  coherence, opens PRs
- **Orchestrator** (`/tk:orchestrate` slash command) — coordinates the workflow, launches subagents, reacts to their
  signals. Stays context-lean: uses `tk query` with jq for structured data, never `tk show`

### Ticket hierarchy

Two levels: **Feature** and **Task**.

- **Feature** (`type: feature`, assignee: `tk:architect-reviewer`) — logical grouping of related work. Created by
  `/tk:create-feature` from a plan document. Depends on all its child tasks (appears in `tk ready` when all children
  close). Plan context is embedded in the description.
- **Task** (`type: task`, parent: feature, assignee: `tk:coder`) — one task = one worktree = one branch = one PR. Cycles
  through: coder → code-reviewer → closed.

### Task lifecycle

1. **Coder** implements the task, runs tests, commits, pushes, returns `requesting-review`
2. **Orchestrator** immediately launches code-reviewer on the same task
3. **Code-reviewer** reviews code + tests, returns `approved` or `changes-requested`
4. If approved → orchestrator closes task
5. If changes requested → orchestrator relaunches coder (max 3 review iterations, then escalate)

### Feature lifecycle

1. All child tasks closed → feature appears in `tk ready`
2. **Architect-reviewer** reviews cross-task coherence, integration, downstream deps
3. If approved → orchestrator closes feature, PRs ready for human review
4. If issues found → architect reopens specific task(s) for rework → tasks go through coder/reviewer cycle again

### Review workflow

Review uses ticket notes as the handoff mechanism:

1. **Coder works** — implements the task, logging decisions and steps as `tk` notes along the way
2. **Coder finishes** — returns `requesting-review` signal to orchestrator
3. **Code-reviewer picks up** — reads ticket description, notes, and reviews the code in the worktree with fresh context
4. **If approved** — code-reviewer returns `approved`, orchestrator closes task
5. **If changes requested** — code-reviewer leaves detailed feedback as a note, returns `changes-requested`.
   Orchestrator relaunches a fresh coder that reads the notes + code and makes targeted changes.

This intentionally discards implementation context on revision — the coder reads the review feedback alongside the
actual code and makes targeted changes, rather than defending the original approach.

### Subagent launching

`just start-subagent <ticket-id>` is self-contained: it queries the ticket for assignee and `repo:<name>` tag, derives
the worktree name, creates the worktree if needed, and launches `claude --agent <agent> -p <prompt>` in the worktree
directory.

### Worktree naming convention

Worktree and branch names are derived deterministically from ticket metadata: `<id>-<slugified-title>`. The
`just worktree-name <ticket-id>` recipe computes this. No need to track worktree assignments — any agent or recipe can
derive the worktree path from a ticket ID.

### Return text signal block

All subagents must end their output with a structured signal block so the orchestrator can parse the result:

```text
---
signal: <signal-type>
ticket: <ticket-id>
summary: <one-line summary>
details: <optional details>
```

| Signal              | Agent              | Meaning                                       |
| ------------------- | ------------------ | --------------------------------------------- |
| `requesting-review` | coder              | Implementation done, tests pass, ready for CR |
| `approved`          | code-reviewer      | Code and tests look good, task can be closed  |
| `changes-requested` | code-reviewer      | Issues found, coder should address feedback   |
| `feature-approved`  | architect-reviewer | Feature is coherent, PRs ready                |
| `task-rework`       | architect-reviewer | Specific task(s) need changes (in details)    |
| `escalate`          | any                | Blocker that needs human attention            |

### Note conventions

Notes are prefixed with the agent role in brackets: `[coder]`, `[code-reviewer]`, `[architect]`. Task notes are for the
next agent on the same task. Feature notes are for sibling tasks and the architect.

### Concurrency

The orchestrator enforces a configurable max concurrent subagents limit (default: 3, via `$TK_MAX_CONCURRENT`). One
agent per worktree at a time.

## Directory Structure

```text
justfile                              # main entry point — `just init <dir>`
claude/.claude/
  agents/tk/
    coder.md                          # coder agent (opus, full tools, orange)
    code-reviewer.md                  # code reviewer agent (opus, read-only, cyan)
    architect-reviewer.md             # architect reviewer agent (opus, read-only, magenta)
  commands/tk/
    subagent-task.md                  # slash command: work on a ticket by ID
    orchestrate.md                    # slash command: run the orchestration loop
    create-feature.md                 # slash command: break down plans into features/tasks
  rules/
    tk-agents.md                      # behavioral rules for subagents
scripts/
  justfile                            # worktree/subagent recipes
.husky/pre-commit                     # runs lint-staged on commit
package.json                          # dotagents — prettier + lint-staged dev deps
.prettierrc.yml                       # 120 char width, proseWrap: always for markdown
.markdownlint.yaml                    # no line-length rule, no first-line-heading rule
```

## Intended Workflow

1. `just init ../<project>` — deploys agent configs and ticket infrastructure
2. User clones repos as named subdirectories (e.g. `repo-a/`, `repo-b/`), each with `default/` as the main checkout
3. Work comes in as plans (Claude plan mode output), GitHub issues, Jira, etc.
4. User runs `/tk:create-feature` to break work into tk tickets (features → tasks with dependencies)
5. User runs `/tk:orchestrate` to start the orchestration loop
6. Orchestrator: `tk ready` → create/reuse worktrees → start subagents → react to signals → close tickets → notify user

## Work Breakdown Model

- **Plan** → optional starting point (markdown, GitHub issue, Jira, etc.)
- **Feature** (`type: feature`) — logical grouping of related work, one or more tasks, reviewed by architect
- **Task** (`type: task`, `parent: feature`) — unit of work, one worktree/branch/PR, parallelizable via tk dependencies

## Testing Strategy

Testing is requirements-driven. `/tk:create-feature` embeds testable requirements in each task description. These
requirements are the basis for test coverage throughout the pipeline.

- **Coder** owns test writing. Tests are mandatory output — unit tests for all new/changed code, integration tests where
  cross-component interaction is involved. When working on existing code with coverage gaps, the coder fills in coverage
  for code they touch. The coder discovers project testing conventions from the codebase (framework, patterns, file
  locations) and follows them.
- **Code-reviewer** enforces test quality. Insufficient testing is grounds for `changes-requested`, same as a code
  defect. The reviewer traces task requirements to test coverage, checks for error/edge case coverage, and rejects
  happy-path-only or meaningless assertions. Feedback on missing tests must be specific (what scenarios, what code
  paths).
- **Architect-reviewer** reviews integration test coverage at the feature level. Checks that cross-task interactions are
  tested, API boundaries are verified on both sides, and components from different tasks work together. Requests rework
  on specific tasks via `task-rework` when integration coverage is insufficient — does not write tests directly
  (read-only). May also flag unit test gaps at API boundaries.

## Open Design Questions

- **Cross-repo features**: Each repo gets its own worktree/branch; ticket metadata tracks the target repo.
- **Retry logic**: Handling crashed subagents (exit without clean return text).
- **Promoting orchestrator**: From slash command to autonomous `claude -p` once reliable.

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
