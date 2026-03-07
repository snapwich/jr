import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");
const JUSTFILE = join(REPO_ROOT, "scripts", "justfile");

function justEnv(projectDir) {
  return { ...process.env, TK_PROJECT_DIR: projectDir };
}

Given(
  "the worktree for {string} has commits with {string} trailers for {string}",
  async function (featureName, _trailerName, taskName) {
    const featureId = this.ticketIds[featureName];
    const taskId = this.ticketIds[taskName];
    const env = justEnv(this.projectDir);

    // Derive worktree name via just recipe
    const { stdout: wtName } = await execFileAsync(
      "just",
      ["--justfile", JUSTFILE, "--working-directory", this.projectDir, "worktree-name", featureId],
      { cwd: this.projectDir, env },
    );

    // Create worktree if it doesn't exist
    const wt = wtName.trim();
    await execFileAsync(
      "just",
      ["--justfile", JUSTFILE, "--working-directory", this.projectDir, "create-worktree", wt],
      { cwd: this.projectDir, env },
    ).catch(() => {}); // ignore if already exists

    const wtDir = join(this.projectDir, wt);

    // Use task-specific filenames to avoid conflicts when multiple tasks share a worktree
    const prefix = taskName.replace(/[^a-z0-9]/gi, "-");

    await writeFile(join(wtDir, `${prefix}-hello.txt`), "hello");
    await execFileAsync("git", ["-C", wtDir, "add", `${prefix}-hello.txt`]);
    await execFileAsync("git", ["-C", wtDir, "commit", "--trailer", `Tk-Task: ${taskId}`, "-m", `Add ${prefix} hello`]);

    await writeFile(join(wtDir, `${prefix}-world.txt`), "world");
    await execFileAsync("git", ["-C", wtDir, "add", `${prefix}-world.txt`]);
    await execFileAsync("git", ["-C", wtDir, "commit", "--trailer", `Tk-Task: ${taskId}`, "-m", `Add ${prefix} world`]);

    // Store initial commit SHA (the one without trailers) for assertions
    const { stdout: initSha } = await execFileAsync("git", ["-C", wtDir, "rev-list", "--max-parents=0", "HEAD"]);
    this._initialCommitSha = initSha.trim();
  },
);

When("I run task-commits for {string}", async function (taskName) {
  const taskId = this.ticketIds[taskName];
  const env = justEnv(this.projectDir);
  const result = await this.exec(
    "just",
    ["--justfile", JUSTFILE, "--working-directory", this.projectDir, "task-commits", taskId],
    { cwd: this.projectDir, env },
  );
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

When("I run task-diff for {string}", async function (taskName) {
  const taskId = this.ticketIds[taskName];
  const env = justEnv(this.projectDir);
  const result = await this.exec(
    "just",
    ["--justfile", JUSTFILE, "--working-directory", this.projectDir, "task-diff", taskId],
    { cwd: this.projectDir, env },
  );
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

Then("the output should contain exactly {int} commit SHAs", function (count) {
  const shas = this.lastOutput
    .trim()
    .split("\n")
    .filter((line) => /^[0-9a-f]{40}$/.test(line.trim()));
  assert.strictEqual(shas.length, count, `Expected ${count} SHAs, got ${shas.length}.\nOutput:\n${this.lastOutput}`);
});

Then("the output should not contain the initial commit SHA", function () {
  assert.ok(
    !this.lastOutput.includes(this._initialCommitSha),
    `Output should not contain initial commit SHA ${this._initialCommitSha}.\nOutput:\n${this.lastOutput}`,
  );
});
