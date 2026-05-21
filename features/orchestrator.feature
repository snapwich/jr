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
    And the output should not contain "prior:"

  Scenario: Changes requested — coder relaunched then approved
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent always returns "requesting-review" for "task-impl" as "jr:coder"
    And the mock subagent returns "changes-requested" then "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator
    Then ticket "task-impl" should be closed
    And the output should contain "prior:"

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

  Scenario: One ticket escalates, others continue and the run exits 2 with a summary
    Given a feature "feat-a" with a linear task chain: "task-a1"
    And a feature "feat-b" with a linear task chain: "task-b1"
    And the mock subagent always returns "escalate" for "task-a1" as "jr:coder"
    And the mock subagent always returns "requesting-review" for "task-b1" as "jr:coder"
    And the mock subagent always returns "approved" for "task-b1" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-b" as "jr:architect-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 3
    And the output should contain "ESCALATE: "
    And the output should contain "Escalated this run"
    And ticket "task-b1" should be closed
    And the output should contain "Run `just me` to review."

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
    Then the orchestrator should exit with code 3
    And the output should contain "ESCALATE"
    And the output should contain "Escalated this run"

  Scenario: Worktree creation failure escalates instead of running agent in project root
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And feature "feat-1" has tag "base:does-not-exist"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And the output should contain "ESCALATE"
    And ticket "task-impl" should have a note containing "worktree"
    And the mock subagent should not have been launched for "task-impl" as "jr:coder"

  # --- Investigator (no-signal) flow ---

  Scenario: No-signal exit — investigator says resume, coder finishes on retry
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent for "task-impl" as "jr:coder" produces no signal once
    And the mock subagent returns "approved" for "task-impl" as "jr:coder" after rework
    And the mock subagent always returns "resume" for "task-impl" as "jr:investigator"
    When I run the orchestrator
    Then ticket "task-impl" should have a note containing "[orchestrator] Resuming (resume 1 of"
    And ticket "task-impl" should have a note containing "[orchestrator] Agent crashed (exit 0)"

  Scenario: No-signal exit — investigator escalates, run continues with other tickets
    Given a feature "feat-a" with a linear task chain: "task-a1"
    And a feature "feat-b" with a linear task chain: "task-b1"
    And the mock subagent for "task-a1" as "jr:coder" produces no signal
    And the mock subagent always returns "escalate" for "task-a1" as "jr:investigator"
    And the mock subagent always returns "requesting-review" for "task-b1" as "jr:coder"
    And the mock subagent always returns "approved" for "task-b1" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-b" as "jr:architect-reviewer"
    When I run the orchestrator
    Then the orchestrator should exit with code 3
    And ticket "task-b1" should be closed
    And ticket "task-a1" should have a note containing "Investigator escalated"
    And the output should contain "Escalated this run"

  Scenario: Crash (non-zero exit) is diagnosed and routed to investigator
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent for "task-impl" as "jr:coder" crashes with exit 1
    And the mock subagent always returns "escalate" for "task-impl" as "jr:investigator"
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And ticket "task-impl" should have a note containing "Agent crashed (exit 1)"
    And ticket "task-impl" should have a note containing "Investigator escalated"

  Scenario: Resume budget exhausted after repeated failures
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent for "task-impl" as "jr:coder" produces no signal
    And the mock subagent always returns "resume" for "task-impl" as "jr:investigator"
    When I run the orchestrator with resume budget 2
    Then the orchestrator should exit with code 2
    And ticket "task-impl" should have a note containing "Resume budget exhausted"

  Scenario: Investigator's own timeout escalates the ticket
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent for "task-impl" as "jr:coder" produces no signal
    And the mock subagent for "task-impl" as "jr:investigator" crashes with exit 124
    When I run the orchestrator
    Then the orchestrator should exit with code 2
    And ticket "task-impl" should have a note containing "Investigator timed out"

  Scenario: Rate-limit detected within run — defers, then wakes, then resumes
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent emits a rate-limit line then exits 1 once for "task-impl" as "jr:coder"
    And the mock subagent returns "requesting-review" for "task-impl" as "jr:coder" after rework
    And the mock subagent always returns "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator with rate-limit max sleep 2
    Then ticket "task-impl" should have a note containing "Rate-limited; will resume after"
    And ticket "task-impl" should not have a note containing "Escalated to human"
    And ticket "task-impl" should not have a note containing "Investigator"
    And the output should contain "Rate limit cleared, resuming"
    And ticket "task-impl" should be closed

  Scenario: Recover active rate-limit window on startup, then resume
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And ticket "task-impl" has a pre-seeded rate-limit note resuming in 3 seconds
    And the mock subagent always returns "requesting-review" for "task-impl" as "jr:coder"
    And the mock subagent always returns "approved" for "task-impl" as "jr:code-reviewer"
    And the mock subagent always returns "approved" for "feat-1" as "jr:architect-reviewer"
    When I run the orchestrator
    Then the output should contain "Recovered active rate-limit window"
    And the output should contain "Rate limit cleared, resuming"
    And ticket "task-impl" should be closed

  Scenario: Rate-limit with unparseable reset time escalates loudly
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the mock subagent emits an unparseable rate-limit line for "task-impl" as "jr:coder"
    When I run the orchestrator
    Then ticket "task-impl" should have a note containing "Rate-limited but reset time unparseable"
    And ticket "task-impl" should be assigned to "human"
