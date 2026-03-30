Feature: Worktree name slugification

  The `worktree-name` recipe derives a worktree/branch name from a ticket.
  For tasks, it resolves to the parent feature first.
  Uses `external-ref` field on the feature if present (preserving original case),
  otherwise falls back to the ticket ID: `<feature-id>-<slugified-title>`.

  Background:
    Given a project with jr initialized

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

  Scenario: Task resolves to parent feature for worktree name
    Given a feature "My Feature" with child task "My Task"
    When I run worktree-name for task "My Task"
    Then the worktree name should end with "my-feature"

  Scenario: External-ref on feature overrides ticket ID
    Given a ticket titled "Add login page" with external-ref "PEX-1234"
    When I run worktree-name for that ticket
    Then the worktree name should be "PEX-1234-add-login-page"

  Scenario: External-ref preserves original case
    Given a ticket titled "Fix Auth Bug" with external-ref "JIRA-567"
    When I run worktree-name for that ticket
    Then the worktree name should be "JIRA-567-fix-auth-bug"

  Scenario: Task inherits external-ref from parent feature
    Given a feature "My Feature" with external-ref "PEX-999" and child task "Backend work"
    When I run worktree-name for task "Backend work"
    Then the worktree name should be "PEX-999-my-feature"
