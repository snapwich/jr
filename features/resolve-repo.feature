Feature: Resolve repo for a feature

  Background:
    Given a project with jr initialized

  Scenario: Feature with repo tag resolves to tag value
    Given a multi-repo project with repo "backend"
    And a feature "feat-api" titled "API Work" with tag "repo:backend"
    And a worktree for "feat-api" in repo "backend" with a commit "api change"
    When I run resolve-repo for "feat-api"
    Then the resolved repo should be "backend"

  Scenario: Feature without repo tag resolves via filesystem
    Given a multi-repo project with repo "backend"
    And a feature "feat-api" titled "API Work"
    And a worktree for "feat-api" in repo "backend" with a commit "api change"
    When I run resolve-repo for "feat-api"
    Then the resolved repo should be "backend"
