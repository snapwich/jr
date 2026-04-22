import { Given, When, Then, defineStep } from "@cucumber/cucumber";
import assert from "assert";
import { join } from "path";
import { stat, mkdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = join(import.meta.dirname, "..", "..");

// --- Setup ---

Given("the jr ticket repo is initialized", async function () {
  const jrDir = join(this.projectDir, ".jr");
  await execFileAsync("git", ["init"], { cwd: jrDir });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: jrDir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: jrDir });
  await execFileAsync("git", ["add", "."], { cwd: jrDir });
  await execFileAsync("git", ["commit", "-m", "init tickets"], { cwd: jrDir });
});

Given("a feature {string} with tasks: {string}", async function (featureName, taskNamesCsv) {
  const featureId = await this.createTicket(featureName, { type: "feature", assignee: "jr:architect-reviewer" });
  this.ticketIds[featureName] = featureId;

  const taskNames = taskNamesCsv.split(",").map((s) => s.trim());
  let prevTaskId = null;
  for (const taskName of taskNames) {
    const taskId = await this.createTicket(taskName, { type: "task", assignee: "jr:coder", parent: featureId });
    this.ticketIds[taskName] = taskId;
    await this.addDep(featureId, taskId);
    if (prevTaskId) {
      await this.addDep(taskId, prevTaskId);
    }
    prevTaskId = taskId;
  }

  // Stage new tickets in .jr repo so git mv works
  const jrDir = join(this.projectDir, ".jr");
  await execFileAsync("git", ["add", ".tickets/"], { cwd: jrDir });
  await execFileAsync("git", ["commit", "-m", `add ${featureName}`], { cwd: jrDir });
});

Given("archive {string} has a {string} subdirectory", async function (archiveName, subdir) {
  await mkdir(join(this.projectDir, ".jr", "archive", archiveName, subdir), { recursive: true });
});

// --- Actions ---

defineStep("I run archive {string} for {string}", async function (archiveName, ticketName) {
  const ticketId = this.ticketIds[ticketName] || ticketName;
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "archive", archiveName, ticketId], {
    env: { ...process.env, JR_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

When("I run unarchive {string}", async function (archiveName) {
  const justfile = join(REPO_ROOT, "scripts", "justfile");
  const result = await this.exec("just", ["--justfile", justfile, "unarchive", archiveName], {
    env: { ...process.env, JR_PROJECT_DIR: this.projectDir },
  });
  this.lastExitCode = result.exitCode;
  this.lastOutput = result.stdout + "\n" + result.stderr;
});

// --- Assertions ---

Then("ticket {string} should be in archive {string}", async function (ticketName, archiveName) {
  const id = this.ticketIds[ticketName];
  const filePath = join(this.projectDir, ".jr", "archive", archiveName, `${id}.md`);
  try {
    await stat(filePath);
  } catch {
    assert.fail(`Expected ${id}.md in archive/${archiveName}/ but file not found`);
  }
});

Then("ticket {string} should not be in archive {string}", async function (ticketName, archiveName) {
  const id = this.ticketIds[ticketName];
  const filePath = join(this.projectDir, ".jr", "archive", archiveName, `${id}.md`);
  try {
    await stat(filePath);
    assert.fail(`Expected ${id}.md NOT in archive/${archiveName}/ but file exists`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
});

Then("ticket {string} should be in tickets", async function (ticketName) {
  const id = this.ticketIds[ticketName];
  const filePath = join(this.projectDir, ".jr", ".tickets", `${id}.md`);
  try {
    await stat(filePath);
  } catch {
    assert.fail(`Expected ${id}.md in .tickets/ but file not found`);
  }
});

Then("ticket {string} should not be in tickets", async function (ticketName) {
  const id = this.ticketIds[ticketName];
  const filePath = join(this.projectDir, ".jr", ".tickets", `${id}.md`);
  try {
    await stat(filePath);
    assert.fail(`Expected ${id}.md NOT in .tickets/ but file exists`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
});

Then("archive {string} should not exist", async function (archiveName) {
  const dirPath = join(this.projectDir, ".jr", "archive", archiveName);
  try {
    await stat(dirPath);
    assert.fail(`Expected archive/${archiveName}/ to not exist but it does`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
});

Then("archive {string} should exist", async function (archiveName) {
  const dirPath = join(this.projectDir, ".jr", "archive", archiveName);
  try {
    await stat(dirPath);
  } catch {
    assert.fail(`Expected archive/${archiveName}/ to exist but not found`);
  }
});

Then("the jr repo should have a commit containing {string}", async function (text) {
  const jrDir = join(this.projectDir, ".jr");
  const { stdout } = await execFileAsync("git", ["log", "--oneline", "-5"], { cwd: jrDir });
  assert.ok(stdout.includes(text), `Expected git log to contain "${text}".\nGot:\n${stdout}`);
});
