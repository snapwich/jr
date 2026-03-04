import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

// --- Setup ---

// Note: "all tasks in {string} are closed" is defined in orchestrator.js

Given("a standalone feature {string}", async function (featureName) {
  const featureId = await this.createTicket(featureName, { type: "feature" });
  this.ticketIds[featureName] = featureId;
});

// Note: "a standalone task {string}" is defined in verify-tickets.js

// --- Actions ---

When("I run request-changes for {string} with {string}", async function (featureName, feedback) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "request-changes", featureId, feedback], {
    env: { ...process.env, TK_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

// --- Assertions ---

Then("ticket {string} should have status {string}", async function (name, expectedStatus) {
  const id = this.ticketIds[name];
  const status = await this.getTicketStatus(id);
  assert.strictEqual(
    status,
    expectedStatus,
    `Expected ticket ${name} (${id}) to have status "${expectedStatus}", got "${status}".\nOutput:\n${this.lastOutput}`,
  );
});

Then("ticket {string} should be assigned to {string}", async function (name, expectedAssignee) {
  const id = this.ticketIds[name];
  const result = await this.exec("tk", ["query", `select(.id == "${id}")`]);
  const ticket = JSON.parse(result.stdout);
  assert.strictEqual(
    ticket.assignee,
    expectedAssignee,
    `Expected ticket ${name} (${id}) to be assigned to "${expectedAssignee}", got "${ticket.assignee}"`,
  );
});

Then("ticket {string} should appear in tk ready", async function (name) {
  const id = this.ticketIds[name];
  const result = await this.exec("tk", ["ready"]);
  assert.ok(
    result.stdout.includes(id),
    `Expected ticket ${name} (${id}) to appear in tk ready.\nReady:\n${result.stdout}`,
  );
});

Then("feature {string} should be assigned to {string}", async function (name, expectedAssignee) {
  const id = this.ticketIds[name];
  const result = await this.exec("tk", ["query", `select(.id == "${id}")`]);
  const ticket = JSON.parse(result.stdout);
  assert.strictEqual(
    ticket.assignee,
    expectedAssignee,
    `Expected feature ${name} (${id}) to be assigned to "${expectedAssignee}", got "${ticket.assignee}"`,
  );
});

Then("feature {string} should have a note containing {string}", async function (name, text) {
  const id = this.ticketIds[name];
  const result = await this.exec("tk", ["show", id]);
  assert.ok(
    result.stdout.includes(text),
    `Expected feature ${name} (${id}) to have a note containing "${text}".\nTicket:\n${result.stdout}`,
  );
});

Then("feature {string} should appear in tk ready", async function (name) {
  const id = this.ticketIds[name];
  const result = await this.exec("tk", ["ready"]);
  assert.ok(
    result.stdout.includes(id),
    `Expected feature ${name} (${id}) to appear in tk ready.\nReady:\n${result.stdout}`,
  );
});
