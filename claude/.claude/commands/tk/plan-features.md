Break down a plan document into features and tasks, or modify existing ticket structures.

## Input

The user provides a plan document or update request — either as a file path (`$ARGUMENTS`) or pasted directly. The input
describes work to be done: new features, new tasks, or modifications to existing tickets.

## Commands

Run `just plan-work` to see all available commands for this workflow.

**Use `just` for ALL ticket operations.** Do NOT use MCP task tools (`mcp__mc-dev__tasks`, `TaskCreate`, `TaskUpdate`,
`TaskList`, `TaskGet`) — those are generic Claude Code task tracking, unrelated to this system's tickets.

## Process

### 1. Discover Current State

Before analyzing the input, map the existing ticket landscape:

```sh
just tree
```

Then build structured data per feature using `just query` with jq filters:

- Feature ID, status, assignee, child tasks
- Chain order — walk from the task with no sibling deps (first) → follow dependents to the end
- Last implementation task — the task that the feature depends on (after all task deps are closed, feature is ready)
- Feature state classification:

| State               | Detection                                                           | Scenario |
| ------------------- | ------------------------------------------------------------------- | -------- |
| Active              | Feature open, at least 1 child task open/in_progress                | 1        |
| Awaiting architect  | Feature open, all children closed, assignee = tk:architect-reviewer | 2        |
| Awaiting human      | Feature open, all children closed, assignee = human                 | 3        |
| Closed              | Feature closed                                                      | 4        |
| New (doesn't exist) | Not found                                                           | 5        |

Also run:

```sh
just ls
```

This shows the project structure — repos and their worktrees. A single level of entries under `.` means single-repo
mode. Entries grouped under named subdirectories means multi-repo mode — use those directory names as `repo:<name>` tag
values on tasks.

### 2. Analyze Input

Identify what changes are needed:

- **Features**: logical groupings of related work (each becomes a `type: feature` ticket)
- **Tasks**: concrete units of implementation within each feature (each becomes a `type: task` ticket)
- **Dependencies**: ordering constraints between tasks and between features
- **Repos**: which repo(s) each task targets (relevant in multi-repo mode)
- **Modifications to existing features**: new tasks to add, description changes

For existing features, map current chain and identify insertion points (default: append at end of chain).

**Specification depth check**: When the plan references testing specific code (components, endpoints, services, CLI
commands, libraries, pipelines, etc.), explore the actual source to understand its complexity before finalizing ticket
descriptions. **Use Task tool with Explore subagents** for this — do not read source files directly into this context.
Launch Explore agents asking each to summarize the behavior surface of the code under test: inputs, outputs, modes/
options, state transitions, error paths, and external integrations. This keeps the planning context clean while getting
accurate complexity assessments.

**Explore agent scoping**: Direct Explore agents to the project's source code — typically the `default/` worktree (or a
specific repo subdirectory in multi-repo mode). Explicitly tell them to **ignore `.jr/`, `.tickets/`, `.claude/`, and
`justfile`** — these are orchestration infrastructure, not project source. If an Explore agent needs ticket information
(e.g., existing requirements, task descriptions), provide that context in the prompt yourself using `tk` output — do not
let the agent discover it by browsing files.

Compare each Explore summary against the plan's test description for that area. Flag any case where the plan's test
depth is shallow relative to the code's actual behavior surface — these become open questions for §3.

**Cross-feature test needs**: When the plan involves multiple interrelated features, identify interactions between
features that need verification but can't be tested within any single feature's scope. Usually, a downstream feature
that already depends on an upstream feature is the right place for these tests — a task in the downstream feature can
verify the interaction since it has access to both features' code via stacked branches. Add the cross-feature test
requirements to that task's description (or its "Feature verification" section).

Only create a **separate verification feature** when there is no downstream feature that naturally depends on all the
features being tested. This is rare — e.g., multiple independent features that all contribute to a shared flow with no
feature depending on all of them. Keep verification features lean: only the tests that genuinely require code from
multiple features to be present.

### 3. Resolve Open Questions

Before creating or modifying any tickets, scan the input for unresolved decisions and ambiguities. Look for:

- Explicit markers: "TBD", "TODO", "TBC", "open question", "to be decided", "to be determined"
- Alternatives without a decision: "X or Y", "either A or B", "option 1 / option 2"
- Uncertainty language: "maybe", "possibly", "might", "not sure if", "need to decide"
- Incomplete specifications: missing error handling strategy, unspecified edge cases, vague acceptance criteria
- Placeholders: "...", "etc.", "and so on" where specifics are needed for implementation
- **Implicit underspecification**: The plan describes testing something in vague terms ("loads", "works", "interaction",
  "handles requests") but the actual source (explored in §2) reveals significant behavior — multiple modes, stateful
  flows, non-trivial computation, branching logic — that the plan doesn't explicitly cover. For each, present:
  - What the plan says (quote)
  - What the code actually does (from source exploration)
  - The gap between the two
  - Ask the user how deep testing should go — smoke test (exists/responds), functional test (core flows), or exhaustive
    (all modes/edge cases/error paths)

Collect **all** unresolved items and present them to the user in a single batch. For each item:

- Quote the relevant text from the input
- Explain why it needs resolution (what decision the coder would be stuck on)
- Suggest a default if one is obvious

Wait for the user to answer all open questions before proceeding. Use the resolved answers when writing ticket
descriptions — replace every ambiguity with the concrete decision. **No ticket description should contain unresolved
language.** If you find yourself writing "TBD" or "or" between alternatives in a ticket, stop and ask the user.

### 4. Behavioral Impact Analysis

Before creating tickets, scan for **behavioral breaking changes** — places where the new pattern fundamentally changes
how code executes, not just how it's written. These require explicit warnings in task descriptions.

**Checklist** (check each that applies):

- [ ] **Async/await implications** — Does the new pattern wait for operations that were previously fire-and-forget? Does
      it change what happens on success/failure?
- [ ] **Control flow changes** — Does lifecycle management shift (e.g., state-controlled → promise-controlled)? Does
      error handling responsibility move?
- [ ] **Callback behavior** — Do callbacks need to be awaited that weren't before? Do return values now matter?
- [ ] **Side effect timing** — Does the order or timing of side effects change? Are there new race conditions?

For each "yes" answer, add an explicit **BEHAVIORAL CHANGE** callout to the affected task description:

> **BEHAVIORAL CHANGE**: [Old pattern] becomes [new pattern].
>
> - Old behavior: [what happened before]
> - New behavior: [what happens now]
> - Patterns that will break: [fire-and-forget, early returns, etc.]
> - What to look for: [callback chains, async operations, etc.]

### 5. Integration Test Analysis

For tasks that modify shared components, APIs, or cross-cutting concerns, identify integration test requirements:

1. **Discovery**: Determine if integration tests exist that exercise the modified code. Use project skills (if
   available), CLAUDE.md, or explore the test structure to understand how integration tests are organized.

2. **Add to task description** when integration tests are relevant:

   > **Integration verification**: Verify integration tests covering [affected area] pass before marking complete.

3. **When to require**: Migration tasks, API changes, shared component modifications, changes with many consumers

If no integration tests exist but should (shared component migration), note this as a gap on the feature description —
but don't block task creation on it.

### 6. Present Plan

Show a clear view of what will be created or modified. Include:

**For new features:**

- Feature name and summary
- Task list with dependencies
- Cross-feature dependencies if any

**For existing features being modified:**

- Current chain diagram (task order with arrows)
- Proposed chain diagram showing where new tasks insert
- What will be created, reopened, or re-wired

**Warnings:**

- In-progress tasks (recommend waiting)
- Downstream features that will be re-blocked if reopening a closed feature

Wait for user confirmation before executing.

### 7. Execute: Create New Features

For each new feature identified:

```sh
just create "<feature title>" \
  -t feature \
  -a tk:architect-reviewer \
  -d "<plan context embedded in the description>"
```

Features are assigned to `tk:architect-reviewer` at creation. When all child tasks close, the feature appears in
`just ready` and the orchestrator launches the architect for feature-level review.

In multi-repo mode, add a `repo:<name>` tag to each feature matching the target repo directory name. If the user also
specifies an external prefix (e.g., a JIRA ID like "PEX-1234"), use `--external-ref` on the **feature** ticket. This
overrides the tk ticket ID as the worktree/branch name prefix, preserving the original case of the value. Example:
`--external-ref "PEX-1234" --tags "repo:backend"`.

The description MUST include all relevant plan context for this feature. The plan is consumed — the original document is
not referenced again. Include:

- What this feature accomplishes (from the plan)
- **Acceptance criteria** — written as specific, testable statements. These are feature-level requirements that may span
  multiple tasks (e.g., "the API endpoint returns paginated results and the frontend renders them with infinite
  scroll"). The architect-reviewer traces these to test coverage across the branch. Write them with the same rigor as
  task-level requirements — concrete enough that you can point to a test and say "this verifies that criterion."
- Any architectural notes or constraints
- Cross-feature context if relevant

### 8. Execute: Create Tasks

Tasks within a feature form a **linear chain** — no parallel tasks within a feature. Order them logically (e.g., backend
before frontend, data model before API, etc.).

For each task within a feature:

```sh
just create "<task title>" \
  -t task \
  -a tk:coder \
  --parent <feature-id> \
  -d "<task description with implementation guidance>"
```

In multi-repo mode, every task MUST have a `repo:<name>` tag matching the target repo directory name. Features MUST also
have a `repo:<name>` tag in multi-repo mode (used by `rebase-feature`, `approve`, and `worktree-deps`). In single-repo
mode, omit the tag (the orchestrator defaults to `.`).

The task description should include:

- What to implement
- **Requirements**: specific, testable statements of what the implementation must do. These are the basis for test
  coverage — the coder writes tests to verify these requirements, and reviewers check tests against them. Requirements
  don't need to be exhaustive or prescribe implementation details, but they should be concrete enough that you can tell
  from a test whether the requirement is met.
- **Acceptance criteria**: observable conditions for the task to be considered complete
- Any relevant technical context from the plan

Task descriptions should focus on **what** to accomplish, not **how** to run commands:

- "Run the type checker on the components package" — good
- `pnpm --filter @mc/components type-check` — bad (explicit command becomes stale)
- "Run unit tests for the auth module" — good
- `npm test -- --testPathPattern=auth` — bad

The coder discovers correct commands via skills (if available), CLAUDE.md, or other discovery methods at implementation
time.

**Last task owns feature-level test verification.** The last task in the chain has access to all prior tasks' code in
the worktree. If the feature's acceptance criteria require verification beyond what individual tasks test, add a
"Feature verification" section to this task's description listing what needs to be verified and at what level. Use the
cheapest test type that adequately covers each criterion:

- **Unit tests** should cover the majority of requirements — they are fast, focused, and cheap to maintain
- **Integration tests** only where unit tests genuinely can't verify the interaction (e.g., API contracts, middleware
  chains, cross-component data flow). Happy path is usually sufficient unless the integration boundary has its own
  failure modes.
- **E2E tests** only when explicitly needed — expensive to write and maintain

Not every feature needs this section. If all acceptance criteria are already covered by individual tasks' unit tests
(e.g., a migration feature where each task verifies its own migration), omit it.

Example for a feature that does need cross-task verification:

```
## Feature verification
- Verify the API endpoint (task 1) returns data that the renderer (task 2) handles correctly [integration]
- Verify the Storybook stories render without errors [unit — snapshot test]
```

**Cross-feature test placement.** If verifying a feature requires testing its interaction with code from other features,
prefer adding those tests to a downstream feature that already depends on the upstream feature — a task in that feature
has access to both features' code. Only create a separate verification feature when no existing feature naturally
depends on all the features being tested (see "Cross-feature test needs" in the analysis step). The feature's own
acceptance criteria should only cover what can be tested within its scope.

### 9. Execute: Modify Existing Features

Handle each scenario differently:

**Scenario 1 — Active feature** (open, has open/in_progress children):

- If any task is `in_progress`, **warn the user** and recommend waiting for it to complete before modifying the chain.
  Proceed only with explicit confirmation.
- Create new tasks, chain them after the current last task, add feature deps on new tasks.

**Scenario 2 — Awaiting architect** (open, all children closed, assignee = tk:architect-reviewer):

- Add a note explaining what changed: `just add-note $FEATURE "[human] Adding new tasks: <brief description>"`
- Create new tasks, chain after current last task, add feature deps.
- The architect review will trigger again after the new tasks close.

**Scenario 3 — Awaiting human** (open, all children closed, assignee = human):

- Reassign feature back to architect: `just assign $FEATURE tk:architect-reviewer`
- Add a note: `just add-note $FEATURE "[human] Adding new tasks — re-review required: <brief description>"`
- Create new tasks, chain after current last task, add feature deps.

**Scenario 4 — Closed feature**:

- Reopen the feature: `just reopen $FEATURE`
- Reassign to architect: `just assign $FEATURE tk:architect-reviewer`
- Add note: `just add-note $FEATURE "[human] Reopened to add new tasks: <brief description>"`
- Create new tasks, chain after current last task, add feature deps.
- **Warning**: Reopening a closed feature re-blocks any downstream features that depend on it. Note this to the user.

**Re-wiring pattern** for appending tasks at end:

```sh
# New task chains after last existing task
just dep $NEW_TASK_1 $LAST_TASK

# Chain new tasks together (if multiple)
just dep $NEW_TASK_2 $NEW_TASK_1

# Feature depends on each new task
just dep $FEATURE $NEW_TASK_1
just dep $FEATURE $NEW_TASK_2
```

For **mid-chain insertion** (inserting between two existing tasks): break the link between the two adjacent tasks,
insert the new task(s), and re-wire both ends.

### 10. Set Up Dependencies

#### Feature depends on all its child tasks

Every feature must depend on all its child tasks so it only appears in `just ready` when all children are closed:

```sh
just dep <feature-id> <task-id-1>
just dep <feature-id> <task-id-2>
# ... for each child task
```

#### Linear task chain within each feature

Tasks within a feature form a linear chain — each task depends on the previous one:

```sh
just dep <task-2> <task-1>
just dep <task-3> <task-2>
# ... and so on
```

#### Cross-feature dependencies

If one feature depends on another completing first:

```sh
# Feature B depends on Feature A
just dep <feature-B-id> <feature-A-id>
# First task of Feature B also depends on Feature A (blocks until A is human-reviewed and closed)
just dep <first-task-B-id> <feature-A-id>
```

This blocks all tasks in the dependent feature until the dependency feature is closed by a human.

### 11. Execute: Modify Descriptions

Use `just show <id>` to read the current ticket content. Then use the Edit tool on `.tickets/<id>.md` to modify the body
text.

**Do not hand-edit frontmatter** — use `tk` commands for metadata changes (status, assignee, tags, deps).

### 12. Verify

After all changes:

1. Show the full hierarchy: `just tree`
2. Check for dependency cycles: `just dep cycle`
3. Show what's immediately ready to work on: `just ready`
4. Run `just verify-tickets` to check for linear chains and cross-feature task dependencies
5. Report a summary to the user: what was created, reopened, re-wired

## Output

Present the user with:

- Total features and tasks created/modified
- The ticket hierarchy (from `just tree`)
- What's immediately ready to work on
- Any cross-feature dependencies
- Confirmation that no dependency cycles exist

## Scope Boundary

**STOP after verification.** This command creates and modifies tickets ONLY. Do NOT:

- Spawn agents to work on tickets (e.g., `Task` tool with `subagent_type="tk:coder"`)
- Run `just start-work`
- Start implementing task requirements
- Make code changes

Work on tickets happens through the orchestrator: `just start-work`. The human decides when to start work.

## Edge Cases

- **Feature with in-progress task**: Warn the user and recommend waiting. Modifying the chain while a coder is active
  risks conflicts. Only proceed with explicit confirmation.
- **Feature with no tasks yet**: New tasks become the first in the chain.
- **Closed feature with downstream deps**: Reopening re-blocks all downstream features that depend on it. Always note
  this to the user before proceeding.
- **Mid-chain insertion**: Supported — identify the insertion point, break the link between the two adjacent tasks,
  insert new task(s), re-wire both ends.

## Rules

- Embed plan context in feature descriptions — do not reference external plan files
- Features are assigned to `tk:architect-reviewer` at creation — the architect reviews when all tasks close
- Every task gets initial assignee `tk:coder`
- Every feature must depend on all its child tasks
- Tasks within a feature form a **linear chain** — no parallel tasks
- One feature = one worktree = one branch = one PR
- Tasks must only depend on other tasks within the same feature — use feature-level dependencies for cross-feature
  ordering
- Cross-feature deps: feature B depends on feature A, AND first task of feature B depends on feature A
- In multi-repo mode, every task must have a `repo:<name>` tag
- `--external-ref` goes on **features** (not tasks) for worktree/branch naming
- **No unresolved questions in tickets** — every TBD, open alternative, or ambiguity in the plan must be resolved with
  the user before creating tickets. Coders implement exactly what the ticket says; if it says "TBD", they're stuck.
- **No explicit shell commands in task descriptions** — describe WHAT to do (run tests, type-check, lint, build), not
  HOW (specific pnpm/npm/yarn/make commands). Coders discover the correct commands at implementation time via skills,
  CLAUDE.md, justfile, or project docs. This keeps tickets timeless — project tooling may change between ticket creation
  and implementation.
- When adding tasks to awaiting-human features, reassign feature to `tk:architect-reviewer`
- When adding tasks to closed features, reopen the feature AND reassign to `tk:architect-reviewer`
- Add `[human]` notes explaining what was changed and why on modified features
- New tasks default to appending at end of chain unless user specifies otherwise
- Use `tk` CLI for all ticket operations — NOT MCP task tools
- STOP after verification — do not spawn agents or start implementation
