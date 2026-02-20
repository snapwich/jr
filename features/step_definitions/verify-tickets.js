import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

// --- Ticket setup for verify-tickets ---

Given("a feature {string} with task {string}", async function (featureName, taskName) {
  // Create feature if not exists
  if (!this.ticketIds[featureName]) {
    const featureId = await this.createTicket(featureName, { type: "feature", assignee: "tk:architect-reviewer" });
    this.ticketIds[featureName] = featureId;
  }

  const featureId = this.ticketIds[featureName];
  const taskId = await this.createTicket(taskName, { type: "task", assignee: "tk:coder", parent: featureId });
  this.ticketIds[taskName] = taskId;

  // Feature depends on its child task
  await this.addDep(featureId, taskId);
});

Given("task {string} depends on sibling task {string}", async function (taskName, siblingName) {
  const taskId = this.ticketIds[taskName];
  const siblingId = this.ticketIds[siblingName];
  await this.addDep(taskId, siblingId);
});

Given("task {string} depends on task {string} from another feature", async function (taskName, depTaskName) {
  const taskId = this.ticketIds[taskName];
  const depTaskId = this.ticketIds[depTaskName];
  await this.addDep(taskId, depTaskId);
});

Given("task {string} depends on feature {string}", async function (taskName, featureName) {
  const taskId = this.ticketIds[taskName];
  const featureId = this.ticketIds[featureName];
  await this.addDep(taskId, featureId);
});

Given("a standalone task {string}", async function (taskName) {
  const taskId = await this.createTicket(taskName, { type: "task", assignee: "tk:coder" });
  this.ticketIds[taskName] = taskId;
});

// --- Actions ---

When("I run verify-tickets", async function () {
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "verify-tickets"]);
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

// --- Assertions ---

Then("the verification should pass", async function () {
  assert.strictEqual(
    this.lastExitCode,
    0,
    `Expected verification to pass (exit 0), got ${this.lastExitCode}.\nOutput:\n${this.lastOutput}`,
  );
});

Then("the verification should fail", async function () {
  assert.strictEqual(
    this.lastExitCode,
    1,
    `Expected verification to fail (exit 1), got ${this.lastExitCode}.\nOutput:\n${this.lastOutput}`,
  );
});
