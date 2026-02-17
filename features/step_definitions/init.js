import { Given, When, Then } from "@cucumber/cucumber";
import assert from "assert";
import { mkdtemp, readFile, writeFile, access, lstat, stat, readlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { constants } from "fs";

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
