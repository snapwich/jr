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
