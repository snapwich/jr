Feature: Task commit tracking via trailers

  Background:
    Given a project with jr initialized

  Scenario: task-commits finds commits by Tk-Task trailer
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the worktree for "feat-1" has commits with "Tk-Task" trailers for "task-impl"
    When I run task-commits for "task-impl"
    Then the output should contain exactly 2 commit SHAs
    And the output should not contain the initial commit SHA

  Scenario: task-diff shows diffs for trailer-matched commits
    Given a feature "feat-1" with a linear task chain: "task-impl"
    And the worktree for "feat-1" has commits with "Tk-Task" trailers for "task-impl"
    When I run task-diff for "task-impl"
    Then the output should contain "task-impl-hello.txt"
    And the output should contain "task-impl-world.txt"

  Scenario: task-commits ignores commits without matching trailer
    Given a feature "feat-1" with a linear task chain: "task-a, task-b"
    And the worktree for "feat-1" has commits with "Tk-Task" trailers for "task-a"
    And the worktree for "feat-1" has commits with "Tk-Task" trailers for "task-b"
    When I run task-commits for "task-a"
    Then the output should contain exactly 2 commit SHAs
