Feature: Multi-repo worktree support

  Scenario: Task inherits repo from parent feature
    Given a project with jr initialized
    And a multi-repo project with repo "backend"
    And a feature "feat-1" targeting repo "backend" with a task "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "jr:coder"
    And the mock subagent always returns "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator
    Then a worktree should exist under "backend/"
    And ticket "task-impl" should be closed
