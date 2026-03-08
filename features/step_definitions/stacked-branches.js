import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

// --- Setup ---

Given("a feature {string}", async function (featureName) {
  if (!this.ticketIds[featureName]) {
    const featureId = await this.createTicket(featureName, { type: "feature" });
    this.ticketIds[featureName] = featureId;
  }
});

Given("a feature {string} titled {string}", async function (featureName, title) {
  const featureId = await this.createTicket(title, { type: "feature" });
  this.ticketIds[featureName] = featureId;
});

Given("feature {string} depends on {string}", async function (featureName, depName) {
  const featureId = this.ticketIds[featureName];
  const depId = this.ticketIds[depName];
  await this.addDep(featureId, depId);
});

Given("feature {string} is closed", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  await this.closeTicket(featureId);
});

// --- Actions ---

When("I resolve the base branch for {string}", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "resolve-base-branch", featureId], {
    env: { ...process.env, TK_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
  this.lastBaseBranch = result.stdout.trim();
});

When("I resolve the base branch for {string} with TK_BASE_BRANCH {string}", async function (featureName, baseBranch) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "resolve-base-branch", featureId], {
    env: { ...process.env, TK_PROJECT_DIR: this.projectDir, TK_BASE_BRANCH: baseBranch },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
  this.lastBaseBranch = result.stdout.trim();
});

// --- Assertions ---

Then("the base branch should be {string}", async function (expected) {
  assert.strictEqual(
    this.lastBaseBranch,
    expected,
    `Expected base branch "${expected}", got "${this.lastBaseBranch}".\nOutput:\n${this.lastOutput}`,
  );
});

Then("the base branch should end with {string}", async function (suffix) {
  assert.ok(
    this.lastBaseBranch.endsWith(suffix),
    `Expected base branch to end with "${suffix}", got "${this.lastBaseBranch}".\nOutput:\n${this.lastOutput}`,
  );
});
