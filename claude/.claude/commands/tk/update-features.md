Modify existing ticket structures — add tasks to features, create new features, or edit descriptions.

## Input

The user provides an update request — either as a file path (`$ARGUMENTS`) or described interactively. The request
describes what needs to change: new tasks for existing features, new features, description edits.

## Process

### 1. Discover Current State

Before anything, map the existing ticket landscape:

```sh
tk tree
```

Then build structured data per feature using `tk query` with jq filters:

- Feature ID, status, child tasks
- Chain order — walk from the task with no sibling deps (first) → follow dependents to the end
- Architect-review task — identified by `architect-review` **tag** (never by assignee)
- Last implementation task — the task that architect-review depends on
- Feature state classification:

| State               | Detection                                            | Scenario |
| ------------------- | ---------------------------------------------------- | -------- |
| Active              | Feature open, at least 1 child task open/in_progress | 1        |
| In human review     | Feature open, all children closed                    | 2        |
| Closed              | Feature closed                                       | 3        |
| New (doesn't exist) | Not found                                            | 4        |

Also run:

```sh
just worktree-list
```

This shows repo layout (single vs multi-repo mode) — needed for `repo:<name>` tags on new tasks.

### 2. Analyze Update Request

Identify what changes are needed:

- New tasks to add to existing features (default: insert before architect-review)
- New features to create (with their own task chains)
- Description changes to existing tickets

Resolve all open questions with the user before proceeding. Look for:

- Explicit markers: "TBD", "TODO", "open question", "to be decided"
- Alternatives without a decision: "X or Y", "either A or B"
- Uncertainty language: "maybe", "possibly", "might"
- Incomplete specifications: missing error handling, unspecified edge cases
- Placeholders: "...", "etc." where specifics are needed

Collect **all** unresolved items and present them to the user in a single batch. For each:

- Quote the relevant text
- Explain why it needs resolution
- Suggest a default if obvious

Wait for answers before proceeding. **No ticket description should contain unresolved language.**

### 3. Present Update Plan

Show a clear before/after view for each affected feature. Include:

- Current chain diagram (task order with arrows)
- Proposed chain diagram showing where new tasks insert
- What will be created, reopened, or re-wired
- Any warnings (in-progress tasks, downstream re-blocking)

Wait for user confirmation before executing.

### 4. Execute: Modify Existing Features

Handle each scenario differently:

**Scenario 1 — Active feature** (open, has open/in_progress children):

- If any task is `in_progress`, **warn the user** and recommend waiting for it to complete before modifying the chain.
  Proceed only with explicit confirmation.
- Break the link between architect-review and the last implementation task.
- Create new tasks, wire the chain, add feature deps on new tasks.

**Scenario 2 — Feature in human review** (open, all children closed):

- Reopen the architect-review task: `tk reopen $ARCH_REVIEW`
- Reassign it: `tk assign $ARCH_REVIEW tk:architect-reviewer`
- Add a note explaining what changed:
  `tk add-note $ARCH_REVIEW "[human] Reopened — new tasks added: <brief description>"`
- Then same re-wiring as scenario 1.

**Scenario 3 — Closed feature**:

- Reopen the feature: `tk reopen $FEATURE`
- Reopen the architect-review task: `tk reopen $ARCH_REVIEW`
- Reassign architect-review: `tk assign $ARCH_REVIEW tk:architect-reviewer`
- Add notes on both: `tk add-note $FEATURE "[human] Reopened to add new tasks: <brief description>"`
- Then same re-wiring as scenario 1.
- **Warning**: Reopening a closed feature re-blocks any downstream features that depend on it. Note this to the user.

**Re-wiring pattern** for inserting tasks before architect-review:

```sh
# Break old link
tk undep $ARCH_REVIEW $LAST_IMPL

# New task chains after last impl
tk dep $NEW_TASK_1 $LAST_IMPL

# Chain new tasks together (if multiple)
tk dep $NEW_TASK_2 $NEW_TASK_1

# Architect-review depends on last new task
tk dep $ARCH_REVIEW $NEW_TASK_LAST

# Feature depends on each new task
tk dep $FEATURE $NEW_TASK_1
tk dep $FEATURE $NEW_TASK_2
```

For **mid-chain insertion** (inserting between two existing implementation tasks): same pattern but target the specific
insertion point — break the link between the two existing tasks, insert the new task(s), and re-wire both ends.

**Task creation** follows the same conventions as `create-features`:

```sh
tk create "<task title>" \
  -t task \
  -a tk:coder \
  --parent <feature-id> \
  -d "<task description with requirements>"
```

In multi-repo mode, every task MUST have a `repo:<name>` tag. In single-repo mode, omit the tag.

### 5. Execute: Add New Features

Same process as `create-features` steps 4-6:

1. Create feature ticket (no assignee, with description and acceptance criteria)
2. Create task tickets (assigned to `tk:coder`, with requirements)
3. Create architect-review task as last in chain (assigned to `tk:architect-reviewer`, tagged `architect-review`)
4. Wire linear chain deps within the feature
5. Wire feature → all child task deps
6. Wire cross-feature deps if needed (feature-to-feature AND first-task-to-feature)

Be aware of existing features when wiring dependencies — new features may depend on or be depended upon by existing
ones.

### 6. Execute: Modify Descriptions

Use `tk show <id>` to read the current ticket content. Then use the Edit tool on `.tickets/<id>.md` to modify the body
text.

**Do not hand-edit frontmatter** — use `tk` commands for metadata changes (status, assignee, tags, deps).

### 7. Verify

Mandatory verification after all changes:

1. `tk tree` — show updated hierarchy
2. `tk dep cycle` — check for dependency cycles
3. `tk ready` — show what's immediately actionable
4. `just verify-tickets` — structural validation (linear chains, architect-review tags, no cross-feature task deps)
5. Report a summary to the user: what was created, reopened, re-wired

## Edge Cases

- **Feature with in-progress task**: Warn the user and recommend waiting. Modifying the chain while a coder is active
  risks conflicts. Only proceed with explicit confirmation.
- **Feature with only architect-review** (no impl tasks yet): New tasks become the first in the chain. Architect-review
  depends on the last new task.
- **Architect-review in rework cycle** (currently assigned to coder after changes-requested): Still identified by the
  `architect-review` tag. When adding new tasks, reassign to `tk:architect-reviewer` after re-wiring.
- **Closed feature with downstream deps**: Reopening re-blocks all downstream features that depend on it. Always note
  this to the user before proceeding.
- **Mid-chain insertion**: Supported — identify the insertion point, break the link between the two adjacent tasks,
  insert new task(s), re-wire both ends.

## Rules

All rules from `create-features` apply, plus:

- When adding tasks to completed/in-review features, ALWAYS reopen architect-review and reassign to
  `tk:architect-reviewer`
- When adding tasks to closed features, ALWAYS reopen the feature AND architect-review
- Add `[human]` notes explaining what was changed and why on reopened tickets
- Identify architect-review by `architect-review` **tag**, never by assignee
- New tasks default to insertion before architect-review unless user specifies otherwise
- Features have **NO assignee** — they are human review gates
- Every implementation task gets initial assignee `tk:coder`
- Every feature must have an architect-review task as the last task in its chain
- Every feature must depend on all its child tasks
- Tasks within a feature form a **linear chain** — no parallel tasks
- Tasks must only depend on other tasks within the same feature — use feature-level dependencies for cross-feature
  ordering
- In multi-repo mode, every task must have a `repo:<name>` tag
- **No unresolved questions in tickets** — resolve all ambiguities with the user before creating or modifying tickets
