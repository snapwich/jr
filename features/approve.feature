Feature: Approve a feature

  Background:
    Given a project with tk initialized

  Scenario: Approve closes feature ticket
    Given a feature "feat-1" with all tasks closed
    When I run approve for "feat-1"
    Then ticket "feat-1" should be closed
    And the output should contain "approved and closed"
    And the output should contain "Worktree:"

  Scenario: Fails if child tasks not closed
    Given a feature "feat-1" with a linear task chain: "task-impl"
    When I run approve for "feat-1"
    Then the last command should exit with code 1
    And the output should contain "not closed"

  Scenario: Fails for non-feature ticket
    Given a task "my-task" assigned to "tk:coder"
    When I run approve for "my-task"
    Then the last command should exit with code 1
    And the output should contain "not a feature"
