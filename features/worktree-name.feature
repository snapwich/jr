Feature: Worktree name slugification

  The `worktree-name` recipe derives a worktree/branch name from a ticket:
  `<id>-<slugified-title>`. Lowercased, non-alphanumeric chars become hyphens,
  consecutive hyphens collapsed, trailing hyphens stripped.

  Background:
    Given a project with tk initialized

  Scenario: Basic title
    Given a ticket titled "Add login page"
    When I run worktree-name for that ticket
    Then the worktree name should end with "add-login-page"

  Scenario: Uppercase letters
    Given a ticket titled "Fix README Formatting"
    When I run worktree-name for that ticket
    Then the worktree name should end with "fix-readme-formatting"

  Scenario: Special characters
    Given a ticket titled "Fix bug: auth (v2)"
    When I run worktree-name for that ticket
    Then the worktree name should end with "fix-bug-auth-v2"

  Scenario: Consecutive special characters
    Given a ticket titled "Add feature -- beta"
    When I run worktree-name for that ticket
    Then the worktree name should end with "add-feature-beta"

  Scenario: Trailing special characters
    Given a ticket titled "New feature!!"
    When I run worktree-name for that ticket
    Then the worktree name should end with "new-feature"

  Scenario: Numbers preserved
    Given a ticket titled "Add OAuth2 support"
    When I run worktree-name for that ticket
    Then the worktree name should end with "add-oauth2-support"
