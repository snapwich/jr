import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";
import { execFile } from "child_process";
import { writeFile } from "fs/promises";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");

// Helper: ensure a child task exists for a feature, return its ID
async function ensureChildTask(world, featureName) {
  const featureId = world.ticketIds[featureName];
  const taskKey = `${featureName}:task`;
  if (!world.ticketIds[taskKey]) {
    const taskId = await world.createTicket(`Task for ${featureName}`, {
      type: "task",
      parent: featureId,
    });
    world.ticketIds[taskKey] = taskId;
  }
  return world.ticketIds[taskKey];
}

// --- Setup ---

Given("a single-repo project layout", async function () {
  await this.setupSingleRepo();
});

Given("a worktree for {string} with a commit {string}", async function (featureName, commitMsg) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");

  // Derive worktree name
  const nameResult = await this.exec(
    "just",
    ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
    { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
  );
  const wtName = nameResult.stdout.trim();
  this.ticketIds[`${featureName}:wt`] = wtName;

  // Resolve base branch
  const baseResult = await this.exec("just", ["--justfile", justfile, "resolve-base-branch", featureId], {
    env: { ...process.env, TK_PROJECT_DIR: this.projectDir },
  });
  const baseBranch = baseResult.stdout.trim();

  // Create worktree
  const defaultDir = join(this.projectDir, "default");
  await execFileAsync("git", ["fetch", "origin"], { cwd: defaultDir }).catch(() => {});
  await execFileAsync("git", ["worktree", "add", "-b", wtName, `../${wtName}`, baseBranch], { cwd: defaultDir });

  // Commit with Tk-Task trailer
  const taskId = await ensureChildTask(this, featureName);
  const wtDir = join(this.projectDir, wtName);
  await writeFile(join(wtDir, `${wtName}.txt`), commitMsg);
  await execFileAsync("git", ["add", "."], { cwd: wtDir });
  await execFileAsync("git", ["commit", "-m", `${commitMsg}\n\nTk-Task: ${taskId}`], { cwd: wtDir });
});

Given(
  "a worktree for {string} branched from {string} with a commit {string}",
  async function (featureName, upstreamName, commitMsg) {
    const featureId = this.ticketIds[featureName];
    const justfile = join(REPO_ROOT, "scripts", "justfile");

    // Derive worktree name
    const nameResult = await this.exec(
      "just",
      ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
      { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
    );
    const wtName = nameResult.stdout.trim();
    this.ticketIds[`${featureName}:wt`] = wtName;

    // Resolve base branch (should resolve to upstream worktree branch)
    const baseResult = await this.exec(
      "just",
      ["--justfile", justfile, "--working-directory", this.projectDir, "resolve-base-branch", featureId],
      { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
    );
    const baseBranch = baseResult.stdout.trim();

    // Create worktree from upstream branch
    const defaultDir = join(this.projectDir, "default");
    await execFileAsync("git", ["worktree", "add", "-b", wtName, `../${wtName}`, baseBranch], { cwd: defaultDir });

    // Commit with Tk-Task trailer
    const taskId = await ensureChildTask(this, featureName);
    const wtDir = join(this.projectDir, wtName);
    await writeFile(join(wtDir, `${wtName}.txt`), commitMsg);
    await execFileAsync("git", ["add", "."], { cwd: wtDir });
    await execFileAsync("git", ["commit", "-m", `${commitMsg}\n\nTk-Task: ${taskId}`], { cwd: wtDir });
  },
);

Given("the branch for {string} is squash-merged into default", async function (featureName) {
  const wtName = this.ticketIds[`${featureName}:wt`];
  const defaultDir = join(this.projectDir, "default");

  // Squash merge the feature branch into default
  await execFileAsync("git", ["merge", "--squash", wtName], { cwd: defaultDir });
  await execFileAsync("git", ["commit", "-m", `squash merge feature`], { cwd: defaultDir });
  // Push to origin so origin/HEAD updates
  await execFileAsync("git", ["push", "origin", "HEAD"], { cwd: defaultDir });
});

Given("the worktree and branch for {string} is removed", async function (featureName) {
  const wtName = this.ticketIds[`${featureName}:wt`];
  const defaultDir = join(this.projectDir, "default");
  await execFileAsync("git", ["worktree", "remove", `../${wtName}`], { cwd: defaultDir });
  await execFileAsync("git", ["branch", "-D", wtName], { cwd: defaultDir });
});

Given(
  "a worktree for {string} with stale base, rebased onto {string} with a commit {string}",
  async function (featureName, upstreamName, commitMsg) {
    const featureId = this.ticketIds[featureName];
    const upstreamWt = this.ticketIds[`${upstreamName}:wt`];
    const justfile = join(REPO_ROOT, "scripts", "justfile");

    // Derive worktree name
    const nameResult = await this.exec(
      "just",
      ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
      { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
    );
    const wtName = nameResult.stdout.trim();
    this.ticketIds[`${featureName}:wt`] = wtName;

    const defaultDir = join(this.projectDir, "default");

    // Create worktree from origin/HEAD (mimics orchestrator when upstream was already closed)
    await execFileAsync("git", ["worktree", "add", "-b", wtName, `../${wtName}`, "origin/HEAD"], { cwd: defaultDir });

    const wtDir = join(this.projectDir, wtName);

    // Rebase onto upstream branch (mimics coder rebasing to get upstream's code)
    await execFileAsync("git", ["rebase", upstreamWt], { cwd: wtDir });

    // Make a downstream commit with Tk-Task trailer
    const taskId = await ensureChildTask(this, featureName);
    await writeFile(join(wtDir, `${wtName}.txt`), commitMsg);
    await execFileAsync("git", ["add", "."], { cwd: wtDir });
    await execFileAsync("git", ["commit", "-m", `${commitMsg}\n\nTk-Task: ${taskId}`], { cwd: wtDir });
  },
);

Given("the branch for {string} is merged into default", async function (featureName) {
  const wtName = this.ticketIds[`${featureName}:wt`];
  const defaultDir = join(this.projectDir, "default");

  // Regular merge (no --squash) — preserves commit ancestry
  await execFileAsync("git", ["merge", "--no-ff", wtName, "-m", `merge ${wtName}`], { cwd: defaultDir });
  // Push to origin so origin/HEAD updates
  await execFileAsync("git", ["push", "origin", "HEAD"], { cwd: defaultDir });
});

// --- Actions ---

When("I run rebase-feature for {string}", async function (featureName) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const mockScript = join(REPO_ROOT, "features", "support", "mock-subagent.sh");
  const env = {
    ...process.env,
    TK_PROJECT_DIR: this.projectDir,
    // Pass mock env vars if mock responses are configured
    ...(this.mockResponsesDir && {
      CLAUDE_CMD: mockScript,
      MOCK_RESPONSES_DIR: this.mockResponsesDir,
    }),
  };
  const result = await this.exec("just", ["--justfile", justfile, "rebase-feature", featureId], { env });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

// --- Assertions ---

Then("the worktree for {string} should have commit {string}", async function (featureName, commitMsg) {
  const wtName = this.ticketIds[`${featureName}:wt`];
  const wtDir = join(this.projectDir, wtName);
  const result = await execFileAsync("git", ["log", "--oneline", "--format=%s"], { cwd: wtDir });
  assert.ok(
    result.stdout.includes(commitMsg),
    `Expected worktree ${wtName} to have commit "${commitMsg}".\nLog:\n${result.stdout}`,
  );
});

Then("the worktree for {string} should not have commit {string}", async function (featureName, commitMsg) {
  const wtName = this.ticketIds[`${featureName}:wt`];
  const wtDir = join(this.projectDir, wtName);
  // Check that the commit message does not appear in the direct ancestry
  // After rebase, the upstream's individual commits should be gone (replaced by squash commit)
  const result = await execFileAsync("git", ["log", "--oneline", "--format=%s"], { cwd: wtDir });
  // The squash merge commit message won't match "upstream change" exactly
  // Filter out the squash merge line and check that the original commit is gone
  const lines = result.stdout.trim().split("\n");
  const hasOriginalCommit = lines.some((line) => line.trim() === commitMsg);
  assert.ok(
    !hasOriginalCommit,
    `Expected worktree ${wtName} to NOT have commit "${commitMsg}".\nLog:\n${result.stdout}`,
  );
});

// --- Conflict scenarios ---

// Creates a worktree and modifies a shared file. The file must exist in default first.
Given("a worktree for {string} with a conflicting commit on {string}", async function (featureName, fileName) {
  const featureId = this.ticketIds[featureName];
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const defaultDir = join(this.projectDir, "default");

  // First, ensure the shared file exists in default with initial content
  // (so both upstream and downstream can modify it from a common base)
  const sharedFilePath = join(defaultDir, fileName);
  try {
    await execFileAsync("git", ["show", `HEAD:${fileName}`], { cwd: defaultDir });
  } catch {
    // File doesn't exist, create it
    await writeFile(sharedFilePath, "Line 1: Original\nLine 2: Original\nLine 3: Original\n");
    await execFileAsync("git", ["add", fileName], { cwd: defaultDir });
    await execFileAsync("git", ["commit", "-m", `Add ${fileName}`], { cwd: defaultDir });
    await execFileAsync("git", ["push", "origin", "HEAD"], { cwd: defaultDir });
  }

  // Derive worktree name
  const nameResult = await this.exec(
    "just",
    ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
    { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
  );
  const wtName = nameResult.stdout.trim();
  this.ticketIds[`${featureName}:wt`] = wtName;

  // Create worktree from origin/HEAD
  await execFileAsync("git", ["fetch", "origin"], { cwd: defaultDir }).catch(() => {});
  await execFileAsync("git", ["worktree", "add", "-b", wtName, `../${wtName}`, "origin/HEAD"], { cwd: defaultDir });

  // Modify the shared file with Tk-Task trailer
  const taskId = await ensureChildTask(this, featureName);
  const wtDir = join(this.projectDir, wtName);
  await writeFile(join(wtDir, fileName), `Line 1: Modified by ${featureName}\nLine 2: Original\nLine 3: Original\n`);
  await execFileAsync("git", ["add", fileName], { cwd: wtDir });
  await execFileAsync("git", ["commit", "-m", `${featureName} modifies ${fileName}\n\nTk-Task: ${taskId}`], {
    cwd: wtDir,
  });
});

// Creates a downstream worktree that also modifies the shared file from origin/HEAD
// (not from upstream branch) to guarantee a conflict when rebasing.
Given(
  "a worktree for {string} branched from {string} with a conflicting commit on {string}",
  async function (featureName, upstreamName, fileName) {
    const featureId = this.ticketIds[featureName];
    const justfile = join(REPO_ROOT, "scripts", "justfile");
    const defaultDir = join(this.projectDir, "default");

    // Derive worktree name
    const nameResult = await this.exec(
      "just",
      ["--justfile", justfile, "--working-directory", this.projectDir, "worktree-name", featureId],
      { env: { ...process.env, TK_PROJECT_DIR: this.projectDir } },
    );
    const wtName = nameResult.stdout.trim();
    this.ticketIds[`${featureName}:wt`] = wtName;

    // Create worktree from origin/HEAD (NOT from upstream branch) to ensure conflict
    // The tk dependency is for scheduling, but git-wise we branch from origin/HEAD
    await execFileAsync("git", ["fetch", "origin"], { cwd: defaultDir }).catch(() => {});
    await execFileAsync("git", ["worktree", "add", "-b", wtName, `../${wtName}`, "origin/HEAD"], { cwd: defaultDir });

    // Modify the SAME line as upstream but differently with Tk-Task trailer
    const taskId = await ensureChildTask(this, featureName);
    const wtDir = join(this.projectDir, wtName);
    await writeFile(
      join(wtDir, fileName),
      `Line 1: Modified by ${featureName} (conflicts with upstream)\nLine 2: Original\nLine 3: Original\n`,
    );
    await execFileAsync("git", ["add", fileName], { cwd: wtDir });
    await execFileAsync("git", ["commit", "-m", `${featureName} modifies ${fileName}\n\nTk-Task: ${taskId}`], {
      cwd: wtDir,
    });
  },
);

Given("a mock rebaser response for {string} that signals {string}", async function (featureName, signalType) {
  const featureId = this.ticketIds[featureName];
  const content = `---
signal: ${signalType}
ticket: ${featureId}
summary: Mock rebaser completed`;
  await this.setMockResponse(featureId, "tk:rebaser", content);
});

Given(
  "a mock rebaser response for {string} that signals {string} with summary {string}",
  async function (featureName, signalType, summary) {
    const featureId = this.ticketIds[featureName];
    const content = `---
signal: ${signalType}
ticket: ${featureId}
summary: ${summary}`;
    await this.setMockResponse(featureId, "tk:rebaser", content);
  },
);
