import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

Given("a ticket titled {string}", async function (title) {
  const id = await this.createTicket(title);
  this.lastTicketTitle = title;
  this.ticketIds[title] = id;
});

Given("a ticket titled {string} with tags {string}", async function (title, tags) {
  const id = await this.createTicket(title, { tags });
  this.lastTicketTitle = title;
  this.ticketIds[title] = id;
});

When("I run worktree-name for that ticket", async function () {
  const id = this.ticketIds[this.lastTicketTitle];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", [
    "--justfile",
    justfile,
    "--working-directory",
    this.projectDir,
    "worktree-name",
    id,
  ]);
  assert.strictEqual(result.exitCode, 0, `worktree-name failed: ${result.stderr}`);
  this.lastWorktreeName = result.stdout;
});

Then("the worktree name should end with {string}", async function (expectedSlug) {
  const id = this.ticketIds[this.lastTicketTitle];
  const expected = `${id}-${expectedSlug}`;
  assert.strictEqual(
    this.lastWorktreeName,
    expected,
    `Expected worktree name "${expected}", got "${this.lastWorktreeName}"`,
  );
});

Then("the worktree name should be {string}", async function (expected) {
  assert.strictEqual(
    this.lastWorktreeName,
    expected,
    `Expected worktree name "${expected}", got "${this.lastWorktreeName}"`,
  );
});
