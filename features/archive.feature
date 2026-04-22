Feature: Archive and unarchive tickets

  Background:
    Given a project with jr initialized
    And the jr ticket repo is initialized

  Scenario: Archive moves tickets to archive directory
    Given a feature "feat-1" with tasks: "task-a, task-b"
    When I run archive "my-archive" for "feat-1"
    Then ticket "feat-1" should not be in tickets
    And ticket "task-a" should not be in tickets
    And ticket "task-b" should not be in tickets
    And ticket "feat-1" should be in archive "my-archive"
    And ticket "task-a" should be in archive "my-archive"
    And ticket "task-b" should be in archive "my-archive"
    And the output should contain "Archived 3 ticket(s)"

  Scenario: Archive captures transitive dependency tree
    Given a feature "upstream" with tasks: "up-task"
    And a feature "downstream" with tasks: "down-task"
    And feature "downstream" depends on "upstream"
    When I run archive "full-tree" for "downstream"
    Then ticket "downstream" should be in archive "full-tree"
    And ticket "down-task" should be in archive "full-tree"
    And ticket "upstream" should be in archive "full-tree"
    And ticket "up-task" should be in archive "full-tree"

  Scenario: Archive creates a git commit in .jr repo
    Given a feature "feat-1" with tasks: "task-a"
    When I run archive "committed" for "feat-1"
    Then the jr repo should have a commit containing "archive: committed"

  Scenario: Unarchive restores tickets to .tickets/
    Given a feature "feat-1" with tasks: "task-a"
    And I run archive "temp" for "feat-1"
    When I run unarchive "temp"
    Then ticket "feat-1" should be in tickets
    And ticket "task-a" should be in tickets
    And ticket "feat-1" should not be in archive "temp"
    And the output should contain "Restored 2 ticket(s)"

  Scenario: Unarchive removes empty archive directory
    Given a feature "feat-1" with tasks: "task-a"
    And I run archive "cleanup" for "feat-1"
    When I run unarchive "cleanup"
    Then archive "cleanup" should not exist

  Scenario: Unarchive preserves archive directory with subdirs
    Given a feature "feat-1" with tasks: "task-a"
    And I run archive "has-plans" for "feat-1"
    And archive "has-plans" has a "plans" subdirectory
    When I run unarchive "has-plans"
    Then archive "has-plans" should exist
    And ticket "feat-1" should be in tickets

  Scenario: Unarchive creates a git commit
    Given a feature "feat-1" with tasks: "task-a"
    And I run archive "roundtrip" for "feat-1"
    When I run unarchive "roundtrip"
    Then the jr repo should have a commit containing "unarchive: roundtrip"

  Scenario: Archive fails if name already exists
    Given a feature "feat-1" with tasks: "task-a"
    And I run archive "taken" for "feat-1"
    And a feature "feat-2" with tasks: "task-b"
    When I run archive "taken" for "feat-2"
    Then the last command should exit with code 1
    And the output should contain "already exists"

  Scenario: Archive fails if ticket not found
    When I run archive "bad" for "nonexistent-id"
    Then the last command should exit with code 1
    And the output should contain "No tickets found"

  Scenario: Unarchive fails if archive not found
    When I run unarchive "nope"
    Then the last command should exit with code 1
    And the output should contain "not found"
