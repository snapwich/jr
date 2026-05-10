import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { mkdtemp, mkdir, readFile, writeFile, access, lstat, stat, readlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { constants } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");

Given("an empty target directory", async function () {
  const dir = await mkdtemp(join(tmpdir(), "tk-init-"));
  this.initTargetDir = dir;
  this.initTargetDirs.push(dir);
});

When("I run init on the target directory", async function () {
  const justfile = join(REPO_ROOT, "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "init", this.initTargetDir], { cwd: REPO_ROOT });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

When("I add {string} to the target {string}", async function (field, relPath) {
  const filePath = join(this.initTargetDir, relPath);
  const content = JSON.parse(await readFile(filePath, "utf8"));
  content[field] = true;
  await writeFile(filePath, JSON.stringify(content, null, 2) + "\n");
});

Then("the target should have directory {string}", async function (relPath) {
  const fullPath = join(this.initTargetDir, relPath);
  const stat = await lstat(fullPath);
  assert.ok(stat.isDirectory(), `Expected ${relPath} to be a directory`);
});

Then("the target should have symlink {string}", async function (relPath) {
  const fullPath = join(this.initTargetDir, relPath);
  const stat = await lstat(fullPath);
  assert.ok(stat.isSymbolicLink(), `Expected ${relPath} to be a symlink`);
});

Then("the target {string} should be a symlink to {string}", async function (relPath, target) {
  const fullPath = join(this.initTargetDir, relPath);
  const stat = await lstat(fullPath);
  assert.ok(stat.isSymbolicLink(), `Expected ${relPath} to be a symlink`);
  const linkTarget = await readlink(fullPath);
  assert.strictEqual(linkTarget, target, `Expected symlink target "${target}", got "${linkTarget}"`);
});

Then("the target {string} should contain {string}", async function (relPath, expected) {
  const fullPath = join(this.initTargetDir, relPath);
  const content = await readFile(fullPath, "utf8");
  assert.ok(content.includes(expected), `Expected ${relPath} to contain "${expected}". Content:\n${content}`);
});

Then("the target should have file {string}", async function (relPath) {
  const fullPath = join(this.initTargetDir, relPath);
  const s = await stat(fullPath);
  assert.ok(s.isFile(), `Expected ${relPath} to be a file`);
});

Then("the target {string} should be executable", async function (relPath) {
  const fullPath = join(this.initTargetDir, relPath);
  await access(fullPath, constants.X_OK);
});

Then("the last command should exit with code {int}", async function (code) {
  assert.strictEqual(
    this.lastExitCode,
    code,
    `Expected exit code ${code}, got ${this.lastExitCode}.\nOutput:\n${this.lastOutput}`,
  );
});

Then(
  "the target {string} should have exactly {int} line(s) matching {string}",
  async function (relPath, count, pattern) {
    const fullPath = join(this.initTargetDir, relPath);
    const content = await readFile(fullPath, "utf8");
    const matches = content.split("\n").filter((line) => line.includes(pattern));
    assert.strictEqual(
      matches.length,
      count,
      `Expected ${count} line(s) matching "${pattern}" in ${relPath}, found ${matches.length}. Content:\n${content}`,
    );
  },
);

Given("the target has a {string} repo with a remote but no origin HEAD", async function (repoName) {
  const repoDir = join(this.initTargetDir, repoName);
  const bareDir = join(this.initTargetDir, `${repoName}-bare`);
  await mkdir(repoDir, { recursive: true });
  await mkdir(bareDir, { recursive: true });
  await execFileAsync("git", ["init", "--bare"], { cwd: bareDir });
  await execFileAsync("git", ["init"], { cwd: repoDir });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoDir });
  await writeFile(join(repoDir, ".gitkeep"), "");
  await execFileAsync("git", ["add", "."], { cwd: repoDir });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoDir });
  await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: repoDir });
  await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd: repoDir });
  await execFileAsync("git", ["fetch", "origin"], { cwd: repoDir });
  // Confirm origin/HEAD doesn't resolve before init runs.
  const verify = await execFileAsync("git", ["rev-parse", "--verify", "origin/HEAD"], { cwd: repoDir }).catch((e) => ({
    code: e.code,
  }));
  if (!verify.code) throw new Error("Test setup: origin/HEAD should not resolve before init");
});

Given("the target has a {string} repo with origin HEAD pointing at a non-default branch", async function (repoName) {
  const repoDir = join(this.initTargetDir, repoName);
  const bareDir = join(this.initTargetDir, `${repoName}-bare`);
  await mkdir(repoDir, { recursive: true });
  await mkdir(bareDir, { recursive: true });
  await execFileAsync("git", ["init", "--bare"], { cwd: bareDir });
  await execFileAsync("git", ["init", "-b", "main"], { cwd: repoDir });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoDir });
  await writeFile(join(repoDir, ".gitkeep"), "");
  await execFileAsync("git", ["add", "."], { cwd: repoDir });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoDir });
  await execFileAsync("git", ["checkout", "-b", "develop"], { cwd: repoDir });
  await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: repoDir });
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: repoDir });
  await execFileAsync("git", ["push", "-u", "origin", "develop"], { cwd: repoDir });
  await execFileAsync("git", ["fetch", "origin"], { cwd: repoDir });
  // Manually point origin HEAD at develop (non-default — bare repo defaults to main).
  await execFileAsync("git", ["remote", "set-head", "origin", "develop"], { cwd: repoDir });
});

Then("the target {string} repo should have origin HEAD set", async function (repoName) {
  const repoDir = join(this.initTargetDir, repoName);
  const result = await execFileAsync("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], { cwd: repoDir });
  assert.ok(
    result.stdout.trim().startsWith("refs/remotes/origin/"),
    `Expected origin HEAD to resolve, got: ${result.stdout}`,
  );
});

Then("the target {string} repo origin HEAD should still point at the non-default branch", async function (repoName) {
  const repoDir = join(this.initTargetDir, repoName);
  const result = await execFileAsync("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], { cwd: repoDir });
  assert.strictEqual(
    result.stdout.trim(),
    "refs/remotes/origin/develop",
    `Expected origin HEAD unchanged at develop, got: ${result.stdout}`,
  );
});
