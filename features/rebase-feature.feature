Feature: Rebase feature worktree

  Background:
    Given a project with tk initialized
    And a single-repo project layout

  Scenario: Rebase after squash merge of upstream
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    And a worktree for "feat-upstream" with a commit "upstream change"
    And a worktree for "feat-downstream" branched from "feat-upstream" with a commit "downstream change"
    And the branch for "feat-upstream" is squash-merged into default
    And the worktree and branch for "feat-upstream" is removed
    And feature "feat-upstream" is closed
    When I run rebase-feature for "feat-downstream"
    Then the output should contain "Rebase complete"
    And the worktree for "feat-downstream" should have commit "downstream change"
    And the worktree for "feat-downstream" should not have commit "upstream change"

  Scenario: Rebase after squash merge with stale recorded base
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    And a worktree for "feat-upstream" with a commit "upstream change"
    And a worktree for "feat-downstream" with stale base, rebased onto "feat-upstream" with a commit "downstream change"
    And the branch for "feat-upstream" is squash-merged into default
    And the worktree and branch for "feat-upstream" is removed
    And feature "feat-upstream" is closed
    When I run rebase-feature for "feat-downstream"
    Then the output should contain "Rebase complete"
    And the worktree for "feat-downstream" should have commit "downstream change"
    And the worktree for "feat-downstream" should not have commit "upstream change"

  Scenario: No-op after regular merge
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    And a worktree for "feat-upstream" with a commit "upstream change"
    And a worktree for "feat-downstream" branched from "feat-upstream" with a commit "downstream change"
    And the branch for "feat-upstream" is merged into default
    And feature "feat-upstream" is closed
    When I run rebase-feature for "feat-downstream"
    Then the output should contain "Already up to date"

  Scenario: No-op when base has not changed
    Given a feature "feat-solo" titled "Solo Work"
    And a worktree for "feat-solo" with a commit "solo change"
    When I run rebase-feature for "feat-solo"
    Then the output should contain "Already up to date"

  Scenario: No-op when feature is open
    Given a feature "feat-open" titled "Open Work"
    And a worktree for "feat-open" with a commit "open change"
    When I run rebase-feature for "feat-open"
    Then the output should contain "Already up to date"

  Scenario: Fails if no worktree exists
    Given a feature "feat-no-wt" titled "No Worktree"
    When I run rebase-feature for "feat-no-wt"
    Then the last command should exit with code 1
    And the output should contain "does not exist"

  Scenario: No-op when no recorded base SHA (non-stacked)
    Given a feature "feat-no-base" titled "No Base"
    And a worktree for "feat-no-base" without base recording
    When I run rebase-feature for "feat-no-base"
    Then the output should contain "Already up to date"

  Scenario: Updates base note after successful rebase
    Given a feature "feat-upstream" titled "Upstream Work"
    And a feature "feat-downstream" titled "Downstream Work"
    And feature "feat-downstream" depends on "feat-upstream"
    And a worktree for "feat-upstream" with a commit "upstream change"
    And a worktree for "feat-downstream" branched from "feat-upstream" with a commit "downstream change"
    And the branch for "feat-upstream" is squash-merged into default
    And the worktree and branch for "feat-upstream" is removed
    And feature "feat-upstream" is closed
    When I run rebase-feature for "feat-downstream"
    Then feature "feat-downstream" should have an updated base note
