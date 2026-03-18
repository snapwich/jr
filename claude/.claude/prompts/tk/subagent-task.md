Work on `just show $ARGUMENTS[0]`. Use `just show <parent>` if you need higher-level context around the current task.

## Signaling Completion

Every subagent MUST end by running `just signal` and **outputting its result verbatim as the final message**. Do not
summarize, add commentary, or output anything after the signal block.

```sh
just signal <type> <ticket-id> "<summary>" ["<role>"]
```

The command outputs a signal block — copy it exactly as your final output:

```text
---
signal: requesting-review
ticket: abc-1234
summary: Implemented feature X with tests
```

The optional `role` parameter overrides the default note prefix. The architect-reviewer passes `"architect"` to get
`[architect]` notes.

Valid signals:

| Signal              | Agent                             | Meaning                                       |
| ------------------- | --------------------------------- | --------------------------------------------- |
| `requesting-review` | coder                             | Implementation done, tests pass, ready for CR |
| `approved`          | code-reviewer, architect-reviewer | Code/feature looks good                       |
| `changes-requested` | code-reviewer, architect-reviewer | Issues found, coder should address feedback   |
| `rebase-complete`   | rebaser                           | Rebase conflicts resolved, rebase finished    |
| `escalate`          | any                               | Blocker that needs human attention            |

## Note Conventions

Prefix every note with your agent role in brackets:

```text
[coder] Implemented auth endpoint using JWT. Added 12 unit tests.
[code-reviewer] APPROVED. Code quality good. Tests are meaningful.
[code-reviewer] CHANGES REQUESTED. 1. auth.test.ts: need error cases. 2. middleware/auth.ts:15: race condition.
[architect] APPROVED. Feature coherent. Backend API matches frontend expectations.
[architect] CHANGES REQUESTED. 1. API contract mismatch between task A and task B.
```

### Task Notes vs Feature Notes

| Note type              | Where       | Examples                                                 |
| ---------------------- | ----------- | -------------------------------------------------------- |
| Progress/decisions     | Task        | "Implemented X, chose approach Y because Z"              |
| Review feedback        | Task        | "Changes requested: ...", "Approved"                     |
| Steps taken            | Task        | "Ran tests, 12/12 pass", "Fixed lint errors"             |
| Cross-task discoveries | **Feature** | "API shape differs from plan, sibling tasks use X"       |
| Architectural findings | **Feature** | "Shared util needed for auth across tasks"               |
| Discoveries            | **Feature** | "Patterns not in docs, stale context, risks not in plan" |
| Blockers/risks         | **Feature** | "External API rate limit may affect tests"               |

Rule of thumb: if only the next agent on this task needs it, note on the task. If sibling tasks or the architect needs
it, note on the feature.

## Running Tests

**Always prefix test commands with `CI=true`** (e.g., `CI=true pnpm test`, `CI=true python -m pytest`). Many test
runners and dev tools default to watch mode, interactive prompts, or browser launching without it, which hangs the
agent.

## Skills

Some projects provide skills — project-specific commands for running tests, linting, formatting, type-checking, and
other operations. If skills are listed in your system prompt, prefer using them over guessing at shell commands. Skills
encode the correct commands, flags, and paths for the specific project.

Before running a project operation (tests, lint, format, type-check, etc.), check if a matching skill is available. If
one exists, invoke it with the Skill tool. If no matching skill exists, fall back to CLAUDE.md, justfile, package.json,
or other project docs for the correct command.

## Worktree Context

You are working in a **feature worktree** shared with other tasks in the same feature. Prior commits are from earlier
tasks — do not modify or rebase them.

## Integrity

- Do NOT silently apply patterns that seem wrong
- Do NOT complete tasks you know are incomplete
- Do NOT assume the plan author understood implications you're discovering
