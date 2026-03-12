import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

Given("a ticket titled {string}", async function (title) {
  const id = await this.createTicket(title);
  this.lastTicketTitle = title;
  this.ticketIds[title] = id;
});

Given("a ticket titled {string} with external-ref {string}", async function (title, externalRef) {
  const id = await this.createTicket(title, { externalRef });
  this.lastTicketTitle = title;
  this.ticketIds[title] = id;
});

Given("a feature {string} with child task {string}", async function (featureTitle, taskTitle) {
  const featureId = await this.createTicket(featureTitle, { type: "feature" });
  this.ticketIds[featureTitle] = featureId;
  const taskId = await this.createTicket(taskTitle, { type: "task", parent: featureId });
  this.ticketIds[taskTitle] = taskId;
});

Given(
  "a feature {string} with external-ref {string} and child task {string}",
  async function (featureTitle, externalRef, taskTitle) {
    const featureId = await this.createTicket(featureTitle, { type: "feature", externalRef });
    this.ticketIds[featureTitle] = featureId;
    const taskId = await this.createTicket(taskTitle, { type: "task", parent: featureId });
    this.ticketIds[taskTitle] = taskId;
  },
);

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

When("I run worktree-name for task {string}", async function (taskTitle) {
  const id = this.ticketIds[taskTitle];
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
  assert.ok(
    this.lastWorktreeName.endsWith(expectedSlug),
    `Expected worktree name "${this.lastWorktreeName}" to end with "${expectedSlug}"`,
  );
});

Then("the worktree name should be {string}", async function (expected) {
  assert.strictEqual(
    this.lastWorktreeName,
    expected,
    `Expected worktree name "${expected}", got "${this.lastWorktreeName}"`,
  );
});
