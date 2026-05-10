# jr

Stow-based toolkit for deploying AI agent configs into project directories. Orchestrates multi-agent workflows where
Claude subagents work on tickets in git worktrees.

**Intended flow:** `just init` a project → break down work into tickets (features/tasks) → run `just start-work` →
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

**Orchestrator as bash recipe.** The orchestrator is a bash script inlined in the justfile (`just start-work`). Its
decision tree is fully deterministic — every signal maps to a fixed action, no LLM reasoning needed. It uses
`just ready` to discover work, launches subagents in the background, and uses `wait -n` for instant completion
detection. All state lives in `tk`, making it fully restartable.

**Early issue detection.** A key motivation is avoiding the failure mode of existing long-running loops that do too much
work before surfacing problems. The orchestrator should catch issues early and surface them to the user rather than
letting subagents grind on a bad path.

## Architecture

### Stow deployment model

`claude/` and `scripts/` are symlinked into a target project via GNU stow. The target project gets Claude agent
definitions, commands, and a `scripts/justfile` for worktree/subagent management.

```text
jr repo                          target project
─────────────                         ──────────────
claude/.claude/agents/jr/*    ──→     .claude/agents/jr/*
claude/.claude/commands/jr/*  ──→     .claude/commands/jr/*
claude/.claude/prompts/jr/*  ──→     .claude/prompts/jr/*
scripts/justfile              ──→     justfile (worktree mgmt)
.prettierrc.yml               ──(cp)  .jr/.prettierrc.yml
.markdownlint.yaml            ──(cp)  .jr/.markdownlint.yaml
                                      .jr/.tickets/  (git-tracked tickets)
                                      .jr/package.json  (generated, per-project)
```

### Expected project structure

The toolkit supports two modes depending on whether the project works with one repo or multiple:

**Single-repo mode** — `default/` and worktrees at project root:

```text
~/
├── .jr/                              # this repo
└── <project>/                            # target project (single repo)
    ├── .jr/, .claude/, justfile      # project-level (stowed)
    ├── default/                          # main checkout
    │   └── .claude/                      # merged copy (if repo has .claude/ committed)
    ├── feat-abcd-my-feature/             # feature worktree (one per feature)
    │   └── .claude/                      # merged copy of project .claude/
    └── feat-efgh-another-feature/        # another feature worktree
```

**Multi-repo mode** — repos are named subdirectories:

```text
~/
├── .jr/                              # this repo
└── <project>/                            # target project (multi-repo)
    ├── .jr/, .claude/, justfile      # project-level (stowed)
    ├── <repo-a>/                         # user-managed git repo
    │   ├── default/                      # main checkout
    │   └── feat-abcd-backend-feature/    # feature worktree
    └── <repo-b>/                         # another repo
        ├── default/
        └── feat-efgh-frontend-feature/
```

**Project layout:** Run `just worktree-list` — displays a tree of repos and their worktrees. A single level of entries
under `.` means single-repo mode (pass `.` as the `repo` parameter to justfile recipes). Entries grouped under named
subdirectories means multi-repo mode.

Claude Code doesn't recursively search parent directories for `.claude/`, so each worktree needs its own copy.
`just create-worktree <name> [repo] [base]` handles this — it copies the project-level `.claude/` into the worktree
using rsync with `--ignore-existing`, which merges without overwriting existing files. This means worktrees get both the
stowed jr configs and any project-specific claude config (rules, settings, CLAUDE.md, etc.).

### Ticket system

`tk` is the underlying git-backed markdown ticket tracker. All ticket operations are exposed as `just` recipes — use
`just --list` to see available commands (e.g., `just show`, `just ready`, `just close`, `just create`, `just assign`,
`just note`).

### Worktree model

Worktrees align with **features**, not tasks. One feature = one worktree = one branch = one PR. Tasks within a feature
are sequential commits on the feature's branch.

Each repo has a `default/` checkout with sibling worktrees. All justfile recipes take a `repo` parameter:

- **Single-repo mode:** `default/` is at project root; omit the repo arg (e.g. `just create-worktree feat-abcd-title`)
- **Multi-repo mode:** repos are subdirectories; pass the repo name (e.g. `just create-worktree feat-abcd-title repo-a`)

### Worktree naming convention

Worktree and branch names are derived from the **feature** ticket (not task). The `just worktree-name <ticket-id>`
recipe computes this — when called with a task ID, it resolves to the parent feature first.

**Prefix logic**: Check the feature's `external-ref` field. If present, use it (preserving original case) instead of the
ticket ID: `PEX-1234-my-feature-title`. If no external-ref, fall back to the ticket ID: `rep-abcd-my-feature-title`.

### Stacked branches

When Feature B depends on Feature A, Feature B's worktree branches off Feature A's branch (not origin/HEAD). The
`resolve_base_branch()` function in the orchestrator checks feature deps for upstream features.

### Task parallelism

Tasks within a feature form a **linear chain** — they run sequentially, sharing the same worktree. Cross-feature
parallelism is supported: features with independent dependency chains can run their tasks concurrently in separate
worktrees. The orchestrator enforces one agent per worktree at a time.

### Agent model

Four Claude subagents plus a bash orchestrator:

- **Coder** (`jr:coder`, sonnet, full tools, orange) — implements tasks, runs tests, commits
- **Code-Reviewer** (`jr:code-reviewer`, opus, read-only, cyan) — reviews code + test quality, approves or requests
  changes
- **Architect-Reviewer** (`jr:architect-reviewer`, opus, ticket write access, magenta) — reviews full feature branch for
  cross-task coherence, integration quality. Can reopen tasks or create new ones.
- **Investigator** (`jr:investigator`, haiku, read-only, yellow) — triages no-signal exits (timeout/crash). Synchronous,
  ≤5 turns. Returns `resume` (with optional steering nudge) or `escalate`.
- **Orchestrator** (`just start-work`, bash) — coordinates the workflow, launches subagents, reacts to their signals.
  Deterministic signal dispatch — no LLM. Exits 0 on completion, 2 on per-ticket escalations/deadlock, 3 on features
  awaiting human review (3 wins over 2).

### Ticket hierarchy

Two levels: **Feature** and **Task**.

- **Feature** (`type: feature`, `assignee: jr:architect-reviewer`) — logical grouping of related work. One feature = one
  worktree = one branch = one PR. Created by `/jr:plan-features` from a plan document. Depends on all its child tasks
  (appears in `just ready` when all children close). When ready, orchestrator launches architect for feature review.
  After architect approval, feature is assigned to `human` and orchestrator exits with code 3 for human review.
- **Task** (`type: task`, parent: feature) — sequential unit of work within a feature. Tasks form a linear chain within
  their feature.

### Task lifecycle

1. **Orchestrator** adds `[orchestrator] Assigned to coder.` note
2. **Coder** implements the task, runs tests, commits with `Tk-Task: <ticket-id>` trailers, signals `requesting-review`
3. **Orchestrator** immediately assigns to code-reviewer and launches
4. **Code-reviewer** reviews code + tests (finds task commits via `just task-diff`/`just task-commits`)
   - If approved → orchestrator closes task
   - If changes requested → orchestrator relaunches coder (`JR_REVIEW_ROUNDS` (default 5) iterations, then escalate)

### Feature lifecycle

1. All child tasks closed → feature appears in `just ready` (architect already assigned)
2. **Orchestrator** launches architect-reviewer for feature
3. **Architect** reviews full branch diff
   - If issues → reopens specific tasks (or creates new ones), chains deps, signals `changes-requested`
   - If approved → assigns feature to `human`, signals `approved`
4. If `changes-requested` → reopened tasks appear in `just ready` → normal coder→code-reviewer flow → when all close,
   feature ready again → architect re-reviews (`JR_REVIEW_ROUNDS` (default 5) iterations, then escalate)
5. If `approved` → feature assigned to `human` → orchestrator exits 3
6. **Human** reviews the branch/worktree
   - Satisfied → `just close <feature-id>` → downstream features unblocked
   - Issues found → `just request-changes <feature-id> "<feedback>"` (or omit feedback to open `$EDITOR`) → triggers
     rework loop

### Review workflow

Review uses ticket notes as the handoff mechanism:

1. **Orchestrator** adds assignment note before launching coder
2. **Coder works** — implements the task, commits with `Tk-Task: <ticket-id>` trailers, logs decisions as ticket notes
3. **Coder finishes** — returns `requesting-review` signal to orchestrator
4. **Code-reviewer picks up** — reads ticket notes, uses `just task-diff`/`just task-commits` for focused diff review
   (trailers survive rebases, unlike SHA-based tracking)
5. **If approved** — code-reviewer returns `approved`, orchestrator closes task
6. **If changes requested** — code-reviewer leaves detailed feedback as a note, returns `changes-requested`.
   Orchestrator relaunches a fresh coder that reads the notes + code and makes targeted changes.

This intentionally discards implementation context on revision — the coder reads the review feedback alongside the
actual code and makes targeted changes, rather than defending the original approach.

### Subagent launching

The internal `launch()` function in `start-work` is self-contained: it queries the ticket for assignee and `repo:<name>`
tag, derives the worktree name from the parent feature, resolves the base branch for stacked features, creates the
worktree if needed, and launches `claude --agent <agent> -p <prompt>` in the worktree directory as a background process.

### Signaling completion

All subagents must use `just signal` as the **last command** in their output. This atomically adds the completion note
and outputs the signal block for the orchestrator to parse:

```sh
just signal <type> <ticket-id> "<summary>"
```

The agent identity is read from the `JR_AGENT` env var (set by the orchestrator at launch).

| Signal              | Agent                             | Meaning                                                   |
| ------------------- | --------------------------------- | --------------------------------------------------------- |
| `requesting-review` | coder                             | Implementation done, tests pass, ready for CR             |
| `approved`          | code-reviewer, architect-reviewer | Code/feature looks good                                   |
| `changes-requested` | code-reviewer, architect-reviewer | Issues found, coder should address feedback               |
| `escalate`          | any                               | Blocker that needs human attention                        |
| `resume`            | investigator                      | Original agent should be resumed (optional steering note) |

### Note conventions

`just add-note` auto-prefixes with `[$JR_AGENT]`. Notes use full agent names: `[jr:coder]`, `[jr:code-reviewer]`,
`[jr:architect-reviewer]`. Non-agent prefixes: `[orchestrator]`, `[human]`. Task notes are for the next agent on the
same task. Feature notes are for sibling tasks and the architect.

### Autonomous mode (`--no-human-review`)

By default, the orchestrator exits with code 3 at the human review gate. `--no-human-review` (or `JR_NO_HUMAN_REVIEW=1`)
skips this — architect approval closes the feature directly, no exit 3. Crash-safe: if the orchestrator restarts and
finds a human-assigned feature, it auto-closes it. The architect's `just assign <id> human` is kept as a crash-safety
measure; the orchestrator overrides it in both `react()` and `launch()`.

### Merging completed features (`merge-all`)

`just merge-all [--squash]` merges closed feature branches into their base branches in dependency order. Atomic: merges
into a temp branch, fast-forwards base only if all succeed. Handles stacked branches with `--squash` by rebasing
downstream branches onto the temp branch after each squash merge. Rolls back on failure (deletes temp branch, restores
rebased branches). Cleans up worktrees and branches on success. Groups features by `(repo, base)` — features targeting
different base branches get separate merge tracks. Multi-repo aware via `repo:<name>` tags. Does not push.

### No-signal exits and the investigator

When a subagent exits without a valid signal — timeout (124/137) or crash (other non-zero) — the orchestrator
synchronously runs `jr:investigator` (Haiku, read-only triage role). The investigator gets the failed agent's session
JSONL tail, ticket notes, and the worktree diff. It returns `resume "<optional nudge>"` (re-launch the original agent,
optionally with a steering note) or `escalate "<diagnosis>"` (reassign the ticket to human). `JR_RESUME_BUDGET`
(default: 3) caps resumes per ticket per run; once exhausted, no-signal exits escalate without invoking the
investigator. The investigator itself has a 600s timeout — if it doesn't return, the ticket escalates with
`Investigator timed out`. Embedded session-JSONL and diff payloads are byte-truncated (50 KB and 30 KB) so the
investigator prompt stays under `ARG_MAX` (claude CLI takes the prompt via `-p` argv; there's no stdin-prompt mode).

### Rate-limit handling

When a subagent's output contains `You've hit your limit · resets <time> (<TZ>)` (the literal message Claude prints when
the per-account window is exhausted), the orchestrator handles it deterministically rather than running the
investigator:

1. Parse the reset time + 5-minute buffer.
2. Add a `[orchestrator] Rate-limited; will resume after <epoch> (<ISO>, parsed from "<line>")` note to the ticket.
   Assignee and status stay as-is.
3. Set a global `RATE_LIMIT_RESET_TS`. The main loop drains in-flight subagents (they may also hit the wall — same
   handling), then sleeps until the reset, then resumes the loop. Bell rings once at sleep start and once on wake.
4. On orchestrator restart, the same note is the source of truth: `setup()` scans open/in_progress tickets, takes the
   max future reset time across them, and re-enters the sleep state if needed.

Rate-limit deferrals do not count against `JR_RESUME_BUDGET` — the `Agent crashed/timed out` note that drives that
counter is never written for this path. Investigator output is also checked for the rate-limit line so a non-rate-limit
crash followed by a rate-limited investigator defers cleanly instead of cascading to escalation.

If the reset time can't be parsed (Anthropic changes the wording, etc.), the ticket escalates with
`Rate-limited but reset time unparseable: <line>` so the parser drift is visible.

### Per-ticket escalation

All escalations (agent `escalate` signal, review-round caps, investigator escalates, budget exhaustion) are
**per-ticket**: the ticket is reassigned to `human`, an `[orchestrator] Escalated to human: ...` note is added, and the
run continues with other launchable work. The terminal bell rings on each escalation. End-of-run prints the list of
escalated tickets and points the user at `just me`. Exit code: `2` if the run finished with any escalations and no
human-review-gate; `3` if the human-review-gate hit (3 wins over 2); `0` otherwise.

### Concurrency

The orchestrator enforces a configurable max concurrent subagents limit (default: 3, via `$JR_MAX_CONCURRENT`).
Per-feature base branches are configured via `base:<branch>` tags (e.g., `base:origin/develop`, `base:release/1.0`). No
tag defaults to `origin/HEAD`. `$JR_REVIEW_ROUNDS` sets the max review iterations before escalation (default: 5).
`$JR_RESUME_BUDGET` (default: 3) caps no-signal resumes per ticket per run. One agent per worktree at a time.
Escalations no longer halt the run — sibling tickets keep going. See [docs/workflow.md](docs/workflow.md) for visual
diagrams of the orchestrator flow.

## Directory Structure

```text
justfile                              # main entry point — `just init <dir>`
claude/.claude/
  agents/jr/
    coder.md                          # coder agent (sonnet, full tools, orange)
    code-reviewer.md                  # code reviewer agent (opus, read-only, cyan)
    architect-reviewer.md             # architect reviewer agent (opus, ticket write access, magenta)
    investigator.md                   # no-signal triage agent (haiku, read-only, yellow)
  commands/jr/
    plan-features.md                  # slash command: create/modify features and tasks
    retro.md                          # slash command: post-mortem analysis of a feature
  prompts/jr/
    subagent-task.md                  # subagent prompt template (injected by orchestrator)
scripts/
  justfile                            # worktree/subagent/orchestrator recipes
.husky/pre-commit                     # runs lint-staged on commit (this repo only)
package.json                          # prettier + lint-staged dev deps
.prettierrc.yml                       # prettier config (copied to project .jr/)
.markdownlint.yaml                    # markdownlint config (copied to project .jr/)
```

## Intended Workflow

1. `just init ../<project>` — deploys agent configs and ticket infrastructure
2. User clones repos as named subdirectories (e.g. `repo-a/`, `repo-b/`), each with `default/` as the main checkout
3. Work comes in as plans (Claude plan mode output), GitHub issues, Jira, etc.
4. User runs `/jr:plan-features` to break work into tickets (features → linear task chains with architect review)
5. User runs `just start-work` to start the orchestration loop
6. Orchestrator: `just ready` → create/reuse feature worktrees → start subagents → react to signals → close tasks
7. All automated work done → orchestrator exits 3 → human reviews feature branches
8. Human closes features (`just close`) or requests changes (`just request-changes`)
9. Optionally, run `/jr:retro <feature-id>` to analyze friction in the completed workflow and extract improvements

## Work Breakdown Model

- **Plan** → optional starting point (markdown, GitHub issue, Jira, etc.)
- **Feature** (`type: feature`) — one worktree, one branch, one PR. Human review gate.
- **Task** (`type: task`, `parent: feature`) — sequential commit(s) within the feature's worktree. Linear chain, last
  task is always architect review.

## Testing Strategy

Testing is requirements-driven at two levels: task requirements drive per-task tests, feature acceptance criteria drive
feature-level verification. `/jr:plan-features` embeds testable requirements in each task description and testable
acceptance criteria in each feature description. The testing strategy follows a cost pyramid: prefer unit tests
(exhaustive), use integration tests only where unit tests can't cover the interaction, and e2e tests only as a last
resort.

- **Coder** owns test writing. Tests are mandatory output. The coder finds and updates existing tests covering modified
  behavior before writing new tests. Unit tests are the default and should be most exhaustive — covering requirements,
  error cases, edge cases, and boundary conditions. Integration tests only where unit tests genuinely can't cover the
  scenario. The **last implementation task** (before architect review) may include a "Feature verification" section
  listing feature-level acceptance criteria that need test coverage beyond what individual tasks provide.
- **Code-reviewer** enforces test quality. Insufficient testing is grounds for `changes-requested`, same as a code
  defect. The reviewer traces task requirements to test coverage, checks for error/edge case coverage, and rejects
  happy-path-only or meaningless assertions. Feedback on missing tests must be specific (what scenarios, what code
  paths).
- **Architect-reviewer** reviews test coverage at the feature level. Traces each feature acceptance criterion to
  concrete test cases in the branch — any test type counts (unit, integration, e2e). Also reviews test appropriateness:
  flags integration/e2e tests that could be unit tests (over-testing), and flags missing integration tests where unit
  tests can't cover cross-component interactions. If cross-feature integration/e2e tests are needed, notes this on the
  parent feature rather than requesting them as changes. Does not write tests directly (read-only).

## Known Limitations

- **Cross-repo features**: Supported — each repo gets its own worktree/branch; ticket metadata tracks the target repo
  via `repo:<name>` tag. Limited test coverage.
- **Crashed/timed-out subagents**: Triaged by `jr:investigator` (see "No-signal exits and the investigator").
  `JR_AGENT_TIMEOUT` (default: 60 min) prevents indefinite runs; `JR_RESUME_BUDGET` (default: 3) caps resumes.

## Development Guidelines

- All ticket operations are `just` recipes — use `just --list` to discover commands
- Formatting enforced by prettier on commit: 120 char width, `proseWrap: always` for markdown
- Markdown linting via markdownlint (MD013 disabled, MD041 disabled)
- Agent definitions and commands are the main development surface
- The `init` recipe should be idempotent: safe to run on a fresh project or to deploy new files added since last init
- **Justfile group convention**: Recipes in `scripts/justfile` that are internal to a process use `[group('name')]`
  (e.g. `orchestrator`, `subagent`, `plan-features`). Human-facing recipes have **no group** — they appear at the top
  level of `just --list`

## Testing

BDD tests using cucumber.js + mock subagents. Run with `just test` or `pnpm test`.

- **Framework**: cucumber.js for Gherkin scenarios, zx available for shell scripting in steps
- **Mock subagent**: `features/support/mock-subagent.sh` — stands in for `claude` CLI, returns preconfigured signal
  blocks. Supports numbered files (queue) and unnumbered files (repeatable) for multi-call scenarios.
- **Test world**: `features/support/world.js` — creates isolated temp projects with tickets initialized per scenario
- **Orchestrator tests**: `features/orchestrator.feature` — covers full signal dispatch lifecycle (task approval,
  changes requested, escalation, feature review, deadlock detection)

Do not use `../portfolio` or other real projects as test targets.

## Dependencies

- **tk** — git-backed ticket CLI (wrapped by `just` recipes)
- **GNU stow** — symlink farm manager
- **just** — command runner
- **git** — with worktree support
- **Node.js/pnpm** — for prettier/husky dev tooling only (not runtime)
