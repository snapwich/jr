import { Given, Then } from "@cucumber/cucumber";
import assert from "assert";
import { readdir } from "fs/promises";
import { join } from "path";

// --- Setup ---

Given("a multi-repo project with repo {string}", async function (repoName) {
  await this.setupMultiRepo(repoName);
});

Given(
  "a feature {string} targeting repo {string} with a task {string}",
  async function (featureName, repoName, taskName) {
    // Create feature with repo tag and architect assignee
    const featureId = await this.createTicket(featureName, {
      type: "feature",
      assignee: "jr:architect-reviewer",
      tags: `repo:${repoName}`,
    });
    this.ticketIds[featureName] = featureId;

    // Task has no repo tag — inherits from parent feature
    const taskId = await this.createTicket(taskName, {
      type: "task",
      assignee: "jr:coder",
      parent: featureId,
    });
    this.ticketIds[taskName] = taskId;
    await this.addDep(featureId, taskId);
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
