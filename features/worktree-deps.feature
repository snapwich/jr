Feature: Worktree dependency tree

  Background:
    Given a project with jr initialized
    And a single-repo project layout

  Scenario: Stacked features show dependency tree
    Given a feature "feat-a" titled "Feature A"
    And a feature "feat-b" titled "Feature B"
    And a feature "feat-d" titled "Feature D"
    And feature "feat-b" depends on "feat-a"
    And a worktree for "feat-a" with a commit "a change"
    And a worktree for "feat-b" branched from "feat-a" with a commit "b change"
    And a worktree for "feat-d" with a commit "d change"
    When I run worktree-deps
    Then the worktree-deps output should show "feat-a" as a root
    And the worktree-deps output should show "feat-b" indented under "feat-a"
    And the worktree-deps output should show "feat-d" as a root

  Scenario: Ghost detection after upstream merge
    Given a feature "feat-a" titled "Feature A"
    And a feature "feat-b" titled "Feature B"
    And feature "feat-b" depends on "feat-a"
    And a worktree for "feat-a" with a commit "a change"
    And a worktree for "feat-b" branched from "feat-a" with a commit "b change"
    And the worktree and branch for "feat-a" is removed
    When I run worktree-deps
    Then the worktree-deps output should show "feat-a" as a ghost
    And the worktree-deps output should show "feat-b" indented under "feat-a"

  Scenario: Unmatched worktrees listed separately
    Given a worktree "orphan-branch" with no feature ticket
    When I run worktree-deps
    Then the worktree-deps output should contain "(unmatched"
    And the worktree-deps output should contain "orphan-branch/"

  Scenario: Rebased feature not shown under ghost
    Given a feature "feat-a" titled "Feature A"
    And a feature "feat-b" titled "Feature B"
    And feature "feat-b" depends on "feat-a"
    And a worktree for "feat-a" with a commit "a change"
    And a worktree for "feat-b" branched from "feat-a" with a commit "b change"
    And the branch for "feat-a" is squash-merged into default
    And the worktree and branch for "feat-a" is removed
    And feature "feat-a" is closed
    And the worktree for "feat-b" is rebased onto origin/HEAD
    When I run worktree-deps
    Then the worktree-deps output should show "feat-b" as a root
    And the worktree-deps output should not contain "(merged"

  Scenario: No feature worktrees
    When I run worktree-deps
    Then the worktree-deps output should contain "(no feature worktrees)"
