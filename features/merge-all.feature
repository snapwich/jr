Feature: merge-all

  Background:
    Given a project with jr initialized
    And a single-repo project layout

  Scenario: Merges a closed feature
    Given a closed feature "feat-1" with a worktree and commit "add widget"
    When I run merge-all
    Then the last command should exit with code 0
    And the base branch should contain commit "add widget"
    And branch for "feat-1" should not exist

  Scenario: Squash-merges a closed feature
    Given a closed feature "feat-1" with a worktree and commit "add widget"
    When I run merge-all with "--squash"
    Then the last command should exit with code 0
    And the base branch should contain a squash commit for "feat-1"
    And branch for "feat-1" should not exist

  Scenario: Succeeds when base branch is checked out in another worktree
    Given a closed feature "feat-1" with a worktree and commit "add widget"
    And another worktree has the base branch checked out
    When I run merge-all
    Then the last command should exit with code 0
    And the base branch should contain commit "add widget"
    And branch for "feat-1" should not exist
    And the base branch worktree should have a clean working tree

  Scenario: Squash-merges when base branch is checked out in another worktree
    Given a closed feature "feat-1" with a worktree and commit "add widget"
    And another worktree has the base branch checked out
    When I run merge-all with "--squash"
    Then the last command should exit with code 0
    And the base branch should contain a squash commit for "feat-1"
    And branch for "feat-1" should not exist
    And the base branch worktree should have a clean working tree
