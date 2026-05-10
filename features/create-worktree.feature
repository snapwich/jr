Feature: Worktree creation deploys .claude/ structure

  The `just create-worktree` recipe stows jr agents and commands into the
  worktree as symlinks, merges agent extensions when present, and copies
  project rules from .jr/claude/.

  Background:
    Given an initialized project with a git repo

  Scenario: Worktree has stow symlinks for agents and commands
    When I create worktree "test-wt"
    Then worktree "test-wt" should have symlink ".claude/agents/jr"
    And worktree "test-wt" should have symlink ".claude/commands/jr"
    And worktree "test-wt" file ".claude/agents/jr/coder.md" should exist
    And worktree "test-wt" file ".claude/commands/jr/plan-features.md" should exist

  Scenario: Agent extensions unfold jr/ into real dir with merged files
    Given the project has agent extension "coder" with content "# Project coder rules"
    When I create worktree "test-wt"
    Then worktree "test-wt" should have directory ".claude/agents/jr"
    And worktree "test-wt" ".claude/agents/jr" should not be a symlink
    And worktree "test-wt" file ".claude/agents/jr/coder.md" should contain "# Project coder rules"
    And worktree "test-wt" should have symlink ".claude/agents/jr/code-reviewer.md"

  Scenario: Create-worktree is idempotent
    When I create worktree "test-wt"
    And I create worktree "test-wt"
    Then worktree "test-wt" should have symlink ".claude/agents/jr"
    And worktree "test-wt" should have symlink ".claude/commands/jr"

  Scenario: Create-worktree auto-resolves when origin HEAD is unset
    Given the project has a remote without an origin HEAD
    When I create worktree "test-wt" with default base
    Then worktree "test-wt" should be registered as a git worktree
    And the project's origin HEAD should now be set

  Scenario: Create-worktree falls back to local HEAD when no origin
    Given the project has no origin remote
    When I create worktree "test-wt" with default base
    Then worktree "test-wt" should be registered as a git worktree

  Scenario: Create-worktree fails clearly when explicit base ref doesn't exist
    When I create worktree "test-wt" with base "does-not-exist"
    Then create-worktree should have failed
    And the create-worktree error should mention "could not be resolved"
