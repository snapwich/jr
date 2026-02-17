Feature: Orchestrator signal dispatch

  Background:
    Given a project with tk initialized

  Scenario: Task lifecycle — coder through approval
    Given a task "test-abc" assigned to "tk:coder"
    And the mock subagent always returns "requesting-review" for "test-abc" as "tk:coder"
    And the mock subagent always returns "approved" for "test-abc" as "tk:code-reviewer"
    When I run the orchestrator
    Then ticket "test-abc" should be closed
    And the orchestrator should exit with code 0

  Scenario: Changes requested — coder relaunched then approved
    Given a task "test-abc" assigned to "tk:coder"
    And the mock subagent always returns "requesting-review" for "test-abc" as "tk:coder"
    And the mock subagent returns "changes-requested" then "approved" for "test-abc" as "tk:code-reviewer"
    When I run the orchestrator
    Then ticket "test-abc" should be closed

  Scenario: Escalation after max review iterations
    Given a task "test-abc" assigned to "tk:code-reviewer"
    And ticket "test-abc" has 3 code-reviewer notes
    And the mock subagent always returns "changes-requested" for "test-abc" as "tk:code-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"

  Scenario: Feature approved after all tasks closed
    Given a feature "feat-xyz" with closed child task "test-abc"
    And the mock subagent always returns "feature-approved" for "feat-xyz" as "tk:architect-reviewer"
    When I run the orchestrator
    Then ticket "feat-xyz" should be closed

  Scenario: Task rework reopens tasks for coder
    Given a feature "feat-xyz" with closed child task "test-abc"
    And the mock subagent returns "task-rework" for "feat-xyz" as "tk:architect-reviewer" with details "test-abc"
    And the mock subagent always returns "requesting-review" for "test-abc" as "tk:coder"
    And the mock subagent always returns "approved" for "test-abc" as "tk:code-reviewer"
    And the mock subagent returns "feature-approved" for "feat-xyz" as "tk:architect-reviewer" after rework
    When I run the orchestrator
    Then ticket "feat-xyz" should be closed
    And ticket "test-abc" should be closed

  Scenario: Escalation signal drains and exits
    Given a task "test-abc" assigned to "tk:coder"
    And the mock subagent always returns "escalate" for "test-abc" as "tk:coder"
    When I run the orchestrator
    Then the orchestrator should exit with code 2

  Scenario: No work exits cleanly
    When I run the orchestrator
    Then the orchestrator should exit with code 0
    And the output should contain "All work complete"

  Scenario: Deadlock detected when tickets exist but none ready
    Given a task "test-abc" assigned to "tk:coder"
    And ticket "test-abc" depends on nonexistent "test-def"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "DEADLOCK"
