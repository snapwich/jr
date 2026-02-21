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
