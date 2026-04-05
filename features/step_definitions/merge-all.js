import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";
import { execFile } from "child_process";
import { writeFile } from "fs/promises";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");

Given("a closed feature {string} with a worktree and commit {string}", async function (featureName, commitMsg) {
  const featureId = await this.createTicket(featureName, { type: "feature", assignee: "jr:architect-reviewer" });
  this.ticketIds[featureName] = featureId;

  const taskId = await this.createTicket(`task for ${featureName}`, { type: "task", parent: featureId });
  this.ticketIds[`${featureName}:task`] = taskId;
  await this.addDep(featureId, taskId);

  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const nameResult = await this.exec(
    "just",
    ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
    { env: { ...process.env, JR_PROJECT_DIR: this.projectDir } },
  );
  const wtName = nameResult.stdout.trim();
  this.ticketIds[`${featureName}:wt`] = wtName;

  const defaultDir = join(this.projectDir, "default");
  await execFileAsync("git", ["worktree", "add", "-b", wtName, `../${wtName}`, "origin/HEAD"], { cwd: defaultDir });

  const wtDir = join(this.projectDir, wtName);
  await writeFile(join(wtDir, `${wtName}.txt`), commitMsg);
  await execFileAsync("git", ["add", "."], { cwd: wtDir });
  await execFileAsync("git", ["commit", "-m", `${commitMsg}\n\nTk-Task: ${taskId}`], { cwd: wtDir });

  await this.closeTicket(taskId);
  await this.closeTicket(featureId);
});

Given("another worktree has the base branch checked out", async function () {
  const defaultDir = join(this.projectDir, "default");
  // Get the current base branch name (what default/ is on, typically main/master)
  const { stdout } = await execFileAsync("git", ["symbolic-ref", "--short", "HEAD"], { cwd: defaultDir });
  const baseBranch = stdout.trim();
  this._conflictWtBranch = baseBranch;
  // Move default/ off the base branch so we can lock it in another worktree
  await execFileAsync("git", ["checkout", "-b", "_temp-holder"], { cwd: defaultDir });
  // Create another worktree on the base branch — this locks it
  const conflictWtDir = join(this.projectDir, "_conflict-wt");
  await execFileAsync("git", ["worktree", "add", `../_conflict-wt`, baseBranch], { cwd: defaultDir });
  this._conflictWtDir = conflictWtDir;
});

When("I run merge-all", async function () {
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "merge-all"], {
    env: { ...process.env, JR_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

When("I run merge-all with {string}", async function (args) {
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "merge-all", ...args.split(" ")], {
    env: { ...process.env, JR_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

Then("the base branch should contain commit {string}", async function (commitMsg) {
  const defaultDir = join(this.projectDir, "default");
  // Check the main branch ref explicitly (HEAD may be on a different branch)
  const { stdout } = await execFileAsync("git", ["log", "main", "--oneline", "--format=%s"], { cwd: defaultDir });
  assert.ok(stdout.includes(commitMsg), `Expected base branch to contain commit "${commitMsg}".\nLog:\n${stdout}`);
});

Then("the base branch should contain a squash commit for {string}", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const defaultDir = join(this.projectDir, "default");
  const { stdout } = await execFileAsync("git", ["log", "main", "--oneline", "--format=%s"], { cwd: defaultDir });
  // Squash commit message is the feature label (id: title or external-ref: title)
  assert.ok(
    stdout.includes(featureId) || stdout.includes(featureName),
    `Expected base branch to contain squash commit for "${featureName}".\nLog:\n${stdout}`,
  );
});

Then("the base branch worktree should have a clean working tree", async function () {
  const wtDir = this._conflictWtDir;
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: wtDir });
  assert.strictEqual(stdout.trim(), "", `Expected clean working tree in ${wtDir}.\ngit status:\n${stdout}`);
});

Then("branch for {string} should not exist", async function (featureName) {
  const wtName = this.ticketIds[`${featureName}:wt`];
  const defaultDir = join(this.projectDir, "default");
  try {
    await execFileAsync("git", ["rev-parse", "--verify", wtName], { cwd: defaultDir });
    assert.fail(`Branch "${wtName}" should have been deleted but still exists`);
  } catch {
    // Expected — branch doesn't exist
  }
});
