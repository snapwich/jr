Work is managed using a ticketing CLI. Run `tk` (no args) once to see available commands and syntax. There is no help
subcommand — `tk` alone displays usage. Do not run `tk help`, `tk --help`, or `tk <cmd> help`.

## Signaling Completion

Every subagent MUST use `just signal` as the **last command** in their output. This atomically adds the completion note
and outputs the signal block for the orchestrator.

```sh
just signal <type> <ticket-id> "<summary>" ["<details>"]
```

Valid signals:

| Signal              | Agent              | Meaning                                       |
| ------------------- | ------------------ | --------------------------------------------- |
| `requesting-review` | coder              | Implementation done, tests pass, ready for CR |
| `approved`          | code-reviewer      | Code and tests look good, task can be closed  |
| `changes-requested` | code-reviewer      | Issues found, coder should address feedback   |
| `feature-approved`  | architect-reviewer | Feature is coherent, PRs ready                |
| `task-rework`       | architect-reviewer | Specific task(s) need changes (in details)    |
| `escalate`          | any                | Blocker that needs human attention            |

## Note Conventions

Prefix every note with your agent role in brackets:

```text
[coder] Implemented auth endpoint using JWT. Added 12 unit tests.
[code-reviewer] APPROVED. Code quality good. Tests are meaningful.
[code-reviewer] CHANGES REQUESTED. 1. auth.test.ts: need error cases. 2. middleware/auth.ts:15: race condition.
[architect] Feature coherent. Backend API matches frontend expectations. PRs opened.
```

### Task Notes vs Feature Notes

| Note type              | Where       | Examples                                           |
| ---------------------- | ----------- | -------------------------------------------------- |
| Progress/decisions     | Task        | "Implemented X, chose approach Y because Z"        |
| Review feedback        | Task        | "Changes requested: ...", "Approved"               |
| Steps taken            | Task        | "Ran tests, 12/12 pass", "Fixed lint errors"       |
| Cross-task discoveries | **Feature** | "API shape differs from plan, sibling tasks use X" |
| Architectural findings | **Feature** | "Shared util needed for auth across tasks"         |
| Blockers/risks         | **Feature** | "External API rate limit may affect tests"         |

Rule of thumb: if only the next agent on this task needs it, note on the task. If sibling tasks or the architect needs
it, note on the feature.

## Context Scoping

- **Primary context**: task description + task notes (focused, immediate)
- **Broader context**: parent feature description + feature notes (read on-demand when needed)
- Read the parent feature with `tk show <parent-id>` when you need context beyond your task

## Git Workflow

- Make logical commits — meaningful units of change, not one giant commit
- Write clear commit messages explaining the "why"
- Do NOT push — human reviews locally first, then pushes manually
- Code-reviewers and architect-reviewers do NOT commit or push (read-only)
