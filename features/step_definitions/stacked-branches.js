import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";
import { writeFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
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

Given("a feature {string} with tag {string}", async function (featureName, tag) {
  const featureId = await this.createTicket(featureName, { type: "feature", tags: tag });
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

Given("a worktree for {string} from HEAD with a commit {string}", async function (featureName, commitMsg) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const nameResult = await this.exec(
    "just",
    ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
    { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
  );
  const wtName = nameResult.stdout.trim();
  const defaultDir = join(this.projectDir, "default");
  await execFileAsync("git", ["worktree", "add", "-b", wtName, `../${wtName}`, "HEAD"], { cwd: defaultDir });
  const wtDir = join(this.projectDir, wtName);
  await writeFile(join(wtDir, `${wtName}.txt`), commitMsg);
  await execFileAsync("git", ["add", "."], { cwd: wtDir });
  await execFileAsync("git", ["commit", "-m", commitMsg], { cwd: wtDir });
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

When("I run worktree-base from the worktree for {string}", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const nameResult = await this.exec(
    "just",
    ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
    { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
  );
  const wtName = nameResult.stdout.trim();
  const wtDir = join(this.projectDir, wtName);
  const result = await this.exec("just", ["--justfile", justfile, "worktree-base"], {
    cwd: wtDir,
    env: { ...process.env, TK_PROJECT_DIR: this.projectDir },
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
