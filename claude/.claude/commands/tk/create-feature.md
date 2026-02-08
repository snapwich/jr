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
  -a tk:architect-reviewer \
  -d "<plan context embedded in the description>"
```

The description MUST include all relevant plan context for this feature. The plan is consumed — the original document is
not referenced again. Include:

- What this feature accomplishes (from the plan)
- Acceptance criteria
- Any architectural notes or constraints
- Cross-feature context if relevant

### 4. Create Task Tickets

For each task within a feature:

```sh
tk create "<task title>" \
  -t task \
  -a tk:coder \
  --parent <feature-id> \
  --tags "repo:<repo-name>" \
  -d "<task description with implementation guidance>"
```

In multi-repo mode, every task MUST have a `repo:<name>` tag matching the target repo directory name. In single-repo
mode, omit the tag (the orchestrator defaults to `.`).

The task description should include:

- What to implement
- Acceptance criteria
- Any relevant technical context from the plan

### 5. Set Up Dependencies

#### Feature depends on all its child tasks

Every feature must depend on all its child tasks so it only appears in `tk ready` when all children are closed:

```sh
tk dep <feature-id> <task-id-1>
tk dep <feature-id> <task-id-2>
# ... for each child task
```

#### Inter-task dependencies

Set up ordering between tasks within a feature (e.g., frontend depends on backend):

```sh
tk dep <task-id-dependent> <task-id-dependency>
```

#### Cross-feature dependencies

If one feature depends on another completing first:

```sh
tk dep <feature-id-dependent> <feature-id-dependency>
```

This blocks all tasks in the dependent feature until the dependency feature is architect-reviewed and closed.

### 6. Verify

After creating all tickets:

1. Show the full hierarchy: `tk tree`
2. Check for dependency cycles: `tk dep cycle`
3. Show what's immediately ready to work on: `tk ready`
4. Report a summary to the user

## Output

Present the user with:

- Total features and tasks created
- The ticket hierarchy (from `tk tree`)
- What's immediately ready to work on
- Any cross-feature dependencies
- Confirmation that no dependency cycles exist

## Rules

- Embed plan context in feature descriptions — do not reference external plan files
- Every feature gets assignee `tk:architect-reviewer`
- Every task gets initial assignee `tk:coder`
- Every feature must depend on all its child tasks
- Keep task scope focused — one task = one worktree = one branch = one PR
- In multi-repo mode, every task must have a `repo:<name>` tag
- If the plan is ambiguous about task breakdown, propose your interpretation and ask the user before creating tickets
