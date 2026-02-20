Feature: Verify tickets structure

  Background:
    Given a project with tk initialized

  Scenario: Valid tickets pass verification
    Given a feature "feat-1" with task "task-a"
    And a feature "feat-1" with task "task-b"
    And task "task-b" depends on sibling task "task-a"
    When I run verify-tickets
    Then the verification should pass
    And the output should contain "All tickets valid"

  Scenario: Cross-feature task dependency detected
    Given a feature "feat-1" with task "task-a"
    And a feature "feat-2" with task "task-b"
    And task "task-b" depends on task "task-a" from another feature
    When I run verify-tickets
    Then the verification should fail
    And the output should contain "Cross-feature task dependency detected"
    And the output should contain "should depend on feature"

  Scenario: Task depending on feature is allowed
    Given a feature "feat-1" with task "task-a"
    And a feature "feat-2" with task "task-b"
    And task "task-b" depends on feature "feat-1"
    When I run verify-tickets
    Then the verification should pass

  Scenario: No tickets passes verification
    When I run verify-tickets
    Then the verification should pass
    And the output should contain "All tickets valid"

  Scenario: Orphan task without parent passes
    Given a standalone task "orphan-task"
    When I run verify-tickets
    Then the verification should pass
