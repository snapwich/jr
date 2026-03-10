Post-mortem analysis of a completed or in-progress feature. Read-only — presents findings, doesn't make changes.

## Input

`$ARGUMENTS` is a feature ticket ID.

## Process

### 1. Gather Ticket Data

Read the feature and all child tasks with their notes:

```sh
just show <feature-id>
just tree <feature-id>
```

Then for each child task: `just show <task-id>` to get description, status, and notes.

### 2. Find Session Logs

Derive the worktree path from the feature:

```sh
just worktree-name <feature-id>
```

Use the worktree name to find the matching `~/.claude/projects/` directory. Claude Code creates project directories
based on the absolute path of the working directory, with slashes replaced by dashes and a leading dash. Look for
directories matching the worktree path pattern.

Read all `.jsonl` session files in the matching project directory. Each line is a JSON object representing an API
message. Focus on assistant messages with tool calls and tool results — these show what the agent actually did.

### 3. Analyze for Friction Patterns

Cross-reference ticket notes, session logs, and task descriptions to identify:

- **Churning**: Excessive exploration, repeated failures, trial-and-error loops. Signs: same file read multiple times,
  same command run with variations, long sequences of failed attempts before finding the right approach. Quantify where
  possible (e.g., "spent 15 tool calls exploring X before finding Y").

- **Missed catches**: Regressions or gaps that passed code-review but were caught later by the architect or human. Look
  for `[architect] CHANGES REQUESTED` or `[human]` notes that identify issues the code-reviewer should have caught.
  Cross-reference with the code-reviewer's approval note — what did they check vs. what they missed?

- **Wasted cycles**: Full rework loops triggered by things that should have been caught earlier. A task that went
  through multiple coder→code-reviewer→coder cycles where the final fix was something obvious from the start. Architect
  rework that reopened tasks for issues visible in the original diff.

- **Underspecified tasks**: Tasks where the coder spent disproportionate effort on discovery vs. implementation. Signs:
  long setup phases, multiple escalation notes, scope discovery notes, coder notes expressing confusion about
  requirements. Compare actual work done against what the task description specified.

### 4. Present Findings

Organize findings into three categories:

#### Project recommendations

Specific, actionable additions to the project's CLAUDE.md, tooling docs, or test patterns that would help future agents
working in this codebase. Examples:

- "Add to CLAUDE.md: Sass `:global()` selector behaves differently than LESS — nested `&` references the global scope,
  not the parent selector"
- "Add a test helper for dark mode class toggling — multiple tasks needed this and each discovered it independently"
- "Document the build pipeline's CSS module resolution order in CLAUDE.md"

#### Feature/task recommendations

Were task descriptions underspecified or misleading? Did the planning process (`/tk:plan-features`) miss important
details? Should remaining open tickets be updated before continuing work? Examples:

- "Task X described 'update styles' but didn't mention the dark mode variant — coder discovered it mid-implementation"
- "Feature acceptance criteria said 'no .less files remain' but task 3 was scoped to only convert components/, leaving
  utils/ unconverted"
- "Remaining task Y should be updated to include: ..."

#### Workflow recommendations

Observations about agent behavior that suggest `.agents`-level changes — agent definitions, orchestrator logic, review
process. These are surfaced for the user to act on separately. Examples:

- "Code-reviewer approved a migration without checking semantic equivalence — consider adding a migration-specific
  review checklist"
- "Architect caught an issue on second review that was present in the original diff — code-reviewer's mutation testing
  didn't target the right code paths"
- "Coder escalated for a missing system dependency that could have been detected in task description"

## Rules

- **Read-only** — do not modify tickets, code, or configuration
- **Evidence-based** — every finding must cite specific ticket notes, session log entries, or code. No speculation.
- **Actionable** — every recommendation should be something concrete that can be done (add X to CLAUDE.md, update ticket
  Y, change agent definition Z)
- **Proportional** — focus on patterns that caused real friction, not theoretical improvements. A single minor hiccup is
  not worth a recommendation.
- Use `just` for all ticket operations
