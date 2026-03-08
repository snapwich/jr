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

  Scenario: Solo feature with TK_BASE_BRANCH resolves to env var
    Given a feature "feat-solo"
    When I resolve the base branch for "feat-solo" with TK_BASE_BRANCH "redesign"
    Then the base branch should be "redesign"

  Scenario: Closed upstream with deleted branch falls back to TK_BASE_BRANCH
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    And feature "feat-upstream" is closed
    When I resolve the base branch for "feat-downstream" with TK_BASE_BRANCH "redesign"
    Then the base branch should be "redesign"

  Scenario: Feature with upstream dep ignores TK_BASE_BRANCH
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    When I resolve the base branch for "feat-downstream" with TK_BASE_BRANCH "redesign"
    Then the base branch should end with "upstream-work"

  Scenario: Closed upstream with branch still present resolves to upstream branch
    Given a single-repo project layout
    And a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    And a worktree for "feat-upstream" with a commit "upstream change"
    And feature "feat-upstream" is closed
    When I resolve the base branch for "feat-downstream"
    Then the base branch should end with "upstream-work"
