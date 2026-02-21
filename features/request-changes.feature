Feature: Request changes on a completed feature

  Background:
    Given a project with tk initialized

  Scenario: Reopens architect-review task for rework
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And all tasks in "feat-1" are closed
    When I run request-changes for "feat-1" with "Fix error handling"
    Then ticket "arch-review" should have status "open"
    And ticket "arch-review" should be assigned to "tk:coder"
    And ticket "arch-review" should have a note containing "[human] Fix error handling"

  Scenario: Fails when no architect-review task exists
    Given a standalone feature "feat-orphan"
    When I run request-changes for "feat-orphan" with "Some feedback"
    Then the last command should exit with code 1
    And the output should contain "No architect-review task found"

  Scenario: Reopened task appears in tk ready
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And all tasks in "feat-1" are closed
    When I run request-changes for "feat-1" with "Needs rework"
    Then ticket "arch-review" should appear in tk ready
