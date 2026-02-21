import { Given, Then } from "@cucumber/cucumber";
import assert from "assert";
import { readdir } from "fs/promises";
import { join } from "path";

// --- Setup ---

Given("a multi-repo project with repo {string}", async function (repoName) {
  await this.setupMultiRepo(repoName);
});

Given(
  "a feature {string} with a task {string} targeting repo {string}",
  async function (featureName, taskName, repoName) {
    // Create feature
    const featureId = await this.createTicket(featureName, { type: "feature" });
    this.ticketIds[featureName] = featureId;

    // Create implementation task with repo tag
    const taskId = await this.createTicket(taskName, {
      type: "task",
      assignee: "tk:coder",
      parent: featureId,
      tags: `repo:${repoName}`,
    });
    this.ticketIds[taskName] = taskId;
    await this.addDep(featureId, taskId);

    // Create architect-review task with repo tag
    const archTaskId = await this.createTicket("Architect review", {
      type: "task",
      assignee: "tk:architect-reviewer",
      parent: featureId,
      tags: `architect-review,repo:${repoName}`,
    });
    this.ticketIds["arch-review"] = archTaskId;
    await this.addDep(featureId, archTaskId);
    await this.addDep(archTaskId, taskId);
  },
);

// --- Assertions ---

Then("a worktree should exist under {string}", async function (repoPrefix) {
  const repoDir = join(this.projectDir, repoPrefix);
  const entries = await readdir(repoDir);
  // Should have "default" plus at least one worktree directory
  const worktrees = entries.filter((e) => e !== "default");
  assert.ok(
    worktrees.length > 0,
    `Expected at least one worktree under ${repoPrefix}, found only: ${entries.join(", ")}`,
  );
});
