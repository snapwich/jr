Break down a plan document into features and tasks with proper dependencies.

## Input

The user provides a plan document — either as a file path (`$ARGUMENTS`) or pasted directly. The plan describes work to
be done, potentially spanning multiple features and repos.

## Process

### 1. Analyze the Plan

Read the plan document and identify:

- **Features**: logical groupings of related work (each becomes a `type: feature` ticket)
- **Tasks**: concrete units of implementation within each feature (each becomes a `type: task` ticket)
- **Dependencies**: ordering constraints between tasks and between features
- **Repos**: which repo(s) each task targets (relevant in multi-repo mode)
- **Cross-feature test needs**: when the plan involves multiple interrelated features, identify interactions between
  features that need verification but can't be tested within any single feature's scope. Usually, a downstream feature
  that already depends on an upstream feature is the right place for these tests — a task in the downstream feature can
  verify the interaction since it has access to both features' code via stacked branches. Add the cross-feature test
  requirements to that task's description (or its "Feature verification" section).

  Only create a **separate verification feature** when there is no downstream feature that naturally depends on all the
  features being tested. This is rare — e.g., multiple independent features that all contribute to a shared flow with no
  feature depending on all of them. Keep verification features lean: only the tests that genuinely require code from
  multiple features to be present.

### 2. Resolve Open Questions

Before creating any tickets, scan the plan for unresolved decisions and ambiguities. Look for:

- Explicit markers: "TBD", "TODO", "TBC", "open question", "to be decided", "to be determined"
- Alternatives without a decision: "X or Y", "either A or B", "option 1 / option 2"
- Uncertainty language: "maybe", "possibly", "might", "not sure if", "need to decide"
- Incomplete specifications: missing error handling strategy, unspecified edge cases, vague acceptance criteria
- Placeholders: "...", "etc.", "and so on" where specifics are needed for implementation

Collect **all** unresolved items and present them to the user in a single batch. For each item:

- Quote the relevant text from the plan
- Explain why it needs resolution (what decision the coder would be stuck on)
- Suggest a default if one is obvious

Wait for the user to answer all open questions before proceeding. Use the resolved answers when writing ticket
descriptions — replace every ambiguity with the concrete decision. **No ticket description should contain unresolved
language.** If you find yourself writing "TBD" or "or" between alternatives in a ticket, stop and ask the user.

### 2.5. Behavioral Impact Analysis

Before creating tickets, scan the plan for **behavioral breaking changes** — places where the new pattern fundamentally
changes how code executes, not just how it's written. These require explicit warnings in task descriptions.

**Checklist** (check each that applies):

- [ ] **Async/await implications** — Does the new pattern wait for operations that were previously fire-and-forget? Does
      it change what happens on success/failure?
- [ ] **Control flow changes** — Does lifecycle management shift (e.g., state-controlled → promise-controlled)? Does
      error handling responsibility move?
- [ ] **State management shifts** — Does the pattern change from declarative (React state) to imperative (function
      calls)? Vice versa?
- [ ] **Callback behavior** — Do callbacks need to be awaited that weren't before? Do return values now matter?
- [ ] **Side effect timing** — Does the order or timing of side effects change? Are there new race conditions?

For each "yes" answer, add an explicit **BEHAVIORAL CHANGE** callout to the affected task description:

> **BEHAVIORAL CHANGE**: [Old pattern] becomes [new pattern].
>
> - Old behavior: [what happened before]
> - New behavior: [what happens now]
> - Patterns that will break: [fire-and-forget, early returns, etc.]
> - What to look for: [callback chains, async operations, etc.]

### 2.6. Integration Test Analysis

For tasks that modify shared components, APIs, or cross-cutting concerns, identify integration test requirements:

1. **Discovery**: Determine if integration tests exist that exercise the modified code. Use project skills (if
   available), CLAUDE.md, or explore the test structure to understand how integration tests are organized.

2. **Add to task description** when integration tests are relevant:

   > **Integration verification**: Verify integration tests covering [affected area] pass before marking complete.

3. **When to require**: Migration tasks, API changes, shared component modifications, changes with many consumers

If no integration tests exist but should (shared component migration), note this as a gap on the feature description —
but don't block task creation on it.

### 3. Discover Project Layout

```sh
just worktree-list
```

This shows the project structure — repos and their worktrees. A single level of entries under `.` means single-repo
mode. Entries grouped under named subdirectories means multi-repo mode — use those directory names as `repo:<name>` tag
values on tasks.

### 4. Create Feature Tickets

For each feature identified in the plan:

```sh
tk create "<feature title>" \
  -t feature \
  -d "<plan context embedded in the description>"
```

Features have **NO assignee** — they are human review gates that appear in `tk ready` when all child tasks close.

In multi-repo mode, add a `repo:<name>` tag to each feature matching the target repo directory name. If the user also
specifies an external prefix (e.g., a JIRA ID like "PEX-1234"), add a `prefix:<value>` tag to the **feature** ticket.
This overrides the tk ticket ID as the worktree/branch name prefix, preserving the original case of the value. Example:
`--tags "prefix:PEX-1234,repo:backend"`.

The description MUST include all relevant plan context for this feature. The plan is consumed — the original document is
not referenced again. Include:

- What this feature accomplishes (from the plan)
- **Acceptance criteria** — written as specific, testable statements. These are feature-level requirements that may span
  multiple tasks (e.g., "the API endpoint returns paginated results and the frontend renders them with infinite
  scroll"). The architect-reviewer traces these to test coverage across the branch. Write them with the same rigor as
  task-level requirements — concrete enough that you can point to a test and say "this verifies that criterion."
- Any architectural notes or constraints
- Cross-feature context if relevant

### 5. Create Task Tickets

Tasks within a feature form a **linear chain** — no parallel tasks within a feature. Order them logically (e.g., backend
before frontend, data model before API, etc.).

For each task within a feature:

```sh
tk create "<task title>" \
  -t task \
  -a tk:coder \
  --parent <feature-id> \
  -d "<task description with implementation guidance>"
```

In multi-repo mode, every task MUST have a `repo:<name>` tag matching the target repo directory name. Features MUST also
have a `repo:<name>` tag in multi-repo mode (used by `rebase-feature`, `approve`, and `worktree-deps`). In single-repo
mode, omit the tag (the orchestrator defaults to `.`).

**Always create an architect-review task** as the **last task** in each feature's chain:

```sh
tk create "Architect review" \
  -t task \
  -a tk:architect-reviewer \
  --parent <feature-id> \
  --tags "architect-review" \
  -d "Review the full feature branch for cross-task coherence, integration quality, and architectural soundness."
```

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

The coder discovers correct commands via skills (if available), CLAUDE.md, justfile, or package.json at implementation
time.

**Last implementation task owns feature-level test verification.** The last implementation task (immediately before the
architect-review task) has access to all prior tasks' code in the worktree. If the feature's acceptance criteria require
verification beyond what individual tasks test, add a "Feature verification" section to this task's description listing
what needs to be verified and at what level. Use the cheapest test type that adequately covers each criterion:

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

### 6. Set Up Dependencies

#### Feature depends on all its child tasks

Every feature must depend on all its child tasks so it only appears in `tk ready` when all children are closed:

```sh
tk dep <feature-id> <task-id-1>
tk dep <feature-id> <task-id-2>
# ... for each child task (including the architect-review task)
```

#### Linear task chain within each feature

Tasks within a feature form a linear chain — each task depends on the previous one:

```sh
tk dep <task-2> <task-1>
tk dep <task-3> <task-2>
# ... and so on
```

The architect-review task is always last in the chain.

#### Cross-feature dependencies

If one feature depends on another completing first:

```sh
# Feature B depends on Feature A
tk dep <feature-B-id> <feature-A-id>
# First task of Feature B also depends on Feature A (blocks until A is human-reviewed and closed)
tk dep <first-task-B-id> <feature-A-id>
```

This blocks all tasks in the dependent feature until the dependency feature is closed by a human.

### 7. Verify

After creating all tickets:

1. Show the full hierarchy: `tk tree`
2. Check for dependency cycles: `tk dep cycle`
3. Show what's immediately ready to work on: `tk ready`
4. Run `just verify-tickets` to check for linear chains, architect-review tags, and cross-feature task dependencies
5. Report a summary to the user

## Output

Present the user with:

- Total features and tasks created
- The ticket hierarchy (from `tk tree`)
- What's immediately ready to work on
- Any cross-feature dependencies
- Confirmation that no dependency cycles exist

## Rules

- Embed plan context in feature descriptions — do not reference external plan files
- Features have **NO assignee** — they are human review gates
- Every implementation task gets initial assignee `tk:coder`
- Every feature must have an architect-review task as the last task in its chain
- Every feature must depend on all its child tasks
- Tasks within a feature form a **linear chain** — no parallel tasks
- One feature = one worktree = one branch = one PR
- Tasks must only depend on other tasks within the same feature — use feature-level dependencies for cross-feature
  ordering
- Cross-feature deps: feature B depends on feature A, AND first task of feature B depends on feature A
- In multi-repo mode, every task must have a `repo:<name>` tag
- `prefix:<value>` tags go on **features** (not tasks) for worktree/branch naming
- **No unresolved questions in tickets** — every TBD, open alternative, or ambiguity in the plan must be resolved with
  the user before creating tickets. Coders implement exactly what the ticket says; if it says "TBD", they're stuck.
- **No explicit shell commands in task descriptions** — describe WHAT to do (run tests, type-check, lint, build), not
  HOW (specific pnpm/npm/yarn/make commands). Coders discover the correct commands at implementation time via skills,
  CLAUDE.md, justfile, or project docs. This keeps tickets timeless — project tooling may change between ticket creation
  and implementation.
