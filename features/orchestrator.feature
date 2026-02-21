Feature: Orchestrator signal dispatch

  Background:
    Given a project with tk initialized

  Scenario: Task lifecycle — coder through approval
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "tk:coder"
    And the mock subagent always returns "approved" for "task-impl" as "tk:code-reviewer"
    And the mock subagent always returns "approved" for "arch-review" as "tk:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should be closed
    And ticket "arch-review" should be closed
    And the orchestrator should exit with code 3
    And the output should contain "ready for human review"

  Scenario: Changes requested — coder relaunched then approved
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "tk:coder"
    And the mock subagent returns "changes-requested" then "approved" for "task-impl" as "tk:code-reviewer"
    And the mock subagent always returns "approved" for "arch-review" as "tk:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should be closed
    And ticket "arch-review" should be closed

  Scenario: Escalation after max code-review iterations
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And ticket "task-impl" is assigned to "tk:code-reviewer"
    And ticket "task-impl" has 3 code-reviewer notes
    And the mock subagent always returns "changes-requested" for "task-impl" as "tk:code-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"

  Scenario: Code-reviewer approved on architect-review task re-launches architect
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And all tasks except arch-review in "feat-1" are closed
    And the mock subagent returns "changes-requested" then "approved" for "arch-review" as "tk:architect-reviewer"
    And the mock subagent always returns "requesting-review" for "arch-review" as "tk:coder"
    And the mock subagent always returns "approved" for "arch-review" as "tk:code-reviewer"
    When I run the orchestrator
    Then ticket "arch-review" should be closed

  Scenario: Architect changes-requested triggers rework loop
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "tk:coder"
    And the mock subagent always returns "approved" for "task-impl" as "tk:code-reviewer"
    And the mock subagent always returns "requesting-review" for "arch-review" as "tk:coder"
    And the mock subagent always returns "approved" for "arch-review" as "tk:code-reviewer"
    And the mock subagent returns "changes-requested" then "approved" for "arch-review" as "tk:architect-reviewer"
    When I run the orchestrator
    Then ticket "arch-review" should be closed
    And the orchestrator should exit with code 3

  Scenario: Feature in tk ready logged as human review
    Given a feature "feat-1" with all tasks closed
    When I run the orchestrator
    Then the output should contain "ready for human review"
    And the orchestrator should exit with code 3

  Scenario: Orchestrator adds HEAD SHA note before launching coder
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "tk:coder"
    And the mock subagent always returns "approved" for "task-impl" as "tk:code-reviewer"
    And the mock subagent always returns "approved" for "arch-review" as "tk:architect-reviewer"
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

  Scenario: Escalation after max architect review iterations
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And all tasks except arch-review in "feat-1" are closed
    And ticket "arch-review" has 3 architect notes
    And the mock subagent always returns "changes-requested" for "arch-review" as "tk:architect-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"
