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
     │  assignee:       │                   │  dep: Feature A  │
     │  tk:architect-   │                   │  assignee:       │
     │  reviewer        │                   │  tk:architect-   │
     │                  │                   │  reviewer        │
     │  1 worktree      │                   │  1 worktree      │
     │  1 branch        │                   │  1 branch        │
     │  1 PR            │                   │  (stacked on A)  │
     └────────┬─────────┘                   └────────┬─────────┘
              │                                      │
     ┌────────┼────────┐                    ┌────────┼────────┐
     ▼        ▼        ▼                    ▼        ▼        ▼
  ┌────────┐┌────────┐                   ┌────────┐┌────────┐
  │ Task 1 ││ Task 2 │                   │ Task 3 ││ Task 4 │
  │ coder  ││ coder  │                   │ coder  ││ coder  │
  │        ││ dep: 1 │                   │        ││ dep: 3 │
  └────────┘└────────┘                   └────────┘└────────┘
  ◄── linear chain ──►                   ◄── linear chain ──►

  One feature = one worktree = one branch = one PR.
  Tasks are sequential commits within a feature's worktree.
  Features are assigned to tk:architect-reviewer at creation.
  When all tasks close, architect reviews the full feature branch.
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
│  Orchestrator adds HEAD SHA note before launching coder.         │
│  Code-reviewer uses SHA to focus review on current task changes. │
│                                                                  │
│  Max 3 review iterations per task, then escalate.                │
└──────────────────────────────────────────────────────────────────┘
```

## Feature Lifecycle (architect + human review)

```text
┌─────────────────────────────────────────────────────────────────────┐
│                   FEATURE COMPLETION                                 │
│                                                                     │
│  All child tasks closed                                             │
│  → feature appears in tk ready (architect already assigned)         │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────────────┐                                       │
│  │ ORCHESTRATOR             │  Launches architect-reviewer for      │
│  │ Launches architect       │  feature-level review                 │
│  └──────────────┬───────────┘                                       │
│                 │                                                   │
│                 ▼                                                   │
│  ┌──────────────────────────┐                                       │
│  │ ARCHITECT-REVIEWER       │                                       │
│  │ Reviews full branch diff │                                       │
│  └──────────────┬───────────┘                                       │
│            ┌────┴──────┐                                            │
│            ▼           ▼                                            │
│   ┌────────────┐  ┌───────────────────────────┐                     │
│   │ approved   │  │ changes-requested         │                     │
│   │            │  │                           │                     │
│   │ Assigns to │  │ Reopens tasks or creates  │                     │
│   │ human      │  │ new tasks, chains deps    │                     │
│   │            │  │ → tasks appear in ready   │                     │
│   │ Orchestr.  │  │ → normal coder flow       │                     │
│   │ exits 3    │  │ → all close → architect   │                     │
│   │            │  │   re-reviews              │                     │
│   └─────┬──────┘  └───────────────────────────┘                     │
│         ▼                                                           │
│  ┌──────────────────────────────────────────────┐                   │
│  │ HUMAN REVIEW                                 │                   │
│  │                                              │                   │
│  │ • just approve <feature-id>  → closes feat  │                   │
│  │ • just request-changes <id> "feedback"      │                   │
│  │   → reassigns to architect, adds note       │                   │
│  │   → architect reopens tasks for rework      │                   │
│  └──────────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Architect Rework Flow

```text
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  Feature ready (all tasks closed, architect assigned)                 │
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
│  │               ├─ Architect reopens specific tasks (adds notes)     │
│  │               ├─ Architect may create new tasks                    │
│  │               ├─ Architect chains deps to keep linear order        │
│  │               ├─ Tasks appear in tk ready                          │
│  │               ├─ Coder fixes, signals requesting-review            │
│  │               ├─ Code-reviewer reviews fix                         │
│  │               │  ├─ changes-requested → back to coder              │
│  │               │  └─ approved → close task                          │
│  │               └─ All tasks close → architect re-reviews (N+1)      │
│  │                                                                    │
│  ▼                                                                    │
│ Assign to human → orchestrator exits 3 → HUMAN REVIEW                │
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
            │  • feature with architect assignee │                     │
            │    → launch architect-reviewer     │                     │
            │  • feature with human assignee     │                     │
            │    → log "ready for human review"  │                     │
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
            │  → close task                      │                     │
            │                                    │                     │
            │  CODE-REVIEWER: "changes-requested"│                     │
            │  → assign to coder + SHA note,     │                     │
            │    launch (or escalate if ≥3)      │                     │
            │                                    │                     │
            │  ARCHITECT (on feature): "approved"│                     │
            │  → assign feature to human         │                     │
            │                                    │                     │
            │  ARCHITECT: "changes-requested"    │                     │
            │  → reopened tasks appear in ready  │                     │
            │    (or escalate if ≥3)             │                     │
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
