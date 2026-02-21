Feature: Multi-repo worktree support

  Scenario: Task with repo tag creates worktree in correct subdirectory
    Given a project with tk initialized
    And a multi-repo project with repo "backend"
    And a feature "feat-1" with a task "task-impl" targeting repo "backend"
    And the mock subagent always returns "requesting-review" for "task-impl" as "tk:coder"
    And the mock subagent always returns "approved" for "task-impl" as "tk:code-reviewer"
    And the mock subagent always returns "approved" for "arch-review" as "tk:architect-reviewer"
    When I run the orchestrator
    Then a worktree should exist under "backend/"
    And ticket "task-impl" should be closed
