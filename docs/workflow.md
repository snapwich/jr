# Orchestrator Workflow Design

## Overview Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PLAN DOCUMENT                                      │
│                         (markdown, user-provided)                               │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                         create-feature command
                     (consumes plan, creates tickets)
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
     ┌──────────────────┐                   ┌──────────────────┐
     │  FEATURE A       │                   │  FEATURE B       │
     │  type: feature   │                   │  type: feature   │
     │  assignee:       │                   │  assignee:       │
     │   architect      │                   │   architect      │
     │                  │                   │  dep: Feature A  │
     │  dep: Task 1     │                   │  dep: Task 3     │
     │  dep: Task 2     │                   │  dep: Task 4     │
     └────────┬─────────┘                   └────────┬─────────┘
              │                                      │
     ┌────────┴────────┐                    ┌────────┴────────┐
     ▼                 ▼                    ▼                 ▼
  ┌────────────┐  ┌────────────┐         ┌────────────┐  ┌────────────┐
  │ TASK 1     │  │ TASK 2     │         │ TASK 3     │  │ TASK 4     │
  │ backend    │  │ frontend   │         │ api-svc    │  │ worker-svc │
  │ worktree A │  │ worktree B │         │ worktree C │  │ worktree D │
  │ = 1 PR     │  │ = 1 PR     │         │ = 1 PR     │  │ = 1 PR     │
  └─────┬──────┘  └─────┬──────┘         └─────┬──────┘  └─────┬──────┘
        │  dep          │                      │               │
        └──────────────►│                      │               │

  Features depend on their child tasks (via tk dep).
  When all child tasks close → feature appears in tk ready.
  Cross-feature deps (Feature B dep Feature A) block until
  Feature A is architect-reviewed and closed.
```

## Task Lifecycle (per task)

```text
┌──────────────────────────────────────────────────────────┐
│                    SINGLE TASK LIFECYCLE                 │
│                                                          │
│  tk ready finds task                                     │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────┐        ┌───────────────┐                    │
│  │         │ return │               │                    │
│  │  CODER  │───────►│ CODE-REVIEWER │                    │
│  │         │ text   │               │                    │
│  └─────────┘        └───────┬───────┘                    │
│       ▲                     │                            │
│       │  changes requested  │  approved                  │
│       ├─────────────────────┘     │                      │
│       │                           ▼                      │
│       │                      ┌────────┐                  │
│       │                      │ CLOSED │                  │
│       │                      └────────┘                  │
│                                                          │
│  Coder implements AND runs tests.                        │
│  Code-reviewer reviews code + test quality,              │
│  runs tests to confirm, sends back if needed.            │
│                                                          │
│  Handoff: coder returns "requesting review" →            │
│  orchestrator immediately launches code-reviewer.        │
│                                                          │
│  Max 3 review iterations. Code-reviewer reads notes,     │
│  if 3 prior reviews exist → escalate to orchestrator     │
│  → escalate to user.                                     │
└──────────────────────────────────────────────────────────┘
```

## Feature Lifecycle (architect review)

```text
┌─────────────────────────────────────────────────────────────┐
│                   FEATURE COMPLETION                        │
│                                                             │
│  All child tasks closed                                     │
│  → feature appears in tk ready                              │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────┐                                    │
│  │ ARCHITECT-REVIEWER   │  Launched in project root.        │
│  │                     │  Reads feature's child tasks       │
│  │ Reviews:            │  from tk, navigates to each        │
│  │ • branch diffs      │  task's worktree to review.        │
│  │ • cross-task fit    │                                    │
│  │ • downstream deps   │  Checks tk for features/tasks      │
│  │ • integration tests │  that depend on this feature to    │
│  │                     │  ensure their needs are met.       │
│  └──────────┬──────────┘                                    │
│        ┌────┴──────┐                                        │
│        ▼           ▼                                        │
│   ┌────────┐  ┌───────────────┐                             │
│   │APPROVED│  │ISSUES FOUND   │                             │
│   │        │  │               │                             │
│   │feature │  │reopens task(s)│  Reopened task → feature    │
│   │closed  │  │→ coder fixes  │  drops from tk ready.       │
│   │PRs rdy │  │→ code-review  │  Task re-closes → feature   │
│   └────────┘  │→ task re-done │  reappears → architect      │
│               │→ feature back │  reviews again.             │
│               │  in tk ready  │                             │
│               │               │                             │
│               │or escalate    │  Most likely source of      │
│               │→ orchestrator │  human escalation.          │
│               │→ user         │                             │
│               └───────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

## Orchestrator Main Loop

```text
                         ┌──────────────┐
                         │    START     │
                         └──────┬───────┘
                                ▼
            ┌────────────────────────────────────┐
            │  tk ready → get unblocked items    │◄────────────────────┐
            │                                    │                     │
            │  For each result:                  │                     │
            │  • read assignee → launch that     │                     │
            │    agent (coder in task worktree,  │                     │
            │    architect in project root)      │                     │
            │                                    │                     │
            │  Background all launches, track    │                     │
            │  PIDs + output files.              │                     │
            │  One agent per worktree at a time. │                     │
            └──────────────┬─────────────────────┘                     │
                           ▼                                           │
            ┌────────────────────────────────────┐                     │
            │  Wait for any subagent to finish   │                     │
            │  (wait -n on background PIDs)      │                     │
            └──────────────┬─────────────────────┘                     │
                           ▼                                           │
            ┌────────────────────────────────────┐                     │
            │  Read return text, react:          │                     │
            │                                    │                     │
            │  CODER: "requesting review"        │                     │
            │  → immediately launch              │                     │
            │    code-reviewer on same task      │                     │
            │                                    │                     │
            │  CODE-REVIEWER: "approved"         │                     │
            │  → close task                      │                     │
            │                                    │                     │
            │  CODE-REVIEWER: "changes requested"│                     │
            │  → relaunch coder on same task     │                     │
            │                                    │                     │
            │  ARCHITECT: "feature approved"     │                     │
            │  → close feature, PRs ready        │                     │
            │                                    │                     │
            │  ARCHITECT: "issues in task X"     │                     │
            │  → reopen task X                   │                     │
            │                                    │                     │
            │  ANY: "escalate"                   │                     │
            │  → surface to user                 │                     │
            └──────────────┬─────────────────────┘                     │
                           │                                           │
                           └───────────────────────────────────────────┘
                        (loop: check tk ready for new work,
                         handle next completed subagent)

  Termination:
  • No active subagents AND no ready items AND all features closed → done
  • No active subagents AND no ready items AND open items exist → deadlock → ask user
```

## Ticket Hierarchy

Two levels: **Feature** and **Task**.

### Feature (`type: feature`)

A logical grouping of related work. Can span multiple repos, worktrees, and PRs.

- Created by the `create-feature` command from a plan document
- **Assignee: `tk:architect-reviewer`** — set at creation time, tells orchestrator which agent to launch when feature
  becomes ready
- Plan context is **embedded** in the feature description (plan is consumed, not referenced)
- **Depends on all its child tasks** (via `tk dep`) — shows up in `tk ready` when all children close
- May depend on other features for cross-feature ordering
- Discovery notes from agents are added here (findings relevant to sibling tasks)
- Feature is "done" when architect-reviewer approves and orchestrator closes it

### Task (`type: task`, `parent: feature`)

One task = one worktree = one branch = one eventual PR.

- Has an `assignee` field (initial: `tk:coder`)
- Worktree is assigned at the task level, tracked via a `tk` note on the task
- Progress notes accumulate on the task via `tk` notes as agents hand off
- Dependencies between tasks control ordering (both within and across features)
- Each task cycles through: coder → code-reviewer → closed

### Dependency Model

```text
Feature A ──dep──► Task 1 (child of Feature A)
Feature A ──dep──► Task 2 (child of Feature A)
Task 2    ──dep──► Task 1 (frontend depends on backend)
Feature B ──dep──► Feature A (cross-feature ordering)
Feature B ──dep──► Task 3 (child of Feature B)
Feature B ──dep──► Task 4 (child of Feature B)
```

`create-feature` sets up all these dependencies at creation time. The combined effect:

- Tasks 1 and 2 are immediately discoverable via `tk ready` (Task 2 blocked by Task 1 if dep exists)
- Feature A appears in `tk ready` only when Tasks 1 and 2 are both closed
- Tasks 3 and 4 in Feature B are blocked until Feature A is closed (architect-reviewed)

## Agent Roles

### Coder (`tk:coder`)

**Model:** opus | **Tools:** Bash, Read, Edit, Write, Grep, Glob

Implements the work AND runs tests. No separate tester — the coder owns test execution. No point requesting review if
tests don't pass.

- Reads task description + task notes (sees prior review feedback if iterating)
- If broader context needed: reads parent feature description + feature notes
- Implements the work described in the task
- Runs tests, ensures they pass
- Adds progress notes to the task (what was done, decisions, files changed)
- Adds discovery notes to the parent **feature** if findings affect sibling tasks
- When done: returns to orchestrator with "requesting review" signal
- Orchestrator immediately launches code-reviewer (no `tk ready` cycle needed)

### Code-Reviewer (`tk:code-reviewer`)

**Model:** opus | **Tools:** Bash, Read, Grep, Glob (no Edit/Write)

Reviews code quality AND test quality. Validates that the coder wrote good tests, not just tests that pass.

- Reads task description + task notes (what was implemented, decisions made)
- Reviews code quality, correctness, style
- Reviews test quality — are tests meaningful or just written to pass? Do they align with the feature requirements?
- Runs task-specific tests to confirm they pass
- **Checks iteration count in notes**: if 3 prior reviews exist → escalate to orchestrator → user
- Approved: returns "approved" → orchestrator closes task
- Changes needed: returns "changes requested" with detailed feedback → orchestrator relaunches coder
- No Edit/Write tools — evaluates, doesn't modify
- Feedback must be specific enough that a fresh coder agent can act on it

### Architect-Reviewer (`tk:architect-reviewer`)

**Model:** opus | **Tools:** Bash, Read, Grep, Glob (no Edit/Write)

Feature-level review after all tasks pass their code reviews. Launched in the **project root** so it can navigate to all
task worktrees.

- Reads the feature description and all child task descriptions/notes from `tk`
- Navigates to each task's worktree (from worktree notes) to review branch diffs
- Checks cross-task coherence (e.g., backend API matches what frontend expects)
- Checks downstream `tk` dependencies — features/tasks that depend on this work, ensures their needs are met
- Runs integration tests
- Approved: returns "feature approved" → orchestrator closes feature, PRs ready
- Issues in specific task: returns identifying which task(s) need rework → orchestrator reopens those tasks (which
  removes the feature from `tk ready` until the tasks re-close)
- Blocker/architectural concern: returns escalation → orchestrator surfaces to user
- Most likely agent to raise human-escalation blockers

### Orchestrator (`just start-work`)

**Implementation:** Bash script inlined in `scripts/justfile` — no LLM, purely deterministic signal dispatch.

Coordinates the workflow without accumulating domain knowledge. Alternates between discovery and reaction:

1. **Discovery** — polls `tk ready` for unblocked items:
   - Read assignee → launch that agent (create worktree if needed for tasks, project root for architect)
   - Uniform logic: assignee determines agent type regardless of ticket type

2. **Reaction** — handles subagent completions via return text signal blocks:
   - Coder "requesting review" → assign to code-reviewer, relaunch
   - Code-reviewer "approved" → close task
   - Code-reviewer "changes requested" → count review rounds, relaunch coder (or escalate after 3)
   - Architect "feature approved" → close feature
   - Architect "task rework" → reopen specified tasks for coder
   - Any "escalate" or no valid signal → drain running subagents, exit 2

**Parallelism:**

Backgrounds all subagent launches, tracks PIDs and output files. Uses `wait -n -p` to detect which subagent finishes.
One agent per worktree at a time (serialization constraint). Different worktrees run in parallel.

**Exit codes:** 0 = all work complete, 2 = escalation or deadlock, 130 = interrupted (Ctrl-C).

**Status reporting:**

After every significant state change, logs structured status updates with counts of total/completed/active/blocked items
and what's happening next.

## Context Model

| Context Type       | Where                | Written By                | Read By                       |
| ------------------ | -------------------- | ------------------------- | ----------------------------- |
| Plan/requirements  | Feature description  | `create-feature` command  | All agents on that feature    |
| Progress/work log  | Task notes           | Each agent during handoff | Next agent in lifecycle       |
| Discovery/findings | Feature notes        | Any agent                 | Sibling task agents           |
| Escalation signals | Subagent return text | Completing agent          | Orchestrator only             |
| Review history     | Task notes           | Code-reviewer             | Next coder iteration, and     |
|                    |                      |                           | code-reviewer (iteration cap) |

### Context Scoping

- **Primary**: task description + task notes (focused, immediate)
- **Broader**: parent feature description + feature notes (on-demand)
- **Orchestrator**: `tk ready` + return text (never reads notes)

## Communication Channels

- **Agent → tk**: add notes, close/reopen tasks, modify dependencies
- **Agent → orchestrator**: subagent return text (summary + lifecycle signals + escalations)
- **Orchestrator → agents**: none directly — next agent reads `tk` state on startup
- **Agent → sibling agents**: notes on the parent feature (discovery context)

## Plan Consumption (`create-feature` command)

1. Reads plan document (markdown, path provided as argument)
2. Creates feature tickets with: plan context embedded in description, assignee `tk:architect-reviewer`
3. Creates task tickets as children with: work description, initial assignee (`tk:coder`), inter-task dependencies
4. Sets each feature to depend on all its child tasks (so feature appears in `tk ready` when all tasks close)
5. Sets cross-feature dependencies
6. Plan is consumed — features carry their context forward, original doc not referenced again
