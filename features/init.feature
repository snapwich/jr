Feature: Project initialization

  The `just init <dir>` recipe deploys agent configs, ticket infrastructure,
  and dev tooling into a target project directory.

  Scenario: Fresh init creates expected structure
    Given an empty target directory
    When I run init on the target directory
    Then the target should have directory ".agents/.tickets"
    And the target should have directory ".agents/plans"
    And the target should have directory ".agents/.git"
    And the target should have symlink ".claude"
    And the target should have file ".claude/agents/tk/coder.md"
    And the target should have file ".claude/commands/tk/subagent-task.md"
    And the target should have file ".claude/rules/tk-agents.md"
    And the target should have symlink "justfile"
    And the target should have file ".agents/.prettierrc.yml"
    And the target should have file ".agents/.markdownlint.yaml"
    And the target ".tickets" should be a symlink to ".agents/.tickets"
    And the target ".agents/package.json" should contain "devDependencies"
    And the target ".agents/package.json" should contain "lint-staged"
    And the target ".agents/package.json" should contain "prettier"
    And the target ".agents/package.json" should contain "markdownlint-cli2"
    And the target ".agents/.gitignore" should contain "node_modules/"
    And the target ".agents/.git/hooks/pre-commit" should be executable
    And the target should have directory ".agents/node_modules"

  Scenario: Init is idempotent
    Given an empty target directory
    When I run init on the target directory
    And I run init on the target directory
    Then the last command should exit with code 0

  Scenario: Init preserves existing package.json
    Given an empty target directory
    When I run init on the target directory
    And I add "custom-field" to the target ".agents/package.json"
    And I run init on the target directory
    Then the target ".agents/package.json" should contain "custom-field"

  Scenario: Init does not duplicate gitignore entries
    Given an empty target directory
    When I run init on the target directory
    And I run init on the target directory
    Then the target ".agents/.gitignore" should have exactly 1 line matching "node_modules/"
