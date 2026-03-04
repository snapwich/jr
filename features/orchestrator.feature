Feature: Orchestrator signal dispatch

  Background:
    Given a project with tk initialized

  Scenario: Task lifecycle — coder through approval
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "tk:coder"
    And the mock subagent always returns "approved" for "task-impl" as "tk:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "tk:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should be closed
    And the orchestrator should exit with code 3
    And the output should contain "ready for human review"

  Scenario: Changes requested — coder relaunched then approved
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "tk:coder"
    And the mock subagent returns "changes-requested" then "approved" for "task-impl" as "tk:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "tk:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should be closed

  Scenario: Escalation after max code-review iterations
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And ticket "task-impl" is assigned to "tk:code-reviewer"
    And ticket "task-impl" has 3 code-reviewer notes
    And the mock subagent always returns "changes-requested" for "task-impl" as "tk:code-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"

  Scenario: Feature in tk ready with human assignee logged as human review
    Given a feature "feat-1" with all tasks closed
    When I run the orchestrator
    Then the output should contain "ready for human review"
    And the orchestrator should exit with code 3

  Scenario: Orchestrator adds HEAD SHA note before launching coder
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "tk:coder"
    And the mock subagent always returns "approved" for "task-impl" as "tk:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "tk:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should have a note containing "[orchestrator] Assigned to coder. HEAD:"

  Scenario: Escalation signal drains and exits
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "escalate" for "task-impl" as "tk:coder"
    When I run the orchestrator
    Then the orchestrator should exit with code 2

  Scenario: No work exits cleanly
    When I run the orchestrator
    Then the orchestrator should exit with code 0
    And the output should contain "All work complete"

  Scenario: Deadlock detected when tickets exist but none ready
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And ticket "task-impl" depends on nonexistent "blocker"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "DEADLOCK"

  Scenario: Drain does not launch new agents after escalation
    Given a feature "feat-a" with a linear task chain: "task-a1"
    And a feature "feat-b" with a linear task chain: "task-b1"
    And the mock subagent always returns "escalate" for "task-a1" as "tk:coder"
    And the mock subagent always returns "requesting-review" for "task-b1" as "tk:coder"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"
    And the output should contain "Drain: skipping dispatch"

  Scenario: Escalation after max architect review iterations
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And all tasks in "feat-1" are closed
    And ticket "feat-1" has 3 architect notes
    And the mock subagent always returns "changes-requested" for "feat-1" as "tk:architect-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"
