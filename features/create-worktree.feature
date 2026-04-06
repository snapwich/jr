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
