Break down a plan document into features and tasks using parallel subagents that explore and create in one pass.

## Input

The user provides a plan document or update request — either as a file path (`$ARGUMENTS`) or pasted directly.

## Commands

Run `just plan-features` to see all available commands for this workflow.

**Use `just` for ALL ticket operations.** Do NOT use MCP task tools (`mcp__mc-dev__tasks`, `TaskCreate`, `TaskUpdate`,
`TaskList`, `TaskGet`) — those are generic Claude Code task tracking, unrelated to this system's tickets.

## Process

### 1. Pre-flight

Discover current state:

```sh
just tree
```

Classify each input feature's state from tree output (shows status, type, assignee, children):

| State              | Detection                                               |
| ------------------ | ------------------------------------------------------- |
| Active             | Feature open, at least 1 child task open/in_progress    |
| Awaiting architect | Feature open, all children closed, assignee = architect |
| Awaiting human     | Feature open, all children closed, assignee = human     |
| Closed             | Feature closed                                          |
| New                | Not found in tree                                       |

Ask for **base branch** (AskUserQuestion): `origin/HEAD (Recommended)`, `main`, or Other. Applies to all features.

### 2. Identify Feature Boundaries

Trivial when input is external tickets (1 ticket = 1 feature). For plans, identify logical feature groupings. Ask user
if boundaries are ambiguous. Each feature = one PR that leaves the app working when merged.

### 3. Handle Existing Features

Before fanning out agents, handle metadata state changes for features that already exist:

- **Active** (has in_progress tasks): Warn user, recommend waiting. Proceed only with confirmation.
- **Awaiting architect**: Add note explaining changes.
- **Awaiting human**: Reassign to `jr:architect-reviewer`, add note.
- **Closed**: Reopen, reassign to `jr:architect-reviewer`, add note. Warn about re-blocking downstream.

### 4. Fan Out Explore+Create Agents (wave-based)

Group features into waves by dependency order — independent features in wave 1, features that depend on wave 1 in wave
2, etc. Process one wave at a time; within each wave, launch all agents in parallel.

**Wave N agents** receive upstream ticket IDs from prior waves. They read those tickets (`just show`) to understand the
future codebase state they'll inherit, then explore the current codebase for structural context.

Agent prompt structure (generate dynamically per feature):

> You are exploring a codebase and creating tickets for one feature. Do both in one pass.
>
> **Feature**: [title + full content from plan/ticket]
>
> **Source location**: [path to default/ worktree or repo subdirectory] **Ignore**: `.jr/`, `.tickets/`, `.claude/`,
> `justfile` — orchestration infrastructure.
>
> **Metadata**: external-ref=[value or none], repo=[name or none], base=[branch] **Existing feature ID**: [ID if > > >
> modifying, or "new"]
>
> **Upstream dependencies**: [feature IDs this feature depends on, or "none"] Read these with `just show <id>` to
> understand what state the codebase will be in when your feature starts. Your tasks should assume upstream work is
> already merged.
>
> ## Phase 1: Explore
>
> Read the codebase to understand what's needed. Identify:
>
> - Tracer-bullet task decomposition (vertical slices — axis depends on work type)
> - Ambiguities or underspecified aspects a coder would get stuck on
> - Components/APIs/files this feature touches that other features might also touch
> - Behavioral surprises the plan doesn't account for
>
> **If you find unresolvable ambiguity**: STOP. Return ONLY your open questions (quote relevant text, explain why it
> needs resolution). Do NOT create tickets. Format:
>
> ```
> STATUS: questions
> QUESTIONS:
> - [question 1]
> - [question 2]
> ```
>
> **If everything is clear**: proceed to Phase 2.
>
> ## Phase 2: Create
>
> Create the feature and all tasks using `just` commands:
>
> - `just create "<title>" -t feature -a jr:architect-reviewer -d "<description>"` (with --external-ref and --tags as
>   needed)
> - `just create "<title>" -t task -a jr:coder --parent <feature-id> -d "<description>"` for each task
> - `just dep <task-N> <task-N-1>` to chain tasks linearly
> - `just dep <feature-id> <task-id>` for each task (feature depends on all children)
>
> If modifying an existing feature: create new tasks, chain after last existing task, add feature deps on new tasks.
>
> ## Ticket-Writing Rules
>
> - Feature descriptions: what it accomplishes, acceptance criteria (specific testable statements), architectural notes,
>   expected test impact (2-5 bullets: what tests change, how, why)
> - Task descriptions: what to implement, requirements (specific testable statements — basis for test coverage),
>   acceptance criteria, relevant technical context
> - Last task in chain: add "Feature verification" section if feature acceptance criteria need cross-task verification.
>   Prefer unit tests; integration only where units can't cover; e2e only when explicitly needed.
> - Embed ALL plan context in descriptions — the plan is consumed, never referenced again
> - No shell commands in descriptions — describe WHAT (run tests, type-check) not HOW (specific commands)
> - No unresolved questions — every ambiguity must be resolved before creation
> - Features: `type: feature`, assignee `jr:architect-reviewer`, `--external-ref` for branch naming
> - Tasks: `type: task`, assignee `jr:coder`, `--parent <feature-id>`, no `repo:` tags (inherited)
> - Linear task chain — no parallel tasks within a feature
> - Self-contained features — each PR must leave the app working when merged
>
> ## Output (if tickets created)
>
> ```
> STATUS: created
> FEATURE_ID: <id>
> TASK_IDS: <id1>, <id2>, ... (chain order)
> CROSS_FEATURE_CONCERNS: [brief list of shared components/APIs touched]
> SURPRISES: [brief list of behavioral gotchas, or "none"]
> ```

### 5. Collect Results and Resolve Questions (per wave)

After each wave completes, check each agent's output:

- **`STATUS: created`** — record feature ID, task IDs, cross-feature concerns
- **`STATUS: questions`** — agent hit ambiguity, no tickets created

If any agents returned questions:

1. Batch ALL questions from all agents into one AskUserQuestion call
2. SendMessage the answers back to each agent that had questions (they resume with exploration context intact, proceed
   to Phase 2, return created IDs)

Then proceed to the next wave (passing created ticket IDs as upstream dependencies).

### 6. Wire Cross-Feature Dependencies

From agents' CROSS_FEATURE_CONCERNS, identify ordering (feature touching shared code first → others depend on it). Ask
user to confirm ordering if non-obvious:

```sh
just dep <feature-B> <feature-A>
just dep <first-task-B> <feature-A>
```

### 7. Verify

```sh
just tree
just dep-cycle
just verify-tickets
just ready
```

Try to fix issues (missing deps, broken chains). Escalate to user only if unfixable.

### 8. Commit

```sh
just commit-tickets "chore: plan-features — <summary>"
```

Non-fatal if it fails.

---

## Scope Boundary

**STOP after verification.** This command creates tickets ONLY. Do NOT spawn agents to work on tickets, run
`just start-work`, or make code changes.

## Output

Present: total features/tasks created, ticket hierarchy (`just tree`), what's ready, cross-feature deps, cycle check
result, commit status.
