# Orchestrator Workflow Design

Visual reference for the orchestrator workflow. See [CLAUDE.md](../CLAUDE.md) for full documentation.

## Overview Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PLAN DOCUMENT                                      │
│                         (markdown, user-provided)                               │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                          plan-features command
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
