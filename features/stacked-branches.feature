Feature: Stacked branch resolution

  Background:
    Given a project with tk initialized

  Scenario: Feature with no upstream dep resolves to origin/HEAD
    Given a feature "feat-solo"
    When I resolve the base branch for "feat-solo"
    Then the base branch should be "origin/HEAD"

  Scenario: Feature depending on another feature resolves to upstream branch
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    When I resolve the base branch for "feat-downstream"
    Then the base branch should end with "upstream-work"

  Scenario: Closed upstream with deleted branch falls back to origin/HEAD
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    And feature "feat-upstream" is closed
    When I resolve the base branch for "feat-downstream"
    Then the base branch should be "origin/HEAD"

  Scenario: Feature with base tag resolves to tagged branch
    Given a feature "feat-solo" with tag "base:release/1.0"
    When I resolve the base branch for "feat-solo"
    Then the base branch should be "release/1.0"

  Scenario: Closed upstream with deleted branch falls back to base tag
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work" with tag "base:release/1.0"
    And feature "feat-downstream" depends on "feat-upstream"
    And feature "feat-upstream" is closed
    When I resolve the base branch for "feat-downstream"
    Then the base branch should be "release/1.0"

  Scenario: Feature with upstream dep ignores base tag
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work" with tag "base:release/1.0"
    And feature "feat-downstream" depends on "feat-upstream"
    When I resolve the base branch for "feat-downstream"
    Then the base branch should end with "upstream-work"

  Scenario: worktree-base resolves base tag from inside worktree
    Given a single-repo project layout
    And a feature "feat-tagged" titled "Tagged Work" with tag "base:release/1.0"
    And a worktree for "feat-tagged" from HEAD with a commit "tagged change"
    When I run worktree-base from the worktree for "feat-tagged"
    Then the base branch should be "release/1.0"

  Scenario: worktree-base defaults to origin/HEAD without base tag
    Given a single-repo project layout
    And a feature "feat-plain" titled "Plain Work"
    And a worktree for "feat-plain" from HEAD with a commit "plain change"
    When I run worktree-base from the worktree for "feat-plain"
    Then the base branch should be "origin/HEAD"

  Scenario: Closed upstream with branch still present resolves to upstream branch
    Given a single-repo project layout
    And a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    And a worktree for "feat-upstream" with a commit "upstream change"
    And feature "feat-upstream" is closed
    When I resolve the base branch for "feat-downstream"
    Then the base branch should end with "upstream-work"
