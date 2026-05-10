import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { mkdtemp, mkdir, writeFile, readFile, lstat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { execFile } from "child_process";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");

Given("an initialized project with a git repo", async function () {
  const dir = await mkdtemp(join(tmpdir(), "jr-cwt-"));
  this.initTargetDir = dir;
  this.initTargetDirs.push(dir);

  // Run just init
  const justfile = join(REPO_ROOT, "justfile");
  await execFileAsync("just", ["--justfile", justfile, "init", dir], { cwd: REPO_ROOT });

  // Create default/ git repo with an initial commit
  const defaultDir = join(dir, "default");
  await mkdir(defaultDir, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: defaultDir });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: defaultDir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: defaultDir });
  await writeFile(join(defaultDir, ".gitkeep"), "");
  await execFileAsync("git", ["add", "."], { cwd: defaultDir });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: defaultDir });
});

Given("the project has agent extension {string} with content {string}", async function (agent, content) {
  const extDir = join(this.initTargetDir, ".jr", "claude", "_", "agents", "jr");
  await mkdir(extDir, { recursive: true });
  await writeFile(join(extDir, `${agent}.md`), content + "\n");
});

When("I create worktree {string}", async function (name) {
  const justfile = join(this.initTargetDir, "justfile");
  await execFileAsync("just", ["--justfile", justfile, "create-worktree", name, ".", "main"], {
    cwd: this.initTargetDir,
  }).catch(() => {}); // ignore exit code on existing worktree
});

Given("the project has a remote without an origin HEAD", async function () {
  const defaultDir = join(this.initTargetDir, "default");
  const bareDir = join(this.initTargetDir, "bare-remote");
  await mkdir(bareDir, { recursive: true });
  await execFileAsync("git", ["init", "--bare"], { cwd: bareDir });
  await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: defaultDir });
  await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd: defaultDir });
  await execFileAsync("git", ["fetch", "origin"], { cwd: defaultDir });
  // Don't run `git remote set-head origin -a` — that's what we're testing the fallback for.
  // Confirm origin/HEAD doesn't resolve (replicates the user's broken state).
  const result = await execFileAsync("git", ["rev-parse", "--verify", "origin/HEAD"], {
    cwd: defaultDir,
  }).catch((e) => ({ stderr: e.stderr || "", code: e.code }));
  if (!result.code) throw new Error("Test setup failed: origin/HEAD should not resolve");
});

Given("the project has no origin remote", async function () {
  // The default setup creates a git repo with no remote, so this is a no-op.
  // Just verify there's no origin.
  const defaultDir = join(this.initTargetDir, "default");
  const result = await execFileAsync("git", ["remote"], { cwd: defaultDir });
  if (result.stdout.trim()) throw new Error(`Test setup: expected no remotes, got: ${result.stdout}`);
});

When("I create worktree {string} with default base", async function (name) {
  const justfile = join(this.initTargetDir, "justfile");
  // Default base is origin/HEAD — exercises the fallback chain
  this.lastCreateWorktreeResult = await execFileAsync("just", ["--justfile", justfile, "create-worktree", name], {
    cwd: this.initTargetDir,
  }).catch((err) => ({
    stdout: err.stdout || "",
    stderr: err.stderr || "",
    code: err.code,
  }));
});

When("I create worktree {string} with base {string}", async function (name, base) {
  const justfile = join(this.initTargetDir, "justfile");
  this.lastCreateWorktreeResult = await execFileAsync(
    "just",
    ["--justfile", justfile, "create-worktree", name, ".", base],
    { cwd: this.initTargetDir },
  ).catch((err) => ({
    stdout: err.stdout || "",
    stderr: err.stderr || "",
    code: err.code,
  }));
});

Then("worktree {string} should be registered as a git worktree", async function (name) {
  const defaultDir = join(this.initTargetDir, "default");
  const result = await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: defaultDir });
  const expectedPath = join(this.initTargetDir, name);
  assert.ok(
    result.stdout.includes(`worktree ${expectedPath}`),
    `Expected '${expectedPath}' in worktree list:\n${result.stdout}`,
  );
});

Then("the project's origin HEAD should now be set", async function () {
  const defaultDir = join(this.initTargetDir, "default");
  const headRef = await execFileAsync("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], { cwd: defaultDir });
  assert.ok(
    headRef.stdout.trim().startsWith("refs/remotes/origin/"),
    `Expected origin HEAD to resolve, got: ${headRef.stdout}`,
  );
});

Then("create-worktree should have failed", function () {
  assert.ok(
    this.lastCreateWorktreeResult.code,
    `Expected create-worktree to fail, but it succeeded.\nstdout: ${this.lastCreateWorktreeResult.stdout}\nstderr: ${this.lastCreateWorktreeResult.stderr}`,
  );
});

Then("the create-worktree error should mention {string}", function (text) {
  const combined = (this.lastCreateWorktreeResult.stdout || "") + (this.lastCreateWorktreeResult.stderr || "");
  assert.ok(combined.includes(text), `Expected error to mention "${text}". Got:\n${combined}`);
});

Then("worktree {string} should have symlink {string}", async function (wt, relPath) {
  const fullPath = join(this.initTargetDir, wt, relPath);
  const s = await lstat(fullPath);
  assert.ok(s.isSymbolicLink(), `Expected ${relPath} to be a symlink`);
});

Then("worktree {string} should have directory {string}", async function (wt, relPath) {
  const fullPath = join(this.initTargetDir, wt, relPath);
  const s = await lstat(fullPath);
  assert.ok(s.isDirectory(), `Expected ${relPath} to be a directory`);
});

Then("worktree {string} {string} should not be a symlink", async function (wt, relPath) {
  const fullPath = join(this.initTargetDir, wt, relPath);
  const s = await lstat(fullPath);
  assert.ok(!s.isSymbolicLink(), `Expected ${relPath} to not be a symlink`);
});

Then("worktree {string} file {string} should exist", async function (wt, relPath) {
  const fullPath = join(this.initTargetDir, wt, relPath);
  // Follow symlinks — stat not lstat
  const { stat } = await import("fs/promises");
  const s = await stat(fullPath);
  assert.ok(s.isFile(), `Expected ${relPath} to be a file (or symlink to file)`);
});

Then("worktree {string} file {string} should contain {string}", async function (wt, relPath, expected) {
  const fullPath = join(this.initTargetDir, wt, relPath);
  const content = await readFile(fullPath, "utf8");
  assert.ok(content.includes(expected), `Expected ${relPath} to contain "${expected}". Content:\n${content}`);
});
