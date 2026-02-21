# Orchestrator Workflow Design

## Overview Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PLAN DOCUMENT                                      │
│                         (markdown, user-provided)                               │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                         create-features command
                     (consumes plan, creates tickets)
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
     ┌──────────────────┐                   ┌──────────────────┐
     │  FEATURE A       │                   │  FEATURE B       │
     │  type: feature   │                   │  type: feature   │
     │  NO assignee     │                   │  NO assignee     │
     │  (human gate)    │                   │  dep: Feature A  │
     │                  │                   │                  │
     │  1 worktree      │                   │  1 worktree      │
     │  1 branch        │                   │  1 branch        │
     │  1 PR            │                   │  (stacked on A)  │
     └────────┬─────────┘                   └────────┬─────────┘
              │                                      │
     ┌────────┼────────┐                    ┌────────┼────────┐
     ▼        ▼        ▼                    ▼        ▼        ▼
  ┌────────┐┌────────┐┌─────────┐       ┌────────┐┌────────┐┌─────────┐
  │ Task 1 ││ Task 2 ││ Arch    │       │ Task 3 ││ Task 4 ││ Arch    │
  │ coder  ││ coder  ││ Review  │       │ coder  ││ coder  ││ Review  │
  │        ││ dep: 1 ││ dep: 2  │       │        ││ dep: 3 ││ dep: 4  │
  └────────┘└────────┘└─────────┘       └────────┘└────────┘└─────────┘
  ◄──── linear chain ────►              ◄──── linear chain ────►

  One feature = one worktree = one branch = one PR.
  Tasks are sequential commits within a feature's worktree.
  Architect-review task is always last in the chain.
  Features are human review gates — no agent assignee.
```

## Task Lifecycle (per task)

```text
┌──────────────────────────────────────────────────────────────────┐
│                    SINGLE TASK LIFECYCLE                          │
│                                                                  │
│  tk ready finds task                                             │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────┐         ┌───────────────┐                           │
│  │         │ signal  │               │                           │
│  │  CODER  │────────►│ CODE-REVIEWER │                           │
│  │         │         │               │                           │
│  └─────────┘         └───────┬───────┘                           │
│       ▲                      │                                   │
│       │  changes requested   │  approved                         │
│       ├──────────────────────┘     │                             │
│       │                            ▼                             │
│       │                       ┌────────┐                         │
│       │                       │ CLOSED │                         │
│       │                       └────────┘                         │
│                                                                  │
│  For architect-review tasks, "approved" from code-reviewer       │
│  re-launches the architect (not close). The architect then       │
│  signals approved/changes-requested for the full feature.        │
│                                                                  │
│  Orchestrator adds HEAD SHA note before launching coder.         │
│  Code-reviewer uses SHA to focus review on current task changes. │
│                                                                  │
│  Max 3 review iterations per reviewer type, then escalate.       │
└──────────────────────────────────────────────────────────────────┘
```

## Feature Lifecycle (human review gate)

```text
┌─────────────────────────────────────────────────────────────────────┐
│                   FEATURE COMPLETION                                 │
│                                                                     │
│  All child tasks closed (including architect-review)                │
│  → feature appears in tk ready                                     │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────────────┐                                       │
│  │ ORCHESTRATOR             │  Logs "ready for human review"        │
│  │ Does NOT launch agent    │  Exits with code 3 if no other       │
│  │ (features have no        │  automated work remains.             │
│  │  assignee)               │                                       │
│  └──────────────┬───────────┘                                       │
│            ┌────┴──────┐                                            │
│            ▼           ▼                                            │
│   ┌────────────┐  ┌───────────────────────────┐                     │
│   │ HUMAN      │  │ HUMAN REQUESTS CHANGES    │                     │
│   │ CLOSES     │  │                           │                     │
│   │ FEATURE    │  │ just request-changes      │  Reopens architect  │
│   │            │  │   <feature-id> "<text>"   │  review task with   │
│   │ Unblocks   │  │                           │  [human] note       │
│   │ downstream │  │ → coder fixes             │                     │
│   │ features   │  │ → code-reviewer reviews   │                     │
│   └────────────┘  │ → architect re-reviews    │                     │
│                   │ → feature back in ready   │                     │
│                   └───────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Architect Rework Flow

```text
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  Architect-review task ready (all prior tasks closed)                 │
│       │                                                               │
│       ▼                                                               │
│  Architect reviews full branch diff                                   │
│       │                                                               │
│  ┌────┴──────┐                                                        │
│  ▼           ▼                                                        │
│ approved   changes-requested (round N)                                │
│  │          │                                                         │
│  │          ├─ N ≥ 3 → ESCALATE                                       │
│  │          └─ N < 3 →                                                │
│  │               ├─ Orchestrator assigns to coder + HEAD SHA note     │
│  │               ├─ Coder fixes, signals requesting-review            │
│  │               ├─ Code-reviewer reviews fix                         │
│  │               │  ├─ changes-requested → back to coder              │
│  │               │  └─ approved → orchestrator sees architect-review  │
│  │               │     tag → re-launches architect                    │
│  │               └─ Architect reviews again (round N+1)               │
│  │                                                                    │
│  ▼                                                                    │
│ Close task → feature in tk ready → HUMAN REVIEW                      │
└───────────────────────────────────────────────────────────────────────┘
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
            │  • feature → log "ready for        │                     │
            │    human review", skip             │                     │
            │  • task → derive worktree from     │                     │
            │    parent feature, create if       │                     │
            │    needed, add HEAD SHA note,      │                     │
            │    launch assignee agent           │                     │
            │                                    │                     │
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
            │  CODER: "requesting-review"        │                     │
            │  → assign to code-reviewer, launch │                     │
            │                                    │                     │
            │  CODE-REVIEWER: "approved"         │                     │
            │  → if architect-review tag:        │                     │
            │    assign to architect, launch     │                     │
            │  → else: close task                │                     │
            │                                    │                     │
            │  CODE-REVIEWER: "changes-requested"│                     │
            │  → assign to coder + SHA note,     │                     │
            │    launch (or escalate if ≥3)      │                     │
            │                                    │                     │
            │  ARCHITECT: "approved"             │                     │
            │  → close task                      │                     │
            │                                    │                     │
            │  ARCHITECT: "changes-requested"    │                     │
            │  → assign to coder + SHA note,     │                     │
            │    launch (or escalate if ≥3)      │                     │
            │                                    │                     │
            │  ANY: "escalate" or no signal      │                     │
            │  → drain, exit 2                   │                     │
            └──────────────┬─────────────────────┘                     │
                           │                                           │
                           └───────────────────────────────────────────┘
                        (loop: check tk ready for new work,
                         handle next completed subagent)

  Exit codes:
  • 0 = all work complete (no open tickets)
  • 2 = escalation or deadlock
  • 3 = all automated work done, features awaiting human review
  • 130 = interrupted (Ctrl-C)
```

## Ticket Hierarchy

Two levels: **Feature** and **Task**.

### Feature (`type: feature`)

A logical grouping of related work. One feature = one worktree = one branch = one PR.

- Created by the `create-features` command from a plan document
- **NO assignee** — features are human review gates
- Plan context is **embedded** in the feature description (plan is consumed, not referenced)
- **Depends on all its child tasks** (via `tk dep`) — shows up in `tk ready` when all children close
- May depend on other features for cross-feature ordering
- `prefix:<value>` tag controls worktree/branch name prefix (overrides tk ID, preserves original case)
- Discovery notes from agents are added here (findings relevant to sibling tasks)
- Feature is "done" when a human closes it (after reviewing the branch)

### Task (`type: task`, `parent: feature`)

Sequential unit of work within a feature. Tasks share the feature's worktree and become commits on the feature's branch.

- Has an `assignee` field (initial: `tk:coder`, or `tk:architect-reviewer` for the last task)
- Tasks within a feature form a linear chain (no parallel tasks)
- Last task in chain has `architect-review` tag and `tk:architect-reviewer` assignee
- Progress notes accumulate on the task via `tk` notes as agents hand off
- Each task cycles through: coder → code-reviewer → closed (or architect loop for architect-review tasks)

### Dependency Model

```text
Feature A ──dep──► Task 1 (child of Feature A)
Feature A ──dep──► Task 2 (child of Feature A)
Feature A ──dep──► Arch Review (child of Feature A)
Task 2    ──dep──► Task 1 (linear chain)
Arch Rev  ──dep──► Task 2 (linear chain)
Feature B ──dep──► Feature A (cross-feature ordering)
Feature B ──dep──► Task 3 (child of Feature B)
Task 3    ──dep──► Feature A (first task in B depends on Feature A)
```

`create-features` sets up all these dependencies at creation time. The combined effect:

- Task 1 is immediately discoverable via `tk ready`
- Task 2 is blocked until Task 1 closes
- Architect review is blocked until Task 2 closes
- Feature A appears in `tk ready` only when all its tasks (including architect review) are closed
- Feature B's tasks are blocked until Feature A is closed (by a human)

## Agent Roles

### Coder (`tk:coder`)

**Model:** opus | **Tools:** Bash, Read, Edit, Write, Grep, Glob

Implements the work AND runs tests. No separate tester — the coder owns test execution. No point requesting review if
tests don't pass.

- Reads task description + task notes (sees prior review feedback if iterating)
- Reads `[orchestrator]` note for HEAD SHA — prior commits are from earlier tasks in the feature
- If broader context needed: reads parent feature description + feature notes
- Implements the work described in the task
- Runs tests, ensures they pass
- Adds progress notes to the task (what was done, decisions, files changed)
- Adds discovery notes to the parent **feature** if findings affect sibling tasks
- When done: returns to orchestrator with "requesting-review" signal
- Orchestrator immediately launches code-reviewer (no `tk ready` cycle needed)

### Code-Reviewer (`tk:code-reviewer`)

**Model:** opus | **Tools:** Bash, Read, Grep, Glob (no Edit/Write)

Reviews code quality AND test quality. Validates that the coder wrote good tests, not just tests that pass.

- Reads task description + task notes (what was implemented, decisions made)
- Uses HEAD SHA from `[orchestrator]` note to focus review on current task's changes
- Full branch diff available for integration context
- Reviews code quality, correctness, style
- Reviews test quality — are tests meaningful or just written to pass? Do they align with the feature requirements?
- Runs task-specific tests to confirm they pass
- **Checks iteration count in notes**: if 3 prior reviews exist → escalate to orchestrator → user
- Approved: returns "approved" → orchestrator closes task (or re-launches architect for architect-review tasks)
- Changes needed: returns "changes requested" with detailed feedback → orchestrator relaunches coder
- No Edit/Write tools — evaluates, doesn't modify
- Feedback must be specific enough that a fresh coder agent can act on it

### Architect-Reviewer (`tk:architect-reviewer`)

**Model:** opus | **Tools:** Bash, Read, Grep, Glob (no Edit/Write)

Feature-level review as the last task in the chain. Runs in the feature worktree and reviews the full branch diff
covering all tasks.

- Reads task description, parent feature, and all sibling task notes from `tk`
- Reviews full branch diff (`git diff $(git merge-base HEAD origin/HEAD)..HEAD`)
- Checks cross-task coherence (e.g., backend API matches what frontend expects)
- Checks downstream `tk` dependencies — features/tasks that depend on this work
- Runs integration tests
- Approved: returns "approved" → orchestrator closes task → feature appears in `tk ready` for human review
- Changes needed: returns "changes-requested" → orchestrator assigns to coder for fixes → code-reviewer reviews →
  architect re-reviews
- Does NOT create PRs — human handles PRs after human review
- Blocker/architectural concern: returns escalation → orchestrator surfaces to user

### Orchestrator (`just start-work`)

**Implementation:** Bash script inlined in `scripts/justfile` — no LLM, purely deterministic signal dispatch.

Coordinates the workflow without accumulating domain knowledge. Alternates between discovery and reaction:

1. **Discovery** — polls `tk ready` for unblocked items:
   - Feature → log "ready for human review", skip (features have no assignee)
   - Task → derive worktree from parent feature, create if needed, add HEAD SHA note, launch assignee agent
   - One agent per worktree at a time (serialization constraint)

2. **Reaction** — handles subagent completions via return text signal blocks:
   - Coder "requesting-review" → assign to code-reviewer, launch
   - Code-reviewer "approved" → if architect-review tag: assign to architect, launch. Else: close task
   - Code-reviewer "changes-requested" → count review rounds, assign to coder + SHA note, launch (or escalate after 3)
   - Architect "approved" → close task
   - Architect "changes-requested" → count architect rounds, assign to coder + SHA note, launch (or escalate after 3)
   - Any "escalate" or no valid signal → drain running subagents, exit 2

**Exit codes:** 0 = all complete, 2 = escalation/deadlock, 3 = features awaiting human review, 130 = interrupted.

## Context Model

| Context Type       | Where                | Written By                | Read By                       |
| ------------------ | -------------------- | ------------------------- | ----------------------------- |
| Plan/requirements  | Feature description  | `create-features` command | All agents on that feature    |
| Progress/work log  | Task notes           | Each agent during handoff | Next agent in lifecycle       |
| Discovery/findings | Feature notes        | Any agent                 | Sibling task agents           |
| Escalation signals | Subagent return text | Completing agent          | Orchestrator only             |
| Review history     | Task notes           | Code-reviewer, architect  | Next coder iteration, and     |
|                    |                      |                           | code-reviewer (iteration cap) |
| HEAD SHA context   | Task notes           | Orchestrator              | Coder, code-reviewer          |

### Context Scoping

- **Primary**: task description + task notes (focused, immediate)
- **Broader**: parent feature description + feature notes (on-demand)
- **Orchestrator**: `tk ready` + return text (never reads notes)

## Communication Channels

- **Agent → tk**: add notes, close/reopen tasks, modify dependencies
- **Agent → orchestrator**: subagent return text (summary + lifecycle signals + escalations)
- **Orchestrator → agents**: HEAD SHA note on task before launch
- **Agent → sibling agents**: notes on the parent feature (discovery context)

## Plan Consumption (`create-features` command)

1. Reads plan document (markdown, path provided as argument)
2. Creates feature tickets with: plan context embedded in description, no assignee, optional `prefix:<value>` tag
3. Creates task tickets as children with: work description, initial assignee (`tk:coder`), linear chain deps
4. Auto-creates architect-review task as last in each chain (`tk:architect-reviewer`, `architect-review` tag)
5. Sets each feature to depend on all its child tasks (so feature appears in `tk ready` when all tasks close)
6. Sets cross-feature dependencies (feature-to-feature AND first-task-to-feature)
7. Plan is consumed — features carry their context forward, original doc not referenced again
