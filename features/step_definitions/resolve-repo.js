import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";
import { writeFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");

Given("a feature {string} titled {string} with tag {string}", async function (featureName, title, tag) {
  const featureId = await this.createTicket(title, { type: "feature", tags: tag });
  this.ticketIds[featureName] = featureId;
});

Given("a worktree for {string} in repo {string} with a commit {string}", async function (featureName, repoName, msg) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");

  const nameResult = await this.exec(
    "just",
    ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
    { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
  );
  const wtName = nameResult.stdout.trim();
  this.ticketIds[`${featureName}:wt`] = wtName;

  const repoDefault = join(this.projectDir, repoName, "default");
  await execFileAsync("git", ["fetch", "origin"], { cwd: repoDefault }).catch(() => {});
  await execFileAsync("git", ["worktree", "add", "-b", wtName, `../${wtName}`, "origin/HEAD"], { cwd: repoDefault });

  const wtDir = join(this.projectDir, repoName, wtName);
  await writeFile(join(wtDir, `${wtName}.txt`), msg);
  await execFileAsync("git", ["add", "."], { cwd: wtDir });
  await execFileAsync("git", ["commit", "-m", msg], { cwd: wtDir });
});

When("I run resolve-repo for {string}", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "resolve-repo", featureId], {
    env: { ...process.env, TK_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
  this.resolvedRepo = result.stdout.trim();
});

Then("the resolved repo should be {string}", async function (expected) {
  assert.strictEqual(
    this.resolvedRepo,
    expected,
    `Expected resolved repo "${expected}", got "${this.resolvedRepo}".\nOutput:\n${this.lastOutput}`,
  );
});
