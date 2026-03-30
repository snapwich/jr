Feature: Request changes on a completed feature

  Background:
    Given a project with jr initialized

  Scenario: Reassigns feature to architect for rework
    Given a feature "feat-1" with all tasks closed
    When I run request-changes for "feat-1" with "Fix error handling"
    Then feature "feat-1" should be assigned to "jr:architect-reviewer"
    And feature "feat-1" should have a note containing "[human] CHANGES REQUESTED: Fix error handling"

  Scenario: Fails when ticket is not a feature
    Given a standalone task "task-orphan"
    When I run request-changes for "task-orphan" with "Some feedback"
    Then the last command should exit with code 1
    And the output should contain "not a feature"

  Scenario: Reassigned feature appears in just ready
    Given a feature "feat-1" with all tasks closed
    When I run request-changes for "feat-1" with "Needs rework"
    Then feature "feat-1" should appear in just ready
