import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");

Given("a worktree {string} with no feature ticket", async function (branchName) {
  const defaultDir = join(this.projectDir, "default");
  await execFileAsync("git", ["worktree", "add", "-b", branchName, `../${branchName}`, "origin/HEAD"], {
    cwd: defaultDir,
  });
});

When("I run worktree-deps", async function () {
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "worktree-deps"], {
    env: { ...process.env, JR_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
  this.depsOutput = result.stdout;
});

Then("the worktree-deps output should show {string} as a root", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const nameResult = await this.exec(
    "just",
    ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
    { env: { ...process.env, JR_PROJECT_DIR: this.projectDir } },
  );
  const wtName = nameResult.stdout.trim();
  // Root nodes have no leading whitespace (no tree prefix before the name)
  const lines = this.depsOutput.split("\n");
  const rootLine = lines.find((l) => l.includes(`${wtName}/`) && !l.match(/^[\s│├└]/));
  assert.ok(rootLine, `Expected ${wtName}/ as a root in worktree-deps output.\nOutput:\n${this.depsOutput}`);
});

Then("the worktree-deps output should show {string} indented under {string}", async function (childName, parentName) {
  const childId = this.ticketIds[childName];
  const parentId = this.ticketIds[parentName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const childWt = (
    await this.exec(
      "just",
      ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", childId],
      { env: { ...process.env, JR_PROJECT_DIR: this.projectDir } },
    )
  ).stdout.trim();
  const parentWt = (
    await this.exec(
      "just",
      ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", parentId],
      { env: { ...process.env, JR_PROJECT_DIR: this.projectDir } },
    )
  ).stdout.trim();

  const lines = this.depsOutput.split("\n");
  const parentIdx = lines.findIndex((l) => l.includes(`${parentWt}/`));
  const childIdx = lines.findIndex((l) => l.includes(`${childWt}/`));

  assert.ok(parentIdx >= 0, `Parent ${parentWt}/ not found in output.\nOutput:\n${this.depsOutput}`);
  assert.ok(childIdx >= 0, `Child ${childWt}/ not found in output.\nOutput:\n${this.depsOutput}`);
  assert.ok(childIdx > parentIdx, `Child should appear after parent.\nOutput:\n${this.depsOutput}`);

  // Child line should have tree indentation (├── or └──)
  const childLine = lines[childIdx];
  assert.ok(
    childLine.match(/[├└]── /),
    `Child line should be indented with tree chars.\nLine: "${childLine}"\nOutput:\n${this.depsOutput}`,
  );
});

Then("the worktree-deps output should show {string} as a ghost", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const nameResult = await this.exec(
    "just",
    ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
    { env: { ...process.env, JR_PROJECT_DIR: this.projectDir } },
  );
  const wtName = nameResult.stdout.trim();
  const lines = this.depsOutput.split("\n");
  const ghostLine = lines.find((l) => l.includes(`${wtName}/`) && l.includes("merged"));
  assert.ok(ghostLine, `Expected ${wtName}/ to appear as ghost (merged) in output.\nOutput:\n${this.depsOutput}`);
});

Then("the worktree-deps output should contain {string}", async function (text) {
  assert.ok(
    this.depsOutput.includes(text),
    `Expected worktree-deps output to contain "${text}".\nOutput:\n${this.depsOutput}`,
  );
});

Then("the worktree-deps output should not contain {string}", async function (text) {
  assert.ok(
    !this.depsOutput.includes(text),
    `Expected worktree-deps output to NOT contain "${text}".\nOutput:\n${this.depsOutput}`,
  );
});

Given("the worktree for {string} is rebased onto origin\\/HEAD", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const wtName = this.ticketIds[`${featureName}:wt`];
  const defaultDir = join(this.projectDir, "default");
  const wtDir = join(this.projectDir, wtName);

  // Fetch so origin/HEAD is up to date
  await execFileAsync("git", ["fetch", "origin"], { cwd: defaultDir });

  const originSha = (await execFileAsync("git", ["rev-parse", "origin/HEAD"], { cwd: wtDir })).stdout.trim();

  // Find fork point via Tk-Task trailers
  const mergeBase = (await execFileAsync("git", ["merge-base", originSha, "HEAD"], { cwd: wtDir })).stdout.trim();
  const taskResult = await this.exec("tk", ["query", `select(.parent == "${featureId}")`]);
  const taskIds = taskResult.stdout
    .split("\n")
    .map((l) => {
      try {
        return JSON.parse(l).id;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const grepPattern = `Tk-Task: (${taskIds.join("|")})`;
  const firstOwn = (
    await execFileAsync(
      "git",
      ["log", "--reverse", "--format=%H", "-E", `--grep=${grepPattern}`, `${mergeBase}..HEAD`],
      {
        cwd: wtDir,
      },
    )
  ).stdout
    .trim()
    .split("\n")[0];
  const forkPoint = (await execFileAsync("git", ["rev-parse", `${firstOwn}^`], { cwd: wtDir })).stdout.trim();

  // Rebase onto origin/HEAD
  await execFileAsync("git", ["rebase", "--onto", originSha, forkPoint, "HEAD"], { cwd: wtDir });
});
