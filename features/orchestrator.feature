Feature: Orchestrator signal dispatch

  Background:
    Given a project with jr initialized

  Scenario: Task lifecycle — coder through approval
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "jr:coder"
    And the mock subagent always returns "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should be closed
    And the orchestrator should exit with code 3
    And the output should contain "ready for human review"
    And the output should not contain "Resuming session"

  Scenario: Changes requested — coder relaunched then approved
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "jr:coder"
    And the mock subagent returns "changes-requested" then "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should be closed
    And the output should contain "Resuming session"

  Scenario: Escalation after max code-review iterations
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And ticket "task-impl" is assigned to "jr:code-reviewer"
    And ticket "task-impl" has 5 code-reviewer notes
    And the mock subagent always returns "changes-requested" for "task-impl" as "jr:code-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"

  Scenario: Feature in just ready with human assignee logged as human review
    Given a feature "feat-1" with all tasks closed
    When I run the orchestrator
    Then the output should contain "ready for human review"
    And the orchestrator should exit with code 3

  Scenario: Orchestrator adds assignment note before launching coder
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "jr:coder"
    And the mock subagent always returns "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should have a note containing "[orchestrator] Assigned to coder."

  Scenario: Escalation signal drains and exits
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "escalate" for "task-impl" as "jr:coder"
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
    And the mock subagent always returns "escalate" for "task-a1" as "jr:coder"
    And the mock subagent always returns "requesting-review" for "task-b1" as "jr:coder"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"
    And the output should contain "Drain: skipping dispatch"

  Scenario: No-human-review closes feature after architect approval
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "jr:coder"
    And the mock subagent always returns "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator with no-human-review
    Then ticket "task-impl" should be closed
    And ticket "feat-1" should be closed
    And the orchestrator should exit with code 0
    And the output should contain "no-human-review"

  Scenario: No-human-review recovery closes human-assigned feature
    Given a feature "feat-1" with all tasks closed
    When I run the orchestrator with no-human-review
    Then ticket "feat-1" should be closed
    And the orchestrator should exit with code 0
    And the output should contain "no-human-review recovery"

  Scenario: Signal recovered from ticket notes when stdout is displaced
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent returns displaced output for "task-impl" as "jr:coder" with signal "requesting-review"
    And the mock subagent always returns "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should be closed

  Scenario: Escalation after max architect review iterations
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And all tasks in "feat-1" are closed
    And ticket "feat-1" has 5 architect notes
    And the mock subagent always returns "changes-requested" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"
