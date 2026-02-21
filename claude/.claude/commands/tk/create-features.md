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

### 2. Detect Project Mode

```sh
just detect-mode
```

In multi-repo mode, each task should specify which repo it targets.

### 3. Create Feature Tickets

For each feature identified in the plan:

```sh
tk create "<feature title>" \
  -t feature \
  -d "<plan context embedded in the description>"
```

Features have **NO assignee** — they are human review gates that appear in `tk ready` when all child tasks close.

If the user specifies an external prefix (e.g., a JIRA ID like "PEX-1234"), add a `prefix:<value>` tag to the
**feature** ticket. This overrides the tk ticket ID as the worktree/branch name prefix, preserving the original case of
the value. Example: `--tags "prefix:PEX-1234"`.

The description MUST include all relevant plan context for this feature. The plan is consumed — the original document is
not referenced again. Include:

- What this feature accomplishes (from the plan)
- Acceptance criteria
- Any architectural notes or constraints
- Cross-feature context if relevant

### 4. Create Task Tickets

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

In multi-repo mode, every task MUST have a `repo:<name>` tag matching the target repo directory name. In single-repo
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

### 5. Set Up Dependencies

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

### 6. Verify

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
- If the plan is ambiguous about task breakdown, propose your interpretation and ask the user before creating tickets
